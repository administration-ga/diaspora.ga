import { APPEARANCE } from "./appearance"
import { routes } from "./routes"
import { type AdminSection, SECTIONS } from "./sections"

/**
 * La section demandée avant la connexion (revue de sécurité A1, constat F2). Elle n'est
 * JAMAIS portée par une adresse : le retour d'IDN arrive sur `/entrer` nu, où le moteur
 * ajoute le jeton à usage unique de la session ; un paramètre de continuation
 * (`retour`, `next`…) relayé ou mal relu suffirait à l'envoyer ailleurs. Elle est donc
 * gardée dans le stockage de CET onglet (`sessionStorage`), relue contre le registre des
 * sections, et effacée dès qu'elle sert.
 *
 * La clé porte le préfixe de l'application (`antsia:`) : « Se déconnecter partout »
 * l'efface avec le reste de l'état personnel.
 */
export const REQUESTED_SECTION_KEY = `${APPEARANCE.storagePrefix}requested-section`

export type SectionStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">

/** Le stockage de l'onglet, ou `null` (rendu serveur, mode privé strict, accès refusé). */
function tabStorage(): SectionStorage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage
  } catch {
    return null
  }
}

function knownSection(href: string | null | undefined, sections: readonly AdminSection[]): string | null {
  return sections.find((section) => section.href === href)?.href ?? null
}

/**
 * Retient la section à rouvrir après la connexion : une adresse du registre autre que le
 * tableau de bord ; toute autre valeur efface ce qui était retenu. Un stockage refusé ne
 * bloque rien : la connexion mène alors au tableau de bord.
 */
export function rememberRequestedSection(
  href: string | undefined,
  sections: readonly AdminSection[] = SECTIONS,
  storage: SectionStorage | null = tabStorage(),
): void {
  if (storage === null) return
  const section = knownSection(href, sections)
  try {
    if (section !== null && section !== routes.dashboard()) storage.setItem(REQUESTED_SECTION_KEY, section)
    else storage.removeItem(REQUESTED_SECTION_KEY)
  } catch {
    // Quota, mode privé : on retombe sur le tableau de bord.
  }
}

/**
 * Reprend la section retenue, UNE fois : elle est effacée aussitôt lue, puis relue contre
 * le registre (une valeur posée par un autre code de cette origine n'est jamais suivie
 * telle quelle) ; sinon le tableau de bord.
 */
export function takeRequestedSection(sections: readonly AdminSection[] = SECTIONS, storage: SectionStorage | null = tabStorage()): string {
  if (storage === null) return routes.dashboard()
  let stored: string | null = null
  try {
    stored = storage.getItem(REQUESTED_SECTION_KEY)
  } catch {
    stored = null
  }
  try {
    storage.removeItem(REQUESTED_SECTION_KEY)
  } catch {
    // Effacement refusé : la valeur reste bornée au registre à la prochaine lecture.
  }
  return knownSection(stored, sections) ?? routes.dashboard()
}

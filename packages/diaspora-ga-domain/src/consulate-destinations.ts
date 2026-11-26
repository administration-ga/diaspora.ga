/**
 * Passerelle DIASPORA.GA → consulat.ga (contrat DIASPORA-PASSERELLE-V1, `docs/contrats/`,
 * chantier CH-863, lot D1) — règle PURE, sans dépendance.
 *
 * DIASPORA.GA et consulat.ga restent deux applications : deux dépôts, deux bases, deux sessions.
 * Basculer de l'une à l'autre est une NAVIGATION dans le même onglet, rien de plus : aucune
 * donnée ne passe d'une base à l'autre, aucun identifiant, rien de pré-rempli, aucun référent,
 * aucune mesure par personne. Le sens inverse (consulat.ga → la porte d'arrivée de DIASPORA.GA)
 * vit dans la table des routes de l'application. L'attestation consulaire (DIASPORA-ATTESTATION-V1)
 * est un autre flux, de serveur à serveur et consenti, hors de ce contrat.
 *
 * Les destinations sont FERMÉES : une clé stable, un chemin et des paramètres fixés par le
 * contrat, jamais une valeur qui désigne la personne. L'origine de consulat.ga se lit dans la
 * configuration de l'application (`NEXT_PUBLIC_CONSULATE_URL`) ; absente ou invalide, aucune
 * destination n'existe, et l'écran ne montre aucun lien (jamais de lien mort).
 */

/** Les destinations de consulat.ga, dans l'ordre du contrat : l'espace personnel, puis l'inscription. */
export const CONSULATE_DESTINATIONS = ["mySpace", "register"] as const
export type ConsulateDestination = (typeof CONSULATE_DESTINATIONS)[number]

/** Le chemin d'une destination dans consulat.ga et ses paramètres fixes, non personnels. */
export interface ConsulateDestinationRule {
  readonly path: string
  readonly query: Readonly<Record<string, string>>
}

/**
 * La table du contrat. `register` pré-choisit le type d'inscription (« long séjour », celui de
 * la diaspora) : une valeur de formulaire de consulat.ga, la même pour tout le monde.
 */
export const CONSULATE_DESTINATION_RULES: Readonly<Record<ConsulateDestination, ConsulateDestinationRule>> = {
  mySpace: { path: "/my-space", query: {} },
  register: { path: "/register", query: { type: "long_stay" } },
}

/** Un caractère de contrôle, un blanc ou une barre inverse : rien ne passe. */
function hasUnsafeCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code <= 0x20 || code === 0x7f || value[index] === "\\") return true
  }
  return false
}

/**
 * L'origine configurée de consulat.ga, normalisée (`https://hôte[:port]`), ou `null`. Refusée :
 * une valeur absente ou vide, un autre schéma que https, des identifiants de connexion, un
 * chemin (hors la barre finale), une requête, une ancre, un blanc ou une barre inverse.
 */
export function parseConsulateOrigin(raw: string | null | undefined): string | null {
  const value = raw?.trim() ?? ""
  if (value.length === 0 || hasUnsafeCharacter(value) || value.includes("?") || value.includes("#")) return null
  if (!/^https:\/\//i.test(value)) return null
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return null
  }
  if (url.protocol !== "https:" || url.username !== "" || url.password !== "" || url.pathname !== "/") return null
  return url.origin
}

/**
 * L'adresse absolue d'une destination du contrat, composée sur l'origine configurée ; `null`
 * quand l'origine manque ou est refusée. Rien d'autre n'entre dans l'adresse.
 */
export function consulateDestinationUrl(origin: string | null | undefined, destination: ConsulateDestination): string | null {
  const base = parseConsulateOrigin(origin)
  if (base === null) return null
  const rule = CONSULATE_DESTINATION_RULES[destination]
  const url = new URL(rule.path, base)
  for (const [name, value] of Object.entries(rule.query)) url.searchParams.set(name, value)
  return url.toString()
}

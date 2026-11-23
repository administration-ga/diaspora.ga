import { LEGAL_TEXT_KINDS } from "@diaspora-ga/domain"

import { LEGAL_TEXT_ROUTES } from "./legal-texts"

/**
 * Les pages publiques qui ne lisent aucune donnée : les cinq textes du site (LX-05). Une arrivée
 * directe sur l'une d'elles n'attend pas la session du moteur (`components/providers.tsx`) : le
 * serveur en rend le texte entier, lisible sans script, par un téléchargement simple comme par un
 * lecteur d'écran.
 */
const STATIC_PUBLIC_PATHS: ReadonlySet<string> = new Set(LEGAL_TEXT_KINDS.map((kind) => LEGAL_TEXT_ROUTES[kind]()))

/** L'adresse est-elle celle d'un texte du site ? Une barre oblique finale est admise. */
export function isStaticPublicPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname
  return STATIC_PUBLIC_PATHS.has(path)
}

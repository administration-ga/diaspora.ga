/**
 * Le corps d'une rubrique d'un texte du site, lu en BLOCS (LX-05) — module PUR.
 *
 * Une rubrique est une seule phrase de langue (`legal.<texte>.<rubrique>.body`) : les
 * fichiers de langue ne portent que des chaînes. Un texte développé a pourtant des
 * paragraphes et des listes ; la convention tient en deux règles, sans balisage :
 *   · une ligne vide sépare deux blocs ;
 *   · un bloc dont CHAQUE ligne commence par un tiret (« – ») est une liste, une ligne
 *     par élément ; tout autre bloc est un paragraphe.
 * Aucune mise en forme n'entre dans le texte lui-même : ni gras, ni lien, ni titre.
 */

export type LegalBlock =
  | { readonly kind: "paragraph"; readonly text: string }
  | { readonly kind: "list"; readonly items: readonly string[] }

/** Le tiret demi-cadratin des listes, ou le trait d'union d'une saisie au clavier. */
const BULLET = /^[–-]\s+/

export function parseLegalBody(body: string): LegalBlock[] {
  return body
    .split(/\n\s*\n/)
    .map((chunk) => chunk.split("\n").map((line) => line.trim()).filter((line) => line.length > 0))
    .filter((lines) => lines.length > 0)
    .map((lines) =>
      lines.every((line) => BULLET.test(line))
        ? { kind: "list" as const, items: lines.map((line) => line.replace(BULLET, "")) }
        : { kind: "paragraph" as const, text: lines.join(" ") },
    )
}

/** Tout le texte d'un corps, sans ses marques de liste : ce qu'une personne lit à l'écran. */
export function legalBodyLines(body: string): string[] {
  return parseLegalBody(body).flatMap((block) => (block.kind === "list" ? [...block.items] : [block.text]))
}

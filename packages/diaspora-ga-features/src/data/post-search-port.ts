/**
 * Capacité « chercher dans les publications » (DS-11, volet recherche) — PORT de données.
 * PROPRIÉTAIRE : ce chantier (CH-817).
 *
 * Les publications que le lecteur a le DROIT de lire dans DIASPORA.GA, et elles seules : le
 * fournisseur relit chaque candidate par la même garde que le fil (audience, blocage, adhésion,
 * réseau). Une publication de groupe d'autrui ne remonte jamais (elle se cherche sur le mur de
 * son groupe). La recherche est un acte de découverte : le masquage et la sourdine ne
 * s'appliquent pas, le blocage si (règle du moteur, `posts.search`). Aucune recherche n'est
 * gardée, ni au serveur, ni dans le navigateur.
 *
 * Bornée : le moteur ne rend qu'une fenêtre de publications, sans curseur. L'écran en demande une
 * fenêtre de plus à chaque « Voir plus », jusqu'à la borne ; à la borne, il dit de préciser.
 *
 * Facultative : un fournisseur qui ne la sert pas la laisse absente, et l'écran n'offre pas le champ.
 */
import type { Loadable, PostView } from "./types"

/** En deçà, on ne cherche pas : une lettre seule rapporterait un fragment de l'index (règle du moteur). */
export const POST_SEARCH_MIN_LENGTH = 2
/** Résultats par fenêtre : « Voir plus » en ajoute autant. */
export const POST_SEARCH_PAGE_SIZE = 20
/** Le plus de résultats qu'une recherche rend (la borne du moteur) ; au-delà, l'écran demande de préciser. */
export const POST_SEARCH_MAX_RESULTS = 50

export interface PostSearchRequest {
  /** Les mots saisis ; le fournisseur les replie (accents, casse). Trop courts : aucun appel, liste vide. */
  readonly query: string
  /** Combien de résultats l'écran veut voir ; ramené entre une fenêtre et la borne. */
  readonly limit: number
}

export interface PostSearchPage {
  readonly items: readonly PostView[]
  /** Une fenêtre de plus est disponible avant la borne. */
  readonly hasMore: boolean
  /** La borne est atteinte : d'autres publications peuvent exister ; préciser la recherche. */
  readonly capped: boolean
}

export type PostSearchQuery = Loadable<PostSearchPage>

export interface PostSearchCapability {
  /** Une recherche réactive, réservée aux membres qui lisent le réseau (le refus standard sinon). */
  usePostSearch(args: PostSearchRequest): PostSearchQuery
}

/** La page d'une recherche trop courte : rien, sans erreur. */
export const EMPTY_POST_SEARCH: PostSearchPage = Object.freeze({ items: [], hasMore: false, capped: false })

/** Le nombre de résultats voulu, entre une fenêtre et la borne. */
export function postSearchLimit(limit: number): number {
  const whole = Number.isFinite(limit) ? Math.trunc(limit) : POST_SEARCH_PAGE_SIZE
  return Math.min(Math.max(whole, 1), POST_SEARCH_MAX_RESULTS)
}

/** La fenêtre suivante, bornée. */
export function nextPostSearchLimit(limit: number): number {
  return postSearchLimit(postSearchLimit(limit) + POST_SEARCH_PAGE_SIZE)
}

/**
 * Ce que le fournisseur demande pour `limit` résultats : un de plus, pour savoir s'il en reste,
 * sans jamais dépasser la borne (à la borne, il ne peut pas le savoir).
 */
export function postSearchRequestSize(limit: number): number {
  return Math.min(postSearchLimit(limit) + 1, POST_SEARCH_MAX_RESULTS)
}

/** La page rendue à l'écran depuis ce que le fournisseur a trouvé (au plus `postSearchRequestSize`). */
export function toPostSearchPage(found: readonly PostView[], limit: number): PostSearchPage {
  const wanted = postSearchLimit(limit)
  return {
    items: found.slice(0, wanted),
    hasMore: wanted < POST_SEARCH_MAX_RESULTS && found.length > wanted,
    capped: wanted >= POST_SEARCH_MAX_RESULTS && found.length >= POST_SEARCH_MAX_RESULTS,
  }
}

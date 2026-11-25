/**
 * La grille des médias d'une publication (A6, consigne du propriétaire du 25/11/2026),
 * règle PURE, testée sans navigateur : la mise en page suit le nombre de médias, comme
 * sur les réseaux sociaux.
 *
 *   · 1 : pleine largeur, dans ses proportions bornées (`singleMediaRatio`) ;
 *   · 2 : côte à côte ;
 *   · 3 : une grande à gauche, deux empilées à droite ;
 *   · 4 : une grille 2 × 2 ;
 *   · au-delà : trois vignettes, puis une quatrième voilée marquée « +N », où N est le
 *     reste à voir à partir d'elle (elle comprise) — « 3 photos et plus, le reste qui
 *     continue », dit le propriétaire. La toucher ouvre la visionneuse à la quatrième.
 *
 * Aucun plafond n'est supposé : le moteur borne aujourd'hui une publication à quatre
 * photos (`POST_MEDIA_MAX_COUNT`), un lot du moteur pourra l'élever, la grille sert déjà.
 */

/** Le nombre de tuiles qu'une grille montre au plus ; au-delà, la dernière porte « +N ». */
export const MEDIA_GRID_VISIBLE_TILES = 4

export type MediaGridVariant = "none" | "single" | "pair" | "trio" | "quad" | "overflow"

/** La place d'une tuile : pleine largeur, demi, grande (deux rangées), empilée, quart. */
export type MediaTileArea = "full" | "half" | "large" | "stacked" | "quarter"

export interface MediaGridTile {
  /** L'index du média dans la publication. */
  readonly index: number
  readonly area: MediaTileArea
  /** Le reste à voir, posé sur la dernière tuile d'une grille qui déborde ; zéro sinon. */
  readonly more: number
}

export interface MediaGridLayout {
  readonly variant: MediaGridVariant
  readonly tiles: readonly MediaGridTile[]
}

function tile(index: number, area: MediaTileArea, more = 0): MediaGridTile {
  return { index, area, more }
}

export function mediaGridLayout(count: number): MediaGridLayout {
  const total = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0
  if (total === 0) return { variant: "none", tiles: [] }
  if (total === 1) return { variant: "single", tiles: [tile(0, "full")] }
  if (total === 2) return { variant: "pair", tiles: [tile(0, "half"), tile(1, "half")] }
  if (total === 3) return { variant: "trio", tiles: [tile(0, "large"), tile(1, "stacked"), tile(2, "stacked")] }
  if (total === MEDIA_GRID_VISIBLE_TILES) return { variant: "quad", tiles: [0, 1, 2, 3].map((index) => tile(index, "quarter")) }
  const shown = MEDIA_GRID_VISIBLE_TILES - 1
  return {
    variant: "overflow",
    tiles: [...Array.from({ length: shown }, (_, index) => tile(index, "quarter")), tile(shown, "quarter", total - shown)],
  }
}

/**
 * Les bornes d'une photo seule (largeur sur hauteur) : pas plus haute qu'un portrait 4:5,
 * pas plus large qu'un 16:9. Au-delà, la tuile recadre ; la visionneuse montre tout.
 */
export const SINGLE_MEDIA_RATIO = { min: 4 / 5, max: 16 / 9 } as const

/** Le rapport d'une photo seule, borné ; `null` sans dimensions valides (le cadre réservé s'applique). */
export function singleMediaRatio(width: number | null, height: number | null): number | null {
  if (width === null || height === null || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null
  return Math.min(SINGLE_MEDIA_RATIO.max, Math.max(SINGLE_MEDIA_RATIO.min, width / height))
}

// @vitest-environment node
import { POST_MEDIA_MAX_COUNT } from "@antsia/social-domain/content"
import { describe, expect, it } from "vitest"

import { MEDIA_GRID_VISIBLE_TILES, SINGLE_MEDIA_RATIO, mediaGridLayout, singleMediaRatio } from "./media-layout"

/**
 * A6 (25/11/2026, consigne du propriétaire) : la grille des photos d'une publication
 * s'adapte au nombre — une photo pleine largeur, deux côte à côte, trois en une grande
 * et deux empilées, quatre en 2 × 2 ; au-delà, trois vignettes puis une quatrième,
 * voilée, marquée « +N » (N : le reste à voir, à partir d'elle). Aucun nombre n'est
 * borné par le moteur ici : la règle vaut pour tout N.
 */
describe("mediaGridLayout — la grille suit le nombre de médias", () => {
  it("aucun média, aucune grille", () => {
    expect(mediaGridLayout(0)).toEqual({ variant: "none", tiles: [] })
  })

  it("une photo : pleine largeur", () => {
    expect(mediaGridLayout(1)).toEqual({ variant: "single", tiles: [{ index: 0, area: "full", more: 0 }] })
  })

  it("deux photos : côte à côte", () => {
    expect(mediaGridLayout(2)).toEqual({ variant: "pair", tiles: [{ index: 0, area: "half", more: 0 }, { index: 1, area: "half", more: 0 }] })
  })

  it("trois photos : une grande, deux empilées", () => {
    expect(mediaGridLayout(3)).toEqual({
      variant: "trio",
      tiles: [{ index: 0, area: "large", more: 0 }, { index: 1, area: "stacked", more: 0 }, { index: 2, area: "stacked", more: 0 }],
    })
  })

  it("quatre photos : une grille 2 × 2, sans « +N »", () => {
    const layout = mediaGridLayout(4)
    expect(layout.variant).toBe("quad")
    expect(layout.tiles.map((tile) => [tile.index, tile.area, tile.more])).toEqual([[0, "quarter", 0], [1, "quarter", 0], [2, "quarter", 0], [3, "quarter", 0]])
  })

  it.each([5, 6, 7, 8, 9, 10])("%i photos : trois vignettes, puis la quatrième voilée marquée « +N » (le reste à voir)", (count) => {
    const layout = mediaGridLayout(count)
    expect(layout.variant).toBe("overflow")
    expect(layout.tiles).toHaveLength(MEDIA_GRID_VISIBLE_TILES)
    expect(layout.tiles.map((tile) => tile.index)).toEqual([0, 1, 2, 3])
    expect(layout.tiles.slice(0, 3).every((tile) => tile.more === 0)).toBe(true)
    // La quatrième ouvre la suite : elle et les suivantes, soit tout ce qui suit les trois premières.
    expect(layout.tiles[3]).toEqual({ index: 3, area: "quarter", more: count - 3 })
  })

  it("la règle ne dépend pas du plafond du moteur : elle sert déjà au-delà de ses quatre photos", () => {
    expect(POST_MEDIA_MAX_COUNT).toBeGreaterThanOrEqual(1)
    expect(mediaGridLayout(POST_MEDIA_MAX_COUNT + 6).tiles[3]?.more).toBe(POST_MEDIA_MAX_COUNT + 3)
    expect(() => mediaGridLayout(-1)).not.toThrow()
    expect(mediaGridLayout(-1).variant).toBe("none")
    expect(mediaGridLayout(2.7).variant).toBe("pair")
  })
})

describe("singleMediaRatio — une photo seule garde ses proportions, dans des bornes", () => {
  it("garde le rapport d'une photo ordinaire", () => {
    expect(singleMediaRatio(800, 600)).toBeCloseTo(4 / 3)
    expect(singleMediaRatio(1080, 1080)).toBe(1)
  })

  it("borne une photo très haute au portrait 4:5, une très large au 16:9", () => {
    expect(singleMediaRatio(1080, 4000)).toBe(SINGLE_MEDIA_RATIO.min)
    expect(SINGLE_MEDIA_RATIO.min).toBeCloseTo(4 / 5)
    expect(singleMediaRatio(4000, 500)).toBe(SINGLE_MEDIA_RATIO.max)
    expect(SINGLE_MEDIA_RATIO.max).toBeCloseTo(16 / 9)
  })

  it("sans dimensions connues ou valides, aucun rapport n'est inventé", () => {
    expect(singleMediaRatio(null, null)).toBeNull()
    expect(singleMediaRatio(800, 0)).toBeNull()
    expect(singleMediaRatio(Number.NaN, 600)).toBeNull()
  })
})

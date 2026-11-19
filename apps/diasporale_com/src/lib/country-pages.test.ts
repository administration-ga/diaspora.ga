import type { PageView } from "@diasporale/features/data"
import { describe, expect, it } from "vitest"

import { countryPagesPreview, RAIL_OFFICIAL_PAGES_MAX, RAIL_PAGES_MAX } from "./country-pages"

const page = (id: string, ownerKind: PageView["ownerKind"]): PageView => ({
  id,
  handle: id,
  name: id,
  ownerKind,
  trust: ownerKind === "institution" ? "official" : "community",
  badge: ownerKind === "institution" ? "official" : "community",
  country: "FR",
  city: null,
  description: "",
  followers: 0,
  claimable: false,
})

describe("pages d'un pays dans le rail du fil", () => {
  it("les pages officielles d'abord, puis associations et entreprises en alternance", () => {
    const preview = countryPagesPreview({
      officialPages: [page("consulat", "institution")],
      associations: [page("a1", "association"), page("a2", "association"), page("a3", "association")],
      companies: [page("e1", "company")],
    })
    expect(preview.map((item) => item.id)).toEqual(["consulat", "a1", "e1", "a2"])
    expect(preview).toHaveLength(RAIL_PAGES_MAX)
  })

  it("une page portée par deux listes ne paraît qu'une fois ; un plafond nul ne montre rien", () => {
    const shared = page("double", "association")
    expect(countryPagesPreview({ officialPages: [], associations: [shared], companies: [shared] }).map((item) => item.id)).toEqual(["double"])
    expect(countryPagesPreview({ officialPages: [], associations: [shared], companies: [] }, 0)).toEqual([])
  })

  it("deux pages officielles au plus : associations et entreprises gardent leur place", () => {
    const preview = countryPagesPreview({
      officialPages: [page("o1", "institution"), page("o2", "institution"), page("o3", "institution")],
      associations: [page("a1", "association")],
      companies: [page("e1", "company")],
    })
    expect(preview.map((item) => item.id)).toEqual(["o1", "o2", "a1", "e1"])
    expect(preview.filter((item) => item.ownerKind === "institution")).toHaveLength(RAIL_OFFICIAL_PAGES_MAX)
  })

  it("aucune page inscrite : un aperçu vide", () => {
    expect(countryPagesPreview({ officialPages: [], associations: [], companies: [] })).toEqual([])
  })
})

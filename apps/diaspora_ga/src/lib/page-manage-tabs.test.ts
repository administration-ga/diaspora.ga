import type { PageOwnerKind } from "@diaspora-ga/domain"
import { describe, expect, it } from "vitest"

import { offeredManageTabs, PAGE_MANAGE_TABS, pageManageTabOffered, type PageManageServed } from "./page-manage-tabs"

const ALL: PageManageServed = { servicesOpen: true, reviews: true, jobs: true, decisions: true }
const NONE: PageManageServed = { servicesOpen: false, reviews: false, jobs: false, decisions: false }
const CORE = ["publications", "identite", "equipe", "revendications"]

describe("les onglets de gestion qu'une page offre (CH-816, P0)", () => {
  it("l'ordre de la gestion : publications, services, demandes, avis, emplois, identité, équipe, revendications, décisions", () => {
    expect(PAGE_MANAGE_TABS).toEqual(["publications", "services", "demandes", "avis", "emplois", "identite", "equipe", "revendications", "decisions"])
  })

  it.each(["company", "association"] as const)("services fermés, une page « %s » n'offre ni services, ni demandes, ni avis", (kind) => {
    const tabs = offeredManageTabs(kind, { ...ALL, servicesOpen: false })
    expect(tabs).not.toContain("services")
    expect(tabs).not.toContain("demandes")
    expect(tabs).not.toContain("avis")
    expect(tabs).toEqual(expect.arrayContaining(CORE))
  })

  it.each(["company", "association"] as const)("services ouverts, une page « %s » offre services et demandes ; les avis s'ils sont servis", (kind) => {
    expect(offeredManageTabs(kind, { ...NONE, servicesOpen: true })).toEqual(["publications", "services", "demandes", "identite", "equipe", "revendications"])
    expect(offeredManageTabs(kind, { ...NONE, servicesOpen: true, reviews: true })).toContain("avis")
  })

  it.each(["institution", "media", "community"] as const)("une page « %s » ne propose pas de services, même tout ouvert", (kind: PageOwnerKind) => {
    for (const tab of ["services", "demandes", "avis"] as const) expect(pageManageTabOffered(tab, kind, ALL)).toBe(false)
  })

  it("les emplois : une page qui recrute, emplois servis ; les décisions : servies", () => {
    expect(pageManageTabOffered("emplois", "association", ALL)).toBe(true)
    expect(pageManageTabOffered("emplois", "association", { ...ALL, jobs: false })).toBe(false)
    expect(pageManageTabOffered("emplois", "institution", ALL)).toBe(false)
    expect(pageManageTabOffered("decisions", "institution", ALL)).toBe(true)
    expect(pageManageTabOffered("decisions", "company", { ...ALL, decisions: false })).toBe(false)
  })

  it("rien de servi : le socle de la gestion seul ; une capacité non dite n'est pas servie", () => {
    expect(offeredManageTabs("company", NONE)).toEqual(CORE)
    expect(offeredManageTabs("company", {})).toEqual(CORE)
    expect(pageManageTabOffered("services", "company", { servicesOpen: true })).toBe(true)
  })
})

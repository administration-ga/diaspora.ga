import {
  MEMBER_ACCOUNT_ENTRIES,
  MEMBER_BAR_ENTRIES,
  MEMBER_COMMUNITY_FEATURES,
  MEMBER_CREATE_FORMATS,
  MEMBER_CREATE_RULES,
  MEMBER_MENU_ENTRIES,
  MEMBER_MENU_ENTRY_IDS,
  MEMBER_PERSONAL_ENTRIES,
  MEMBER_RESPONSIBLE_ENTRIES,
  type MemberMenuRouteKey,
} from "@diaspora-ga/features/navigation"
import { describe, expect, it } from "vitest"

import { memberCreateHref, memberMenuHref, MEMBER_MENU_HREFS } from "./member-menu"
import { ACCOUNT_DESTINATIONS, PERSONAL_DESTINATIONS, PRIMARY_DESTINATIONS, type RouteKey } from "./nav-destinations"
import { featureOfPath, featuresUnderDestination } from "./network-features"
import { routes } from "./routes"

/**
 * CH-815 A5 — parité entre le menu partagé (`@diaspora-ga/features/navigation`) et les tables de
 * diaspora.ga : le module qu'une entrée DÉCLARE est celui que la table des adresses donne à son
 * adresse, « Communautés » s'offre avec les modules que les deux tables rangent sous elle, et les
 * identifiants des entrées sont ceux de la table des destinations. Ce qui rend l'aperçu
 * d'admin.diaspora.ga vrai pour ce que la coque de diaspora.ga filtre.
 */
const HANDLE = "awa.demo"

describe("menu partagé — parité avec les tables de diaspora.ga", () => {
  it("chaque clé de route du menu est une clé de la table des routes, et compose la même adresse", () => {
    const keys: RouteKey[] = [...Object.keys(MEMBER_MENU_HREFS), "newPage"] as MemberMenuRouteKey[]
    for (const key of keys) expect(Object.keys(routes), key).toContain(key)
    for (const [key, href] of Object.entries(MEMBER_MENU_HREFS)) {
      const route = routes[key as keyof typeof routes] as (value?: string) => string
      expect(href(HANDLE), key).toBe(key === "profile" ? routes.profile(HANDLE) : route())
    }
  })

  it("le module déclaré par chaque entrée est celui de la table des adresses de diaspora.ga", () => {
    for (const id of MEMBER_MENU_ENTRY_IDS) {
      const rule = MEMBER_MENU_ENTRIES[id]
      expect(featureOfPath(memberMenuHref(rule, HANDLE)), id).toBe(rule.feature)
    }
    for (const id of MEMBER_CREATE_FORMATS) {
      const rule = MEMBER_CREATE_RULES[id]
      expect(featureOfPath(memberCreateHref(rule)), id).toBe(rule.feature)
    }
  })

  it("« Communautés » s'offre avec les modules que les deux tables rangent sous elle", () => {
    expect(MEMBER_COMMUNITY_FEATURES).toEqual(featuresUnderDestination("communities"))
    expect(MEMBER_MENU_ENTRIES.communities.offeredWith).toEqual(featuresUnderDestination("communities"))
  })

  it("les entrées portent les identifiants de la table des destinations (barre, « Mon espace », compte)", () => {
    expect(MEMBER_BAR_ENTRIES).toEqual(PRIMARY_DESTINATIONS)
    expect([...MEMBER_PERSONAL_ENTRIES, ...MEMBER_RESPONSIBLE_ENTRIES]).toEqual(PERSONAL_DESTINATIONS)
    expect(MEMBER_ACCOUNT_ENTRIES).toEqual(ACCOUNT_DESTINATIONS)
  })

  it("« Créer » mène à une actu, puis à l'inscription d'une association et d'une entreprise", () => {
    expect(MEMBER_CREATE_FORMATS.map((id) => memberCreateHref(MEMBER_CREATE_RULES[id]))).toEqual([routes.newStory(), routes.newPage("association"), routes.newPage("company")])
  })
})

import { describe, expect, it } from "vitest"

import { anchors, routes } from "./routes"
import {
  SETTINGS_ANCHORS,
  SETTINGS_VIEW_ANCHORS,
  SETTINGS_VIEW_LABELS,
  SETTINGS_VIEWS,
  settingsListAnchor,
  settingsViewFragment,
  settingsViewOfAnchor,
} from "./settings-views"

/**
 * Les sous-vues des réglages (« une page = une vue », lot 2a, plan du 24/11/2026, § 3) : chaque
 * ancre qui mène aux réglages tombe sur sa sous-vue, et chaque sous-vue a son ancre canonique.
 */
const anchorOf = (href: string) => href.slice(href.indexOf("#") + 1)

/** Les routes de la table qui mènent à une ancre des réglages (relevées, pas recopiées). */
const SETTINGS_ROUTES = Object.entries(routes).flatMap(([key, value]) => {
  if (typeof value !== "function" || value.length !== 0) return []
  const href: unknown = (value as () => unknown)()
  return typeof href === "string" && href.startsWith(`${routes.settings()}#`) ? [[key, href] as const] : []
})

describe("sous-vues des réglages — la table des ancres", () => {
  it("neuf sous-vues, dans l'ordre de la liste", () => {
    expect(SETTINGS_VIEWS).toEqual(["compte", "profil", "pays", "fil", "appels", "affichage", "consentements", "parrainage", "donnees"])
  })

  it("chaque route des réglages de la table des routes tombe sur sa sous-vue", () => {
    expect(Object.fromEntries(SETTINGS_ROUTES.map(([key, href]) => [key, settingsViewOfAnchor(anchorOf(href))]))).toEqual({
      settingsFeed: "fil",
      settingsImages: "profil",
      settingsData: "donnees",
      settingsReports: "donnees",
      settingsDecisions: "donnees",
      sponsorHelp: "parrainage",
    })
  })

  it("les ancres posées ailleurs (profil, membres) et celles des sections tombent sur la sous-vue qui les porte", () => {
    expect(settingsViewOfAnchor("profil")).toBe("profil")
    expect(settingsViewOfAnchor("annuaire")).toBe("fil")
    expect(settingsViewOfAnchor("session")).toBe("compte")
    expect(settingsViewOfAnchor("notifications-appareil")).toBe("affichage")
    expect(settingsViewOfAnchor("messages-et-appels")).toBe("appels")
  })

  it("chaque ancre canonique ramène à sa sous-vue, et c'est l'adresse de son entrée", () => {
    for (const view of SETTINGS_VIEWS) {
      const canonical = SETTINGS_VIEW_ANCHORS[view][0]
      expect(settingsViewOfAnchor(canonical)).toBe(view)
      expect(settingsViewFragment(view)).toBe(`#${canonical}`)
    }
  })

  it("une ancre n'appartient qu'à une sous-vue ; les autres ne désignent rien (la vue par défaut)", () => {
    expect(new Set(SETTINGS_ANCHORS).size).toBe(SETTINGS_ANCHORS.length)
    // L'ancienne rubrique des textes du site, l'ancre de la liste, une ancre inconnue.
    expect(settingsViewOfAnchor("informations")).toBeNull()
    expect(settingsViewOfAnchor(settingsListAnchor())).toBeNull()
    expect(settingsViewOfAnchor("inconnue")).toBeNull()
  })

  it("l'ancre de la liste vient de la table des routes, et n'est l'ancre d'aucune section", () => {
    expect(`#${settingsListAnchor()}`).toBe(anchors.settingsList)
    expect(SETTINGS_ANCHORS).not.toContain(settingsListAnchor())
  })

  it("chaque sous-vue a sa clé de libellé, écrite en toutes lettres", () => {
    expect(SETTINGS_VIEW_LABELS).toEqual({
      compte: "settings.views.account",
      profil: "settings.views.profile",
      pays: "settings.views.country",
      fil: "settings.views.feed",
      appels: "settings.calls.title",
      affichage: "settings.views.display",
      consentements: "settings.consents",
      parrainage: "settings.views.sponsor",
      donnees: "settings.data",
    })
  })
})

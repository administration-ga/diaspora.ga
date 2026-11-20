import { describe, expect, it } from "vitest"

import { createDemoDataSource } from "../demo/source"
import { DemoStore } from "../demo/store"
import { ACTION_ERROR_CODES } from "./errors"
import {
  FEATURE_CAPABILITIES,
  featureGateOf,
  gateSource,
  knownFeatures,
  NETWORK_FEATURES,
  NETWORK_FEATURES_ERROR_CODES,
  networkFeatureToggleError,
} from "./network-features-port"

const REASON = "Ouverture pour le lancement du pilote."

describe("fonctionnalités activables du réseau — port (ADR-0041 du moteur)", () => {
  it("chaque fonctionnalité gouverne des capacités de la source, sans doublon ; le socle n'en fait pas partie", () => {
    expect(Object.keys(FEATURE_CAPABILITIES)).toEqual([...NETWORK_FEATURES])
    const all = Object.values(FEATURE_CAPABILITIES).flat()
    expect(new Set(all).size).toBe(all.length)
    for (const core of ["dataRights", "contentReports", "moderationDesk", "conversations", "callSettings", "networkFeatures", "profileImages", "profilePublication", "contentPreferences"]) {
      expect(all).not.toContain(core)
    }
  })

  it("une source gardée perd les capacités des fonctionnalités fermées, garde le socle et dit ses clés ouvertes", () => {
    const source = createDemoDataSource(new DemoStore(null, () => 0, 0))
    const closed = gateSource(source, [])
    for (const capability of Object.values(FEATURE_CAPABILITIES).flat()) expect(closed[capability], capability).toBeUndefined()
    expect(closed.moderationDesk).toBe(source.moderationDesk)
    expect(closed.contentReports).toBe(source.contentReports)
    expect(closed.networkFeatures).toBe(source.networkFeatures)
    expect(closed.useFeed).toBe(source.useFeed)
    expect(closed.actions).toBe(source.actions)
    expect(closed.openFeatures).toEqual([])
    expect(closed.featuresReady).toBe(true)

    const some = gateSource(source, ["jobs", "pages"], false)
    expect(some.jobs).toBe(source.jobs)
    expect(some.pages).toBe(source.pages)
    expect(some.pageAdmin).toBe(source.pageAdmin)
    expect(some.services).toBeUndefined()
    expect(some.mutualAid).toBeUndefined()
    // Les clés reprennent l'ordre de la liste fermée.
    expect(some.openFeatures).toEqual(["pages", "jobs"])
    expect(some.featuresReady).toBe(false)
  })

  it("la garde : une source non gardée sert tout ce qu'elle porte ; une source gardée, ses seules clés ouvertes", () => {
    const ungated = featureGateOf({})
    expect(ungated.ready).toBe(true)
    for (const feature of NETWORK_FEATURES) expect(ungated.isOpen(feature)).toBe(true)
    expect(featureGateOf(null).isOpen("pages")).toBe(true)
    const gated = featureGateOf({ openFeatures: ["mentoring"], featuresReady: false })
    expect(gated.ready).toBe(false)
    expect(gated.isOpen("mentoring")).toBe(true)
    expect(gated.isOpen("pages")).toBe(false)
  })

  it("une liste lue est ramenée aux clés connues, dans l'ordre", () => {
    expect(knownFeatures(["pilotMetrics", "calls", "pages"])).toEqual(["pages", "pilotMetrics"])
    expect(knownFeatures([])).toEqual([])
  })

  it("une bascule se juge comme au moteur : motif, puis dépendance aux pages", () => {
    expect(networkFeatureToggleError({ feature: "pages", enabled: true, reason: "court" }, [])).toBe("network_feature_reason_length")
    expect(networkFeatureToggleError({ feature: "pages", enabled: true, reason: "x".repeat(501) }, [])).toBe("network_feature_reason_length")
    expect(networkFeatureToggleError({ feature: "jobs", enabled: true, reason: REASON }, [])).toBe("network_feature_requires_parent")
    expect(networkFeatureToggleError({ feature: "jobs", enabled: true, reason: REASON }, ["pages"])).toBeNull()
    expect(networkFeatureToggleError({ feature: "pages", enabled: false, reason: REASON }, ["pages", "services"])).toBe("network_feature_has_open_children")
    expect(networkFeatureToggleError({ feature: "mutualAid", enabled: true, reason: REASON }, [])).toBeNull()
  })

  it("les refus d'une bascule sont des codes d'action traduisibles", () => {
    for (const code of NETWORK_FEATURES_ERROR_CODES) expect(ACTION_ERROR_CODES).toContain(code)
  })
})

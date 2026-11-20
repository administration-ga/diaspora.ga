// @vitest-environment jsdom
import { act, cleanup, render, renderHook, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { GatedDataSourceProvider, useDataSource, useFeatureGate } from "../data/context"
import { createDemoNetworkFeatures, demoOpenFeatures } from "./network-features"
import { createDemoDataSource } from "./source"
import { createDemoSeed, type DemoState } from "./state"
import { DEMO_STORAGE_KEY, DemoStore } from "./store"

/**
 * Fonctionnalités activables de démonstration (ADR-0041 du moteur) : fermées tant que rien
 * n'est décidé, ouvertes et fermées par la personne de la session (l'administration fictive),
 * mêmes règles que le moteur ; la source montée par l'application les garde.
 */
const NOW = Date.UTC(2026, 10, 20, 12)
const REASON = "Ouverture pour le lancement du pilote."

function setup(personId: string | null = "p-prisca") {
  const state: DemoState = { ...createDemoSeed(NOW), session: { personId } }
  const stored = new Map([[DEMO_STORAGE_KEY, JSON.stringify(state)]])
  const storage = {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => { stored.set(key, value) },
    removeItem: vi.fn((key: string) => { stored.delete(key) }),
  }
  const store = new DemoStore(storage, () => NOW, 0)
  return { store, features: createDemoNetworkFeatures(store) }
}

afterEach(cleanup)

describe("fonctionnalités activables de démonstration", () => {
  it("le jeu de départ n'ouvre rien", () => {
    const { store, features } = setup()
    expect(demoOpenFeatures(store.getState())).toEqual([])
    const { result } = renderHook(() => features.useOpen())
    expect(result.current).toEqual({ status: "ready", data: [] })
  })

  it("ouvrir et fermer suit les règles du moteur ; une décision déjà en place ne change rien", async () => {
    const { store, features } = setup()
    expect(await features.setFeature({ feature: "services", enabled: true, reason: REASON })).toEqual({ ok: false, code: "network_feature_requires_parent" })
    expect(await features.setFeature({ feature: "pages", enabled: true, reason: "court" })).toEqual({ ok: false, code: "network_feature_reason_length" })
    expect(await features.setFeature({ feature: "pages", enabled: true, reason: REASON })).toEqual({ ok: true, value: { changed: true } })
    expect(await features.setFeature({ feature: "services", enabled: true, reason: REASON })).toEqual({ ok: true, value: { changed: true } })
    expect(await features.setFeature({ feature: "pages", enabled: false, reason: REASON })).toEqual({ ok: false, code: "network_feature_has_open_children" })
    expect(await features.setFeature({ feature: "pages", enabled: true, reason: REASON })).toEqual({ ok: true, value: { changed: false } })
    expect(demoOpenFeatures(store.getState())).toEqual(["pages", "services"])

    const { result } = renderHook(() => features.useSettings())
    expect(result.current.status).toBe("ready")
    if (result.current.status !== "ready") return
    expect(result.current.data.find((row) => row.feature === "services")).toEqual({ feature: "services", enabled: true, open: true, requires: "pages", updatedAt: NOW })
    expect(result.current.data.find((row) => row.feature === "jobs")).toEqual({ feature: "jobs", enabled: false, open: false, requires: "pages", updatedAt: null })

    // Une remise à zéro referme tout.
    await act(async () => { await store.reset() })
    expect(demoOpenFeatures(store.getState())).toEqual([])
  })

  it("hors session, l'état n'est pas lu et rien ne se décide", async () => {
    const { features } = setup(null)
    const { result } = renderHook(() => features.useSettings())
    expect(result.current).toEqual({ status: "error", code: "not_signed_in" })
    expect(await features.setFeature({ feature: "pages", enabled: true, reason: REASON })).toEqual({ ok: false, code: "not_signed_in" })
  })

  it("la source montée par l'application ne sert que les modules ouverts, et suit une ouverture", async () => {
    const { store } = setup()
    const source = createDemoDataSource(store)
    function Probe() {
      const gate = useFeatureGate()
      const mounted = useDataSource()
      return <p>{`${gate.isOpen("jobs") ? "emploi" : "sans-emploi"} ${mounted.jobs ? "capacite" : "sans-capacite"} ${mounted.moderationDesk ? "guichet" : "sans-guichet"}`}</p>
    }
    render(<GatedDataSourceProvider source={source}><Probe /></GatedDataSourceProvider>)
    expect(screen.getByText("sans-emploi sans-capacite guichet")).toBeTruthy()
    await act(async () => {
      await source.networkFeatures?.setFeature({ feature: "pages", enabled: true, reason: REASON })
      await source.networkFeatures?.setFeature({ feature: "jobs", enabled: true, reason: REASON })
    })
    expect(screen.getByText("emploi capacite guichet")).toBeTruthy()
  })
})

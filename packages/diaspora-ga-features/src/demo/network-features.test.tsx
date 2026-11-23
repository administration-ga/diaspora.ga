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
 * n'est décidé ; la démonstration les lit, le magasin fictif les pose (recettes), et la source
 * montée par l'application les garde.
 */
const NOW = Date.UTC(2026, 10, 20, 12)

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

  it("ne sert que la lecture des modules ouverts : les décisions se prennent dans l'administration (CH-815, D5)", async () => {
    const { store, features } = setup()
    expect(Object.keys(features)).toEqual(["useOpen"])
    // Le jeu fictif pose ses décisions par le magasin (recettes), avec la règle du module exigé.
    await act(async () => {
      await store.setNetworkFeature("services", true)
    })
    expect(demoOpenFeatures(store.getState())).toEqual([])
    await act(async () => {
      await store.setNetworkFeature("pages", true)
    })
    expect(demoOpenFeatures(store.getState())).toEqual(["pages", "services"])
    const { result } = renderHook(() => features.useOpen())
    expect(result.current).toEqual({ status: "ready", data: ["pages", "services"] })

    // Une remise à zéro referme tout.
    await act(async () => { await store.reset() })
    expect(demoOpenFeatures(store.getState())).toEqual([])
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
      await store.setNetworkFeature("pages", true)
      await store.setNetworkFeature("jobs", true)
    })
    expect(screen.getByText("emploi capacite guichet")).toBeTruthy()
  })
})

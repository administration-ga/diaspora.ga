// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { MemberBrowseRequest } from "../data/member-browse-port"
import { createDemoMemberBrowse, memberBrowseView } from "./member-browse"
import { createDemoDataSource } from "./source"
import { createDemoSeed, type DemoState } from "./state"
import { DEMO_STORAGE_KEY, DemoStore } from "./store"

/**
 * Parcours de l'annuaire en démonstration (CH-816, lot P3) : les membres fictifs du jeu,
 * jugés comme par la tranche — niveau choisi, consentement, pays du lecteur, blocage —,
 * puis filtrés sur ce que le lecteur voit ; des plus récents aux plus anciens.
 */
const NOW = Date.UTC(2026, 10, 23, 12)

function setup(personId: string | null = "p-steeve", patch: (state: DemoState) => DemoState = (state) => state) {
  const state: DemoState = patch({ ...createDemoSeed(NOW), session: { personId } })
  const stored = new Map([[DEMO_STORAGE_KEY, JSON.stringify(state)]])
  const storage = {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => { stored.set(key, value) },
    removeItem: vi.fn((key: string) => { stored.delete(key) }),
  }
  return new DemoStore(storage, () => NOW, 0)
}

const FRANCE: MemberBrowseRequest = { country: "FR", cursor: null }
const handles = (store: DemoStore, viewer: string, request: MemberBrowseRequest, pageSize?: number) =>
  memberBrowseView(store.getState(), viewer, request, NOW, pageSize).items.map((item) => item.handle)

afterEach(cleanup)

describe("parcourir l'annuaire fictif", () => {
  it("la règle de la recherche : le niveau « pays » pour la France seulement, « réseau » pour tous, le masqué jamais", () => {
    const store = setup()
    // Steeve (Lyon) : lui-même (visible par son choix), Prisca (réseau), Mireille (pays) ; Clarisse reste masquée.
    expect(handles(store, "p-steeve", FRANCE)).toEqual(["steeve.ngounie", "prisca.abanga", "mireille.ivindo"])
    // Nadia (Bruxelles) : le seul niveau « réseau ».
    expect(handles(store, "p-nadia", FRANCE)).toEqual(["prisca.abanga"])
  })

  it("« vérifiés seulement », la ville sur ce que le lecteur voit, un pays fermé", () => {
    const store = setup()
    expect(handles(store, "p-steeve", { ...FRANCE, verifiedOnly: true })).toEqual(["prisca.abanga", "mireille.ivindo"])
    // La ville de Prisca est réservée à ses relations : Steeve en est une, Nadia non.
    expect(handles(store, "p-steeve", { ...FRANCE, city: " BORDEAUX " })).toEqual(["prisca.abanga"])
    expect(handles(store, "p-nadia", { ...FRANCE, city: "Bordeaux" })).toEqual([])
    expect(handles(store, "p-steeve", { ...FRANCE, city: "Paris" })).toEqual([])
    // La Belgique n'est pas ouverte dans le jeu fictif.
    expect(memberBrowseView(store.getState(), "p-nadia", { country: "BE", cursor: null }, NOW)).toEqual({ items: [], continueCursor: null, isDone: true })
    expect(memberBrowseView(store.getState(), "p-steeve", { ...FRANCE, cursor: "-1" }, NOW)).toEqual({ items: [], continueCursor: null, isDone: true })
  })

  it("par fenêtres : un curseur, aucune carte deux fois, la fin dite", () => {
    const store = setup()
    const first = memberBrowseView(store.getState(), "p-steeve", FRANCE, NOW, 1)
    expect(first).toMatchObject({ isDone: false, continueCursor: "2" })
    expect(first.items.map((item) => item.handle)).toEqual(["steeve.ngounie"])
    const second = memberBrowseView(store.getState(), "p-steeve", { ...FRANCE, cursor: first.continueCursor }, NOW, 1)
    expect(second.items.map((item) => item.handle)).toEqual(["prisca.abanga"])
    const third = memberBrowseView(store.getState(), "p-steeve", { ...FRANCE, cursor: second.continueCursor }, NOW, 1)
    expect(third).toMatchObject({ isDone: true, continueCursor: null })
    expect(third.items.map((item) => item.handle)).toEqual(["mireille.ivindo"])
  })

  it("un blocage retire la personne ; la capacité refuse un compte en attente et sans session", async () => {
    const store = setup()
    await act(async () => {
      await store.block("p-mireille")
    })
    expect(handles(store, "p-steeve", FRANCE)).toEqual(["steeve.ngounie", "prisca.abanga"])

    const browse = createDemoMemberBrowse(store)
    expect(renderHook(() => browse.useBrowse(FRANCE)).result.current).toMatchObject({ status: "ready", data: { isDone: true } })

    const waiting = setup("p-rodrigue", (state) => ({
      ...state,
      memberships: { ...state.memberships, "p-rodrigue": { ...state.memberships["p-rodrigue"]!, grounds: { ...state.memberships["p-rodrigue"]!.grounds, sponsored: false } } },
    }))
    expect(renderHook(() => createDemoMemberBrowse(waiting).useBrowse(FRANCE)).result.current).toEqual({ status: "error", code: "status_insufficient" })
    expect(renderHook(() => createDemoMemberBrowse(setup(null)).useBrowse(FRANCE)).result.current).toEqual({ status: "error", code: "not_signed_in" })
  })

  it("la source de démonstration sert la capacité", () => {
    expect(createDemoDataSource(setup()).memberBrowse).toBeDefined()
  })
})

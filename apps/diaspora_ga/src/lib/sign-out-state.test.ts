import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { clearDiasporaGaDrafts } from "./sign-out-state"

const ERROR_MESSAGE = "Le nettoyage local des brouillons est incomplet."

function storage(initial: readonly string[]) {
  const entries = new Map(initial.map((key) => [key, `contenu privé de ${key}`]))
  const api = {
    get length() { return entries.size },
    key: vi.fn((index: number) => [...entries.keys()][index] ?? null),
    removeItem: vi.fn((key: string) => { entries.delete(key) }),
    getItem: vi.fn(() => { throw new Error("Les valeurs des brouillons ne doivent pas être lues") }),
  }
  return { api, entries }
}

beforeEach(() => {
  vi.stubGlobal("window", {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("clearDiasporaGaDrafts — déconnexion locale ciblée", () => {
  it("retire les brouillons de plusieurs personnes dans les deux stockages en conservant toutes les autres clés", () => {
    const preferences = [
      "diaspora-ga:demonstration:v1", "diaspora-ga:hubs:recents", "diaspora-ga:carte:statut:declaree",
      "theme", "diaspora-ga:langue", "antsia:antia:auth", "autre-produit:brouillon:awa",
      "diaspora-ga:brouillon", "diaspora-ga:brouillon_autre:awa", "autre:diaspora-ga:brouillon:awa",
    ]
    const local = storage(["diaspora-ga:brouillon:awa", ...preferences, "diaspora-ga:brouillon:prisca"])
    const session = storage(["diaspora-ga:brouillon:awa", "session:autre", "diaspora-ga:brouillon:steeve"])

    clearDiasporaGaDrafts([local.api, session.api])

    expect([...local.entries.keys()]).toEqual(preferences)
    expect([...session.entries.keys()]).toEqual(["session:autre"])
    expect(local.api.getItem).not.toHaveBeenCalled()
    expect(session.api.getItem).not.toHaveBeenCalled()
  })

  it("utilise localStorage et sessionStorage du navigateur par défaut", () => {
    const local = storage(["diaspora-ga:brouillon:awa", "theme"])
    const session = storage(["diaspora-ga:brouillon:prisca", "langue"])
    vi.stubGlobal("window", { localStorage: local.api, sessionStorage: session.api })

    clearDiasporaGaDrafts()

    expect([...local.entries.keys()]).toEqual(["theme"])
    expect([...session.entries.keys()]).toEqual(["langue"])
  })

  it("fige les clés avant suppression pour ne pas sauter des brouillons consécutifs", () => {
    const local = storage(["diaspora-ga:brouillon:awa", "diaspora-ga:brouillon:prisca", "diaspora-ga:brouillon:steeve"])
    local.api.removeItem.mockImplementation((key) => {
      expect(local.api.key).toHaveBeenCalledTimes(3)
      local.entries.delete(key)
    })

    clearDiasporaGaDrafts([local.api])

    expect(local.entries.size).toBe(0)
    expect(local.api.removeItem).toHaveBeenCalledTimes(3)
  })

  it("poursuit les autres clés et l'autre stockage quand un retrait échoue, puis lève une erreur sans contenu privé", () => {
    const failedKey = "diaspora-ga:brouillon:personne-privee"
    const local = storage([failedKey, "diaspora-ga:brouillon:prisca", "theme"])
    const session = storage(["diaspora-ga:brouillon:steeve"])
    local.api.removeItem.mockImplementation((key) => {
      if (key === failedKey) throw new Error(`Erreur de stockage confidentielle : ${local.entries.get(key)}`)
      local.entries.delete(key)
    })
    let failure: unknown
    try { clearDiasporaGaDrafts([local.api, session.api]) } catch (error) { failure = error }

    expect(failure).toBeInstanceOf(Error)
    expect((failure as Error).message).toBe(ERROR_MESSAGE)
    expect((failure as Error).message).not.toContain(failedKey)
    expect((failure as Error).message).not.toContain("contenu privé")
    expect([...local.entries.keys()]).toEqual([failedKey, "theme"])
    expect(session.entries.size).toBe(0)
  })

  it("continue l'énumération quand une clé est illisible", () => {
    const local = storage(["diaspora-ga:brouillon:awa", "diaspora-ga:brouillon:prisca", "diaspora-ga:brouillon:steeve"])
    const initial = [...local.entries.keys()]
    local.api.key.mockImplementation((index) => {
      if (index === 1) throw new Error("Accès refusé à une clé")
      return initial[index] ?? null
    })
    const session = storage(["diaspora-ga:brouillon:autre"])

    expect(() => clearDiasporaGaDrafts([local.api, session.api])).toThrow(ERROR_MESSAGE)

    expect([...local.entries.keys()]).toEqual(["diaspora-ga:brouillon:prisca"])
    expect(session.entries.size).toBe(0)
  })

  it("traite l'autre stockage même quand le navigateur refuse l'accès au premier", () => {
    const session = storage(["diaspora-ga:brouillon:awa", "theme"])
    vi.stubGlobal("window", { get localStorage() { throw new Error("Stockage bloqué") }, sessionStorage: session.api })

    expect(() => clearDiasporaGaDrafts()).toThrow(ERROR_MESSAGE)

    expect([...session.entries.keys()]).toEqual(["theme"])
  })

  it("poursuit avec l'autre stockage quand la taille du premier est illisible", () => {
    const local = storage(["diaspora-ga:brouillon:awa"])
    const session = storage(["diaspora-ga:brouillon:prisca"])
    Object.defineProperty(local.api, "length", { get() { throw new Error("Énumération refusée") } })

    expect(() => clearDiasporaGaDrafts([local.api, session.api])).toThrow(ERROR_MESSAGE)

    expect(session.entries.size).toBe(0)
    expect(local.api.removeItem).not.toHaveBeenCalled()
  })

  it("ne fait rien côté serveur, même avec un stockage injecté", () => {
    vi.stubGlobal("window", undefined)
    const local = storage(["diaspora-ga:brouillon:awa"])

    expect(() => clearDiasporaGaDrafts([local.api])).not.toThrow()
    expect(() => clearDiasporaGaDrafts()).not.toThrow()

    expect(local.api.key).not.toHaveBeenCalled()
    expect(local.api.removeItem).not.toHaveBeenCalled()
    expect(local.api.getItem).not.toHaveBeenCalled()
  })
})

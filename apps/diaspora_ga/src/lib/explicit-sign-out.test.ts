// @vitest-environment jsdom
import { personalStateKeys } from "@antsia/api/sign-out-everywhere"
import { describe, expect, it } from "vitest"

import { idnStartOptionsFor } from "./arrival"
import { EXPLICIT_SIGN_OUT_KEY, explicitSignOutHappened, forgetExplicitSignOut, rememberExplicitSignOut } from "./explicit-sign-out"
import { clearDiasporaGaDrafts } from "./sign-out-state"

/**
 * CH-863 D2 — le repère « déconnexion explicite » de ce navigateur : posé quand la personne se
 * déconnecte elle-même, il interdit à la porte d'arrivée de demander l'entrée sans ressaisie
 * jusqu'à la prochaine entrée réussie. Il doit survivre aux purges de la déconnexion de partout.
 */
function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial))
  return {
    values,
    get length() {
      return values.size
    },
    key: (index: number) => [...values.keys()][index] ?? null,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
  }
}

const REFUSED = {
  getItem: () => {
    throw new Error("refusé")
  },
  setItem: () => {
    throw new Error("refusé")
  },
  removeItem: () => {
    throw new Error("refusé")
  },
}

describe("repère de déconnexion explicite", () => {
  it("posé, lu, puis oublié à la prochaine entrée", () => {
    const storage = memoryStorage()
    expect(explicitSignOutHappened(storage)).toBe(false)
    rememberExplicitSignOut(storage)
    expect(explicitSignOutHappened(storage)).toBe(true)
    forgetExplicitSignOut(storage)
    expect(explicitSignOutHappened(storage)).toBe(false)
  })

  it("survit à la purge du moteur (préfixes `antsia:` et `antia:`) et à celle des brouillons de DIASPORA.GA", () => {
    const storage = memoryStorage({ "antsia:diaspora-ga:arrival": "{}", "antsia:diaspora-ga:consulate-gateway:seen": "1", "diaspora-ga:brouillon:persons_awa": "{}" })
    rememberExplicitSignOut(storage)
    // La purge du moteur ne retire que les clés qu'elle reconnaît comme état personnel.
    expect(EXPLICIT_SIGN_OUT_KEY.startsWith("antsia:")).toBe(false)
    expect(EXPLICIT_SIGN_OUT_KEY.startsWith("antia:")).toBe(false)
    expect(personalStateKeys(storage)).not.toContain(EXPLICIT_SIGN_OUT_KEY)
    for (const key of personalStateKeys(storage)) storage.removeItem(key)
    clearDiasporaGaDrafts([storage])
    expect(explicitSignOutHappened(storage)).toBe(true)
    expect([...storage.values.keys()]).toEqual([EXPLICIT_SIGN_OUT_KEY])
  })

  it("stockage refusé ou absent : rien ne casse ; sans lecture possible, on se conduit comme après une déconnexion", () => {
    expect(() => rememberExplicitSignOut(REFUSED)).not.toThrow()
    expect(() => forgetExplicitSignOut(REFUSED)).not.toThrow()
    // Prudence : un stockage illisible ne permet jamais l'entrée sans ressaisie.
    expect(explicitSignOutHappened(REFUSED)).toBe(true)
    expect(explicitSignOutHappened(null)).toBe(true)
    expect(() => rememberExplicitSignOut(null)).not.toThrow()
  })
})

describe("porte d'arrivée — l'option du départ vers IDN", () => {
  it("l'entrée sans ressaisie, seulement venue de consulat.ga et sans déconnexion explicite depuis la dernière entrée", () => {
    expect(idnStartOptionsFor("consulat", false)).toEqual({ reuseIdnSession: true })
    expect(idnStartOptionsFor("consulat", true)).toBeUndefined()
    expect(idnStartOptionsFor(null, false)).toBeUndefined()
    expect(idnStartOptionsFor(null, true)).toBeUndefined()
  })
})

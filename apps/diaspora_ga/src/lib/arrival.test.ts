import { describe, expect, it } from "vitest"

import { ARRIVAL_KEY, ARRIVAL_ORIGINS, ARRIVAL_PARAM, ARRIVAL_TTL_MS, forgetArrival, parseArrival, rememberArrival, takeArrival } from "./arrival"
import { routes } from "./routes"

/**
 * La porte d'arrivée de qui vient de consulat.ga (contrat DIASPORA-PASSERELLE-V1, CH-863 D1) :
 * `/entrer?depuis=consulat`, une valeur FERMÉE, lue côté serveur comme `inscription=1`, et un
 * repère de l'onglet, de courte durée, qui traverse la connexion jusqu'au fil.
 */

/** Un stockage d'onglet en mémoire (le vrai est `sessionStorage`). */
function memoryStorage() {
  const values = new Map<string, string>()
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
  }
}

/** Un stockage refusé (navigation privée, données bloquées) : chaque accès lève. */
const REFUSED_STORAGE = {
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

describe("porte d'arrivée — `?depuis=consulat`, seule valeur admise", () => {
  it("une seule origine fermée, et l'adresse de la table des routes la porte", () => {
    expect(ARRIVAL_ORIGINS).toEqual(["consulat"])
    const [path, query] = routes.enterFromConsulate().split("?")
    expect(path).toBe(routes.enter())
    expect(parseArrival(new URLSearchParams(query).get(ARRIVAL_PARAM) ?? undefined)).toBe("consulat")
    // Rien d'autre dans l'adresse : ni identifiant, ni pré-remplissage.
    expect([...new URLSearchParams(query).keys()]).toEqual([ARRIVAL_PARAM])
  })

  it("toute autre valeur est ignorée : casse, blanc, tableau, absence, autre origine", () => {
    expect(parseArrival("consulat")).toBe("consulat")
    for (const value of [undefined, "", "Consulat", "CONSULAT", " consulat", "consulat ", "consulat.ga", "identite", "1", ["consulat"], ["consulat", "consulat"]]) {
      expect(parseArrival(value), JSON.stringify(value)).toBeNull()
    }
  })
})

describe("porte d'arrivée — le repère de l'onglet, de courte durée", () => {
  const NOW = Date.UTC(2026, 10, 26, 10)

  it("retenu à la porte (préfixe `antsia:`, purgé par la déconnexion de partout), lu une fois puis oublié", () => {
    const storage = memoryStorage()
    rememberArrival("consulat", NOW, storage)
    expect(ARRIVAL_KEY.startsWith("antsia:")).toBe(true)
    expect(storage.values.has(ARRIVAL_KEY)).toBe(true)
    expect(takeArrival(NOW + 1000, storage)).toEqual({ origin: "consulat", at: NOW })
    expect(storage.values.has(ARRIVAL_KEY)).toBe(false)
    expect(takeArrival(NOW + 2000, storage)).toBeNull()
  })

  it("échu, venu du futur ou altéré : rien, et le repère est oublié", () => {
    const storage = memoryStorage()
    rememberArrival("consulat", NOW, storage)
    expect(takeArrival(NOW + ARRIVAL_TTL_MS + 1, storage)).toBeNull()
    expect(storage.values.has(ARRIVAL_KEY)).toBe(false)

    rememberArrival("consulat", NOW + 5000, storage)
    expect(takeArrival(NOW, storage)).toBeNull()

    for (const raw of ["{", "null", "42", JSON.stringify({ origin: "identite", at: NOW }), JSON.stringify({ origin: "consulat", at: "hier" })]) {
      storage.values.set(ARRIVAL_KEY, raw)
      expect(takeArrival(NOW, storage), raw).toBeNull()
      expect(storage.values.has(ARRIVAL_KEY)).toBe(false)
    }
  })

  it("« Ce n'est pas moi » l'oublie ; un stockage refusé ou absent ne casse rien", () => {
    const storage = memoryStorage()
    rememberArrival("consulat", NOW, storage)
    forgetArrival(storage)
    expect(takeArrival(NOW, storage)).toBeNull()

    expect(() => rememberArrival("consulat", NOW, REFUSED_STORAGE)).not.toThrow()
    expect(takeArrival(NOW, REFUSED_STORAGE)).toBeNull()
    expect(() => forgetArrival(REFUSED_STORAGE)).not.toThrow()
    expect(() => rememberArrival("consulat", NOW, null)).not.toThrow()
    expect(takeArrival(NOW, null)).toBeNull()
  })
})

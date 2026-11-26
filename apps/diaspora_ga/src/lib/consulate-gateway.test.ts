import { CONSULATE_DESTINATIONS, consulateDestinationUrl } from "@diaspora-ga/domain"
import { NETWORK_FEATURES } from "@diaspora-ga/features/data"
import { MEMBER_GATEWAY_RULES, MEMBERS_APP_CODE_SWITCHES } from "@diaspora-ga/features/navigation"
import { afterEach, describe, expect, it, vi } from "vitest"

const env = vi.hoisted(() => ({ consulateUrl: null as string | null }))
vi.mock("./env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./env")>()
  return {
    ...actual,
    publicEnv: {
      ...actual.publicEnv,
      get consulateUrl() {
        return env.consulateUrl
      },
    },
  }
})

import * as gateway from "./consulate-gateway"
import {
  CONSULATE_GATEWAY_SEEN_KEY,
  CONSULATE_LINK_ATTRIBUTES,
  configuredConsulateGateway,
  consulateGatewayLinks,
  consulateGatewaySeen,
  consulateGatewayState,
  interceptsConsulateClick,
  rememberConsulateGatewaySeen,
} from "./consulate-gateway"

/**
 * La passerelle « consulat.ga » de DIASPORA.GA (CH-863, lot D1) : les adresses du contrat
 * DIASPORA-PASSERELLE-V1 composées depuis la configuration existante (`NEXT_PUBLIC_CONSULATE_URL`),
 * l'état de la personne qui choisit la feuille, et la mémoire « déjà vu » de ce navigateur.
 */
const ORIGIN = "https://consulat.example/"

afterEach(() => {
  env.consulateUrl = null
})

function memoryStorage() {
  const values = new Map<string, string>()
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
  }
}

describe("passerelle consulat.ga — les adresses, depuis la configuration", () => {
  it("les deux destinations du contrat, composées sur l'origine configurée", () => {
    expect(consulateGatewayLinks(ORIGIN)).toEqual({ mySpace: "https://consulat.example/my-space", register: "https://consulat.example/register?type=long_stay" })
    for (const destination of CONSULATE_DESTINATIONS) expect(consulateGatewayLinks(ORIGIN)?.[destination]).toBe(consulateDestinationUrl(ORIGIN, destination))
  })

  it("adresse absente ou refusée : la passerelle n'existe pas du tout", () => {
    for (const origin of [null, undefined, "", "http://consulat.example", "https://consulat.example/fr"]) expect(consulateGatewayLinks(origin), String(origin)).toBeNull()
  })

  it("lit `NEXT_PUBLIC_CONSULATE_URL` à chaque appel, sans nouvelle variable", () => {
    expect(configuredConsulateGateway()).toBeNull()
    env.consulateUrl = ORIGIN
    expect(configuredConsulateGateway()?.mySpace).toBe("https://consulat.example/my-space")
  })

  it("chaque lien part dans le même onglet, sans ouvreur ni référent", () => {
    expect(CONSULATE_LINK_ATTRIBUTES).toEqual({ rel: "noopener noreferrer", referrerPolicy: "no-referrer" })
    expect(CONSULATE_LINK_ATTRIBUTES).not.toHaveProperty("target")
  })

  it("plus aucun interrupteur de code : le module du réseau `consulateGateway` règle l'entrée, ouvert et fermé dans admin.diaspora.ga", () => {
    expect(MEMBER_GATEWAY_RULES.consulate.feature).toBe("consulateGateway")
    expect(NETWORK_FEATURES).toContain(MEMBER_GATEWAY_RULES.consulate.feature)
    expect(MEMBERS_APP_CODE_SWITCHES as readonly string[]).not.toContain("consulateGateway")
    // Ce module ne décide de rien : il compose des adresses et retient « déjà vu ».
    expect(Object.keys(gateway)).not.toContain("CONSULATE_GATEWAY_SWITCH")
  })
})

describe("passerelle consulat.ga — l'état qui choisit la feuille", () => {
  it("attestée par le consulat : lien direct, quels que soient le compte et le statut", () => {
    expect(consulateGatewayState({ attestation: "verified", hasIdn: true, status: "verifiee" })).toBe("attested")
    expect(consulateGatewayState({ attestation: "verified", hasIdn: false, status: "en_attente" })).toBe("attested")
  })

  it("compte relié à identite.ga : ouvrir son espace, ou s'inscrire", () => {
    expect(consulateGatewayState({ attestation: "none", hasIdn: true, status: "declaree" })).toBe("idn")
    expect(consulateGatewayState({ attestation: "not_confirmed", hasIdn: true, status: "verifiee" })).toBe("idn")
  })

  it("compte léger (code par e-mail) ou en attente : les trois étapes", () => {
    expect(consulateGatewayState({ attestation: "none", hasIdn: false, status: "declaree" })).toBe("light")
    expect(consulateGatewayState({ attestation: "none", hasIdn: true, status: "en_attente" })).toBe("light")
    expect(consulateGatewayState({ attestation: "not_confirmed", hasIdn: false, status: "suspendue" })).toBe("light")
  })
})

describe("passerelle consulat.ga — la feuille la première fois, puis le lien direct", () => {
  it("le premier clic simple ouvre la feuille ; ensuite, ou attestée, le lien mène directement", () => {
    expect(interceptsConsulateClick("light", false)).toBe(true)
    expect(interceptsConsulateClick("idn", false)).toBe(true)
    expect(interceptsConsulateClick("light", true)).toBe(false)
    expect(interceptsConsulateClick("idn", true)).toBe(false)
    expect(interceptsConsulateClick("attested", false)).toBe(false)
  })

  it("« déjà vu » est gardé dans ce navigateur (préfixe `antsia:`, oublié à la déconnexion de partout)", () => {
    const storage = memoryStorage()
    expect(consulateGatewaySeen(storage)).toBe(false)
    rememberConsulateGatewaySeen(storage)
    expect(consulateGatewaySeen(storage)).toBe(true)
    expect(storage.values.get(CONSULATE_GATEWAY_SEEN_KEY)).toBe("1")
    expect(CONSULATE_GATEWAY_SEEN_KEY.startsWith("antsia:")).toBe(true)
  })

  it("stockage refusé ou absent : rien ne casse, la feuille vaut pour cet affichage", () => {
    const refused = {
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
    expect(consulateGatewaySeen(refused)).toBe(false)
    expect(() => rememberConsulateGatewaySeen(refused)).not.toThrow()
    expect(consulateGatewaySeen(null)).toBe(false)
    expect(() => rememberConsulateGatewaySeen(null)).not.toThrow()
  })
})

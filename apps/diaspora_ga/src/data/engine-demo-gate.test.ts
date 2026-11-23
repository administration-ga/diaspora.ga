// @vitest-environment jsdom
import type { EngineAuthClient } from "@antsia/api/auth-client"
import { DEMO_GATE_SESSION_TTL_SECONDS } from "@antsia/social-contracts/demoGate"
import { act, cleanup, renderHook } from "@testing-library/react"
import type { ConvexReactClient } from "convex/react"
import { getFunctionName } from "convex/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { createEngineDemoAccounts } from "./engine-demo-accounts"
import {
  createDemoGateTokenStore,
  createEngineDemoGate,
  DEMO_GATE_STORAGE_KEY,
  demoGateOrigin,
  demoGateTokenFor,
  toDemoGateState,
} from "./engine-demo-gate"

/**
 * La porte des comptes de démonstration côté site (CH-817, lot A1), sans moteur : les deux routes
 * HTTP jouées par un `fetch` factice, la configuration et le catalogue par un `useQueries` factice.
 * Valeurs FICTIVES : origine réservée à la documentation, numéro et code d'essai, jeton de forme seule.
 */
type Reference = Parameters<typeof getFunctionName>[0]

const mocks = vi.hoisted(() => ({
  respond: (() => undefined) as (name: string, args: unknown) => unknown,
  read: vi.fn(),
}))
vi.mock("convex/react", () => ({
  useQueries: (queries: Record<string, { query: Reference; args?: unknown }>) => {
    if (!queries.value) return {}
    const name = getFunctionName(queries.value.query)
    mocks.read(name, queries.value.args)
    return { value: mocks.respond(name, queries.value.args) }
  },
}))

const ORIGIN = "https://actions-demo.example.net"
const PHONE = "+33600000000"
const CHALLENGE = "c".repeat(32)
const TOKEN = "t".repeat(43)
const CONFIGURATION = "modules/platform/authentication:configuration"
const CATALOGUE = "modules/diaspora/demoAccounts:catalogue"
const LATEST_OTP = "modules/platform/devTools:latestOtp"

/** Une réponse HTTP réduite à ce que lit l'adaptateur. */
function reply(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return {
    status,
    json: async () => {
      if (body === undefined) throw new SyntaxError("corps vide")
      return body
    },
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
  } as unknown as Response
}

function memoryStorage() {
  const values = new Map<string, string>()
  return {
    values,
    storage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => void values.set(key, value),
      removeItem: (key: string) => void values.delete(key),
    },
  }
}

function setup(options: { siteUrl?: string | null; now?: () => number } = {}) {
  const memory = memoryStorage()
  const clock = { now: 1_000_000 }
  const now = options.now ?? (() => clock.now)
  const tokens = createDemoGateTokenStore({ storage: () => memory.storage, now })
  const fetch = vi.fn<typeof globalThis.fetch>()
  const gate = createEngineDemoGate({ siteUrl: options.siteUrl === undefined ? ORIGIN : options.siteUrl, tokens, fetch, now })
  return { gate, tokens, fetch, memory, clock }
}

/** Le corps JSON de l'appel n° `index` au `fetch` factice. */
function sentBody(fetch: ReturnType<typeof vi.fn<typeof globalThis.fetch>>, index = 0): Record<string, unknown> {
  const init = fetch.mock.calls[index]?.[1]
  return JSON.parse(String(init?.body)) as Record<string, unknown>
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.respond = () => undefined
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  window.sessionStorage.clear()
})

describe("porte de démonstration — états et origine", () => {
  it("l'état publié par le moteur ; absent (moteur d'avant la porte), la conduite d'avant", () => {
    for (const state of ["closed", "open", "unavailable", "gated"] as const) expect(toDemoGateState(state)).toBe(state)
    expect(toDemoGateState(undefined)).toBe("open")
    // Une valeur inconnue n'ouvre rien : la porte est tenue pour indisponible.
    expect(toDemoGateState("ouverte")).toBe("unavailable")
  })

  it("l'origine des actions HTTP se lit dans la variable ; absente ou malformée, la porte n'est pas joignable", () => {
    expect(demoGateOrigin(`${ORIGIN}/`)).toBe(ORIGIN)
    expect(demoGateOrigin("http://127.0.0.1:3211")).toBe("http://127.0.0.1:3211")
    for (const value of [null, undefined, "", "pas une adresse", "ftp://actions-demo.example.net"]) expect(demoGateOrigin(value)).toBeNull()
    expect(setup().gate.reachable).toBe(true)
    expect(setup({ siteUrl: null }).gate.reachable).toBe(false)
  })

  it("la configuration du moteur donne l'état, une seule lecture, sans argument", () => {
    const { gate } = setup()
    mocks.respond = (name) => (name === CONFIGURATION ? { demoGate: "gated" } : undefined)
    expect(renderHook(() => gate.useGateState()).result.current).toEqual({ status: "ready", data: "gated" })
    expect(mocks.read).toHaveBeenCalledWith(CONFIGURATION, {})
    mocks.respond = (name) => (name === CONFIGURATION ? {} : undefined)
    expect(renderHook(() => gate.useGateState()).result.current).toEqual({ status: "ready", data: "open" })
    mocks.respond = () => undefined
    expect(renderHook(() => gate.useGateState()).result.current).toEqual({ status: "loading" })
    mocks.respond = () => new Error("injoignable")
    expect(renderHook(() => gate.useGateState()).result.current.status).toBe("error")
  })
})

describe("porte de démonstration — demander un code", () => {
  it("202 : le défi et son échéance locale ; le corps porte la portée, le numéro normalisé et la langue", async () => {
    const { gate, fetch } = setup()
    fetch.mockResolvedValue(reply(202, { ok: true, challengeId: CHALLENGE, expiresInSeconds: 300 }))
    expect(await gate.requestCode("0033 6 00 00 00 00", "en")).toEqual({ ok: true, value: { challengeId: CHALLENGE, expiresAt: 1_000_000 + 300_000 } })
    const [url, init] = fetch.mock.calls[0] ?? []
    expect(url).toBe(`${ORIGIN}/demo-gate/request`)
    expect(init).toMatchObject({ method: "POST", credentials: "omit", cache: "no-store", redirect: "error", headers: { "Content-Type": "application/json" } })
    expect(sentBody(fetch)).toEqual({ scope: "diaspora-ga", phone: PHONE, locale: "en" })
  })

  it("un numéro hors de la forme E.164 est refusé avant tout appel ; sans origine, la porte est indisponible", async () => {
    const { gate, fetch } = setup()
    expect(await gate.requestCode("06 00 00 00 00", "fr")).toEqual({ ok: false, code: "phone_invalid" })
    expect(await setup({ siteUrl: null }).gate.requestCode(PHONE, "fr")).toEqual({ ok: false, code: "demo_gate_unavailable" })
    expect(fetch).not.toHaveBeenCalled()
  })

  it.each([
    [503, { ok: false, error: "unavailable" }, "demo_gate_unavailable"],
    [404, { ok: false, error: "not_found" }, "demo_gate_unavailable"],
    [400, { ok: false, error: "invalid_request" }, "phone_invalid"],
    [429, { ok: false, error: "rate_limited" }, "rate_limited"],
    [500, undefined, "unknown"],
    [202, { ok: true, challengeId: "court", expiresInSeconds: 300 }, "unknown"],
    [202, { ok: true, challengeId: CHALLENGE, expiresInSeconds: 0 }, "unknown"],
  ] as const)("HTTP %i : refus fermé, jamais un faux succès", async (status, body, code) => {
    const { gate, fetch } = setup()
    fetch.mockResolvedValue(reply(status, body))
    expect(await gate.requestCode(PHONE, "fr")).toEqual({ ok: false, code })
  })

  it("le réseau ne répond pas : une panne, à reprendre", async () => {
    const { gate, fetch } = setup()
    fetch.mockRejectedValue(new TypeError("Failed to fetch"))
    expect(await gate.requestCode(PHONE, "fr")).toEqual({ ok: false, code: "network_unavailable" })
  })
})

describe("porte de démonstration — vérifier le code et garder la session", () => {
  it("200 : la session se garde dans l'onglet, son échéance locale bornée à trente minutes", async () => {
    const { gate, fetch, tokens, memory } = setup()
    fetch.mockResolvedValue(reply(200, { ok: true, token: TOKEN, expiresAt: 1_000_000 + 10 * 60_000 }))
    expect(await gate.verifyCode(CHALLENGE, "123 456 k")).toEqual({ ok: true, value: { expiresAt: 1_000_000 + 10 * 60_000 } })
    expect(fetch.mock.calls[0]?.[0]).toBe(`${ORIGIN}/demo-gate/verify`)
    expect(sentBody(fetch)).toEqual({ scope: "diaspora-ga", challengeId: CHALLENGE, code: "123456K" })
    expect(tokens.current()).toEqual({ token: TOKEN, expiresAt: 1_000_000 + 10 * 60_000 })
    expect(JSON.parse(memory.values.get(DEMO_GATE_STORAGE_KEY) ?? "null")).toEqual({ token: TOKEN, expiresAt: 1_000_000 + 10 * 60_000 })
    // Jamais dans une adresse : le jeton n'apparaît dans aucune URL appelée.
    expect(fetch.mock.calls.every(([url]) => !String(url).includes(TOKEN))).toBe(true)
  })

  it("une échéance du moteur à une autre horloge ne prolonge ni n'efface la session : trente minutes locales au plus", async () => {
    const { gate, fetch, tokens } = setup()
    fetch.mockResolvedValue(reply(200, { ok: true, token: TOKEN, expiresAt: 1_000_000 + 3 * 3_600_000 }))
    await gate.verifyCode(CHALLENGE, "123456K")
    expect(tokens.current()?.expiresAt).toBe(1_000_000 + DEMO_GATE_SESSION_TTL_SECONDS * 1_000)
    fetch.mockResolvedValue(reply(200, { ok: true, token: TOKEN, expiresAt: 1_000 }))
    await gate.verifyCode(CHALLENGE, "123456K")
    expect(tokens.current()?.expiresAt).toBe(1_000_000 + DEMO_GATE_SESSION_TTL_SECONDS * 1_000)
  })

  it("un code hors de la forme ou un défi malformé : refus indistinct, sans appel", async () => {
    const { gate, fetch } = setup()
    expect(await gate.verifyCode(CHALLENGE, "123456")).toEqual({ ok: false, code: "demo_gate_code_invalid" })
    expect(await gate.verifyCode(CHALLENGE, "123456O")).toEqual({ ok: false, code: "demo_gate_code_invalid" })
    expect(await gate.verifyCode("court", "123456K")).toEqual({ ok: false, code: "demo_gate_code_invalid" })
    expect(fetch).not.toHaveBeenCalled()
  })

  it.each([
    [401, { ok: false, error: "invalid_or_expired" }, {}, { ok: false, code: "demo_gate_code_invalid" }],
    [400, { ok: false, error: "invalid_request" }, {}, { ok: false, code: "demo_gate_code_invalid" }],
    [429, { ok: false, error: "rate_limited", retryAfterMs: 90_000 }, {}, { ok: false, code: "too_many_attempts", retryAfterMs: 90_000 }],
    [429, { ok: false, error: "rate_limited" }, { "retry-after": "120" }, { ok: false, code: "too_many_attempts", retryAfterMs: 120_000 }],
    [429, undefined, {}, { ok: false, code: "too_many_attempts" }],
    [503, { ok: false, error: "unavailable" }, {}, { ok: false, code: "demo_gate_unavailable" }],
    [404, { ok: false, error: "not_found" }, {}, { ok: false, code: "demo_gate_unavailable" }],
    [200, { ok: true, token: "court", expiresAt: 2_000_000 }, {}, { ok: false, code: "unknown" }],
    [502, undefined, {}, { ok: false, code: "unknown" }],
  ] as const)("HTTP %i : rien n'est gardé, le refus est fermé", async (status, body, headers, expected) => {
    const { gate, fetch, tokens, memory } = setup()
    fetch.mockResolvedValue(reply(status, body, headers))
    expect(await gate.verifyCode(CHALLENGE, "123456K")).toEqual(expected)
    expect(tokens.current()).toBeNull()
    expect(memory.values.has(DEMO_GATE_STORAGE_KEY)).toBe(false)
  })

  it("le réseau ne répond pas : une panne, rien n'est gardé", async () => {
    const { gate, fetch, tokens } = setup()
    fetch.mockRejectedValue(new TypeError("Failed to fetch"))
    expect(await gate.verifyCode(CHALLENGE, "123456K")).toEqual({ ok: false, code: "network_unavailable" })
    expect(tokens.current()).toBeNull()
  })

  it("rien n'est écrit au journal : ni numéro, ni code, ni jeton", async () => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((method) => vi.spyOn(console, method).mockImplementation(() => undefined))
    const { gate, fetch } = setup()
    fetch.mockResolvedValueOnce(reply(202, { ok: true, challengeId: CHALLENGE, expiresInSeconds: 300 }))
    fetch.mockResolvedValueOnce(reply(200, { ok: true, token: TOKEN, expiresAt: 1_500_000 }))
    await gate.requestCode(PHONE, "fr")
    await gate.verifyCode(CHALLENGE, "123456K")
    for (const spy of spies) {
      expect(spy).not.toHaveBeenCalled()
      spy.mockRestore()
    }
  })

  it("« Fermer l'accès » oublie la session de l'onglet", async () => {
    const { gate, fetch, tokens, memory } = setup()
    fetch.mockResolvedValue(reply(200, { ok: true, token: TOKEN, expiresAt: 1_500_000 }))
    await gate.verifyCode(CHALLENGE, "123456K")
    gate.forget()
    expect(tokens.current()).toBeNull()
    expect(memory.values.has(DEMO_GATE_STORAGE_KEY)).toBe(false)
  })
})

describe("porte de démonstration — la session de l'onglet", () => {
  it("survit au rechargement (même onglet), et s'oublie à son échéance, à la lecture comme au minuteur", () => {
    vi.useFakeTimers({ now: 1_000_000 })
    const memory = memoryStorage()
    const first = createDemoGateTokenStore({ storage: () => memory.storage })
    first.save({ token: TOKEN, expiresAt: 1_000_000 + 60_000 })
    // Une page rechargée relit la session gardée dans l'onglet.
    const reloaded = createDemoGateTokenStore({ storage: () => memory.storage })
    expect(reloaded.current()).toEqual({ token: TOKEN, expiresAt: 1_060_000 })
    const listener = vi.fn()
    reloaded.subscribe(listener)
    vi.advanceTimersByTime(60_000)
    expect(listener).toHaveBeenCalled()
    expect(reloaded.snapshot()).toBeNull()
    expect(memory.values.has(DEMO_GATE_STORAGE_KEY)).toBe(false)
  })

  it("une valeur gardée échue ou malformée n'est jamais lue comme une session", () => {
    const memory = memoryStorage()
    const now = () => 1_000_000
    for (const raw of ["pas du JSON", JSON.stringify({ token: "court", expiresAt: 2_000_000 }), JSON.stringify({ token: TOKEN }), JSON.stringify({ token: TOKEN, expiresAt: 999_999 }), JSON.stringify([TOKEN])]) {
      memory.values.set(DEMO_GATE_STORAGE_KEY, raw)
      expect(createDemoGateTokenStore({ storage: () => memory.storage, now }).current(), raw).toBeNull()
    }
  })

  it("un stockage refusé ne casse rien : la session reste en mémoire de la page, rien n'est gardé ailleurs", () => {
    const refused = {
      getItem: () => {
        throw new DOMException("refusé", "SecurityError")
      },
      setItem: () => {
        throw new DOMException("refusé", "QuotaExceededError")
      },
      removeItem: () => {
        throw new DOMException("refusé", "SecurityError")
      },
    }
    const tokens = createDemoGateTokenStore({ storage: () => refused, now: () => 1_000_000 })
    expect(() => tokens.save({ token: TOKEN, expiresAt: 2_000_000 })).not.toThrow()
    expect(tokens.current()).toEqual({ token: TOKEN, expiresAt: 2_000_000 })
    expect(window.localStorage.length).toBe(0)
    expect(window.sessionStorage.length).toBe(0)
    expect(() => tokens.clear()).not.toThrow()
    expect(tokens.current()).toBeNull()
    // Même un accès au stockage qui lève (navigation privée) est tenu : aucune session, aucune exception.
    const unreachable = createDemoGateTokenStore({ storage: () => { throw new DOMException("refusé", "SecurityError") }, now: () => 1_000_000 })
    expect(unreachable.current()).toBeNull()
  })

  it("le magasin par défaut écrit dans le sessionStorage de l'onglet, jamais dans le localStorage", () => {
    const tokens = createDemoGateTokenStore({ now: () => 1_000_000 })
    tokens.save({ token: TOKEN, expiresAt: 2_000_000 })
    expect(window.sessionStorage.getItem(DEMO_GATE_STORAGE_KEY)).not.toBeNull()
    expect(window.localStorage.length).toBe(0)
    tokens.clear()
    expect(window.sessionStorage.getItem(DEMO_GATE_STORAGE_KEY)).toBeNull()
  })

  it("la session se lit de façon réactive, sans son jeton", async () => {
    const { gate, tokens } = setup()
    const { result } = renderHook(() => gate.useSession())
    expect(result.current).toBeNull()
    act(() => tokens.save({ token: TOKEN, expiresAt: 1_500_000 }))
    expect(result.current).toEqual({ expiresAt: 1_500_000 })
    act(() => tokens.clear())
    expect(result.current).toBeNull()
  })
})

describe("porte de démonstration — le jeton accompagne les deux lectures qui ouvrent un compte", () => {
  const deps = (tokens: ReturnType<typeof createDemoGateTokenStore>, query: unknown) => ({
    convex: { query, mutation: vi.fn() } as unknown as ConvexReactClient,
    authClient: {} as EngineAuthClient,
    demoGateTokens: tokens,
    sleep: async () => undefined,
  })

  it("seulement pour une adresse réservée, et seulement avec une session valide", () => {
    const { tokens } = setup()
    expect(demoGateTokenFor("verifie@demo.diaspora-ga.test", tokens)).toBeNull()
    tokens.save({ token: TOKEN, expiresAt: 1_500_000 })
    expect(demoGateTokenFor(" Verifie@Demo.Diaspora-GA.test ", tokens)).toBe(TOKEN)
    expect(demoGateTokenFor("ada@exemple.test", tokens)).toBeNull()
    expect(demoGateTokenFor("verifie@demo.diaspora-ga.test.exemple.test", tokens)).toBeNull()
  })

  it("le catalogue : sans session, aucun jeton ; avec elle, le jeton ; l'abonnement suit la session", () => {
    const { tokens } = setup()
    mocks.respond = (name) => (name === CATALOGUE ? [{ actor: "verifie", email: "verifie@demo.diaspora-ga.test", gateExpiresAt: 1_500_000 }] : undefined)
    const accounts = createEngineDemoAccounts(deps(tokens, vi.fn()))
    const { result } = renderHook(() => accounts.useCatalogue())
    expect(mocks.read).toHaveBeenLastCalledWith(CATALOGUE, {})
    act(() => tokens.save({ token: TOKEN, expiresAt: 1_500_000 }))
    expect(mocks.read).toHaveBeenLastCalledWith(CATALOGUE, { gateToken: TOKEN })
    // Ce que l'écran lit : l'acteur et son adresse, jamais l'échéance ni le jeton.
    expect(result.current).toEqual({ status: "ready", data: [{ actor: "verifie", email: "verifie@demo.diaspora-ga.test" }] })
    act(() => tokens.clear())
    expect(mocks.read).toHaveBeenLastCalledWith(CATALOGUE, {})
  })

  it("le code affiché d'une adresse réservée porte le jeton ; une adresse ordinaire ne le reçoit jamais", async () => {
    const { tokens } = setup()
    tokens.save({ token: TOKEN, expiresAt: 1_500_000 })
    const query = vi.fn(async (_reference: Reference, _args: Record<string, unknown>) => ({ code: "123456", expiresAt: 2_000_000 }))
    const accounts = createEngineDemoAccounts(deps(tokens, query))
    expect(await accounts.readLocalCode("mentor@demo.diaspora-ga.test")).toBe("123456")
    expect(getFunctionName(query.mock.calls[0]?.[0] as Reference)).toBe(LATEST_OTP)
    expect(query.mock.calls[0]?.[1]).toEqual({ email: "mentor@demo.diaspora-ga.test", gateToken: TOKEN })
    await accounts.readLocalCode("ada@exemple.test")
    expect(query.mock.calls[1]?.[1]).toEqual({ email: "ada@exemple.test" })
  })
})

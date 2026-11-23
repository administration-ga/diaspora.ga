import { NextRequest } from "next/server"
import { describe, expect, it, vi } from "vitest"

import { cookieFreeFetch, relayAuthRequest } from "./auth-relay"

/**
 * CH-815 A1b — le relais d'authentification d'admin.diaspora.ga ne transporte AUCUN cookie
 * du navigateur (revue A1 : même site que diaspora.ga, dépôt de cookie par un voisin). La
 * session passe par `Better-Auth-Cookie` / `Set-Better-Auth-Cookie`, qui restent intacts.
 */
const ENGINE = "https://moteur.exemple"
const TOSSED = "__Secure-better-auth.session_token=depose-par-un-voisin"
const SESSION = "better-auth.session_token=session-de-cet-onglet"

type Seen = { url: string; headers: Record<string, string>; body: string | null; method: string | undefined }

/** Un moteur simulé : il note ce qui lui arrive et répond avec des cookies de navigateur. */
function fakeEngine(reply: () => Response = () => engineReply(200)) {
  const seen: Seen[] = []
  const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const headers: Record<string, string> = {}
    new Headers(init?.headers).forEach((value, key) => {
      headers[key] = value
    })
    const body = init?.body === undefined || init.body === null ? null : new TextDecoder().decode(init.body as ArrayBuffer)
    seen.push({ url: String(input), headers, body, method: init?.method })
    return reply()
  })
  return { seen, fetchImpl: fetchImpl as unknown as typeof fetch }
}

function engineReply(status: number, extra: [string, string][] = []): Response {
  const headers = new Headers([
    ["content-type", "application/json"],
    ["set-better-auth-cookie", "better-auth.session_token=nouvelle; Max-Age=604800"],
    ...extra,
  ])
  headers.append("set-cookie", "__Secure-better-auth.session_token=pose-par-le-moteur; Path=/; HttpOnly; Secure; SameSite=None")
  headers.append("set-cookie", "__Secure-better-auth.convex_jwt=jwt; Path=/; HttpOnly; Secure")
  return new Response(status === 302 ? null : JSON.stringify({ session: null }), { status, headers })
}

function browserRequest(path: string, init: { method?: string; body?: string; headers?: Record<string, string> } = {}) {
  return new NextRequest(new URL(path, "https://admin.exemple"), {
    method: init.method ?? "GET",
    headers: { cookie: TOSSED, "better-auth-cookie": SESSION, "content-type": "application/json", ...init.headers },
    ...(init.body !== undefined ? { body: init.body } : {}),
  })
}

describe("relais d'authentification d'admin.diaspora.ga — aucun cookie du navigateur", () => {
  it("le `Cookie` entrant ne part jamais vers le moteur ; la session de l'onglet (`Better-Auth-Cookie`) passe", async () => {
    const engine = fakeEngine()
    await relayAuthRequest(browserRequest("/api/auth/get-session"), { convexSiteUrl: ENGINE, isDev: false, fetchImpl: engine.fetchImpl })
    expect(engine.seen).toHaveLength(1)
    expect(engine.seen[0]?.url).toBe(`${ENGINE}/api/auth/get-session`)
    expect(Object.keys(engine.seen[0]!.headers)).not.toContain("cookie")
    expect(JSON.stringify(engine.seen[0])).not.toContain("depose-par-un-voisin")
    expect(engine.seen[0]?.headers["better-auth-cookie"]).toBe(SESSION)
  })

  it("aucun `Set-Cookie` ne revient au navigateur ; `Set-Better-Auth-Cookie`, le corps et le statut restent", async () => {
    const engine = fakeEngine()
    const response = await relayAuthRequest(browserRequest("/api/auth/get-session"), { convexSiteUrl: ENGINE, isDev: false, fetchImpl: engine.fetchImpl })
    expect(response.status).toBe(200)
    expect(response.headers.get("set-cookie")).toBeNull()
    expect(response.headers.getSetCookie()).toEqual([])
    expect(response.headers.get("set-better-auth-cookie")).toBe("better-auth.session_token=nouvelle; Max-Age=604800")
    expect(await response.json()).toEqual({ session: null })
  })

  it("en développement aussi (réécriture des cookies du moteur), rien n'est posé", async () => {
    const engine = fakeEngine()
    const response = await relayAuthRequest(browserRequest("/api/auth/get-session"), { convexSiteUrl: ENGINE, isDev: true, fetchImpl: engine.fetchImpl })
    expect(response.headers.getSetCookie()).toEqual([])
  })

  it("l'échange du jeton à usage unique (POST) : corps relayé tel quel, sans cookie à l'aller ni au retour", async () => {
    const engine = fakeEngine()
    const body = JSON.stringify({ token: "jeton-a-usage-unique" })
    const response = await relayAuthRequest(browserRequest("/api/auth/cross-domain/one-time-token/verify", { method: "POST", body }), {
      convexSiteUrl: ENGINE,
      isDev: false,
      fetchImpl: engine.fetchImpl,
    })
    expect(engine.seen[0]).toMatchObject({ method: "POST", body, url: `${ENGINE}/api/auth/cross-domain/one-time-token/verify` })
    expect(Object.keys(engine.seen[0]!.headers)).not.toContain("cookie")
    expect(response.headers.getSetCookie()).toEqual([])
    expect(response.headers.get("set-better-auth-cookie")).not.toBeNull()
  })

  it("une redirection du moteur garde sa destination, sans cookie", async () => {
    const engine = fakeEngine(() => engineReply(302, [["location", "https://idn.exemple/autoriser"]]))
    const response = await relayAuthRequest(browserRequest("/api/auth/sign-in/oauth2", { method: "POST", body: "{}" }), {
      convexSiteUrl: ENGINE,
      isDev: false,
      fetchImpl: engine.fetchImpl,
    })
    expect(response.status).toBe(302)
    expect(response.headers.get("location")).toBe("https://idn.exemple/autoriser")
    expect(response.headers.getSetCookie()).toEqual([])
  })

  it("le saut borné retire `Cookie` quelle que soit la forme des en-têtes, et laisse le reste", async () => {
    const seen: Headers[] = []
    const inner = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      seen.push(new Headers(init?.headers))
      return new Response(null, { status: 204, headers: [["set-cookie", "a=1"], ["x-autre", "garde"]] })
    }) as unknown as typeof fetch
    const relay = cookieFreeFetch(inner)
    const shapes: HeadersInit[] = [
      { Cookie: TOSSED, "x-garde": "1" },
      [["cookie", TOSSED], ["x-garde", "1"]],
      new Headers({ cookie: TOSSED, "x-garde": "1" }),
    ]
    for (const headers of shapes) {
      const response = await relay(`${ENGINE}/api/auth/get-session`, { method: "GET", headers })
      expect(response.status).toBe(204)
      expect(response.headers.get("set-cookie")).toBeNull()
      expect(response.headers.get("x-autre")).toBe("garde")
    }
    expect(seen.map((headers) => [headers.get("cookie"), headers.get("x-garde")])).toEqual([
      [null, "1"],
      [null, "1"],
      [null, "1"],
    ])
  })
})

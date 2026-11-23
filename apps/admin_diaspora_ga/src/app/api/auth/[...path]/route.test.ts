import { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { DELETE, GET, PATCH, POST, PUT } from "./route"

/**
 * CH-815 A1b, repris au lot A7 — la route `/api/auth/*` d'admin.diaspora.ga ne transporte AUCUN
 * cookie du navigateur (revue A1 : même site que diaspora.ga, dépôt de cookie par un voisin) : le
 * relais commun du moteur, en mode `browserCookies: "drop"`. La session passe par
 * `Better-Auth-Cookie` / `Set-Better-Auth-Cookie`, qui restent intacts. Chaque méthode, avec
 * l'environnement réel (`CONVEX_SITE_URL`, `NODE_ENV`) et un moteur simulé.
 */
const ENGINE = "https://moteur.exemple"
const TOSSED = "__Secure-better-auth.session_token=depose-par-un-voisin"
const SESSION = "better-auth.session_token=session-de-cet-onglet"

type Seen = { url: string; headers: Headers; body: string | null; method: string | undefined }

const seen: Seen[] = []

function engineReply(status: number, extra: [string, string][] = []): Response {
  const headers = new Headers([["content-type", "application/json"], ["set-better-auth-cookie", "better-auth.session_token=nouvelle; Max-Age=604800"], ...extra])
  headers.append("set-cookie", "__Secure-better-auth.session_token=pose-par-le-moteur; Path=/; HttpOnly; Secure; SameSite=None")
  headers.append("set-cookie", "__Secure-better-auth.convex_jwt=jwt; Path=/; HttpOnly; Secure")
  return new Response(status === 302 ? null : JSON.stringify({ session: null }), { status, headers })
}

/** Un moteur simulé : il note ce qui lui arrive et répond avec des cookies de navigateur. */
function fakeEngine(reply: () => Response = () => engineReply(200)) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const body = init?.body === undefined || init.body === null ? null : new TextDecoder().decode(init.body as ArrayBuffer)
      seen.push({ url: String(input), headers: new Headers(init?.headers), body, method: init?.method })
      return reply()
    }),
  )
}

function browserRequest(path: string, init: { method?: string; body?: string } = {}) {
  return new NextRequest(new URL(path, "https://admin.exemple"), {
    method: init.method ?? "GET",
    headers: { cookie: TOSSED, "better-auth-cookie": SESSION, "content-type": "application/json" },
    ...(init.body !== undefined ? { body: init.body } : {}),
  })
}

beforeEach(() => {
  seen.length = 0
  vi.stubEnv("CONVEX_SITE_URL", ENGINE)
  vi.stubEnv("NODE_ENV", "production")
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe("route /api/auth/[...path] d'admin.diaspora.ga — aucun cookie du navigateur", () => {
  it.each([
    ["GET", GET],
    ["POST", POST],
    ["PUT", PUT],
    ["PATCH", PATCH],
    ["DELETE", DELETE],
  ] as const)("%s : ni `Cookie` vers le moteur, ni `Set-Cookie` vers le navigateur ; la session de l'onglet passe", async (method, handler) => {
    fakeEngine()
    const response = await handler(browserRequest("/api/auth/get-session", { method, ...(method === "GET" ? {} : { body: "{}" }) }))
    expect(seen).toHaveLength(1)
    expect(seen[0]?.url).toBe(`${ENGINE}/api/auth/get-session`)
    expect(seen[0]?.headers.get("cookie")).toBeNull()
    expect(JSON.stringify([...seen[0]!.headers.entries()])).not.toContain("depose-par-un-voisin")
    expect(seen[0]?.headers.get("better-auth-cookie")).toBe(SESSION)
    expect(response.headers.getSetCookie()).toEqual([])
    expect(response.headers.get("set-better-auth-cookie")).toBe("better-auth.session_token=nouvelle; Max-Age=604800")
  })

  it("le corps et le statut du moteur restent", async () => {
    fakeEngine()
    const response = await GET(browserRequest("/api/auth/get-session"))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ session: null })
  })

  it("en développement aussi (réécriture des cookies du moteur), rien n'est posé", async () => {
    vi.stubEnv("NODE_ENV", "development")
    fakeEngine()
    const response = await GET(browserRequest("/api/auth/get-session"))
    expect(response.headers.getSetCookie()).toEqual([])
  })

  it("l'échange du jeton à usage unique (POST) : corps relayé tel quel, sans cookie à l'aller ni au retour", async () => {
    fakeEngine()
    const body = JSON.stringify({ token: "jeton-a-usage-unique" })
    const response = await POST(browserRequest("/api/auth/cross-domain/one-time-token/verify", { method: "POST", body }))
    expect(seen[0]).toMatchObject({ method: "POST", body, url: `${ENGINE}/api/auth/cross-domain/one-time-token/verify` })
    expect(seen[0]?.headers.get("cookie")).toBeNull()
    expect(response.headers.getSetCookie()).toEqual([])
    expect(response.headers.get("set-better-auth-cookie")).not.toBeNull()
  })

  it("une redirection du moteur garde sa destination, sans cookie", async () => {
    fakeEngine(() => engineReply(302, [["location", "https://idn.exemple/autoriser"]]))
    const response = await POST(browserRequest("/api/auth/sign-in/oauth2", { method: "POST", body: "{}" }))
    expect(response.status).toBe(302)
    expect(response.headers.get("location")).toBe("https://idn.exemple/autoriser")
    expect(response.headers.getSetCookie()).toEqual([])
  })

  it("un rappel OAuth ne rend ni cookie ni jeton porteur", async () => {
    fakeEngine(() => engineReply(302, [["location", "https://admin.exemple/entrer"], ["set-auth-token", "porteur"]]))
    const response = await GET(browserRequest("/api/auth/oauth2/callback/idn?code=c&state=s"))
    expect(response.headers.getSetCookie()).toEqual([])
    expect(response.headers.get("set-auth-token")).toBeNull()
  })

  it("sans moteur configuré : le refus du relais commun, sans requête", async () => {
    vi.stubEnv("CONVEX_SITE_URL", "")
    const fetchSpy = vi.fn()
    vi.stubGlobal("fetch", fetchSpy)
    const response = await GET(new NextRequest(new URL("/api/auth/get-session", "https://admin.exemple")))
    expect(response.status).toBe(500)
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

import { NextRequest } from "next/server"
import { afterEach, describe, expect, it, vi } from "vitest"

import { DELETE, GET, PATCH, POST, PUT } from "./route"

/**
 * CH-815 A1b — la route `/api/auth/*` d'admin.diaspora.ga est branchée sur le relais SANS
 * cookie (`src/lib/auth-relay.ts`), pas sur le relais commun du moteur tel quel : chaque
 * méthode, avec l'environnement réel (`CONVEX_SITE_URL`) et un moteur simulé.
 */
const ENGINE = "https://moteur.exemple"

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe("route /api/auth/[...path] d'admin.diaspora.ga", () => {
  it.each([
    ["GET", GET],
    ["POST", POST],
    ["PUT", PUT],
    ["PATCH", PATCH],
    ["DELETE", DELETE],
  ] as const)("%s : ni `Cookie` vers le moteur, ni `Set-Cookie` vers le navigateur", async (method, handler) => {
    vi.stubEnv("CONVEX_SITE_URL", ENGINE)
    vi.stubEnv("NODE_ENV", "production")
    const forwarded: Headers[] = []
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
        forwarded.push(new Headers(init?.headers))
        return new Response("{}", { status: 200, headers: [["set-cookie", "__Secure-better-auth.session_token=moteur; Path=/"], ["set-better-auth-cookie", "better-auth.session_token=onglet"]] })
      }),
    )
    const request = new NextRequest(new URL("/api/auth/get-session", "https://admin.exemple"), {
      method,
      headers: { cookie: "__Secure-better-auth.session_token=voisin", "better-auth-cookie": "better-auth.session_token=onglet" },
      ...(method === "GET" ? {} : { body: "{}" }),
    })
    const response = await handler(request)
    expect(forwarded).toHaveLength(1)
    expect(forwarded[0]?.get("cookie")).toBeNull()
    expect(forwarded[0]?.get("better-auth-cookie")).toBe("better-auth.session_token=onglet")
    expect(response.headers.getSetCookie()).toEqual([])
    expect(response.headers.get("set-better-auth-cookie")).toBe("better-auth.session_token=onglet")
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

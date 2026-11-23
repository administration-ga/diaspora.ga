import { type AuthProxyOptions, proxyToConvex } from "@antsia/api/auth-proxy"
import type { NextRequest } from "next/server"

/**
 * Le relais d'authentification d'admin.diaspora.ga : celui du moteur
 * (`@antsia/api/auth-proxy`, réécriture des chemins, en-têtes de saut, cookies de
 * développement), sans AUCUN cookie du navigateur, dans un sens comme dans l'autre
 * (revue de sécurité A1 ; admin.diaspora.ga et diaspora.ga sont du même site, donc
 * `SameSite` ne protège pas d'un cookie déposé par un voisin du domaine).
 *
 * La session de cette application n'en a jamais besoin, vérifié dans le client du
 * moteur (`createEngineAuthClient`, greffon `crossDomain` de `@convex-dev/better-auth`) :
 * chaque requête part avec `credentials: "omit"` et la session dans l'en-tête
 * `Better-Auth-Cookie`, lue dans le stockage de l'origine ; le serveur rend la sienne
 * dans `Set-Better-Auth-Cookie`, qui passe. Un `Cookie` entrant ne vient donc que
 * d'un dépôt étranger (« cookie tossing ») ou d'une navigation forgée : il est retiré
 * AVANT le saut. Un `Set-Cookie` sortant poserait une session que rien ici ne lit : il
 * est retiré de la réponse du moteur et de la réponse rendue.
 *
 * Le moteur n'a pas encore d'option pour cela (`AuthProxyOptions`) : le relais
 * l'enveloppe par son point d'injection (`fetchImpl`), sans le modifier.
 */

const REQUEST_COOKIE = "cookie"
const RESPONSE_COOKIE = "set-cookie"
/** Statuts sans corps : une réponse reconstruite ne doit pas en porter un. */
const NULL_BODY_STATUSES = new Set([101, 204, 205, 304])

/** Les en-têtes d'une requête vers le moteur, sans `Cookie`, dans la forme reçue. */
function withoutRequestCookie(headers: HeadersInit | undefined): HeadersInit | undefined {
  if (headers === undefined) return undefined
  if (headers instanceof Headers) {
    const copy = new Headers(headers)
    copy.delete(REQUEST_COOKIE)
    return copy
  }
  if (Array.isArray(headers)) return headers.filter(([name]) => name.toLowerCase() !== REQUEST_COOKIE)
  return Object.fromEntries(Object.entries(headers).filter(([name]) => name.toLowerCase() !== REQUEST_COOKIE))
}

/** La réponse du moteur sans `Set-Cookie` (corps, statut et autres en-têtes inchangés). */
function withoutResponseCookies(response: Response): Response {
  if (!response.headers.has(RESPONSE_COOKIE)) return response
  const headers = new Headers(response.headers)
  headers.delete(RESPONSE_COOKIE)
  return new Response(NULL_BODY_STATUSES.has(response.status) ? null : response.body, { status: response.status, statusText: response.statusText, headers })
}

/** Le saut vers le moteur, borné : aucun cookie ne part, aucun ne revient. */
export function cookieFreeFetch(fetchImpl: typeof fetch): typeof fetch {
  return async (input, init) => {
    const response = await fetchImpl(input, init === undefined ? undefined : { ...init, headers: withoutRequestCookie(init.headers) })
    return withoutResponseCookies(response)
  }
}

/** Relaie une requête `/api/auth/*` vers le moteur, sans cookie du navigateur. */
export async function relayAuthRequest(req: NextRequest, options: AuthProxyOptions): Promise<Response> {
  const response = await proxyToConvex(req, { ...options, fetchImpl: cookieFreeFetch(options.fetchImpl ?? fetch) })
  // Seconde barrière : quoi que fasse le relais commun, la réponse rendue n'en pose aucun.
  response.headers.delete(RESPONSE_COOKIE)
  return response
}

/** Les réglages du relais commun (`fromEnvironment` du moteur, non exporté). */
export function relayOptionsFromEnvironment(): AuthProxyOptions {
  return { convexSiteUrl: process.env.CONVEX_SITE_URL, isDev: process.env.NODE_ENV !== "production" }
}

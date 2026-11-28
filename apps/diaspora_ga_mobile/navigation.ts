import { publicShareUrl } from "./share-links"

export const ORIGIN = "https://diaspora.ga"
export const feed = ORIGIN + "/fil"

export function incoming(link: string | null): string | null {
  if (link === "diasporaga:///ouvrir") return ORIGIN + "/passerelle/consulat?mode=app&ouvrir=1"
  if (!link) return null
  try {
    const url = new URL(link)
    if (url.origin !== ORIGIN || url.username || url.password) return null
    if (url.pathname === "/mobile/ouvrir") return ORIGIN + "/passerelle/consulat?mode=app"
    if (url.pathname === "/mobile/retour") {
      const values = new URLSearchParams(url.hash.slice(1))
      if (["state", "code"].every(key => /^[a-f0-9]{64}$/.test(values.get(key) ?? ""))) return ORIGIN + "/mobile/retour" + url.hash
    }
    // Android associates the inbox path, including links without a group invitation.
    if (url.pathname === "/messages" && !url.searchParams.has("invitation-groupe")) return ORIGIN + "/messages"
    const target = publicShareUrl(url)
    if (target && url.pathname.startsWith("/publication/") && url.hash === "#commenter") return target + "#commenter"
    return target
  } catch { /* A launch without a supported link starts at the feed. */ }
  return null
}

/** Only the initial entry may fall back. OAuth returns and single-use tickets must stay on their original route. */
export function missingConsulateEntry(status: number, url: string, requested: string | undefined): string | null {
  if (status !== 404 && status !== 410) return null
  if (url !== requested || ![incoming("diasporaga:///ouvrir"), incoming(ORIGIN + "/mobile/ouvrir")].includes(url)) return null
  return ORIGIN + "/entrer?depuis=consulat"
}

export function destination(raw: string): "inside" | "outside" | "blocked" {
  try {
    const url = new URL(raw)
    if (/^tel:\+?[0-9][0-9 ().-]{2,23}$/i.test(raw)) return "outside"
    if (url.username || url.password || url.protocol !== "https:") return "blocked"
    // IDN returns to the same browser context as the original authorization request.
    if ([ORIGIN, "https://identite.ga", "https://site.identite.ga"].includes(url.origin)) return "inside"
    if (url.origin === "https://antsia.ga" && url.pathname === "/api/auth/oauth2/callback/idn") return "inside"
    return "outside"
  } catch { return "blocked" }
}

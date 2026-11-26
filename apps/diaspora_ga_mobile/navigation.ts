export const ORIGIN = "https://diaspora.ga"
export const feed = ORIGIN + "/fil"

export function incoming(link: string | null): string | null {
  if (!link) return null
  try {
    const url = new URL(link)
    if (url.origin !== ORIGIN || url.username || url.password) return null
    if (url.pathname === "/mobile/ouvrir") return ORIGIN + "/passerelle/consulat?mode=app"
    if (url.pathname === "/mobile/retour") {
      const values = new URLSearchParams(url.hash.slice(1))
      if (["state", "code"].every(key => /^[a-f0-9]{64}$/.test(values.get(key) ?? ""))) return ORIGIN + "/mobile/retour" + url.hash
    }
  } catch { /* A launch without a supported link starts at the feed. */ }
  return null
}

export function destination(raw: string): "inside" | "outside" | "blocked" {
  try {
    const url = new URL(raw)
    if (url.username || url.password || url.protocol !== "https:") return "blocked"
    // IDN returns to the same browser context as the original authorization request.
    if ([ORIGIN, "https://identite.ga", "https://site.identite.ga"].includes(url.origin)) return "inside"
    if (url.origin === "https://antsia.ga" && url.pathname === "/api/auth/oauth2/callback/idn") return "inside"
    return "outside"
  } catch { return "blocked" }
}

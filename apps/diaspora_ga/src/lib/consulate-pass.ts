/** Web requests belong to a tab. Mobile requests may resume after the OS reopened the app or browser. */
export type PassMode = "web" | "app" | "companion"
type PassStore = Pick<Storage, "length" | "key" | "getItem" | "setItem" | "removeItem">
const prefix = "antsia:diaspora-ga:consulate-pass:"
const ttl = 180_000
const valid = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{64}$/.test(value)
const hex = (bytes: Uint8Array) => Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("")
export const passMode = (value: string | null): PassMode => value === "app" || value === "companion" ? value : "web"

function pending(store: PassStore, key: string, now: number): { verifier: string; expires: number } | null {
  const raw = store.getItem(key)
  if (!raw) return null
  try {
    const record = JSON.parse(raw)
    if (valid(record?.verifier) && Number.isFinite(record.expires) && record.expires > now && record.expires <= now + ttl) return record
  } catch { /* Remove incomplete or obsolete records. */ }
  store.removeItem(key)
  return null
}

export async function startPass(origin: string, mode: PassMode, store: PassStore): Promise<string> {
  const url = new URL(mode === "web" ? "/my-space/diaspora/continuer" : "/my-space/diaspora/autoriser", origin)
  if (url.protocol !== "https:" || url.username || url.password) throw new Error("Origine invalide")
  const verifier = hex(crypto.getRandomValues(new Uint8Array(32)))
  const state = hex(crypto.getRandomValues(new Uint8Array(32)))
  const challenge = hex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))))
  const now = Date.now()
  const active: { key: string; expires: number }[] = []
  for (let i = store.length - 1; i >= 0; i--) {
    const key = store.key(i)
    if (!key?.startsWith(prefix)) continue
    const record = pending(store, key, now)
    if (record) active.push({ key, expires: record.expires })
  }
  // Concurrent tabs keep independent verifiers. Bound abandoned mobile requests on this device.
  for (const record of active.sort((a, b) => b.expires - a.expires).slice(7)) store.removeItem(record.key)
  store.setItem(prefix + state, JSON.stringify({ verifier, expires: now + ttl }))
  url.search = new URLSearchParams({ state, challenge, mode }).toString()
  return url.href
}

export function takePass(fragment: string, stores: readonly PassStore[], now = Date.now()) {
  const params = new URLSearchParams(fragment.replace(/^#/, ""))
  const state = params.get("state"), code = params.get("code")
  if (!valid(state) || !valid(code)) throw new Error("Retour invalide")
  const key = prefix + state
  for (const store of stores) {
    try {
      const record = pending(store, key, now)
      if (!record) continue
      store.removeItem(key)
      return { code, verifier: record.verifier }
    } catch { /* A private tab can block one storage type while permitting the other. */ }
  }
  throw new Error("Passage expiré")
}

import { describe, expect, it } from "vitest"
import { startPass, takePass } from "./consulate-pass"

function memory() {
  const entries = new Map<string, string>()
  return { get length() { return entries.size }, key: (i: number) => [...entries.keys()][i] ?? null,
    getItem: (k: string) => entries.get(k) ?? null, removeItem: (k: string) => { entries.delete(k) },
    setItem: (k: string, v: string) => { entries.set(k, v) } }
}
const code = "a".repeat(64)
const callback = (url: URL) => "#" + new URLSearchParams({ code, state: url.searchParams.get("state")! })

describe("passage depuis consulat.ga", () => {
  it("deux arrivées en parallèle conservent chacune leur preuve", async () => {
    const store = memory()
    const [first, second] = (await Promise.all([startPass("https://consulat.ga", "companion", store), startPass("https://consulat.ga", "app", store)])).map(url => new URL(url))
    for (const url of [first!, second!]) {
      expect(url.pathname).toBe("/my-space/diaspora/autoriser")
      expect(() => takePass(callback(url), [memory()])).toThrow()
      const proof = takePass(callback(url), [store])
      const sha = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(proof.verifier)))
      expect(Array.from(sha, x => x.toString(16).padStart(2, "0")).join("")).toBe(url.searchParams.get("challenge"))
      expect(url.search).not.toContain(proof.verifier)
      expect(() => takePass(callback(url), [store])).toThrow()
    }
  })
  it("sur le web utilise le retour navigateur et refuse les retours expirés", async () => {
    const store = memory()
    const url = new URL(await startPass("https://consulat.ga/my-space", "web", store))
    expect(url.pathname).toBe("/my-space/diaspora/continuer")
    expect(() => takePass(callback(url), [store], Date.now() + 181000)).toThrow()
    expect(store.length).toBe(0)
  })
})

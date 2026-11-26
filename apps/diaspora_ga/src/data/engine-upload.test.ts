import { afterEach, describe, expect, it, vi } from "vitest"

import { defaultUploadTransport, fetchUploadTransport, xhrUploadTransport } from "./engine-upload"

/**
 * A3 (25/11/2026) — l'envoi d'un fichier au dépôt du moteur dit son avancement (XHR),
 * s'annule d'un geste, et ne montre jamais la réponse du serveur : seuls l'état HTTP et
 * le corps à relire remontent. Sans XHR (rendu serveur, tests), le même envoi passe par
 * `fetch`, sans avancement.
 */

type Listener = (event: { loaded: number; total: number; lengthComputable: boolean }) => void

/** Un XHR simulé : il enregistre ce qu'on lui envoie et laisse le test piloter l'avancement et la fin. */
class FakeXhr {
  static last: FakeXhr | null = null
  method = ""
  url = ""
  headers: Record<string, string> = {}
  body: unknown = null
  status = 0
  responseText = ""
  aborted = false
  private listeners: Record<string, (() => void)[]> = {}
  readonly upload = {
    progress: [] as Listener[],
    addEventListener: (type: string, listener: Listener) => { if (type === "progress") this.upload.progress.push(listener) },
  }
  constructor() { FakeXhr.last = this }
  open(method: string, url: string) { this.method = method; this.url = url }
  setRequestHeader(name: string, value: string) { this.headers[name] = value }
  addEventListener(type: string, listener: () => void) { (this.listeners[type] ??= []).push(listener) }
  send(body: unknown) { this.body = body }
  abort() { this.aborted = true; this.fire("abort") }
  fire(type: string) { for (const listener of this.listeners[type] ?? []) listener() }
  progress(loaded: number, total: number) { for (const listener of this.upload.progress) listener({ loaded, total, lengthComputable: total > 0 }) }
  finish(status: number, body: string) { this.status = status; this.responseText = body; this.fire("load") }
}

afterEach(() => {
  vi.unstubAllGlobals()
  FakeXhr.last = null
})

const file = () => new File(["photo préparée"], "fleuve.jpg", { type: "image/jpeg" })

describe("xhrUploadTransport — l'envoi qui dit son avancement", () => {
  it("envoie le fichier tel quel, avec son type, et dit l'avancement de 0 à 1", async () => {
    vi.stubGlobal("XMLHttpRequest", FakeXhr)
    const progress: number[] = []
    const sent = xhrUploadTransport({ url: "https://depot.test/televersement", file: file(), onProgress: (fraction) => progress.push(fraction) })
    const xhr = FakeXhr.last!
    expect(xhr.method).toBe("POST")
    expect(xhr.url).toBe("https://depot.test/televersement")
    expect(xhr.headers).toEqual({ "Content-Type": "image/jpeg" })
    expect(xhr.body).toBeInstanceOf(File)
    xhr.progress(0, 0)
    xhr.progress(512, 1024)
    xhr.progress(1024, 1024)
    xhr.finish(200, JSON.stringify({ storageId: "kg-photo" }))
    expect(await sent).toEqual({ status: 200, body: JSON.stringify({ storageId: "kg-photo" }) })
    // Un avancement sans taille connue ne se dit pas ; jamais au-delà de 1.
    expect(progress).toEqual([0.5, 1])
  })

  it("une erreur réseau rejette ; un refus HTTP rend son état sans rien inventer", async () => {
    vi.stubGlobal("XMLHttpRequest", FakeXhr)
    const failed = xhrUploadTransport({ url: "https://depot.test/a", file: file() })
    FakeXhr.last!.fire("error")
    await expect(failed).rejects.toThrow()
    const refused = xhrUploadTransport({ url: "https://depot.test/b", file: file() })
    FakeXhr.last!.finish(413, "trop lourd")
    expect(await refused).toEqual({ status: 413, body: "trop lourd" })
  })

  it("l'annulation interrompt l'envoi et rejette en AbortError ; déjà annulé, rien ne part", async () => {
    vi.stubGlobal("XMLHttpRequest", FakeXhr)
    const controller = new AbortController()
    const sending = xhrUploadTransport({ url: "https://depot.test/c", file: file(), signal: controller.signal })
    const xhr = FakeXhr.last!
    controller.abort()
    await expect(sending).rejects.toMatchObject({ name: "AbortError" })
    expect(xhr.aborted).toBe(true)
    FakeXhr.last = null
    await expect(xhrUploadTransport({ url: "https://depot.test/d", file: file(), signal: AbortSignal.abort() })).rejects.toMatchObject({ name: "AbortError" })
    expect(FakeXhr.last).toBeNull()
  })
})

describe("fetchUploadTransport et le choix par défaut", () => {
  it("sans XHR, l'envoi passe par fetch, à l'identique, sans avancement", async () => {
    const deposit = vi.fn(async () => new Response("{\"storageId\":\"kg\"}", { status: 200 }))
    vi.stubGlobal("fetch", deposit)
    vi.stubGlobal("XMLHttpRequest", undefined)
    const upload = file()
    const controller = new AbortController()
    expect(defaultUploadTransport()).toBe(fetchUploadTransport)
    expect(await defaultUploadTransport()({ url: "https://depot.test/e", file: upload, signal: controller.signal })).toEqual({ status: 200, body: "{\"storageId\":\"kg\"}" })
    expect(deposit).toHaveBeenCalledWith("https://depot.test/e", { method: "POST", headers: { "Content-Type": "image/jpeg" }, body: upload, signal: controller.signal })
  })

  it("avec XHR, le choix par défaut est l'envoi qui dit son avancement", () => {
    vi.stubGlobal("XMLHttpRequest", FakeXhr)
    expect(defaultUploadTransport()).toBe(xhrUploadTransport)
  })
})

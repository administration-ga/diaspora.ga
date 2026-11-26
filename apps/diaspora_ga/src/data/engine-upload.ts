/**
 * L'envoi d'un fichier au dépôt du moteur (A3, 25/11/2026) : la deuxième moitié du
 * dépôt en deux temps, après l'URL de dépôt (`media.generateUploadUrl`). `fetch` ne dit
 * pas l'avancement d'un envoi ; XHR le dit (`upload.onprogress`) : l'écran affiche un
 * pour cent. L'annulation (geste, fermeture du composeur) interrompt l'envoi.
 *
 * Rien de la réponse n'est interprété ici : l'état HTTP et le corps remontent, l'appelant
 * lit l'identifiant de stockage ou dit un refus par un code fermé. Sans XHR (rendu
 * serveur, tests en environnement Node), le même envoi passe par `fetch`, sans avancement.
 */

export interface UploadTransportRequest {
  readonly url: string
  readonly file: File
  readonly signal?: AbortSignal
  /** L'avancement de l'envoi, de 0 à 1, quand la taille est connue. */
  readonly onProgress?: (fraction: number) => void
}

export interface UploadTransportResponse {
  readonly status: number
  readonly body: string
}

export type UploadTransport = (request: UploadTransportRequest) => Promise<UploadTransportResponse>

function abortError(): DOMException {
  return new DOMException("Envoi annulé", "AbortError")
}

/** L'envoi par XHR : il dit son avancement et s'interrompt à l'annulation. */
export const xhrUploadTransport: UploadTransport = (request) =>
  new Promise<UploadTransportResponse>((resolve, reject) => {
    if (request.signal?.aborted) {
      reject(abortError())
      return
    }
    const xhr = new XMLHttpRequest()
    const onAbort = () => xhr.abort()
    const settle = () => request.signal?.removeEventListener("abort", onAbort)
    xhr.open("POST", request.url)
    xhr.setRequestHeader("Content-Type", request.file.type)
    if (request.onProgress) {
      const report = request.onProgress
      xhr.upload.addEventListener("progress", (event) => {
        if (!event.lengthComputable || event.total <= 0) return
        report(Math.min(1, Math.max(0, event.loaded / event.total)))
      })
    }
    xhr.addEventListener("load", () => {
      settle()
      resolve({ status: xhr.status, body: typeof xhr.responseText === "string" ? xhr.responseText : "" })
    })
    xhr.addEventListener("error", () => {
      settle()
      reject(new Error("Envoi interrompu"))
    })
    xhr.addEventListener("abort", () => {
      settle()
      reject(abortError())
    })
    request.signal?.addEventListener("abort", onAbort, { once: true })
    xhr.send(request.file)
  })

/** L'envoi par `fetch`, quand XHR manque : le même envoi, sans avancement. */
export const fetchUploadTransport: UploadTransport = async (request) => {
  const response = await fetch(request.url, {
    method: "POST",
    headers: { "Content-Type": request.file.type },
    body: request.file,
    ...(request.signal ? { signal: request.signal } : {}),
  })
  return { status: response.status, body: await response.text() }
}

/** XHR quand le navigateur le connaît, sinon `fetch`. */
export function defaultUploadTransport(): UploadTransport {
  return typeof XMLHttpRequest === "undefined" ? fetchUploadTransport : xhrUploadTransport
}

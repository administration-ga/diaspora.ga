import { POST_MEDIA_MAX_COUNT, POST_VIDEO_MAX_BYTES, POST_VIDEO_MAX_DURATION_MS } from "@antsia/social-domain/content"
import { jpegHasGpsMetadata, listImageMetadata } from "@antsia/social-domain/imageMetadata"
import {
  prepareVideoForUpload,
  type PrepareVideo,
  type VideoPreparationPhase,
  type VideoRuntime,
} from "@antsia/social-features/features/video-upload/video-preparation"
import { TRANSCODE_ABORTED } from "@antsia/social-features/features/video-upload/video-upload-probe"
import {
  POST_VIDEO_UPLOAD_LIMITS,
  VIDEO_PREPARATION_REFUSALS,
  VIDEO_TRANSCODE_MAX_DURATION_MS,
  type VideoPreparationRefusal,
} from "@antsia/social-features/features/video-upload/video-upload-policy"
import { IMAGE_UPLOAD_QUALITY, isPreparedImage, type PrepareImage } from "@antsia/social-features/media-upload"
import { fakeImageRuntime, TEST_JPEG_WITH_GPS_BYTES, testPrepareImage } from "@antsia/social-features/tests/image-runtime"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { getFixedT } from "../i18n"
import { ACTION_ERROR_CODES } from "./errors"
import {
  describeMediaFile,
  downscaleImage,
  fileForDeposit,
  IMAGE_PREPARATION_CODES,
  MEDIA_RULE_CODES,
  POST_MEDIA_ACCEPT,
  postMediaKindOf,
  postMediaRefusal,
  prepareImageFile,
  prepareMediaFile,
  postVideoDurationRefusal,
  selectionMediaInput,
  unsupportedMediaRefusal,
  VIDEO_PREPARATION_CODES,
} from "./media"

function file(bytes: Uint8Array, name: string, type: string): File {
  return new File([bytes as Uint8Array<ArrayBuffer>], name, { type })
}

async function bytesOf(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer())
}

/** Une photo de téléphone FICTIVE, avec sa position GPS (valeurs inventées). */
const phonePhoto = () => file(TEST_JPEG_WITH_GPS_BYTES, "IMG_0001.jpg", "image/jpeg")
/** Le pire encodeur : il recopierait le bloc EXIF de la source. Le module ne s'y fie pas. */
const leakyEncoder = { output: { bytes: TEST_JPEG_WITH_GPS_BYTES, type: "image/jpeg" } } as const

/** Un GIF 1×1 réel, animé d'une boucle, avec un commentaire et un paquet XMP (même forme que le test du moteur). */
function gifWithMetadata(): Uint8Array {
  const ascii = (text: string) => Array.from(text, (char) => char.charCodeAt(0))
  return Uint8Array.from([
    ...ascii("GIF89a"), 0x01, 0x00, 0x01, 0x00, 0x80, 0x00, 0x00, 0xff, 0xff, 0xff, 0x00, 0x00, 0x00,
    0x21, 0xff, 0x0b, ...ascii("NETSCAPE2.0"), 0x03, 0x01, 0x00, 0x00, 0x00,
    0x21, 0xfe, 0x0a, ...ascii("Libreville"), 0x00,
    0x21, 0xff, 0x0b, ...ascii("XMP DataXMP"), 0x05, ...ascii("<x:x>"), 0x00,
    0x21, 0xf9, 0x04, 0x01, 0x00, 0x00, 0x00, 0x00,
    0x2c, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0x02, 0x02, 0x44, 0x01, 0x00,
    0x3b,
  ])
}

/** La mesure d'une vidéo attend ses métadonnées (5 s au plus) : `jsdom` ne les donne jamais, l'horloge est avancée. */
async function measuredVideo<T>(work: Promise<T>): Promise<T> {
  await vi.advanceTimersByTimeAsync(5000)
  return await work
}

/**
 * FD-02 — un navigateur SIMULÉ pour la préparation des vidéos : le vrai module du moteur
 * (`prepareVideoForUpload`, sa politique et ses refus) sur un environnement qui dit ce qu'il
 * sait lire et encoder. Aucune conversion réelle : jsdom n'a ni décodeur ni `MediaRecorder`.
 */
function simulatedBrowser(options: {
  readonly decodable?: boolean
  readonly durationMs?: number | null
  readonly codecs?: readonly string[] | null
  readonly targets?: readonly string[]
  readonly transcode?: VideoRuntime["transcode"]
} = {}) {
  const created: string[] = []
  const revoked: string[] = []
  const transcodes: string[] = []
  const runtime: VideoRuntime = {
    createObjectUrl: () => {
      const url = `blob:sonde-${created.length + 1}`
      created.push(url)
      return url
    },
    revokeObjectUrl: (url) => {
      revoked.push(url)
    },
    probe: async () => ({ decodable: options.decodable ?? true, durationMs: options.durationMs === undefined ? 9_000 : options.durationMs }),
    sniffMp4Codecs: async () => options.codecs ?? null,
    recorderTargets: () => options.targets ?? ["video/mp4"],
    transcode:
      options.transcode ??
      (async (_url, transcodeOptions, onProgress) => {
        transcodes.push(transcodeOptions.targetMime)
        onProgress?.(0.5)
        onProgress?.(1)
        return { blob: new Blob([new Uint8Array(1_024)], { type: "video/mp4" }), mimeType: "video/mp4", durationMs: 8_960 }
      }),
  }
  const prepareVideo = vi.fn<PrepareVideo>((file, prepareOptions) => prepareVideoForUpload(file, prepareOptions, runtime))
  return { prepareVideo, created, revoked, transcodes }
}

/** Une préparation SIMULÉE à sa frontière : elle rend ce fichier-là, sans rien sonder. */
function preparedAs(file: File, outcome: { readonly durationMs?: number; readonly converted?: boolean } = {}) {
  return vi.fn<PrepareVideo>(async () => ({ status: "ready", file, durationMs: outcome.durationMs, converted: outcome.converted ?? true }))
}

const iphoneVideo = () => new File(["mov"], "IMG_0412.MOV", { type: "video/quicktime" })

afterEach(() => {
  vi.useRealTimers()
})

describe("médias d'une publication — les règles du moteur, dites par DIASPORA.GA", () => {
  it("le type dit la nature du média : photo, vidéo, ou refus", () => {
    expect(postMediaKindOf("image/webp")).toBe("image")
    expect(postMediaKindOf("video/mp4")).toBe("video")
    expect(postMediaKindOf("video/webm")).toBe("video")
    // FD-02 (SD-03 du moteur) : une nouvelle publication ne porte jamais un .mov TEL QUEL.
    expect(postMediaKindOf("video/quicktime")).toBeNull()
    expect(postMediaKindOf("application/pdf")).toBeNull()
    // Le sélecteur laisse choisir toute vidéo (le .mov de l'iPhone se convertit) ; le tri vient après.
    expect(POST_MEDIA_ACCEPT.split(",")).toEqual(expect.arrayContaining(["image/jpeg", "image/gif", "video/*"]))
    expect(POST_MEDIA_ACCEPT.split(",")).not.toContain("video/quicktime")
  })

  it("FD-02 : au choix, un .mov se présente comme le MP4 qu'il deviendra ; seule sa place se juge", () => {
    const photo = new File(["photo"], "photo.jpg", { type: "image/jpeg" })
    const mov = new File(["mov"], "IMG_0412.MOV", { type: "video/quicktime" })
    expect(selectionMediaInput(photo)).toEqual({ kind: "image", mimeType: "image/jpeg", sizeBytes: 5 })
    expect(selectionMediaInput(new File(["clip"], "clip.webm", { type: "video/webm" }))).toEqual({ kind: "video", mimeType: "video/webm", sizeBytes: 4 })
    expect(selectionMediaInput(mov)).toEqual({ kind: "video", mimeType: "video/mp4", sizeBytes: POST_VIDEO_MAX_BYTES })
    expect(selectionMediaInput(new File(["%PDF"], "dossier.pdf", { type: "application/pdf" }))).toBeNull()
    const movInput = selectionMediaInput(mov)
    const photoInput = selectionMediaInput(photo)
    if (!movInput || !photoInput) throw new Error("fichier non reconnu")
    expect(postMediaRefusal([movInput])).toBeNull()
    expect(postMediaRefusal([photoInput, movInput])).toBe("media_video_alone")
  })

  it("autant de photos que la borne du moteur, une vidéo seule, un texte alternatif borné : chaque refus a son code", () => {
    const photo = { kind: "image" as const, mimeType: "image/jpeg", sizeBytes: 1000 }
    const video = { kind: "video" as const, mimeType: "video/mp4", sizeBytes: 1000 }
    // M3 du moteur : la borne vient du domaine (dix photos), jamais d'un chiffre écrit ici.
    expect(POST_MEDIA_MAX_COUNT).toBe(10)
    expect(postMediaRefusal(Array.from({ length: POST_MEDIA_MAX_COUNT }, () => photo))).toBeNull()
    expect(postMediaRefusal([video])).toBeNull()
    expect(postMediaRefusal(Array.from({ length: POST_MEDIA_MAX_COUNT + 1 }, () => photo))).toBe("media_too_many")
    expect(postMediaRefusal([video, photo])).toBe("media_video_alone")
    expect(postMediaRefusal([{ ...photo, mimeType: "image/bmp" }])).toBe("media_type_invalid")
    expect(postMediaRefusal([{ ...photo, sizeBytes: 21 * 1024 * 1024 }])).toBe("media_too_large")
    expect(postMediaRefusal([{ ...photo, altText: "x".repeat(301) }])).toBe("media_alt_too_long")
  })

  it("la table des règles ne rend que des codes fermés de DIASPORA.GA", () => {
    for (const code of Object.values(MEDIA_RULE_CODES)) expect(ACTION_ERROR_CODES).toContain(code)
  })

  it("un fichier se juge avant l'envoi ; sans mesure possible, il passe sans dimensions", async () => {
    expect(await describeMediaFile(new File(["%PDF"], "dossier.pdf", { type: "application/pdf" }))).toEqual({ ok: false, code: "media_type_invalid" })
    const heavy = new File(["x"], "lourde.jpg", { type: "image/jpeg" })
    Object.defineProperty(heavy, "size", { value: 21 * 1024 * 1024 })
    expect(await describeMediaFile(heavy)).toEqual({ ok: false, code: "media_too_large" })
    expect(await describeMediaFile(new File(["png"], "photo.png", { type: "image/png" }))).toEqual({
      ok: true,
      value: { kind: "image", mimeType: "image/png", sizeBytes: 3 },
    })
  })
})

describe("FD-01 — une photo part nettoyée et allégée, jamais telle qu'elle a été choisie", () => {
  it("un JPEG portant un bloc GPS sort sans segment EXIF ; type, poids et dimensions déclarés sont ceux du fichier préparé", async () => {
    const source = phonePhoto()
    expect(jpegHasGpsMetadata(TEST_JPEG_WITH_GPS_BYTES)).toBe(true)
    const prepare = testPrepareImage({ width: 4032, height: 3024, ...leakyEncoder })

    const result = await prepareMediaFile(source, prepare)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    const sent = result.value.file
    expect(sent).not.toBe(source)
    expect(isPreparedImage(sent)).toBe(true)
    const bytes = await bytesOf(sent)
    expect(jpegHasGpsMetadata(bytes)).toBe(false)
    expect(listImageMetadata(bytes, "image/jpeg")).toEqual([])
    // SOI puis l'en-tête JFIF : plus aucun APP1 (EXIF) entre eux.
    expect(Array.from(bytes.subarray(0, 4))).toEqual([0xff, 0xd8, 0xff, 0xe0])
    expect(prepare.runtime.canvases).toEqual([{ width: 2048, height: 1536 }])
    expect(prepare.runtime.encodings).toEqual([{ type: "image/jpeg", quality: IMAGE_UPLOAD_QUALITY }])
    expect(result.value.facts).toEqual({ kind: "image", mimeType: "image/jpeg", sizeBytes: sent.size, width: 2048, height: 1536 })
    expect(result.value.facts.sizeBytes).toBeLessThan(source.size)
  })

  it("refus si le canvas manque : un code fermé, aucun fichier rendu", async () => {
    expect(await prepareMediaFile(phonePhoto(), testPrepareImage({ canvas: "absent" }))).toEqual({ ok: false, code: "media_preparation_unavailable" })
    expect(await prepareMediaFile(phonePhoto(), testPrepareImage({ canvas: "no-context" }))).toEqual({ ok: false, code: "media_preparation_unavailable" })
  })

  it("un fichier illisible est refusé avec une phrase traduite, en français comme en anglais", async () => {
    const result = await prepareMediaFile(phonePhoto(), testPrepareImage({ decodeFails: true }))
    expect(result).toEqual({ ok: false, code: "media_unreadable" })
    for (const locale of ["fr", "en"] as const) {
      const t = getFixedT(locale)
      for (const code of Object.values(IMAGE_PREPARATION_CODES)) {
        expect(ACTION_ERROR_CODES).toContain(code)
        expect(t(`errors.${code}`)).not.toBe(`errors.${code}`)
      }
    }
    expect(getFixedT("fr")("errors.media_unreadable")).toMatch(/ne sera pas envoyée/)
  })

  it("un encodeur muet ou une préparation qui lève refusent la photo : l'original ne part jamais", async () => {
    expect(await prepareMediaFile(phonePhoto(), testPrepareImage({ output: null }))).toEqual({ ok: false, code: "media_preparation_failed" })
    const throwing: PrepareImage = () => Promise.reject(new Error("panne"))
    expect(await prepareImageFile(phonePhoto(), throwing)).toEqual({ ok: false, code: "media_unreadable" })
  })

  it("une image déjà sortie du module n'est pas ré-encodée une seconde fois", async () => {
    const first = await prepareImageFile(phonePhoto(), testPrepareImage())
    if (!first.ok) throw new Error("préparation refusée")
    const again = vi.fn<PrepareImage>()
    expect(await prepareImageFile(first.value.file, again)).toEqual({ ok: true, value: { file: first.value.file } })
    expect(again).not.toHaveBeenCalled()
  })

  it("le GIF animé suit la règle du module : animation intacte, métadonnées retirées, aucun canvas", async () => {
    const gif = gifWithMetadata()
    expect(listImageMetadata(gif, "image/gif")?.length).toBeGreaterThan(0)
    const prepare = testPrepareImage()
    const result = await prepareMediaFile(file(gif, "anime.gif", "image/gif"), prepare)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.facts.mimeType).toBe("image/gif")
    expect(listImageMetadata(await bytesOf(result.value.file), "image/gif")).toEqual([])
    expect(prepare.runtime.canvases).toEqual([])
  })

  it("une vidéo MP4 lisible part telle quelle, sans passer par la préparation des photos", async () => {
    vi.useFakeTimers()
    const clip = new File(["clip"], "clip.mp4", { type: "video/mp4" })
    const prepare = vi.fn<PrepareImage>()
    const browser = simulatedBrowser({ durationMs: 4_000, codecs: ["avc1"] })
    const result = await measuredVideo(prepareMediaFile(clip, prepare, { prepareVideo: browser.prepareVideo }))
    expect(result).toEqual({ ok: true, value: { file: clip, facts: { kind: "video", mimeType: "video/mp4", sizeBytes: 4, durationMs: 4_000 } } })
    expect(browser.transcodes).toEqual([])
    expect(prepare).not.toHaveBeenCalled()
    expect(await prepareMediaFile(new File(["%PDF"], "dossier.pdf", { type: "application/pdf" }), prepare)).toEqual({ ok: false, code: "media_type_invalid" })
  })

  it("au dépôt d'une pièce : un document part tel quel, une photo part préparée", async () => {
    const pdf = new File(["%PDF"], "statuts.pdf", { type: "application/pdf" })
    expect(await fileForDeposit(pdf, testPrepareImage())).toEqual({ ok: true, value: pdf })
    const photo = await fileForDeposit(phonePhoto(), testPrepareImage(leakyEncoder))
    expect(photo.ok && isPreparedImage(photo.value)).toBe(true)
    expect(await fileForDeposit(phonePhoto(), testPrepareImage({ canvas: "absent" }))).toEqual({ ok: false, code: "media_preparation_unavailable" })
  })

  it("la démonstration converge sur la même règle : module du moteur, JPEG sans métadonnées, refus fermés, aucun dépôt", async () => {
    const runtime = fakeImageRuntime({ width: 4032, height: 3024, ...leakyEncoder })
    const result = await downscaleImage(phonePhoto(), 1280, runtime)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).toMatchObject({ width: 1280, height: 960 })
    expect(runtime.canvases).toEqual([{ width: 1280, height: 960 }])
    expect(runtime.encodings).toEqual([{ type: "image/jpeg", quality: IMAGE_UPLOAD_QUALITY }])
    const [prefix, payload] = result.value.dataUrl.split(",")
    expect(prefix).toBe("data:image/jpeg;base64")
    const stored = Uint8Array.from(atob(payload ?? ""), (char) => char.charCodeAt(0))
    expect(jpegHasGpsMetadata(stored)).toBe(false)
    expect(listImageMetadata(stored, "image/jpeg")).toEqual([])
    expect(await downscaleImage(phonePhoto(), 1280, fakeImageRuntime({ canvas: "absent" }))).toEqual({ ok: false, code: "media_preparation_unavailable" })
    expect(await downscaleImage(phonePhoto(), 1280, fakeImageRuntime({ decodeFails: true }))).toEqual({ ok: false, code: "media_unreadable" })
    expect(await downscaleImage(new File(["%PDF"], "dossier.pdf", { type: "application/pdf" }), 1280, runtime)).toEqual({ ok: false, code: "media_type_invalid" })
  })
})

describe("FD-02 — une vidéo trop lourde est refusée avant l'envoi, à la borne du moteur", () => {
  it("la borne est celle du domaine : à la limite, recevable ; un octet de plus, refusée", async () => {
    vi.useFakeTimers()
    const atLimit = new File(["v"], "limite.mp4", { type: "video/mp4" })
    Object.defineProperty(atLimit, "size", { value: POST_VIDEO_MAX_BYTES })
    const heavy = new File(["v"], "lourde.mp4", { type: "video/mp4" })
    Object.defineProperty(heavy, "size", { value: POST_VIDEO_MAX_BYTES + 1 })
    expect(postMediaRefusal([{ kind: "video", mimeType: "video/mp4", sizeBytes: POST_VIDEO_MAX_BYTES }])).toBeNull()
    // Refusée avant toute analyse : la préparation n'est même pas appelée.
    const unused = simulatedBrowser()
    expect(await prepareMediaFile(heavy, undefined, { prepareVideo: unused.prepareVideo })).toEqual({ ok: false, code: "media_too_large" })
    expect(unused.prepareVideo).not.toHaveBeenCalled()
    expect((await measuredVideo(prepareMediaFile(atLimit, undefined, { prepareVideo: simulatedBrowser({ codecs: ["avc1"] }).prepareVideo }))).ok).toBe(true)
  })
})

/**
 * Un navigateur qui sait lire les métadonnées d'une vidéo : jsdom n'a pas de
 * décodeur ; on donne à l'élément `<video>` la durée voulue, et l'évènement
 * `loadedmetadata` arrive dès que la source est posée.
 */
function fakeVideoMetadata(durationSeconds: number): () => void {
  const urlStatics = URL as unknown as { createObjectURL?: (blob: Blob) => string; revokeObjectURL?: (url: string) => void }
  const original = { create: urlStatics.createObjectURL, revoke: urlStatics.revokeObjectURL }
  Object.defineProperty(URL, "createObjectURL", { configurable: true, writable: true, value: () => "blob:video-de-test" })
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, writable: true, value: () => undefined })
  const create = document.createElement.bind(document)
  const spy = vi.spyOn(document, "createElement").mockImplementation((tag: string, options?: ElementCreationOptions) => {
    const element = create(tag, options)
    if (element instanceof HTMLVideoElement) {
      Object.defineProperty(element, "duration", { value: durationSeconds })
      Object.defineProperty(element, "videoWidth", { value: 1280 })
      Object.defineProperty(element, "videoHeight", { value: 720 })
      Object.defineProperty(element, "src", {
        configurable: true,
        get: () => "",
        set: () => queueMicrotask(() => element.onloadedmetadata?.call(element, new Event("loadedmetadata"))),
      })
    }
    return element
  })
  return () => {
    spy.mockRestore()
    Object.defineProperty(URL, "createObjectURL", { configurable: true, writable: true, value: original.create })
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, writable: true, value: original.revoke })
  }
}

describe("FD-02 — une vidéo lisible partout et bornée, refusée avant l'envoi", () => {
  it("un .mov que ce navigateur ne sait pas lire reçoit la marche à suivre ; un autre fichier, le refus de type", async () => {
    expect(unsupportedMediaRefusal("video/quicktime")).toBe("media_video_format")
    expect(unsupportedMediaRefusal("video/x-msvideo")).toBe("media_video_format")
    expect(unsupportedMediaRefusal("application/pdf")).toBe("media_type_invalid")
    const mov = iphoneVideo()
    const prepare = vi.fn<PrepareImage>()
    // Préparé d'abord : illisible ici, il est refusé avant tout envoi, sans conversion ni dépôt.
    const browser = simulatedBrowser({ decodable: false, durationMs: null })
    expect(await prepareMediaFile(mov, prepare, { prepareVideo: browser.prepareVideo })).toEqual({ ok: false, code: "media_video_format" })
    expect(browser.transcodes).toEqual([])
    // Décrit sans préparation (la démonstration), il garde la même marche à suivre.
    expect(await describeMediaFile(mov)).toEqual({ ok: false, code: "media_video_format" })
    expect(prepare).not.toHaveBeenCalled()
  })

  it("la durée est jugée par la règle du moteur : à la borne, recevable ; au-delà, refusée ; inconnue, elle passe", () => {
    expect(postVideoDurationRefusal(POST_VIDEO_MAX_DURATION_MS)).toBeNull()
    expect(postVideoDurationRefusal(POST_VIDEO_MAX_DURATION_MS + 1)).toBe("media_video_too_long")
    expect(postVideoDurationRefusal(undefined)).toBeNull()
    // Le refus du serveur (POST_VIDEO_TOO_LONG) se dit par le même code fermé.
    expect(MEDIA_RULE_CODES.POST_VIDEO_TOO_LONG).toBe("media_video_too_long")
    expect(ACTION_ERROR_CODES).toContain("media_video_too_long")
    expect(ACTION_ERROR_CODES).toContain("media_video_format")
  })

  it("une vidéo mesurée au-delà de la borne de durée est refusée avant le dépôt ; à la borne, elle part avec sa durée", async () => {
    const tooLong = fakeVideoMetadata(POST_VIDEO_MAX_DURATION_MS / 1000 + 1)
    try {
      const clip = new File(["clip"], "longue.mp4", { type: "video/mp4" })
      expect(await describeMediaFile(clip)).toEqual({ ok: false, code: "media_video_too_long" })
      // La préparation sonde la même durée et la refuse par le même code, avant tout dépôt.
      const browser = simulatedBrowser({ durationMs: POST_VIDEO_MAX_DURATION_MS + 1_000 })
      expect(await prepareMediaFile(clip, undefined, { prepareVideo: browser.prepareVideo })).toEqual({ ok: false, code: "media_video_too_long" })
    } finally {
      tooLong()
    }
    const atLimit = fakeVideoMetadata(POST_VIDEO_MAX_DURATION_MS / 1000)
    try {
      const clip = new File(["clip"], "limite.webm", { type: "video/webm" })
      expect(await describeMediaFile(clip)).toEqual({
        ok: true,
        value: { kind: "video", mimeType: "video/webm", sizeBytes: 4, width: 1280, height: 720, durationMs: POST_VIDEO_MAX_DURATION_MS },
      })
    } finally {
      atLimit()
    }
  })

  it("les textes suivent la liste d'envoi et la borne du moteur, jamais une valeur écrite", () => {
    for (const locale of ["fr", "en"] as const) {
      const t = getFixedT(locale)
      expect(t("errors.media_video_format")).toContain("MP4")
      expect(t("errors.media_video_format")).toContain("WebM")
      expect(t("errors.media_video_format")).not.toContain("MOV")
      expect(t("errors.media_video_too_long")).toContain(String(POST_VIDEO_MAX_DURATION_MS / 60_000))
    }
  })
})

describe("FD-02 — la vidéo d'un iPhone est préparée avant l'envoi : convertie, pesée, bornée", () => {
  // Un WebM enregistré par `MediaRecorder` ne dit pas sa durée : seule celle de la préparation fait foi.
  let restoreMetadata: () => void = () => undefined
  beforeEach(() => {
    restoreMetadata = fakeVideoMetadata(Number.POSITIVE_INFINITY)
  })
  afterEach(() => {
    restoreMetadata()
  })

  it("un .mov que ce navigateur sait lire est CONVERTI : le MP4 rendu part, avec sa durée et ses dimensions ; l'avancement est suivi", async () => {
    const browser = simulatedBrowser()
    const phases: VideoPreparationPhase[] = []
    const mov = iphoneVideo()
    const prepare = vi.fn<PrepareImage>()
    const result = await prepareMediaFile(mov, prepare, { prepareVideo: browser.prepareVideo, onPhase: (phase) => phases.push(phase) })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.file).not.toBe(mov)
    expect(result.value.file.name).toBe("IMG_0412.mp4")
    expect(result.value.facts).toEqual({ kind: "video", mimeType: "video/mp4", sizeBytes: 1_024, width: 1280, height: 720, durationMs: 8_960 })
    expect(phases).toEqual([{ phase: "probing" }, { phase: "converting", progress: 0 }, { phase: "converting", progress: 0.5 }, { phase: "converting", progress: 1 }])
    // Les bornes d'une PUBLICATION (60 Mio, cinq minutes), celles du domaine du moteur.
    expect(browser.prepareVideo).toHaveBeenCalledWith(mov, expect.objectContaining({ limits: POST_VIDEO_UPLOAD_LIMITS }))
    expect(browser.revoked).toEqual(browser.created)
    expect(prepare).not.toHaveBeenCalled()
  })

  it("un MP4 en H.264 part tel quel ; un MP4 en HEVC (l'iPhone en « Haute efficacité ») est converti", async () => {
    const universal = simulatedBrowser({ codecs: ["avc1"] })
    const clip = new File(["clip"], "IMG_0413.mp4", { type: "video/mp4" })
    const direct = await prepareMediaFile(clip, undefined, { prepareVideo: universal.prepareVideo })
    expect(direct).toEqual({ ok: true, value: { file: clip, facts: { kind: "video", mimeType: "video/mp4", sizeBytes: 4, width: 1280, height: 720, durationMs: 9_000 } } })
    expect(universal.transcodes).toEqual([])
    const hevc = simulatedBrowser({ codecs: ["hvc1"] })
    const converted = await prepareMediaFile(clip, undefined, { prepareVideo: hevc.prepareVideo })
    expect(hevc.transcodes).toEqual(["video/mp4"])
    expect(converted.ok && converted.value.file !== clip).toBe(true)
  })

  it("le fichier RENDU est pesé : une vidéo convertie trop lourde le dit, sans jamais partir", async () => {
    const heavy = new File(["v"], "IMG_0412.mp4", { type: "video/mp4" })
    Object.defineProperty(heavy, "size", { value: POST_VIDEO_MAX_BYTES + 1 })
    expect(await prepareMediaFile(iphoneVideo(), undefined, { prepareVideo: preparedAs(heavy, { converted: true }) })).toEqual({ ok: false, code: "media_video_converted_too_large" })
    // Rendue telle quelle, elle garde le refus de poids ordinaire.
    expect(await prepareMediaFile(iphoneVideo(), undefined, { prepareVideo: preparedAs(heavy, { converted: false }) })).toEqual({ ok: false, code: "media_too_large" })
  })

  it("une durée rendue au-delà de la borne est refusée ; une sortie qui n'est pas une vidéo admise aussi", async () => {
    const clip = new File(["clip"], "IMG_0412.mp4", { type: "video/mp4" })
    expect(await prepareMediaFile(iphoneVideo(), undefined, { prepareVideo: preparedAs(clip, { durationMs: POST_VIDEO_MAX_DURATION_MS + 1 }) })).toEqual({ ok: false, code: "media_video_too_long" })
    const odd = new File(["?"], "IMG_0412.bin", { type: "application/octet-stream" })
    expect(await prepareMediaFile(iphoneVideo(), undefined, { prepareVideo: preparedAs(odd) })).toEqual({ ok: false, code: "media_video_conversion_failed" })
  })

  it("une préparation qui lève devient une conversion échouée, jamais une exception ni l'original", async () => {
    const throwing = vi.fn<PrepareVideo>(() => Promise.reject(new Error("panne")))
    expect(await prepareMediaFile(iphoneVideo(), undefined, { prepareVideo: throwing })).toEqual({ ok: false, code: "media_video_conversion_failed" })
  })

  it("annulée pendant la conversion : `media_cancelled`, rien n'est rendu et l'adresse locale est libérée ; déjà annulée, rien n'est touché", async () => {
    const controller = new AbortController()
    const browser = simulatedBrowser({
      transcode: (_url, options) =>
        new Promise((_resolve, reject) => {
          if (options.signal?.aborted) {
            reject(new Error(TRANSCODE_ABORTED))
            return
          }
          options.signal?.addEventListener("abort", () => reject(new Error(TRANSCODE_ABORTED)), { once: true })
        }),
    })
    const pending = prepareMediaFile(iphoneVideo(), undefined, {
      prepareVideo: browser.prepareVideo,
      signal: controller.signal,
      onPhase: (phase) => {
        if (phase.phase === "converting") queueMicrotask(() => controller.abort())
      },
    })
    expect(await pending).toEqual({ ok: false, code: "media_cancelled" })
    expect(browser.revoked).toEqual(browser.created)

    const untouched = simulatedBrowser()
    expect(await prepareMediaFile(iphoneVideo(), undefined, { prepareVideo: untouched.prepareVideo, signal: AbortSignal.abort() })).toEqual({ ok: false, code: "media_cancelled" })
    expect(untouched.created).toEqual([])
  })

  /** Un scénario RÉEL par refus du module du moteur : le `Record` exige une ligne par code de sa liste fermée. */
  const REFUSALS: Record<VideoPreparationRefusal, { readonly file: () => File; readonly browser: Parameters<typeof simulatedBrowser>[0]; readonly code: string }> = {
    "not-decodable": { file: iphoneVideo, browser: { decodable: false, durationMs: null }, code: "media_video_format" },
    "too-long": { file: () => new File(["clip"], "longue.mp4", { type: "video/mp4" }), browser: { durationMs: POST_VIDEO_MAX_DURATION_MS + 1 }, code: "media_video_too_long" },
    "too-long-to-convert": { file: iphoneVideo, browser: { durationMs: VIDEO_TRANSCODE_MAX_DURATION_MS + 1 }, code: "media_video_too_long_to_convert" },
    "no-encoder": { file: iphoneVideo, browser: { targets: [] }, code: "media_video_format" },
    "conversion-failed": { file: iphoneVideo, browser: { transcode: async () => { throw new Error("transcode:recorder") } }, code: "media_video_conversion_failed" },
  }

  it.each(VIDEO_PREPARATION_REFUSALS.map((refusal) => [refusal]))("le refus « %s » rend son code fermé, dit en français et en anglais", async (refusal) => {
    const scenario = REFUSALS[refusal]
    const browser = simulatedBrowser(scenario.browser)
    expect(VIDEO_PREPARATION_CODES[refusal]).toBe(scenario.code)
    expect(await prepareMediaFile(scenario.file(), undefined, { prepareVideo: browser.prepareVideo })).toEqual({ ok: false, code: scenario.code })
    expect(ACTION_ERROR_CODES).toContain(VIDEO_PREPARATION_CODES[refusal])
    for (const locale of ["fr", "en"] as const) {
      const phrase = getFixedT(locale)(`errors.${VIDEO_PREPARATION_CODES[refusal]}`)
      expect(phrase).not.toBe(`errors.${VIDEO_PREPARATION_CODES[refusal]}`)
      expect(phrase).not.toMatch(/\{\{|\}\}/)
    }
    expect(browser.revoked).toEqual(browser.created)
  })

  it("les nouveaux refus disent la vraie borne : la conversion en minutes, le poids en Mo, les formats d'envoi", () => {
    for (const locale of ["fr", "en"] as const) {
      const t = getFixedT(locale)
      expect(t("errors.media_video_too_long_to_convert")).toContain(String(VIDEO_TRANSCODE_MAX_DURATION_MS / 60_000))
      expect(t("errors.media_video_converted_too_large")).toContain(String(POST_VIDEO_MAX_BYTES / (1024 * 1024)))
      for (const code of ["media_video_too_long_to_convert", "media_video_conversion_failed"] as const) {
        expect(t(`errors.${code}`)).toContain("MP4")
        expect(t(`errors.${code}`)).not.toContain("MOV")
      }
      expect(t("errors.media_cancelled")).not.toBe("errors.media_cancelled")
    }
  })
})

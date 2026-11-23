/**
 * Les médias d'une publication (EXF-DG-10), côté écran : LES règles du moteur
 * (`@antsia/social-domain/content` : mêmes types, mêmes poids, vidéo seule, texte
 * alternatif borné), dites en codes fermés ; et ce que le navigateur sait mesurer
 * d'un fichier avant de l'envoyer (dimensions, durée). Aucune règle n'est
 * réécrite ici : l'écran refuse exactement ce que le moteur refuserait.
 *
 * Une PHOTO ne part jamais telle qu'elle a été choisie (FD-01, décision du
 * 9/11/2026) : elle passe par le module partagé du moteur
 * (`@antsia/social-features/media-upload`, lot SD-02) — ré-encodée, réduite à
 * 2 048 px de plus grand côté, débarrassée de toute métadonnée (position GPS,
 * appareil). Un échec refuse la photo par un code fermé ; l'original n'est
 * jamais rendu. Le type, le poids et les dimensions déclarés sont ceux du
 * fichier PRÉPARÉ.
 *
 * Une VIDÉO (FD-02, lot SD-03 du moteur) part toujours en MP4 ou en WebM, la
 * liste d'envoi du moteur (`POST_VIDEO_UPLOAD_MIME_TYPES`) : le .mov de l'iPhone
 * (ou un MP4 en HEVC) ne se lit pas partout. Toute vidéo choisie passe par la
 * préparation du moteur (`prepareVideoForUpload`) : sondée, puis convertie dans
 * le navigateur quand il sait la lire, en temps réel, onglet visible ; l'écran
 * en suit l'avancement et peut l'annuler (`MediaPreparationOptions`). Quand ce
 * navigateur ne sait ni la lire ni la convertir, la marche à suivre est dite
 * (`media_video_format`) ; chaque refus de la préparation a son code fermé
 * (`VIDEO_PREPARATION_CODES`). Le fichier PRÉPARÉ est pesé et sa durée jugée par
 * la règle du moteur (`assertPostVideoDuration`), puis déclarée avec la vidéo.
 */
import {
  assertPostMedia,
  assertPostVideoDuration,
  POST_IMAGE_MIME_TYPES,
  POST_MEDIA_ALT_MAX_LENGTH,
  POST_MEDIA_MAX_COUNT,
  POST_VIDEO_MAX_BYTES,
  POST_VIDEO_UPLOAD_MIME_TYPES,
  type PostMediaInput,
  type PostMediaKind,
} from "@antsia/social-domain/content"
import { isDomainViolation } from "@antsia/social-domain/violation"
import {
  prepareVideoForUpload,
  type PrepareVideo,
  type PrepareVideoOptions,
  type VideoPreparation,
  type VideoPreparationPhase,
} from "@antsia/social-features/features/video-upload/video-preparation"
import {
  isVideoCandidateType,
  POST_VIDEO_UPLOAD_LIMITS,
  VIDEO_UPLOAD_ACCEPT,
  type VideoPreparationRefusal,
} from "@antsia/social-features/features/video-upload/video-upload-policy"
import { createAppI18n, DEFAULT_LOCALE } from "@antsia/social-features/i18n"
import {
  IMAGE_UPLOAD_MAX_DIMENSION,
  IMAGE_UPLOAD_QUALITY,
  imageUploadPlan,
  isPreparableImageType,
  isPreparedImage,
  prepareImageForUpload,
  reencodeImage,
  type ImagePreparation,
  type ImagePreparationRefusal,
  type ImageRuntime,
  type PrepareImage,
} from "@antsia/social-features/media-upload"

import type { ActionErrorCode } from "./errors"
import type { ActionResult } from "./port"

export { isVideoCandidateType, POST_MEDIA_ALT_MAX_LENGTH, POST_MEDIA_MAX_COUNT }
export type { PostMediaInput, PostMediaKind, PrepareVideo, VideoPreparationPhase }

/**
 * Les types qu'accepte le sélecteur de fichiers du composeur : les photos, et TOUTE vidéo
 * (`VIDEO_UPLOAD_ACCEPT` du moteur) — restreindre le choix à MP4 et WebM cacherait le .mov de
 * l'iPhone, que la préparation sait convertir. Le tri se fait après le choix (FD-02).
 */
export const POST_MEDIA_ACCEPT = [...POST_IMAGE_MIME_TYPES, VIDEO_UPLOAD_ACCEPT].join(",")

/**
 * Les règles des médias du moteur, et de son dépôt de fichiers, dites par
 * DIASPORA.GA : une seule table, lue par l'écran et par la traduction des refus
 * du moteur.
 */
export const MEDIA_RULE_CODES: Readonly<Record<string, ActionErrorCode>> = {
  POST_MEDIA_TOO_MANY: "media_too_many",
  POST_VIDEO_MUST_BE_ALONE: "media_video_alone",
  POST_MEDIA_MIME_INVALID: "media_type_invalid",
  POST_MEDIA_TOO_LARGE: "media_too_large",
  POST_MEDIA_ALT_TOO_LONG: "media_alt_too_long",
  POST_VIDEO_TOO_LONG: "media_video_too_long",
  UPLOAD_TYPE_NOT_ALLOWED: "media_type_invalid",
  UPLOAD_SIZE_OUT_OF_RANGE: "media_too_large",
  UPLOAD_MISMATCH: "media_upload_failed",
}

/** Le genre d'un fichier qu'une NOUVELLE publication peut porter TEL QUEL ; `null` : refusé (le .mov compris, qui se prépare d'abord). */
export function postMediaKindOf(mimeType: string): PostMediaKind | null {
  if ((POST_IMAGE_MIME_TYPES as readonly string[]).includes(mimeType)) return "image"
  if ((POST_VIDEO_UPLOAD_MIME_TYPES as readonly string[]).includes(mimeType)) return "video"
  return null
}

/**
 * Ce qu'un fichier CHOISI présente aux règles du moteur avant tout envoi (FD-02). Une photo, un
 * MP4 ou un WebM : ses vrais type et poids. Une vidéo d'un autre conteneur (le .mov de l'iPhone)
 * se présente comme le MP4 qu'elle deviendra, au plus lourd admis : seule sa PLACE (une vidéo
 * seule, jamais une pièce de trop) se juge ici ; son type, son poids et sa durée réels se jugent
 * sur le fichier PRÉPARÉ, avant tout dépôt (`prepareMediaFile`). `null` : ni photo ni vidéo.
 */
export function selectionMediaInput(file: File): PostMediaInput | null {
  const kind = postMediaKindOf(file.type)
  if (kind) return { kind, mimeType: file.type, sizeBytes: file.size }
  if (isVideoCandidateType(file.type)) return { kind: "video", mimeType: POST_VIDEO_UPLOAD_MIME_TYPES[0], sizeBytes: POST_VIDEO_MAX_BYTES }
  return null
}

/**
 * Le refus d'un fichier hors des types admis : une vidéo d'un autre conteneur
 * (le .mov de l'iPhone, un .avi…) reçoit la marche à suivre
 * (`media_video_format`) ; tout autre fichier, le refus de type.
 */
export function unsupportedMediaRefusal(mimeType: string): ActionErrorCode {
  return isVideoCandidateType(mimeType) ? "media_video_format" : "media_type_invalid"
}

/** La durée d'une vidéo, jugée par la règle du moteur (`assertPostVideoDuration`) ; `null` : dans la borne, ou inconnue. */
export function postVideoDurationRefusal(durationMs: number | undefined): ActionErrorCode | null {
  try {
    assertPostVideoDuration([{ kind: "video", durationMs }])
    return null
  } catch (error) {
    if (isDomainViolation(error)) return MEDIA_RULE_CODES[error.code] ?? "unknown"
    throw error
  }
}

/** Le refus des médias d'une publication, jugés ENSEMBLE par la règle du moteur ; `null` : recevables. */
export function postMediaRefusal(media: readonly PostMediaInput[]): ActionErrorCode | null {
  try {
    assertPostMedia(media)
    return null
  } catch (error) {
    if (isDomainViolation(error)) return MEDIA_RULE_CODES[error.code] ?? "unknown"
    throw error
  }
}

/** Ce qu'un fichier choisi dit de lui-même avant l'envoi. */
export interface MediaFileFacts {
  readonly kind: PostMediaKind
  readonly mimeType: string
  readonly sizeBytes: number
  readonly width?: number
  readonly height?: number
  readonly durationMs?: number
}

/**
 * Juge un fichier seul (type, poids), puis mesure ce que le navigateur sait en
 * dire. Une mesure impossible n'empêche rien : le moteur ne l'exige pas. Une
 * vidéo mesurée au-delà de la borne de durée est refusée ici, avant tout envoi.
 */
export async function describeMediaFile(file: File): Promise<ActionResult<MediaFileFacts>> {
  const kind = postMediaKindOf(file.type)
  if (!kind) return { ok: false, code: unsupportedMediaRefusal(file.type) }
  const refusal = postMediaRefusal([{ kind, mimeType: file.type, sizeBytes: file.size }])
  if (refusal) return { ok: false, code: refusal }
  if (kind === "image") return { ok: true, value: { kind, mimeType: file.type, sizeBytes: file.size, ...(await measureImage(file)) } }
  const video = await measureVideo(file)
  const tooLong = postVideoDurationRefusal(video.durationMs)
  if (tooLong) return { ok: false, code: tooLong }
  return { ok: true, value: { kind, mimeType: file.type, sizeBytes: file.size, ...video } }
}

/**
 * Les refus de la préparation d'une photo (module du moteur), dits par les
 * codes fermés de DIASPORA.GA. Chacun veut dire : la photo n'est PAS envoyée.
 */
export const IMAGE_PREPARATION_CODES: Readonly<Record<ImagePreparationRefusal, ActionErrorCode>> = {
  "unsupported-type": "media_type_invalid",
  unreadable: "media_unreadable",
  "canvas-unavailable": "media_preparation_unavailable",
  "encoder-failed": "media_preparation_failed",
  "metadata-remaining": "media_metadata_remaining",
  "not-croppable": "media_not_croppable",
}

/** Une photo préparée : le fichier NEUF, et ses dimensions quand le module les connaît. */
export interface PreparedImageFile {
  readonly file: File
  readonly width?: number
  readonly height?: number
}

/**
 * Prépare une photo avant son dépôt, par le module partagé du moteur
 * (`prepareImageForUpload` par défaut, injectable pour les tests). Une photo
 * DÉJÀ sortie du module (`isPreparedImage` : recadrée par l'éditeur du profil,
 * par exemple) n'est pas ré-encodée une seconde fois. Échec fermé : le refus
 * rend un code, jamais l'original.
 */
export async function prepareImageFile(file: File, prepare: PrepareImage = prepareImageForUpload): Promise<ActionResult<PreparedImageFile>> {
  if (isPreparedImage(file)) return { ok: true, value: { file } }
  let result: ImagePreparation
  try {
    result = await prepare(file)
  } catch {
    result = { ok: false, refusal: "unreadable" }
  }
  if (!result.ok) return { ok: false, code: IMAGE_PREPARATION_CODES[result.refusal] }
  return {
    ok: true,
    value: {
      file: result.file,
      ...(result.width !== null && result.height !== null ? { width: result.width, height: result.height } : {}),
    },
  }
}

/**
 * Ce qui part au dépôt : une photo PRÉPARÉE, tout autre fichier (document,
 * vidéo) tel quel. Sert les envois qui mêlent pièces et photos (revendication
 * d'une page) et ceux d'une image seule (logo, bannière).
 */
export async function fileForDeposit(file: File, prepare?: PrepareImage): Promise<ActionResult<File>> {
  if (!isPreparableImageType(file.type)) return { ok: true, value: file }
  const prepared = await prepareImageFile(file, prepare)
  return prepared.ok ? { ok: true, value: prepared.value.file } : prepared
}

/**
 * Les refus de la préparation d'une vidéo (module du moteur, liste fermée
 * `VIDEO_PREPARATION_REFUSALS`), dits par les codes fermés de DIASPORA.GA.
 * Chacun veut dire : la vidéo n'est PAS envoyée. Ce navigateur ne sait ni la
 * lire ni la convertir : la marche à suivre d'aujourd'hui (`media_video_format`).
 */
export const VIDEO_PREPARATION_CODES: Readonly<Record<VideoPreparationRefusal, ActionErrorCode>> = {
  "not-decodable": "media_video_format",
  "too-long": "media_video_too_long",
  "too-long-to-convert": "media_video_too_long_to_convert",
  "no-encoder": "media_video_format",
  "conversion-failed": "media_video_conversion_failed",
}

/** Ce que l'écran suit et peut arrêter pendant la préparation d'une vidéo (FD-02). */
export interface MediaPreparationOptions {
  /**
   * La préparation des vidéos : `prepareVideoForUpload` du moteur par défaut. Remplaçable dans
   * les tests — `jsdom` n'a ni décodeur vidéo ni `MediaRecorder`.
   */
  readonly prepareVideo?: PrepareVideo
  /** L'annulation : le geste « Annuler la conversion », la fermeture ou le départ du composeur. */
  readonly signal?: AbortSignal
  /** L'avancement de la préparation d'une vidéo : analyse, puis conversion (de 0 à 1). */
  readonly onPhase?: (phase: VideoPreparationPhase) => void
}

/**
 * Le module du moteur compose aussi une phrase à côté de chaque refus ; DIASPORA.GA dit le CODE
 * par ses propres textes (`VIDEO_PREPARATION_CODES`) et ne montre jamais cette phrase. Une
 * instance du moteur sans textes propres suffit à la composer ; créée au premier besoin.
 */
let engineSentences: PrepareVideoOptions["t"] | null = null
function engineSentenceT(): PrepareVideoOptions["t"] {
  engineSentences ??= createAppI18n({ locale: DEFAULT_LOCALE, appResources: { fr: {}, en: {} }, defaultNS: "reseau" }).getFixedT(DEFAULT_LOCALE)
  return engineSentences
}

/** L'issue d'une préparation qui a levé : annulée si on l'a annulée, sinon une conversion échouée. */
function failedPreparation(signal: AbortSignal | undefined): VideoPreparation {
  return signal?.aborted ? { status: "cancelled" } : { status: "refused", refusal: "conversion-failed", message: "" }
}

/**
 * Prépare une VIDÉO avant son dépôt (FD-02) : un MP4 ou un WebM trop lourd est refusé avant
 * toute analyse ; puis le module du moteur la sonde et, s'il le faut (un .mov, un MP4 en HEVC),
 * la convertit en MP4 ou en WebM dans ce navigateur. Le fichier RENDU est pesé (une conversion
 * vise un débit sans le tenir à l'octet) et sa durée jugée par la règle du moteur. Échec fermé :
 * un refus, ou `media_cancelled`, jamais l'original d'un conteneur non admis.
 */
async function prepareVideoMedia(
  file: File,
  options: MediaPreparationOptions,
): Promise<ActionResult<{ readonly file: File; readonly facts: MediaFileFacts }>> {
  if (postMediaKindOf(file.type) === "video") {
    const weight = postMediaRefusal([{ kind: "video", mimeType: file.type, sizeBytes: file.size }])
    if (weight) return { ok: false, code: weight }
  }
  const { signal, onPhase } = options
  let result: VideoPreparation
  try {
    result = await (options.prepareVideo ?? prepareVideoForUpload)(file, {
      limits: POST_VIDEO_UPLOAD_LIMITS,
      t: engineSentenceT(),
      ...(signal ? { signal } : {}),
      ...(onPhase ? { onPhase } : {}),
    })
  } catch {
    result = failedPreparation(signal)
  }
  if (result.status === "cancelled" || signal?.aborted) return { ok: false, code: "media_cancelled" }
  if (result.status === "refused") return { ok: false, code: VIDEO_PREPARATION_CODES[result.refusal] }
  const output = result.file
  if (postMediaKindOf(output.type) !== "video") return { ok: false, code: "media_video_conversion_failed" }
  const weight = postMediaRefusal([{ kind: "video", mimeType: output.type, sizeBytes: output.size }])
  if (weight) return { ok: false, code: result.converted && weight === "media_too_large" ? "media_video_converted_too_large" : weight }
  // Les dimensions du fichier rendu ; la durée de la préparation fait foi (celle d'un WebM enregistré n'est pas lisible).
  const measured = await measureVideo(output)
  if (signal?.aborted) return { ok: false, code: "media_cancelled" }
  const durationMs = result.durationMs ?? measured.durationMs
  const tooLong = postVideoDurationRefusal(durationMs)
  if (tooLong) return { ok: false, code: tooLong }
  return {
    ok: true,
    value: {
      file: output,
      facts: {
        kind: "video",
        mimeType: output.type,
        sizeBytes: output.size,
        ...(measured.width !== undefined && measured.height !== undefined ? { width: measured.width, height: measured.height } : {}),
        ...(durationMs !== undefined ? { durationMs } : {}),
      },
    },
  }
}

/**
 * Le fichier à déposer pour une publication, et ce qu'il dit de lui-même.
 *
 *   · une PHOTO est préparée (`prepareImageFile`) ; les règles du moteur sont
 *     jugées sur le fichier PRÉPARÉ, celui que le serveur recevra et relira ;
 *     ses dimensions sont celles de la sortie (mesurées, pour un GIF animé
 *     laissé tel quel) ;
 *   · une VIDÉO, quel qu'en soit le conteneur, est préparée par le module du
 *     moteur (`prepareVideoMedia`) : le fichier rendu est toujours un MP4 ou un
 *     WebM, pesé, sa durée bornée ; l'avancement et l'annulation passent par
 *     `options` ;
 *   · tout autre fichier est refusé par son type.
 *
 * Le poids du fichier CHOISI est jugé avant, par le composeur (règles du
 * moteur sur l'ensemble des médias, avant tout envoi).
 */
export async function prepareMediaFile(
  file: File,
  prepare?: PrepareImage,
  options: MediaPreparationOptions = {},
): Promise<ActionResult<{ readonly file: File; readonly facts: MediaFileFacts }>> {
  if (isVideoCandidateType(file.type)) return prepareVideoMedia(file, options)
  const kind = postMediaKindOf(file.type)
  if (kind !== "image") return { ok: false, code: unsupportedMediaRefusal(file.type) }
  const prepared = await prepareImageFile(file, prepare)
  if (!prepared.ok) return prepared
  const output = prepared.value.file
  const outputKind = postMediaKindOf(output.type)
  if (outputKind !== "image") return { ok: false, code: "media_preparation_failed" }
  const refusal = postMediaRefusal([{ kind: outputKind, mimeType: output.type, sizeBytes: output.size }])
  if (refusal) return { ok: false, code: refusal }
  const size = prepared.value.width !== undefined && prepared.value.height !== undefined
    ? { width: prepared.value.width, height: prepared.value.height }
    : await measureImage(output)
  return { ok: true, value: { file: output, facts: { kind: outputKind, mimeType: output.type, sizeBytes: output.size, ...size } } }
}

async function measureImage(file: File): Promise<{ width?: number; height?: number }> {
  if (typeof createImageBitmap !== "function") return {}
  try {
    const bitmap = await createImageBitmap(file)
    const size = { width: bitmap.width, height: bitmap.height }
    bitmap.close()
    return size
  } catch {
    return {}
  }
}

/** Attente maximale des métadonnées d'une vidéo. */
const VIDEO_METADATA_TIMEOUT_MS = 5000

async function measureVideo(file: File): Promise<{ width?: number; height?: number; durationMs?: number }> {
  if (typeof document === "undefined" || typeof URL.createObjectURL !== "function") return {}
  const url = URL.createObjectURL(file)
  const video = document.createElement("video")
  try {
    const loaded = await new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => resolve(false), VIDEO_METADATA_TIMEOUT_MS)
      video.preload = "metadata"
      video.onloadedmetadata = () => {
        clearTimeout(timer)
        resolve(true)
      }
      video.onerror = () => {
        clearTimeout(timer)
        resolve(false)
      }
      video.src = url
    })
    if (!loaded) return {}
    return {
      ...(video.videoWidth > 0 ? { width: video.videoWidth, height: video.videoHeight } : {}),
      ...(Number.isFinite(video.duration) ? { durationMs: Math.round(video.duration * 1000) } : {}),
    }
  } finally {
    video.removeAttribute("src")
    URL.revokeObjectURL(url)
  }
}

/**
 * Une photo pour la démonstration, qui la garde dans le stockage du navigateur
 * (aucun dépôt, aucun serveur) : la MÊME règle que le moteur — mêmes types
 * admis, même module de ré-encodage (`reencodeImage`, lot SD-02), même retrait
 * des métadonnées, mêmes refus, échec fermé —, sous un plan propre à ce
 * stockage de quelques Mo : JPEG, `maxSide` px au plus (jamais au-delà des
 * 2 048 px de la décision du 9/11). Une image animée y est figée sur sa
 * première image.
 */
export async function downscaleImage(
  file: File,
  maxSide: number,
  runtime?: ImageRuntime,
): Promise<ActionResult<{ readonly dataUrl: string; readonly width: number; readonly height: number }>> {
  if (imageUploadPlan(file.type).action === "refuse") return { ok: false, code: "media_type_invalid" }
  const plan = { targetType: "image/jpeg", maxDimension: Math.min(maxSide, IMAGE_UPLOAD_MAX_DIMENSION), quality: IMAGE_UPLOAD_QUALITY } as const
  let result: ImagePreparation
  try {
    result = await reencodeImage(file, plan, runtime)
  } catch {
    result = { ok: false, refusal: "unreadable" }
  }
  if (!result.ok) return { ok: false, code: IMAGE_PREPARATION_CODES[result.refusal] }
  const dataUrl = await dataUrlOf(result.file)
  if (dataUrl === null || result.width === null || result.height === null) return { ok: false, code: "media_upload_failed" }
  return { ok: true, value: { dataUrl, width: result.width, height: result.height } }
}

function dataUrlOf(file: Blob): Promise<string | null> {
  if (typeof FileReader === "undefined") return Promise.resolve(null)
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null)
    reader.onerror = () => resolve(null)
    reader.readAsDataURL(file)
  })
}

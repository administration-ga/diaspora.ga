"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { canAlsoPublishOnRoot, isCountryOpen, type ContentModerationState, type CountryCode } from "@diaspora-ga/domain"
import { FilmIcon, GlobeIcon, ImagePlusIcon, LoaderCircleIcon, RotateCcwIcon, SendIcon, TriangleAlertIcon, XIcon } from "lucide-react"
import { type ChangeEvent, type FormEvent, type KeyboardEvent, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react"
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"

import { useActions } from "../data/context"
import type { ActionErrorCode } from "../data/errors"
import {
  POST_PHOTO_ACCEPT,
  POST_VIDEO_ACCEPT,
  POST_MEDIA_ALT_MAX_LENGTH,
  POST_MEDIA_MAX_COUNT,
  type PostMediaInput,
  type PostMediaKind,
  postMediaRefusal,
  selectionMediaInput,
  unsupportedMediaRefusal,
} from "../data/media"
import type { MediaUploadPhase, PublishMediaInput, UploadedMedia } from "../data/port"
import type { PagePublicationInput, PagePublicationsCapability } from "../data/page-publications-port"
import type { PostView } from "../data/types"
import { useDiasporaGaT } from "../i18n/client"
import { cn } from "../lib/cn"
import { countryName } from "../lib/countries"
import { Button } from "../primitives/button"
import { Checkbox } from "../primitives/checkbox"
import { Field, Input, Label, Textarea } from "../primitives/field"
import { RadioCard, RadioGroup } from "../primitives/radio-group"
import { Sheet, SheetContent } from "../primitives/sheet"
import { CountryTag, ScopeTag } from "./country-tag"
import { SharedPostEmbed, sharedPreviewOf } from "./post-share"

export const POST_BODY_MAX = 2000

const composerFields = z.object({
  body: z.string().trim().max(POST_BODY_MAX, "post_too_long"),
  reach: z.enum(["local", "diaspora"]),
  audience: z.enum(["public", "connections", "followers"]),
  alsoOnRoot: z.boolean(),
  /** Les médias joints, dans l'ordre : la clé de leur dépôt et leur texte alternatif. */
  media: z
    .array(z.object({ key: z.string(), altText: z.string().max(POST_MEDIA_ALT_MAX_LENGTH, "media_alt_too_long") }))
    .max(POST_MEDIA_MAX_COUNT, "media_too_many"),
  /** Partage cité en cours : le texte devient facultatif (l'original porte la publication). */
  sharing: z.boolean(),
})
// Une photo sans légende, un partage sans un mot, sont des publications légitimes ; un message vide seul ne l'est pas.
const composerSchemaFor = (requireMedia: boolean) => composerFields.superRefine((values, context) => {
  if (requireMedia && values.media.length === 0) {
    context.addIssue({ code: "custom", path: ["media"], message: "association_event_gallery_media_required" })
  } else if (values.body.length === 0 && values.media.length === 0 && !values.sharing) {
    context.addIssue({ code: "custom", path: ["body"], message: "post_empty" })
  }
})
type ComposerValues = z.infer<typeof composerFields>

const DEFAULTS: ComposerValues = { body: "", reach: "local", audience: "public", alsoOnRoot: false, media: [], sharing: false }

/** Un brouillon relu du navigateur : le texte et les choix, sans exiger un texte non vide. Ni médias ni partage n'y vont. */
const draftSchema = composerFields.omit({ media: true, sharing: true }).extend({ body: z.string().max(POST_BODY_MAX + 200) })
type DraftValues = z.infer<typeof draftSchema>
/** Attente après la dernière frappe avant de garder le brouillon. */
const DRAFT_SAVE_MS = 400

function readDraft(key: string): DraftValues | null {
  try {
    const parsed = draftSchema.safeParse(JSON.parse(window.localStorage.getItem(key) ?? "null"))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

function writeDraft(key: string, values: DraftValues): void {
  try {
    if (values.body.trim().length === 0) window.localStorage.removeItem(key)
    else window.localStorage.setItem(key, JSON.stringify(values))
  } catch {
    // Stockage refusé (navigation privée…) : le brouillon vit le temps de la page.
  }
}

/** Un média joint : son aperçu local et l'état de son dépôt. */
interface Attachment {
  readonly name: string
  readonly kind: PostMediaKind
  /** Ce que le fichier présente aux règles du moteur au moment du choix (`selectionMediaInput`). */
  readonly mimeType: string
  readonly sizeBytes: number
  readonly previewUrl: string
  readonly state: AttachmentState
}

type AttachmentState =
  /** FD-02 : une vidéo en préparation — analyse (`percent` nul), puis conversion, au pour cent près. */
  | { readonly status: "preparing"; readonly percent: number | null }
  /** A3 : l'envoi du fichier préparé, au pour cent près quand l'envoi le dit (`percent` nul sinon). */
  | { readonly status: "uploading"; readonly percent: number | null }
  | { readonly status: "ready"; readonly upload: UploadedMedia }
  | { readonly status: "failed"; readonly code: ActionErrorCode }

/** A3 : les échecs qu'un nouvel essai peut lever (réseau, dépôt) ; un refus des règles ou de la préparation ne se réessaie pas. */
const RETRYABLE_CODES: ReadonlySet<ActionErrorCode> = new Set<ActionErrorCode>(["media_upload_failed", "network_unavailable", "rate_limited", "unknown"])

/** Un dépôt en cours : son annulation, et s'il en est encore à la préparation de la vidéo. */
interface Transfer {
  readonly controller: AbortController
  preparing: boolean
}

/**
 * FD-02 : l'état que dit une phase du dépôt. La conversion annonce chaque image : l'écran ne
 * retient que le pour cent entier, arrondi vers le bas (jamais « 100 % » avant la fin).
 */
function wholePercent(progress: number): number {
  return Math.floor(Math.min(1, Math.max(0, progress)) * 100)
}

function stateOfPhase(phase: MediaUploadPhase): AttachmentState {
  if (phase.phase === "uploading") return { status: "uploading", percent: phase.progress === undefined ? null : wholePercent(phase.progress) }
  if (phase.phase === "probing") return { status: "preparing", percent: null }
  return { status: "preparing", percent: wholePercent(phase.progress) }
}

function sameState(a: AttachmentState, b: AttachmentState): boolean {
  if (a.status === "preparing" && b.status === "preparing") return a.percent === b.percent
  if (a.status === "uploading" && b.status === "uploading") return a.percent === b.percent
  return false
}

function without<T>(record: Readonly<Record<string, T>>, key: string): Record<string, T> {
  const next = { ...record }
  delete next[key]
  return next
}

/** Une clé d'idempotence neuve (EXF-DG-10) : une par série d'essais d'une même publication. */
function newPublishKey(): string {
  return crypto.randomUUID()
}

/**
 * L'avis d'envoi dit l'état que le fournisseur rend (FD-04) : « Publié. » seulement pour une
 * publication publiée, « en relecture » pour une publication retenue ; un état non rendu
 * (`null`) ne s'affirme pas, la publication est seulement « envoyée ». A1 (25/11/2026) : des
 * médias encore à vérifier par la garde des fichiers (`pendingCheck`) n'apparaissent pas
 * aussitôt ; l'avis le dit au lieu de « Publié. ».
 */
function publishNoticeKey(moderation: ContentModerationState | null, share: boolean, mediaPendingCheck: boolean): string {
  if (moderation === "pending_review") return "composer.sentForReview"
  if (mediaPendingCheck) return "composer.mediaAfterCheck"
  if (moderation === "published") return share ? "composer.shared" : "composer.published"
  return share ? "composer.shareSent" : "composer.sent"
}

/** Entrée dans un texte alternatif ne publie pas : on décrit, on n'envoie pas. */
function keepEnterInField(event: KeyboardEvent<HTMLInputElement>): void {
  if (event.key === "Enter") event.preventDefault()
}

/**
 * Composeur en feuille (charte §8, EXF-DG-10/11). La portée est visible avant
 * l'envoi (le pays de l'auteur, ou toute la diaspora). La visibilité reste
 * `network` par défaut : « Publier aussi sur ANTSIA » est un GESTE, désactivé
 * hors audience publique, expliqué en une ligne. La case naît décochée.
 *
 * Pays pas encore ouvert (HB-01) : la publication locale n'y est pas reçue
 * (aucune relecture par pays n'existe encore, HB-11). L'option locale reste
 * visible, inactive et expliquée, et la portée part pour toute la diaspora.
 *
 * Médias : jusqu'à `POST_MEDIA_MAX_COUNT` photos (dix depuis le lot M3 du moteur), ou
 * une vidéo seule (règles du moteur, jugées AVANT tout envoi). Chaque fichier part dès qu'il est choisi ; la publication attend
 * la fin des envois. Le texte alternatif se donne photo par photo.
 *
 * Vidéo (FD-02) : toute vidéo choisie est d'abord préparée — le .mov de l'iPhone
 * converti en MP4 ou WebM dans ce navigateur, en temps réel. La pièce montre
 * l'analyse puis la progression ; « Annuler la conversion » l'arrête. Fermer la
 * feuille ou quitter le composeur arrête aussi toute préparation et tout envoi en
 * cours, et libère les aperçus. Un refus de la préparation ne joint rien et le
 * dit ; le brouillon gardé ne porte jamais de fichier.
 */
export function PostComposerSheet(props: {
  open: boolean
  onOpenChange: (open: boolean) => void
  memberCountry: CountryCode
  /**
   * Les pays ouverts du réseau ; `null` tant qu'ils ne sont pas connus
   * (chargement, panne) : rien n'est alors affirmé, et l'adaptateur juge à l'envoi.
   */
  openCountries: readonly CountryCode[] | null
  /**
   * Brouillon durable (EXF-DG-10) : gardé dans CE navigateur sous cette clé (une
   * par personne), rétabli à l'ouverture, effacé à la publication. Jamais envoyé.
   */
  draftKey?: string
  /**
   * Partage cité : la publication partagée (son original si c'en est un). Le
   * composeur la montre, n'offre aucun média, et rend le texte facultatif.
   */
  share?: PostView | null
  /**
   * A3 (25/11/2026) : des fichiers choisis HORS de la feuille (raccourcis Photo et Vidéo de la
   * carte « Quoi de neuf ? ») ; joints une fois par `id`, jugés comme un choix fait ici.
   */
  incomingFiles?: { readonly id: number; readonly files: readonly File[] } | null
  /** Une page parle sous sa propre identité, avec ses abonnés et sa règle collective. */
  page?: {
    readonly id: string
    readonly name: string
    readonly country: CountryCode | null
    readonly publish: PagePublicationsCapability["publish"]
    /** Un contexte collectif fermé : aucun choix de portée ne peut l'élargir. */
    readonly fixedScope?: {
      readonly description: string
      readonly audienceLabel: string
      readonly requireMedia: boolean
      /**
       * AS-08 : un lieu où la personne parle en son nom (le groupe d'une association), pas la
       * voix d'une page : ses propres mots pour le titre, l'identité, l'invite et l'avis d'envoi.
       */
      readonly title?: string
      readonly identity?: string
      readonly placeholder?: string
      readonly sentNotice?: string
    }
  }
}) {
  const { t, locale } = useDiasporaGaT()
  const actions = useActions()
  const ids = useId()
  // Un partage monte sa propre instance (la coque la remonte à chaque partage) : il naît en mode partage.
  const page = props.page
  const fixedScope = page?.fixedScope
  const hasFixedScope = fixedScope !== undefined
  const share = page ? null : props.share ?? null
  const defaults: ComposerValues = { ...DEFAULTS, reach: fixedScope || (page && !page.country) ? "diaspora" : "local", sharing: share !== null }
  const schema = useMemo(() => composerSchemaFor(fixedScope?.requireMedia === true), [fixedScope?.requireMedia])
  const form = useForm<ComposerValues>({ resolver: zodResolver(schema), defaultValues: defaults })
  const active = useRef(false)
  useLayoutEffect(() => { active.current = true; return () => { active.current = false } }, [])
  // Idempotence : la même clé pour tous les essais d'une publication (un échec réseau rejoué ne double
  // rien), une clé neuve dès qu'elle est publiée.
  const [publishKey, setPublishKey] = useState(newPublishKey)
  const mediaFields = useFieldArray({ control: form.control, name: "media" })
  const [attachments, setAttachments] = useState<Readonly<Record<string, Attachment>>>({})
  const [mediaError, setMediaError] = useState<ActionErrorCode | null>(null)
  const photoInput = useRef<HTMLInputElement>(null)
  const videoInput = useRef<HTMLInputElement>(null)
  const attachedCount = useRef(0)
  // Le verrou précède même la validation asynchrone : un sélecteur déjà ouvert
  // ne doit pas ajouter des photos à une publication dont le contenu est parti.
  const submissionInFlight = useRef(false)
  const audience = useWatch({ control: form.control, name: "audience" })
  const reach = useWatch({ control: form.control, name: "reach" })
  const body = useWatch({ control: form.control, name: "body" })
  const rootAllowed = !page && canAlsoPublishOnRoot(audience === "followers" ? "connections" : audience)
  const localCountry = page?.country ?? props.memberCountry
  // Un pays connu pour fermé ne reçoit pas de publication locale : la portée effective est la diaspora,
  // sans réécrire le choix gardé (il revient si le pays ouvre pendant que la feuille vit).
  const localClosed = !hasFixedScope && (!page || page.country !== null)
    && props.openCountries !== null && !isCountryOpen(localCountry, props.openCountries)

  // Une audience restreinte ferme la case ANTSIA : la valeur suit, jamais l'inverse.
  useEffect(() => {
    if (!rootAllowed) form.setValue("alsoOnRoot", false)
  }, [rootAllowed, form])

  // Le brouillon gardé est rétabli une fois, au montage (le stockage n'existe pas au rendu serveur).
  const draftKey = props.draftKey
  useEffect(() => {
    if (!draftKey) return
    const draft = readDraft(draftKey)
    if (draft) form.reset({
      ...draft,
      reach: hasFixedScope || (page && !page.country) ? "diaspora" : draft.reach,
      audience: hasFixedScope ? "public" : page ? (draft.audience === "followers" ? "followers" : "public") : (draft.audience === "connections" ? "connections" : "public"),
      alsoOnRoot: page ? false : draft.alsoOnRoot,
      media: [],
      sharing: false,
    })
  }, [draftKey, form, page?.country, page?.id, hasFixedScope])

  // Puis gardé à chaque pause dans la frappe.
  const alsoOnRoot = useWatch({ control: form.control, name: "alsoOnRoot" })
  useEffect(() => {
    if (!draftKey) return
    const timer = setTimeout(() => writeDraft(draftKey, { body, reach: hasFixedScope ? "diaspora" : reach, audience: hasFixedScope ? "public" : audience, alsoOnRoot: hasFixedScope ? false : alsoOnRoot }), DRAFT_SAVE_MS)
    return () => clearTimeout(timer)
  }, [draftKey, body, reach, audience, alsoOnRoot, hasFixedScope])

  // Les aperçus locaux (URL d'objet) se libèrent au retrait, à la publication, et quand le composeur quitte l'écran.
  const previewUrls = useRef(new Set<string>())
  // FD-02 : chaque dépôt en cours, par clé de média — quitter le composeur arrête préparations et envois.
  const transfers = useRef(new Map<string, Transfer>())
  // A3 : le fichier choisi de chaque pièce, gardé le temps de la feuille pour « Réessayer » ; jamais dans le brouillon.
  const chosenFiles = useRef(new Map<string, File>())
  useEffect(() => {
    const urls = previewUrls.current
    const pending = transfers.current
    return () => {
      for (const transfer of pending.values()) transfer.controller.abort()
      pending.clear()
      for (const url of urls) URL.revokeObjectURL(url)
      urls.clear()
    }
  }, [])
  function releasePreview(url: string) {
    URL.revokeObjectURL(url)
    previewUrls.current.delete(url)
  }
  /** FD-02 : la conversion annulée par la personne, dite sans ton d'erreur jusqu'au prochain choix. */
  const [videoCancelled, setVideoCancelled] = useState(false)
  // Après « Annuler la conversion », le bouton disparaît : le focus revient au bouton d'ajout d'une vidéo, de nouveau actif.
  const addMediaButton = useRef<HTMLButtonElement>(null)
  const focusAddMedia = useRef(false)
  useEffect(() => {
    if (!focusAddMedia.current || !addMediaButton.current || addMediaButton.current.disabled) return
    focusAddMedia.current = false
    addMediaButton.current.focus()
  })
  const percentFormat = useMemo(() => new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 0 }), [locale])

  const attached = Object.values(attachments)
  const uploading = attached.some((item) => item.state.status === "uploading")
  const preparing = attached.some((item) => item.state.status === "preparing")
  // A3 : des photos tant que le plafond n'est pas atteint et qu'aucune vidéo n'est jointe ; une vidéo seule, sur une publication vide.
  const canAttachPhotos = mediaFields.fields.length < POST_MEDIA_MAX_COUNT && !attached.some((item) => item.kind === "video")
  const canAttachVideo = mediaFields.fields.length === 0
  // La vidéo en cours de conversion (une seule : une vidéo est seule dans sa publication).
  const conversionKey = Object.entries(attachments).find(([, item]) => item.state.status === "preparing" && item.state.percent !== null)?.[0]

  /** L'avancement d'un dépôt, tant qu'il n'est ni annulé, ni terminé. */
  function followPhase(key: string, transfer: Transfer, phase: MediaUploadPhase) {
    if (transfer.controller.signal.aborted) return
    if (phase.phase === "uploading") transfer.preparing = false
    const next = stateOfPhase(phase)
    setAttachments((current) => {
      const entry = current[key]
      if (!entry || (entry.state.status !== "preparing" && entry.state.status !== "uploading") || sameState(entry.state, next)) return current
      return { ...current, [key]: { ...entry, state: next } }
    })
  }

  function attachFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ""
    addFiles(files)
  }

  /** Les fichiers choisis (ici, ou depuis le fil par Photo et Vidéo) : jugés ensemble, puis chacun part. */
  function addFiles(files: readonly File[]) {
    if (submissionInFlight.current || files.length === 0) return
    const chosen: { file: File; input: PostMediaInput }[] = []
    for (const file of files) {
      // FD-02 : toute vidéo se prépare (le .mov de l'iPhone compris) ; un fichier qui n'est ni photo ni vidéo est refusé.
      const input = selectionMediaInput(file)
      if (!input) {
        setMediaError(unsupportedMediaRefusal(file.type))
        return
      }
      chosen.push({ file, input })
    }
    // Les règles du moteur jugent l'ensemble AVANT tout envoi : rien ne part qui serait refusé.
    const refusal = postMediaRefusal([
      ...attached.map((item) => ({ kind: item.kind, mimeType: item.mimeType, sizeBytes: item.sizeBytes })),
      ...chosen.map(({ input }) => input),
    ])
    if (refusal) {
      setMediaError(refusal)
      return
    }
    setMediaError(null)
    setVideoCancelled(false)
    const added = chosen.map(({ file, input }) => {
      attachedCount.current += 1
      const key = `media-${attachedCount.current}`
      const previewUrl = URL.createObjectURL(file)
      previewUrls.current.add(previewUrl)
      const state = initialState(input.kind)
      const attachment: Attachment = { name: file.name, kind: input.kind, mimeType: input.mimeType, sizeBytes: input.sizeBytes, previewUrl, state }
      return { key, file, attachment }
    })
    setAttachments((current) => ({ ...current, ...Object.fromEntries(added.map(({ key, attachment }) => [key, attachment])) }))
    mediaFields.append(added.map(({ key }) => ({ key, altText: "" })))
    for (const { key, file, attachment } of added) {
      chosenFiles.current.set(key, file)
      startUpload(key, file, attachment)
    }
  }

  /** L'état d'une pièce qui part : une vidéo se prépare d'abord (FD-02), une photo s'envoie. */
  function initialState(kind: PostMediaKind): AttachmentState {
    return kind === "video" ? { status: "preparing", percent: null } : { status: "uploading", percent: null }
  }

  /** Le dépôt d'une pièce : au choix, ou à « Réessayer » (A3), avec la même annulation et le même suivi. */
  function startUpload(key: string, file: File, attachment: Attachment) {
    const transfer: Transfer = { controller: new AbortController(), preparing: attachment.state.status === "preparing" }
    transfers.current.set(key, transfer)
    void actions.uploadMedia(file, { signal: transfer.controller.signal, onPhase: (phase) => followPhase(key, transfer, phase) }).then((result) => {
      if (transfers.current.get(key) === transfer) transfers.current.delete(key)
      // Annulé (geste, fermeture, départ) : la pièce est déjà retirée, rien n'est retenu.
      if (transfer.controller.signal.aborted) return
      // FD-02 : une vidéo refusée par sa préparation n'est pas jointe ; le refus se dit sous le bouton d'ajout.
      if (!result.ok && transfer.preparing) {
        releasePreview(attachment.previewUrl)
        chosenFiles.current.delete(key)
        setAttachments((current) => without(current, key))
        const index = form.getValues("media").findIndex((item) => item.key === key)
        if (index >= 0) mediaFields.remove(index)
        setMediaError(result.code)
        return
      }
      setAttachments((current) => {
        const entry = current[key]
        // Retiré pendant l'envoi : le fichier déposé n'existe pour personne tant qu'aucune publication ne l'embarque.
        if (!entry) return current
        return { ...current, [key]: { ...entry, state: result.ok ? { status: "ready", upload: result.value } : { status: "failed", code: result.code } } }
      })
    })
  }

  /** A3 : renvoyer une pièce dont l'envoi a échoué ; le texte, les choix et les autres pièces restent. */
  function retry(key: string) {
    const entry = attachments[key]
    const file = chosenFiles.current.get(key)
    if (submissionInFlight.current || !entry || !file || entry.state.status !== "failed") return
    const next: Attachment = { ...entry, state: initialState(entry.kind) }
    setAttachments((current) => (current[key] ? { ...current, [key]: next } : current))
    setMediaError(null)
    startUpload(key, file, next)
  }

  // A3 : les fichiers choisis depuis le fil (Photo, Vidéo) rejoignent le composeur, une fois par geste.
  const incomingId = props.incomingFiles?.id ?? null
  const handledIncoming = useRef<number | null>(null)
  useEffect(() => {
    if (incomingId === null || handledIncoming.current === incomingId || !props.incomingFiles) return
    handledIncoming.current = incomingId
    addFiles(props.incomingFiles.files)
  })

  function detach(index: number, key: string) {
    if (submissionInFlight.current) return
    // Une préparation ou un envoi en cours s'arrête : le fichier converti ne reste pas en mémoire.
    const transfer = transfers.current.get(key)
    transfer?.controller.abort()
    transfers.current.delete(key)
    const entry = attachments[key]
    if (entry) releasePreview(entry.previewUrl)
    chosenFiles.current.delete(key)
    setAttachments((current) => without(current, key))
    mediaFields.remove(index)
    setMediaError(null)
    if (transfer?.preparing) setVideoCancelled(true)
  }

  /** FD-02 : arrêter la préparation d'une vidéo (le geste, ou la feuille qui se ferme) ; la pièce est retirée. */
  function cancelPreparation(key: string) {
    const index = form.getValues("media").findIndex((item) => item.key === key)
    if (index >= 0) detach(index, key)
  }

  /**
   * La feuille se ferme : une vidéo en préparation s'arrête (FD-02) — sa progression et son
   * annulation ne se verraient plus. Les photos et une vidéo déjà préparée restent jointes.
   */
  function changeOpen(next: boolean) {
    if (!next) {
      for (const [key, transfer] of transfers.current) if (transfer.preparing) cancelPreparation(key)
    }
    props.onOpenChange(next)
  }

  // Après publication : les aperçus se libèrent ici (une URL déjà libérée se relibère sans effet au démontage).
  function clearAttachments() {
    for (const item of attached) URL.revokeObjectURL(item.previewUrl)
    chosenFiles.current.clear()
    setAttachments({})
    setMediaError(null)
  }

  const publishValidatedForm = form.handleSubmit(async (values) => {
    const media: PublishMediaInput[] = []
    for (const item of values.media) {
      const state = attachments[item.key]?.state
      if (state?.status !== "ready") {
        if (state?.status !== "uploading" && state?.status !== "preparing") setMediaError("media_upload_failed")
        return
      }
      media.push({ upload: state.upload, altText: item.altText })
    }
    if (fixedScope?.requireMedia && media.length === 0) { setMediaError("association_event_gallery_media_required"); return }
    const pageInput: Omit<PagePublicationInput, "pageId"> = {
      body: values.body,
      reach: fixedScope || (page && !page.country) || localClosed ? "diaspora" : values.reach,
      audience: !fixedScope && values.audience === "followers" ? "followers" : "public",
      ...(media.length > 0 ? { media } : {}),
      idempotencyKey: publishKey,
    }
    const result = page ? await page.publish({ pageId: page.id, ...pageInput }) : await actions.publish({
      body: values.body,
      reach: localClosed ? "diaspora" : values.reach,
      audience: values.audience === "connections" ? "connections" : "public",
      alsoOnRoot: values.alsoOnRoot,
      // Local : le pays du hub. Diaspora : le pays d'ORIGINE, en pastille dans les autres hubs (EXF-DG-16).
      country: props.memberCountry,
      ...(media.length > 0 ? { media } : {}),
      ...(share ? { sharedPostId: share.id } : {}),
      idempotencyKey: publishKey,
    })
    if (fixedScope && !active.current) return
    if (!result.ok) {
      toast.error(t(`errors.${result.code}`))
      return
    }
    setPublishKey(newPublishKey())
    const mediaPendingCheck = media.some((item) => item.upload.pendingCheck === true)
    // Une publication retenue en relecture le dit, même dans une page ou un groupe : l'auteur sait pourquoi elle n'apparaît pas encore.
    if (page) {
      const inReview = "moderation" in result.value && result.value.moderation === "pending_review"
      const notice = inReview ? t("composer.sentForReview") : (fixedScope?.sentNotice ?? t("pagePublications.sent", { name: page.name }))
      if (mediaPendingCheck && !inReview) toast.success(notice, { description: t("composer.mediaAfterCheckDetail") })
      else toast.success(notice)
    } else toast.success(t(publishNoticeKey("moderation" in result.value ? (result.value.moderation ?? null) : null, share !== null, mediaPendingCheck)))
    if (draftKey) writeDraft(draftKey, { body: "", reach: hasFixedScope ? "diaspora" : DEFAULTS.reach, audience: DEFAULTS.audience, alsoOnRoot: DEFAULTS.alsoOnRoot })
    clearAttachments()
    form.reset(defaults)
    props.onOpenChange(false)
  })

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submissionInFlight.current) return
    submissionInFlight.current = true
    try {
      await publishValidatedForm(event)
    } catch {
      if (!fixedScope || active.current) toast.error(t("errors.unknown"))
    } finally {
      submissionInFlight.current = false
    }
  }

  const countryLabel = countryName(localCountry, locale)
  const localNoticeId = `${ids}-local-ferme`
  const bodyError = form.formState.errors.body?.message
  const mediaFieldError = form.formState.errors.media?.root?.message ?? form.formState.errors.media?.message
  const mediaNotice = mediaError ?? mediaFieldError

  return (
    <Sheet open={props.open} onOpenChange={changeOpen}>
      <SheetContent
        title={page ? (fixedScope?.title ?? t("pagePublications.composeTitle")) : share ? t("composer.shareTitle") : t("composer.title")}
        description={fixedScope?.description ?? (page ? t("pagePublications.composeDescription", { name: page.name }) : share ? t("composer.shareDescription") : t("composer.description"))}
        hideDescription={!fixedScope}
        closeLabel={t("common.close")}
      >
        <form onSubmit={onSubmit} className="flex flex-col gap-5" aria-busy={form.formState.isSubmitting} noValidate>
          {/* Le succès ne doit effacer que le contenu effectivement envoyé.
              Un fieldset conserve les valeurs RHF tout en gelant tous les contrôles. */}
          <fieldset disabled={form.formState.isSubmitting} className="contents">
          {page ? (
            <div className="rounded-lg bg-muted p-3">
              <p className="text-sm font-semibold">{fixedScope?.identity ?? t("pagePublications.identity", { name: page.name })}</p>
              {fixedScope?.identity === undefined ? <p className="mt-1 text-[13px] text-muted-foreground">{t("pagePublications.networkNotice")}</p> : null}
            </div>
          ) : null}
          {share ? (
            <div className="flex flex-col gap-1.5">
              <p className="text-sm font-medium">{t("composer.shareOriginal")}</p>
              <SharedPostEmbed share={sharedPreviewOf(share)} now={Date.now()} interactiveMedia={false} />
            </div>
          ) : null}
          <Field
            id={`${ids}-corps`}
            label={share ? t("composer.shareBodyLabel") : t("composer.bodyLabel")}
            error={bodyError ? t(`errors.${bodyError}`) : undefined}
            hint={
              draftKey && body.trim().length > 0
                ? `${t("composer.counter", { count: body.length, max: POST_BODY_MAX })} · ${t("composer.draftKept")}`
                : t("composer.counter", { count: body.length, max: POST_BODY_MAX })
            }
          >
            {(control) => (
              <Textarea
                id={control.id}
                aria-describedby={control.describedBy}
                aria-invalid={control.invalid || undefined}
                rows={5}
                maxLength={POST_BODY_MAX + 200}
                placeholder={page ? (fixedScope?.placeholder ?? t("pagePublications.placeholder", { name: page.name })) : share ? t("composer.sharePlaceholder") : t("composer.placeholder", { country: countryLabel })}
                {...form.register("body")}
              />
            )}
          </Field>

          {/* Un partage ne joint aucun média : il montre ceux de l'original (règle du moteur). */}
          <fieldset className={cn("flex flex-col gap-2", share && "hidden")} disabled={share !== null}>
            <legend className="mb-1 text-sm font-medium">{t("composer.mediaLegend")}</legend>
            {mediaFields.fields.length > 0 ? (
              <ul className="grid grid-cols-2 gap-3" aria-label={t("composer.mediaListLabel")}>
                {mediaFields.fields.map((field, index) => {
                  const attachment = attachments[field.key]
                  if (!attachment) return null
                  const altError = form.formState.errors.media?.[index]?.altText?.message
                  const altId = `${ids}-alt-${field.key}`
                  return (
                    <li key={field.id} className="flex min-w-0 flex-col gap-1.5">
                      <div className="relative aspect-square overflow-hidden rounded-md bg-muted">
                        {attachment.kind === "video" ? (
                          <video src={attachment.previewUrl} muted playsInline preload="metadata" aria-hidden className="size-full object-cover" />
                        ) : (
                          // Aperçu local (URL d'objet du navigateur) : rien à optimiser, rien à décrire en double.
                          // eslint-disable-next-line @next/next/no-img-element -- aperçu local, le texte alternatif se donne dessous
                          <img src={attachment.previewUrl} alt="" className="size-full object-cover" />
                        )}
                        {attachment.state.status === "ready" ? null : (
                          <div
                            className={cn(
                              "absolute inset-0 flex flex-col items-center justify-center gap-1 bg-card/85 p-2 text-center text-[12px] font-medium",
                              attachment.state.status === "failed" ? "text-destructive" : "text-foreground",
                            )}
                          >
                            {attachment.state.status === "failed" ? (
                              <TriangleAlertIcon className="size-5" aria-hidden />
                            ) : (
                              <LoaderCircleIcon className="size-5 animate-spin motion-reduce:animate-none" aria-hidden />
                            )}
                            <span role={attachment.state.status === "failed" ? "alert" : undefined}>
                              {attachment.state.status === "failed"
                                ? t(`errors.${attachment.state.code}`)
                                : attachment.state.status === "uploading"
                                  ? attachment.state.percent === null
                                    ? t("composer.mediaUploading")
                                    : t("composer.mediaUploadingPercent", { percent: percentFormat.format(attachment.state.percent / 100) })
                                  : attachment.state.percent === null
                                    ? t("composer.videoProbing")
                                    : t("composer.videoConverting", { percent: percentFormat.format(attachment.state.percent / 100) })}
                            </span>
                            {/* FD-02 et A3 : la progression de la conversion, puis de l'envoi, lue par les lecteurs d'écran (rôle et nom de la barre native). */}
                            {attachment.state.status === "preparing" && attachment.state.percent !== null ? (
                              <progress
                                className="h-1.5 w-4/5 accent-primary"
                                max={100}
                                value={attachment.state.percent}
                                aria-label={t("composer.videoProgressLabel", { name: attachment.name })}
                              />
                            ) : null}
                            {attachment.state.status === "uploading" && attachment.state.percent !== null ? (
                              <progress
                                className="h-1.5 w-4/5 accent-primary"
                                max={100}
                                value={attachment.state.percent}
                                aria-label={t("composer.mediaUploadProgressLabel", { name: attachment.name })}
                              />
                            ) : null}
                            {/* A3 : un envoi échoué se renvoie d'un geste, sans perdre le texte ni les autres pièces. */}
                            {attachment.state.status === "failed" && RETRYABLE_CODES.has(attachment.state.code) ? (
                              <Button
                                type="button"
                                variant="outline"
                                className="mt-1 text-foreground"
                                onClick={() => retry(field.key)}
                                aria-label={t("composer.mediaRetryLabel", { name: attachment.name })}
                              >
                                <RotateCcwIcon aria-hidden />
                                {t("composer.mediaRetry")}
                              </Button>
                            ) : null}
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => detach(index, field.key)}
                          aria-label={t("composer.mediaRemove", { name: attachment.name })}
                          // Pastille de 32 px, cible tactile de 44 px (le pseudo-élément déborde de 6 px).
                          className="absolute right-1.5 top-1.5 inline-flex size-8 items-center justify-center rounded-full bg-card text-foreground shadow-float transition-colors before:absolute before:-inset-1.5 before:content-[''] hover:bg-muted focus-visible:shadow-focus"
                        >
                          <XIcon className="size-4" aria-hidden />
                        </button>
                      </div>
                      <Label htmlFor={altId} className="text-[13px] text-muted-foreground">
                        {t("composer.mediaAltLabel")}
                      </Label>
                      <Input
                        id={altId}
                        autoComplete="off"
                        maxLength={POST_MEDIA_ALT_MAX_LENGTH}
                        placeholder={attachment.kind === "video" ? t("composer.mediaAltPlaceholderVideo") : t("composer.mediaAltPlaceholder")}
                        aria-invalid={altError ? true : undefined}
                        enterKeyHint="done"
                        onKeyDown={keepEnterInField}
                        {...form.register(`media.${index}.altText`)}
                      />
                      {altError ? <p className="text-[13px] text-destructive">{t(`errors.${altError}`)}</p> : null}
                    </li>
                  )
                })}
              </ul>
            ) : null}
            {/* FD-02 : la conversion se fait ici, en temps réel ; elle s'arrête d'un geste. */}
            {conversionKey !== undefined ? (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md bg-muted p-3">
                <p className="min-w-0 flex-1 basis-56 text-[13px] text-muted-foreground">{t("composer.videoKeepVisible")}</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    focusAddMedia.current = true
                    cancelPreparation(conversionKey)
                  }}
                >
                  <XIcon aria-hidden />
                  {t("composer.videoCancel")}
                </Button>
              </div>
            ) : null}
            {/* A3 (comme UDB) : deux sélecteurs, photos (plusieurs) ou une vidéo seule ; les bornes du moteur dites dessous. */}
            <div className="flex flex-col gap-1.5">
              <div role="group" aria-label={t("composer.mediaAdd")} className="flex flex-wrap items-center gap-2">
                <Button type="button" variant="outline" onClick={() => photoInput.current?.click()} disabled={!canAttachPhotos} aria-describedby={`${ids}-medias-aide`}>
                  <ImagePlusIcon aria-hidden />
                  {t("composer.mediaAddPhotos")}
                </Button>
                <Button ref={addMediaButton} type="button" variant="outline" onClick={() => videoInput.current?.click()} disabled={!canAttachVideo} aria-describedby={`${ids}-medias-aide`}>
                  <FilmIcon aria-hidden />
                  {t("composer.mediaAddVideo")}
                </Button>
              </div>
              <p id={`${ids}-medias-aide`} aria-live="polite" className="text-[13px] text-muted-foreground">
                {preparing
                  ? t("composer.videoPreparing")
                  : uploading
                    ? t("composer.mediaWaiting")
                    : videoCancelled
                      ? t("composer.videoCancelled")
                      : t("composer.mediaLimits")}
              </p>
            </div>
            <input ref={photoInput} type="file" accept={POST_PHOTO_ACCEPT} multiple hidden onChange={attachFiles} />
            <input ref={videoInput} type="file" accept={POST_VIDEO_ACCEPT} hidden onChange={attachFiles} />
            {mediaNotice ? (
              <p role="alert" className="text-[13px] text-destructive">
                {t(`errors.${mediaNotice}`)}
              </p>
            ) : null}
          </fieldset>

          {fixedScope ? <p className="rounded-lg bg-muted p-3 text-sm font-medium">{fixedScope.audienceLabel}</p> : <>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium">{t("composer.reachLegend")}</legend>
            <Controller
              control={form.control}
              name="reach"
              render={({ field }) => (
                <RadioGroup value={localClosed ? "diaspora" : field.value} onValueChange={field.onChange} aria-label={t("composer.reachLegend")}>
                  {!page || page.country ? <RadioCard
                    value="local"
                    disabled={localClosed}
                    aria-describedby={localClosed ? localNoticeId : undefined}
                    className="data-[disabled]:cursor-not-allowed data-[disabled]:opacity-60"
                  >
                    <span className="flex flex-wrap items-center gap-2">
                      <CountryTag country={localCountry} />
                      <span className="text-sm">{t("composer.reachLocal", { country: countryLabel })}</span>
                    </span>
                  </RadioCard> : null}
                  <RadioCard value="diaspora">
                    <span className="flex flex-wrap items-center gap-2">
                      <ScopeTag />
                      <span className="text-sm">{t("composer.reachDiaspora")}</span>
                    </span>
                  </RadioCard>
                </RadioGroup>
              )}
            />
            {page && !page.country ? <p className="text-[13px] text-muted-foreground">{t("pagePublications.noCountry")}</p> : null}
            {localClosed ? <p id={localNoticeId} className="text-[13px] text-pending-foreground">{t("composer.reviewNotice", { country: countryLabel })}</p> : null}
          </fieldset>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium">{t("composer.audienceLegend")}</legend>
            <Controller
              control={form.control}
              name="audience"
              render={({ field }) => (
                <RadioGroup value={field.value} onValueChange={field.onChange} aria-label={t("composer.audienceLegend")}>
                  <RadioCard value="public">
                    <span className="text-sm">{t("composer.audiencePublic")}</span>
                  </RadioCard>
                  <RadioCard value={page ? "followers" : "connections"}>
                    <span className="text-sm">{page ? t("pagePublications.followersAudience") : t("composer.audienceConnections")}</span>
                  </RadioCard>
                </RadioGroup>
              )}
            />
          </fieldset>
          </>}

          {!page ? <div className="flex items-start gap-3 rounded-lg bg-muted p-3">
            <Controller
              control={form.control}
              name="alsoOnRoot"
              render={({ field }) => (
                <Checkbox
                  id={`${ids}-antsia`}
                  checked={field.value}
                  onCheckedChange={(checked) => field.onChange(checked === true)}
                  disabled={!rootAllowed}
                  aria-describedby={`${ids}-antsia-aide`}
                  className="mt-0.5"
                />
              )}
            />
            <div className="min-w-0">
              <Label htmlFor={`${ids}-antsia`} className="inline-flex items-center gap-1.5">
                <GlobeIcon className="size-4" aria-hidden />
                {t("composer.alsoOnRoot")}
              </Label>
              <p id={`${ids}-antsia-aide`} className="mt-0.5 text-[13px] text-muted-foreground">
                {rootAllowed ? t("composer.alsoOnRootHint") : t("composer.alsoOnRootDisabled")}
              </p>
            </div>
          </div> : null}

          <div className="sticky bottom-0 -mx-5 -mb-4 flex justify-end gap-2 border-t border-border bg-card px-5 py-3">
            <Button variant="ghost" onClick={() => changeOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting || uploading || preparing}>
              <SendIcon aria-hidden />
              {form.formState.isSubmitting ? t("composer.publishing") : t("composer.publish")}
            </Button>
          </div>
          </fieldset>
        </form>
      </SheetContent>
    </Sheet>
  )
}

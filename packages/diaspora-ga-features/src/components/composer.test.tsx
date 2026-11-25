import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { POST_IMAGE_MAX_BYTES, POST_MEDIA_MAX_COUNT, POST_VIDEO_MAX_BYTES, POST_VIDEO_MAX_DURATION_MS } from "@antsia/social-domain/content"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { DataSourceProvider } from "../data/context"
import type { ActionResult, DiasporaGaDataSource, MediaUploadOptions, MediaUploadPhase, PublishInput, UploadedMedia } from "../data/port"
import type { PagePublicationsCapability } from "../data/page-publications-port"
import { getFixedT } from "../i18n"
import { I18nProvider } from "../i18n/client"
import { POST_PHOTO_ACCEPT, POST_VIDEO_ACCEPT } from "../data/media"
import { megabytes } from "../i18n/media-limits"
import { PostComposerSheet } from "./composer"

const t = getFixedT("fr")
const publish = vi.fn<(input: PublishInput) => Promise<ActionResult<{ moderation: "published" }>>>()
const uploadMedia = vi.fn<(file: File, options?: MediaUploadOptions) => Promise<ActionResult<UploadedMedia>>>()
const onClose = vi.fn()
const pagePublish = vi.fn<PagePublicationsCapability["publish"]>()
const toasts = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
vi.mock("sonner", () => ({ toast: toasts }))
const source = { kind: "engine", actions: { publish, uploadMedia } } as unknown as DiasporaGaDataSource

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

function uploaded(file: File): ActionResult<UploadedMedia> {
  return { ok: true, value: { ref: `stored-${file.name}`, kind: file.type.startsWith("video/") ? "video" : "image", mimeType: file.type, sizeBytes: file.size } }
}

function Composer() {
  const [open, setOpen] = useState(true)
  return <I18nProvider locale="fr"><DataSourceProvider source={source}>
    <button onClick={() => setOpen(true)}>Reprendre</button>
    <PostComposerSheet open={open} onOpenChange={(next) => { setOpen(next); if (!next) onClose() }} memberCountry="FR" openCountries={["FR"]} draftKey="recette:composeur" />
  </DataSourceProvider></I18nProvider>
}

function choose(files: File[]) {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]')
  if (!input) throw new Error("Sélecteur absent")
  fireEvent.change(input, { target: { files } })
}

function PageComposer({ fixed = true }: { readonly fixed?: boolean }) {
  const [open, setOpen] = useState(true)
  return <I18nProvider locale="fr"><DataSourceProvider source={source}>
    <PostComposerSheet open={open} onOpenChange={(next) => { setOpen(next); if (!next) onClose() }} memberCountry="FR" openCountries={["FR"]} draftKey="recette:page-fixed" page={{ id: "page-1", name: "Association de recette", country: "FR", publish: pagePublish, ...(fixed ? { fixedScope: { description: t("eventGallery.composeDescription", { title: "Rencontre de recette" }), audienceLabel: t("eventGallery.associationAudience"), requireMedia: true } } : {}) }} />
  </DataSourceProvider></I18nProvider>
}

beforeEach(() => {
  publish.mockReset().mockResolvedValue({ ok: true, value: { moderation: "published" } })
  uploadMedia.mockReset().mockImplementation(async (file) => uploaded(file))
  onClose.mockClear()
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} })
  vi.stubGlobal("URL", class extends URL {
    static override createObjectURL = vi.fn((file: File) => `blob:recette-${file.name}`)
    static override revokeObjectURL = vi.fn()
  })
})
afterEach(() => { vi.unstubAllGlobals() })

describe("Composeur — les fichiers choisis rejoignent réellement la publication", () => {
  it("attend les deux dépôts puis transmet les photos dans l’ordre choisi, même si le second finit avant le premier", async () => {
    const first = deferred<ActionResult<UploadedMedia>>()
    const second = deferred<ActionResult<UploadedMedia>>()
    uploadMedia.mockImplementationOnce(() => first.promise).mockImplementationOnce(() => second.promise)
    const user = userEvent.setup()
    render(<Composer />)
    const photos = [new File(["photo 1"], "premiere.png", { type: "image/png" }), new File(["photo 2"], "seconde.png", { type: "image/png" })]
    await user.type(screen.getByRole("textbox", { name: t("composer.bodyLabel") }), "Deux photos de recette")
    choose(photos)
    const submit = screen.getByRole("button", { name: t("composer.publish") })
    expect(screen.getAllByRole("textbox", { name: t("composer.mediaAltLabel") })).toHaveLength(2)
    expect(submit).toBeDisabled()
    await act(async () => { second.resolve(uploaded(photos[1]!)) })
    expect(submit).toBeDisabled()
    expect(publish).not.toHaveBeenCalled()
    await act(async () => { first.resolve(uploaded(photos[0]!)) })
    const descriptions = screen.getAllByRole("textbox", { name: t("composer.mediaAltLabel") })
    await user.type(descriptions[0]!, "Première mire")
    await user.type(descriptions[1]!, "Deuxième mire")
    await user.click(submit)
    await waitFor(() => expect(publish).toHaveBeenCalledOnce())
    expect(publish.mock.calls[0]?.[0].media).toEqual(photos.map((file, index) => ({ upload: (uploaded(file) as { ok: true; value: UploadedMedia }).value, altText: index === 0 ? "Première mire" : "Deuxième mire" })))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it.each([
    { pendingCheck: true, notice: "composer.mediaAfterCheck" },
    { pendingCheck: undefined, notice: "composer.published" },
  ])("A1 : un média encore à vérifier ne s'annonce jamais « Publié. » (pendingCheck $pendingCheck)", async ({ pendingCheck, notice }) => {
    toasts.success.mockClear()
    uploadMedia.mockImplementationOnce(async (file) => {
      const done = uploaded(file) as { ok: true; value: UploadedMedia }
      return { ok: true, value: { ...done.value, ...(pendingCheck ? { pendingCheck } : {}) } }
    })
    const user = userEvent.setup()
    render(<Composer />)
    choose([new File(["photo"], "a-verifier.png", { type: "image/png" })])
    await waitFor(() => expect(screen.getByRole("button", { name: t("composer.publish") })).toBeEnabled())
    await user.click(screen.getByRole("button", { name: t("composer.publish") }))
    await waitFor(() => expect(toasts.success).toHaveBeenCalledOnce())
    expect(toasts.success).toHaveBeenCalledWith(t(notice))
  })

  it("conserve les photos en fermant puis rouvrant la feuille sans recharger la page", async () => {
    const user = userEvent.setup()
    render(<Composer />)
    choose([new File(["photo"], "gardee.png", { type: "image/png" })])
    await waitFor(() => expect(screen.getByRole("button", { name: t("composer.publish") })).toBeEnabled())
    await user.click(screen.getByRole("button", { name: t("common.cancel") }))
    await user.click(screen.getByRole("button", { name: "Reprendre" }))
    expect(screen.getAllByRole("textbox", { name: t("composer.mediaAltLabel") })).toHaveLength(1)
    await user.click(screen.getByRole("button", { name: t("composer.publish") }))
    await waitFor(() => expect(publish).toHaveBeenCalledOnce())
    expect(publish.mock.calls[0]?.[0].media).toHaveLength(1)
  })

  it("un dépôt refusé ne devient jamais une publication de texte seule", async () => {
    uploadMedia.mockResolvedValueOnce({ ok: false, code: "media_upload_failed" })
    const user = userEvent.setup()
    render(<Composer />)
    await user.type(screen.getByRole("textbox", { name: t("composer.bodyLabel") }), "Texte à garder avec sa photo")
    choose([new File(["photo"], "refusee.png", { type: "image/png" })])
    await waitFor(() => expect(screen.getByRole("button", { name: t("composer.publish") })).toBeEnabled())
    await user.click(screen.getByRole("button", { name: t("composer.publish") }))
    expect(await screen.findAllByRole("alert")).not.toHaveLength(0)
    expect(publish).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  it("ne laisse pas ajouter des photos à un envoi de texte déjà parti : son succès effacerait des pièces jamais envoyées", async () => {
    const result = deferred<ActionResult<{ moderation: "published" }>>()
    publish.mockImplementationOnce(() => result.promise)
    const user = userEvent.setup()
    render(<Composer />)
    await user.type(screen.getByRole("textbox", { name: t("composer.bodyLabel") }), "Publication en cours")
    await user.click(screen.getByRole("button", { name: t("composer.publish") }))
    await waitFor(() => expect(publish).toHaveBeenCalledOnce())
    expect(publish.mock.calls[0]?.[0].media).toBeUndefined()
    choose([new File(["photo"], "trop-tard.png", { type: "image/png" })])
    expect(uploadMedia).not.toHaveBeenCalled()
    expect(screen.getByRole("button", { name: t("composer.mediaAddPhotos") })).toBeDisabled()
    expect(screen.getByRole("button", { name: t("composer.mediaAddVideo") })).toBeDisabled()
    const form = document.querySelector("form")
    if (!form) throw new Error("Formulaire absent")
    await act(async () => { fireEvent.submit(form) })
    expect(publish).toHaveBeenCalledOnce()
    await act(async () => { result.resolve({ ok: true, value: { moderation: "published" } }) })
  })

  it("une vidéo seule sans texte est transmise et garde son type", async () => {
    const user = userEvent.setup()
    render(<Composer />)
    choose([new File(["video fictive"], "recette.mp4", { type: "video/mp4" })])
    await waitFor(() => expect(screen.getByRole("button", { name: t("composer.publish") })).toBeEnabled())
    await user.click(screen.getByRole("button", { name: t("composer.publish") }))
    await waitFor(() => expect(publish).toHaveBeenCalledOnce())
    expect(publish.mock.calls[0]?.[0]).toMatchObject({ body: "", media: [{ upload: { ref: "stored-recette.mp4", kind: "video", mimeType: "video/mp4" } }] })
    expect(onClose).toHaveBeenCalledOnce()
  })

  it("FD-02 : une vidéo et une photo choisies ensemble sont refusées avant tout envoi ; un autre fichier garde le refus de type", async () => {
    render(<Composer />)
    choose([new File(["photo"], "photo.png", { type: "image/png" }), new File(["video fictive"], "IMG_0412.MOV", { type: "video/quicktime" })])
    expect((await screen.findByRole("alert")).textContent).toContain(t("errors.media_video_alone"))
    expect(uploadMedia).not.toHaveBeenCalled()
    // Un autre fichier garde le refus de type, qui ne cite pas le .mov parmi les formats envoyés.
    choose([new File(["%PDF"], "dossier.pdf", { type: "application/pdf" })])
    expect((await screen.findByRole("alert")).textContent).toContain(t("errors.media_type_invalid"))
    expect(t("errors.media_type_invalid")).not.toContain("MOV")
    expect(uploadMedia).not.toHaveBeenCalled()
  })

  it("un refus de publication rend les contrôles et conserve les deux dépôts pour réessayer avec la même clé", async () => {
    publish.mockResolvedValueOnce({ ok: false, code: "unknown" })
    const user = userEvent.setup()
    render(<Composer />)
    choose([new File(["1"], "une.png", { type: "image/png" }), new File(["2"], "deux.png", { type: "image/png" })])
    await waitFor(() => expect(screen.getByRole("button", { name: t("composer.publish") })).toBeEnabled())
    await user.click(screen.getByRole("button", { name: t("composer.publish") }))
    await waitFor(() => expect(publish).toHaveBeenCalledOnce())
    expect(screen.getByRole("button", { name: t("composer.mediaAddPhotos") })).toBeEnabled()
    expect(screen.getAllByRole("textbox", { name: t("composer.mediaAltLabel") })).toHaveLength(2)
    expect(onClose).not.toHaveBeenCalled()
    await user.click(screen.getByRole("button", { name: t("composer.publish") }))
    await waitFor(() => expect(publish).toHaveBeenCalledTimes(2))
    expect(publish.mock.calls[1]?.[0]).toEqual(publish.mock.calls[0]?.[0])
    expect(uploadMedia).toHaveBeenCalledTimes(2)
    expect(onClose).toHaveBeenCalledOnce()
  })

  it("une validation refusée libère le verrou et permet de joindre puis publier une photo", async () => {
    const user = userEvent.setup()
    render(<Composer />)
    await user.click(screen.getByRole("button", { name: t("composer.publish") }))
    expect(await screen.findByRole("alert")).toHaveTextContent(t("errors.post_empty"))
    expect(publish).not.toHaveBeenCalled()
    choose([new File(["photo"], "apres-validation.png", { type: "image/png" })])
    await waitFor(() => expect(screen.getByRole("button", { name: t("composer.publish") })).toBeEnabled())
    await user.click(screen.getByRole("button", { name: t("composer.publish") }))
    await waitFor(() => expect(publish).toHaveBeenCalledOnce())
    expect(publish.mock.calls[0]?.[0].media).toHaveLength(1)
  })
})

/**
 * FD-02 — le dépôt d'une vidéo piloté pas à pas : le composeur reçoit les phases (analyse,
 * conversion, envoi) et le signal d'annulation ; la préparation elle-même (module du moteur) est
 * jouée par la source et testée avec elle (`media.test.ts`, `engine.test.ts`).
 */
function controlledUpload() {
  const result = deferred<ActionResult<UploadedMedia>>()
  let given: MediaUploadOptions | undefined
  uploadMedia.mockImplementationOnce((_file, options) => {
    given = options
    return result.promise
  })
  return {
    result,
    phase: async (phase: MediaUploadPhase) => {
      await act(async () => {
        given?.onPhase?.(phase)
      })
    },
    options: () => given,
  }
}

const iphoneVideo = () => new File(["mov"], "IMG_0412.MOV", { type: "video/quicktime" })
/** Une phrase telle que Testing Library la lit : les espaces insécables du français deviennent des espaces. */
const plain = (text: string) => text.replace(/\s+/g, " ")
/** Ce que la source rend d'un .mov converti : un MP4, sa durée mesurée. */
const CONVERTED: UploadedMedia = { ref: "stored-IMG_0412.mp4", kind: "video", mimeType: "video/mp4", sizeBytes: 1_024, durationMs: 8_960 }
const percent = (fraction: number) => new Intl.NumberFormat("fr", { style: "percent", maximumFractionDigits: 0 }).format(fraction)

describe("Composeur — la vidéo d'un iPhone est préparée, puis envoyée (FD-02)", () => {
  it("un .mov est préparé : analyse, conversion suivie par une barre nommée, puis envoi ; publié comme toute vidéo", async () => {
    const upload = controlledUpload()
    const user = userEvent.setup()
    render(<Composer />)
    choose([iphoneVideo()])
    // Aucun refus : la vidéo part en préparation, avec de quoi la suivre et l'arrêter.
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
    expect(uploadMedia).toHaveBeenCalledOnce()
    expect(uploadMedia.mock.calls[0]?.[0].name).toBe("IMG_0412.MOV")
    expect(upload.options()).toEqual({ signal: expect.any(AbortSignal), onPhase: expect.any(Function) })
    expect(screen.getByText(plain(t("composer.videoProbing")))).toBeVisible()
    // La zone vivante annonce la préparation ; la publication attend.
    expect(screen.getByText(plain(t("composer.videoPreparing")))).toHaveAttribute("aria-live", "polite")
    const submit = screen.getByRole("button", { name: t("composer.publish") })
    expect(submit).toBeDisabled()

    await upload.phase({ phase: "converting", progress: 0.429 })
    const bar = screen.getByRole("progressbar", { name: t("composer.videoProgressLabel", { name: "IMG_0412.MOV" }) })
    expect(bar).toHaveAttribute("max", "100")
    expect(bar).toHaveAttribute("value", "42")
    expect(bar.parentElement?.textContent).toContain(t("composer.videoConverting", { percent: percent(0.42) }))
    expect(screen.getByText(plain(t("composer.videoKeepVisible")))).toBeVisible()
    expect(screen.getByRole("button", { name: t("composer.videoCancel") })).toBeEnabled()
    expect(submit).toBeDisabled()

    await upload.phase({ phase: "uploading" })
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: t("composer.videoCancel") })).not.toBeInTheDocument()
    expect(screen.getByText(plain(t("composer.mediaUploading")))).toBeVisible()
    expect(screen.getByText(plain(t("composer.mediaWaiting")))).toBeVisible()
    expect(submit).toBeDisabled()

    await act(async () => { upload.result.resolve({ ok: true, value: CONVERTED }) })
    await user.type(screen.getByRole("textbox", { name: t("composer.mediaAltLabel") }), "La rive du fleuve")
    await user.click(submit)
    await waitFor(() => expect(publish).toHaveBeenCalledOnce())
    expect(publish.mock.calls[0]?.[0].media).toEqual([{ upload: CONVERTED, altText: "La rive du fleuve" }])
    expect(onClose).toHaveBeenCalledOnce()
  })

  it("« Annuler la conversion » arrête la préparation : pièce retirée, annulation dite sans alerte, focus rendu ; un résultat tardif est ignoré", async () => {
    const upload = controlledUpload()
    const user = userEvent.setup()
    render(<Composer />)
    await user.type(screen.getByRole("textbox", { name: t("composer.bodyLabel") }), "Texte gardé")
    choose([iphoneVideo()])
    await upload.phase({ phase: "converting", progress: 0.1 })
    await user.click(screen.getByRole("button", { name: t("composer.videoCancel") }))

    expect(upload.options()?.signal?.aborted).toBe(true)
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument()
    expect(screen.queryAllByRole("textbox", { name: t("composer.mediaAltLabel") })).toHaveLength(0)
    expect(screen.getByText(plain(t("composer.videoCancelled")))).toHaveAttribute("aria-live", "polite")
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:recette-IMG_0412.MOV")
    // Le bouton d'annulation a disparu : le focus revient au bouton d'ajout d'une vidéo, de nouveau actif.
    const add = screen.getByRole("button", { name: t("composer.mediaAddVideo") })
    expect(add).toBeEnabled()
    expect(add).toHaveFocus()

    // La préparation annulée rend son issue plus tard : elle ne rejoint rien.
    await act(async () => { upload.result.resolve({ ok: true, value: CONVERTED }) })
    expect(screen.queryAllByRole("textbox", { name: t("composer.mediaAltLabel") })).toHaveLength(0)
    await user.click(screen.getByRole("button", { name: t("composer.publish") }))
    await waitFor(() => expect(publish).toHaveBeenCalledOnce())
    expect(publish.mock.calls[0]?.[0]).toMatchObject({ body: "Texte gardé" })
    expect(publish.mock.calls[0]?.[0].media).toBeUndefined()
  })

  it("fermer la feuille arrête la préparation ; rouverte, la vidéo n'y est plus et l'annulation est dite", async () => {
    const upload = controlledUpload()
    const user = userEvent.setup()
    render(<Composer />)
    choose([iphoneVideo()])
    await upload.phase({ phase: "converting", progress: 0.3 })
    await user.click(screen.getByRole("button", { name: t("common.cancel") }))
    expect(upload.options()?.signal?.aborted).toBe(true)
    expect(onClose).toHaveBeenCalledOnce()
    await user.click(screen.getByRole("button", { name: "Reprendre" }))
    expect(screen.queryAllByRole("textbox", { name: t("composer.mediaAltLabel") })).toHaveLength(0)
    expect(screen.getByText(plain(t("composer.videoCancelled")))).toBeVisible()
  })

  it("quitter le composeur arrête la préparation et libère l'aperçu", () => {
    const upload = controlledUpload()
    const { unmount } = render(<Composer />)
    choose([iphoneVideo()])
    unmount()
    expect(upload.options()?.signal?.aborted).toBe(true)
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:recette-IMG_0412.MOV")
  })

  it("un refus de la préparation ne joint rien et se dit en alerte ; le brouillon gardé ne porte jamais le fichier", async () => {
    const upload = controlledUpload()
    const user = userEvent.setup()
    const view = render(<Composer />)
    await user.type(screen.getByRole("textbox", { name: t("composer.bodyLabel") }), "Ma vidéo de recette")
    choose([iphoneVideo()])
    await upload.phase({ phase: "converting", progress: 0.2 })
    // Pendant la préparation, le brouillon du navigateur garde le texte et les choix, aucun fichier.
    await waitFor(() => expect(JSON.parse(window.localStorage.getItem("recette:composeur") ?? "null")).toEqual({ body: "Ma vidéo de recette", reach: "local", audience: "public", alsoOnRoot: false }))

    await act(async () => { upload.result.resolve({ ok: false, code: "media_video_too_long_to_convert" }) })
    expect(await screen.findByRole("alert")).toHaveTextContent(plain(t("errors.media_video_too_long_to_convert")))
    expect(screen.queryAllByRole("textbox", { name: t("composer.mediaAltLabel") })).toHaveLength(0)
    expect(screen.getByRole("button", { name: t("composer.mediaAddVideo") })).toBeEnabled()

    // Rechargé, le composeur rend le texte, jamais une vidéo à moitié préparée.
    view.unmount()
    render(<Composer />)
    expect(screen.getByRole("textbox", { name: t("composer.bodyLabel") })).toHaveValue("Ma vidéo de recette")
    expect(screen.queryAllByRole("textbox", { name: t("composer.mediaAltLabel") })).toHaveLength(0)
  })

  it("un envoi qui échoue APRÈS la préparation garde la pièce en échec, comme une photo", async () => {
    const upload = controlledUpload()
    render(<Composer />)
    choose([iphoneVideo()])
    await upload.phase({ phase: "uploading" })
    await act(async () => { upload.result.resolve({ ok: false, code: "media_upload_failed" }) })
    expect(await screen.findByRole("alert")).toHaveTextContent(plain(t("errors.media_upload_failed")))
    expect(screen.getAllByRole("textbox", { name: t("composer.mediaAltLabel") })).toHaveLength(1)
    expect(screen.getByRole("button", { name: t("composer.mediaRemove", { name: "IMG_0412.MOV" }) })).toBeEnabled()
  })
})

describe("Composeur — entrée Photo et Vidéo, avancement de l'envoi, nouvel essai (A3)", () => {
  it("deux sélecteurs distincts, photos (plusieurs) et vidéo (une), et les bornes du moteur dites", () => {
    render(<Composer />)
    const group = screen.getByRole("group", { name: t("composer.mediaAdd") })
    expect(within(group).getByRole("button", { name: t("composer.mediaAddPhotos") })).toBeEnabled()
    expect(within(group).getByRole("button", { name: t("composer.mediaAddVideo") })).toBeEnabled()
    const [photoInput, videoInput] = [...document.querySelectorAll<HTMLInputElement>('input[type="file"]')]
    expect(photoInput?.accept).toBe(POST_PHOTO_ACCEPT)
    expect(photoInput?.multiple).toBe(true)
    expect(videoInput?.accept).toBe(POST_VIDEO_ACCEPT)
    expect(videoInput?.multiple).toBe(false)
    const limits = screen.getByText(plain(t("composer.mediaLimits")))
    for (const value of [String(POST_MEDIA_MAX_COUNT), megabytes(POST_IMAGE_MAX_BYTES), megabytes(POST_VIDEO_MAX_BYTES), String(POST_VIDEO_MAX_DURATION_MS / 60_000)]) expect(limits.textContent).toContain(value)
  })

  it("une vidéo jointe ferme l'ajout ; des photos ferment l'ajout d'une vidéo et le rouvrent au plafond", async () => {
    render(<Composer />)
    choose([new File(["v"], "clip.mp4", { type: "video/mp4" })])
    await waitFor(() => expect(screen.getByRole("button", { name: t("composer.publish") })).toBeEnabled())
    expect(screen.getByRole("button", { name: t("composer.mediaAddPhotos") })).toBeDisabled()
    expect(screen.getByRole("button", { name: t("composer.mediaAddVideo") })).toBeDisabled()
  })

  it("l'envoi dit son pour cent, lu par une barre nommée", async () => {
    const upload = controlledUpload()
    render(<Composer />)
    choose([new File(["photo"], "marche.png", { type: "image/png" })])
    await upload.phase({ phase: "uploading", progress: 0.426 })
    const bar = screen.getByRole("progressbar", { name: t("composer.mediaUploadProgressLabel", { name: "marche.png" }) })
    expect(bar).toHaveAttribute("value", "42")
    expect(bar.parentElement?.textContent).toContain(t("composer.mediaUploadingPercent", { percent: percent(0.42) }))
    expect(screen.getByRole("button", { name: t("composer.publish") })).toBeDisabled()
  })

  it("« Réessayer » renvoie la pièce échouée sans perdre le texte, puis la publication la porte", async () => {
    uploadMedia.mockResolvedValueOnce({ ok: false, code: "media_upload_failed" })
    const user = userEvent.setup()
    render(<Composer />)
    await user.type(screen.getByRole("textbox", { name: t("composer.bodyLabel") }), "Texte à garder")
    const file = new File(["photo"], "reessai.png", { type: "image/png" })
    choose([file])
    const retry = await screen.findByRole("button", { name: t("composer.mediaRetryLabel", { name: "reessai.png" }) })
    await user.click(retry)
    await waitFor(() => expect(uploadMedia).toHaveBeenCalledTimes(2))
    expect(uploadMedia.mock.calls[1]?.[0]).toBe(file)
    await waitFor(() => expect(screen.queryByRole("button", { name: t("composer.mediaRetryLabel", { name: "reessai.png" }) })).not.toBeInTheDocument())
    expect(screen.getByRole("textbox", { name: t("composer.bodyLabel") })).toHaveValue("Texte à garder")
    await user.click(screen.getByRole("button", { name: t("composer.publish") }))
    await waitFor(() => expect(publish).toHaveBeenCalledOnce())
    expect(publish.mock.calls[0]?.[0]).toMatchObject({ body: "Texte à garder", media: [{ upload: { ref: "stored-reessai.png" } }] })
  })

  it("les fichiers choisis depuis le fil (Photo, Vidéo) rejoignent le composeur, une fois par geste", async () => {
    const photo = new File(["photo"], "depuis-le-fil.png", { type: "image/png" })
    const view = render(<IncomingComposer incoming={{ id: 1, files: [photo] }} />)
    await waitFor(() => expect(uploadMedia).toHaveBeenCalledOnce())
    expect(uploadMedia.mock.calls[0]?.[0]).toBe(photo)
    expect(screen.getAllByRole("textbox", { name: t("composer.mediaAltLabel") })).toHaveLength(1)
    view.rerender(<IncomingComposer incoming={{ id: 1, files: [photo] }} />)
    expect(uploadMedia).toHaveBeenCalledOnce()
    view.rerender(<IncomingComposer incoming={{ id: 2, files: [new File(["photo"], "seconde.png", { type: "image/png" })] }} />)
    await waitFor(() => expect(uploadMedia).toHaveBeenCalledTimes(2))
    expect(screen.getAllByRole("textbox", { name: t("composer.mediaAltLabel") })).toHaveLength(2)
  })
})

function IncomingComposer(props: { readonly incoming: { readonly id: number; readonly files: readonly File[] } }) {
  return <I18nProvider locale="fr"><DataSourceProvider source={source}>
    <PostComposerSheet open onOpenChange={() => undefined} memberCountry="FR" openCountries={["FR"]} incomingFiles={props.incoming} />
  </DataSourceProvider></I18nProvider>
}

function CountryComposer(props: { readonly memberCountry: "FR" | "ES"; readonly openCountries: readonly ("FR" | "ES")[] | null; readonly pageCountry?: "FR" | "ES" }) {
  const [open, setOpen] = useState(true)
  return <I18nProvider locale="fr"><DataSourceProvider source={source}>
    <PostComposerSheet
      open={open}
      onOpenChange={(next) => { setOpen(next); if (!next) onClose() }}
      memberCountry={props.memberCountry}
      openCountries={props.openCountries}
      {...(props.pageCountry ? { page: { id: "page-es", name: "Association de recette", country: props.pageCountry, publish: pagePublish } } : {})}
    />
  </DataSourceProvider></I18nProvider>
}

describe("Composeur — pays pas encore ouvert (HB-01)", () => {
  beforeEach(() => {
    pagePublish.mockReset().mockResolvedValue({ ok: true, value: { postId: "post-page", created: true } })
  })

  it("le hub local est inactif et expliqué, la portée part pour toute la diaspora, aucune relecture n'est promise", async () => {
    const user = userEvent.setup()
    render(<CountryComposer memberCountry="ES" openCountries={["FR"]} />)
    const local = screen.getByRole("radio", { name: /Dans le hub Espagne/ })
    expect(local).toBeDisabled()
    expect(local).not.toBeChecked()
    expect(local).toHaveAccessibleDescription(t("composer.reviewNotice", { country: "Espagne" }))
    expect(screen.getByRole("radio", { name: /Pour toute la diaspora/ })).toBeChecked()
    expect(screen.getByRole("dialog")).not.toHaveTextContent(/relue|relecture/i)
    await user.type(screen.getByRole("textbox", { name: t("composer.bodyLabel") }), "Bonjour depuis Madrid")
    await user.click(screen.getByRole("button", { name: t("composer.publish") }))
    await waitFor(() => expect(publish).toHaveBeenCalledOnce())
    // La diaspora garde le pays d'ORIGINE de l'auteur (pastille dans les autres hubs).
    expect(publish.mock.calls[0]?.[0]).toMatchObject({ body: "Bonjour depuis Madrid", reach: "diaspora", country: "ES" })
  })

  it("une page d'un pays fermé publie pour toute la diaspora", async () => {
    const user = userEvent.setup()
    render(<CountryComposer memberCountry="FR" openCountries={["FR"]} pageCountry="ES" />)
    expect(screen.getByRole("radio", { name: /Dans le hub Espagne/ })).toBeDisabled()
    await user.type(screen.getByRole("textbox", { name: t("composer.bodyLabel") }), "Annonce de la page")
    await user.click(screen.getByRole("button", { name: t("composer.publish") }))
    await waitFor(() => expect(pagePublish).toHaveBeenCalledOnce())
    expect(pagePublish.mock.calls[0]?.[0]).toMatchObject({ pageId: "page-es", reach: "diaspora" })
  })

  it("en France, rien ne change : le hub local reste offert et choisi par défaut", async () => {
    const user = userEvent.setup()
    render(<CountryComposer memberCountry="FR" openCountries={["FR"]} />)
    const local = screen.getByRole("radio", { name: /Dans le hub France/ })
    expect(local).toBeEnabled()
    expect(local).toBeChecked()
    expect(screen.queryByText(t("composer.reviewNotice", { country: "France" }))).not.toBeInTheDocument()
    await user.type(screen.getByRole("textbox", { name: t("composer.bodyLabel") }), "Bonjour Lyon")
    await user.click(screen.getByRole("button", { name: t("composer.publish") }))
    await waitFor(() => expect(publish).toHaveBeenCalledOnce())
    expect(publish.mock.calls[0]?.[0]).toMatchObject({ reach: "local", country: "FR" })
  })

  it("pays ouverts encore inconnus : aucun pays n'est dit fermé, le choix local reste offert", () => {
    render(<CountryComposer memberCountry="ES" openCountries={null} />)
    expect(screen.getByRole("radio", { name: /Dans le hub Espagne/ })).toBeEnabled()
    expect(screen.queryByText(t("composer.reviewNotice", { country: "Espagne" }))).not.toBeInTheDocument()
  })
})

describe("Composeur — portée fixe de galerie, sans changer les pages ordinaires", () => {
  beforeEach(() => {
    window.localStorage.clear()
    pagePublish.mockReset().mockResolvedValue({ ok: true, value: { postId: "post-gallery", created: true } })
  })
  afterEach(() => { window.localStorage.clear() })

  it("force le brouillon interne et exige un média avant toute publication de galerie", async () => {
    window.localStorage.setItem("recette:page-fixed", JSON.stringify({ body: "Légende conservée dans son événement", reach: "local", audience: "followers", alsoOnRoot: true }))
    const user = userEvent.setup()
    render(<PageComposer />)
    expect(screen.getByRole("textbox", { name: t("composer.bodyLabel") })).toHaveValue("Légende conservée dans son événement")
    expect(screen.getByRole("dialog")).toHaveAccessibleDescription(/Rencontre de recette/)
    expect(screen.getByText(t("eventGallery.associationAudience"))).toBeVisible()
    expect(screen.queryByRole("radiogroup", { name: t("composer.reachLegend") })).not.toBeInTheDocument()
    expect(screen.queryByRole("radiogroup", { name: t("composer.audienceLegend") })).not.toBeInTheDocument()
    expect(screen.queryByRole("checkbox", { name: t("composer.alsoOnRoot") })).not.toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: t("composer.publish") }))
    expect(await screen.findByRole("alert")).toHaveTextContent(t("errors.association_event_gallery_media_required"))
    expect(pagePublish).not.toHaveBeenCalled()
    expect(publish).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
    await waitFor(() => expect(JSON.parse(window.localStorage.getItem("recette:page-fixed") ?? "null")).toEqual({ body: "Légende conservée dans son événement", reach: "diaspora", audience: "public", alsoOnRoot: false }))
  })

  it("réutilise le dépôt et le texte alternatif, puis transmet une portée fixe même pour une page avec pays", async () => {
    const user = userEvent.setup()
    render(<PageComposer />)
    choose([new File(["photo de recette"], "rencontre.png", { type: "image/png" })])
    await waitFor(() => expect(screen.getByRole("button", { name: t("composer.publish") })).toBeEnabled())
    await user.type(screen.getByRole("textbox", { name: t("composer.mediaAltLabel") }), "La salle de rencontre")
    await user.click(screen.getByRole("button", { name: t("composer.publish") }))
    await waitFor(() => expect(pagePublish).toHaveBeenCalledOnce())
    expect(pagePublish.mock.calls[0]?.[0]).toEqual({ pageId: "page-1", body: "", reach: "diaspora", audience: "public", media: [{ upload: { ref: "stored-rencontre.png", kind: "image", mimeType: "image/png", sizeBytes: "photo de recette".length }, altText: "La salle de rencontre" }], idempotencyKey: expect.any(String) })
    expect(publish).not.toHaveBeenCalled()
    expect(uploadMedia).toHaveBeenCalledOnce()
    expect(onClose).toHaveBeenCalledOnce()
  })

  it("une page sans portée fixe garde son choix abonnés et sa publication de texte seul", async () => {
    const user = userEvent.setup()
    render(<PageComposer fixed={false} />)
    expect(screen.getByRole("radiogroup", { name: t("composer.reachLegend") })).toBeVisible()
    expect(screen.getByRole("radiogroup", { name: t("composer.audienceLegend") })).toBeVisible()
    await user.click(screen.getByRole("radio", { name: t("pagePublications.followersAudience") }))
    await user.type(screen.getByRole("textbox", { name: t("composer.bodyLabel") }), "Un texte ordinaire de la page")
    await user.click(screen.getByRole("button", { name: t("composer.publish") }))
    await waitFor(() => expect(pagePublish).toHaveBeenCalledOnce())
    expect(pagePublish.mock.calls[0]?.[0]).toMatchObject({ pageId: "page-1", body: "Un texte ordinaire de la page", reach: "local", audience: "followers" })
    expect(pagePublish.mock.calls[0]?.[0].media).toBeUndefined()
    expect(uploadMedia).not.toHaveBeenCalled()
  })
})

describe("Composeur — le groupe d'une association parle sous ses propres mots (AS-08)", () => {
  const WORDS = {
    title: "Publier dans le groupe de recette",
    identity: "Vous publiez en votre nom dans Groupe de recette",
    placeholder: "Que voulez-vous partager avec le groupe de recette ?",
    sentNotice: "Publication envoyée dans le groupe de recette.",
  }
  function GroupComposer() {
    const [open, setOpen] = useState(true)
    return <I18nProvider locale="fr"><DataSourceProvider source={source}>
      <button onClick={() => setOpen(true)}>Reprendre</button>
      <PostComposerSheet open={open} onOpenChange={setOpen} memberCountry="FR" openCountries={["FR"]} draftKey="recette:groupe" page={{ id: "group-1", name: "Groupe de recette", country: null, publish: pagePublish, fixedScope: { description: "Votre publication reste dans le groupe de recette.", audienceLabel: "Membres du groupe de recette", requireMedia: false, ...WORDS } }} />
    </DataSourceProvider></I18nProvider>
  }

  beforeEach(() => {
    pagePublish.mockReset()
    toasts.success.mockReset()
  })

  it("titre, identité et invite du groupe, sans la voix de la page ; l'avis dit l'envoi, ou la relecture quand elle retient la publication", async () => {
    const user = userEvent.setup()
    render(<GroupComposer />)
    expect(screen.getByRole("dialog", { name: WORDS.title })).toBeVisible()
    expect(screen.getByText(WORDS.identity)).toBeVisible()
    expect(screen.queryByText(t("pagePublications.networkNotice"))).not.toBeInTheDocument()
    expect(screen.getByText("Membres du groupe de recette")).toBeVisible()
    const body = screen.getByRole("textbox", { name: t("composer.bodyLabel") })
    expect(body).toHaveAttribute("placeholder", WORDS.placeholder)

    pagePublish.mockResolvedValueOnce({ ok: true, value: { postId: "post-1", created: true, moderation: "published" } })
    await user.type(body, "Rendez-vous samedi.")
    await user.click(screen.getByRole("button", { name: t("composer.publish") }))
    await waitFor(() => expect(toasts.success).toHaveBeenCalledWith(WORDS.sentNotice))
    expect(pagePublish.mock.calls[0]?.[0]).toMatchObject({ pageId: "group-1", body: "Rendez-vous samedi.", reach: "diaspora" })

    pagePublish.mockResolvedValueOnce({ ok: true, value: { postId: "post-2", created: true, moderation: "pending_review" } })
    await user.click(screen.getByRole("button", { name: "Reprendre" }))
    await user.type(screen.getByRole("textbox", { name: t("composer.bodyLabel") }), "Un second message.")
    await user.click(screen.getByRole("button", { name: t("composer.publish") }))
    await waitFor(() => expect(toasts.success).toHaveBeenLastCalledWith(t("composer.sentForReview")))
  })
})

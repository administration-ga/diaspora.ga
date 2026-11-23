"use client"

import { CopyIcon, Repeat2Icon, Share2Icon } from "lucide-react"
import { createContext, useContext, useId, useRef, useState } from "react"
import { toast } from "sonner"

import { useFeatureGate } from "../data/context"
import type { PostView, SharedPostView } from "../data/types"
import { useDiasporaGaT } from "../i18n/client"
import { cn } from "../lib/cn"
import { formatDate, formatRelative } from "../lib/format"
import { useRouting } from "../routing"
import { Button } from "../primitives/button"
import { Field, Input } from "../primitives/field"
import { Sheet, SheetContent, SheetTrigger } from "../primitives/sheet"
import { PostMediaGrid } from "./post-media"
import { RichText } from "./rich-text"

/**
 * Le pont vers le composeur de partage : la coque de l'application le fournit
 * quand la personne peut publier. Sans lui, la copie du lien reste disponible,
 * mais aucune citation ne peut être créée dans le fil.
 */
const PostShareContext = createContext<((post: PostView) => void) | null>(null)

export const PostShareProvider = PostShareContext.Provider

/** Ouvrir une citation dans le fil ; `null` : ce droit d'écriture n'est pas disponible ici. */
export function usePostShare(): ((post: PostView) => void) | null {
  return useContext(PostShareContext)
}

/**
 * Partager une publication lisible (FD-06) : copier son adresse, ou l'envoyer par la feuille de
 * partage du téléphone quand le navigateur en a une (même approche que le partage d'une page).
 * L'adresse est interne : ouverte hors session, elle mène à la porte, puis à la publication si la
 * personne entrée peut la lire. Rien du contenu ne part avec elle (aucun aperçu public d'une
 * publication `network`) ; partager ne crée ni citation ni droit d'accès.
 */
export function PostShareButton({ post }: { post: PostView }) {
  const { t } = useDiasporaGaT()
  const { routes } = useRouting()
  const share = usePostShare()
  const id = useId()
  const input = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [link, setLink] = useState("")
  const [copying, setCopying] = useState(false)
  const [copyFailed, setCopyFailed] = useState(false)
  const [nativeAvailable, setNativeAvailable] = useState(false)
  const [sharing, setSharing] = useState(false)
  const [shareFailed, setShareFailed] = useState(false)

  const openShare = () => {
    setLink(new URL(routes.post(post.id), window.location.origin).href)
    setCopyFailed(false)
    setShareFailed(false)
    setNativeAvailable(typeof navigator.share === "function")
  }
  const shareNatively = async () => {
    if (sharing || link.length === 0) return
    setSharing(true)
    setShareFailed(false)
    try {
      // Un titre neutre et l'adresse seulement : ni le texte, ni l'auteur, ni les médias.
      await navigator.share({ title: t("post.shareActions.nativeTitle"), url: link })
    } catch (error) {
      // Fermer la feuille du téléphone n'est pas un échec. Jugé par le nom : une `DOMException`
      // ne descend pas toujours de l'`Error` de la page qui l'attrape.
      if (!(typeof error === "object" && error !== null && (error as { name?: unknown }).name === "AbortError")) setShareFailed(true)
    } finally { setSharing(false) }
  }
  const copyLink = async () => {
    if (copying) return
    setCopying(true)
    setCopyFailed(false)
    try {
      await navigator.clipboard.writeText(link)
      toast.success(t("post.shareActions.copied"))
    } catch {
      setCopyFailed(true)
      input.current?.focus()
      input.current?.select()
    } finally { setCopying(false) }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          aria-label={post.shareCount > 0 ? t("post.shareCounted", { count: post.shareCount }) : undefined}
          onClick={openShare}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-md px-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:shadow-focus"
        >
          <Share2Icon className="size-4" aria-hidden />
          {t("post.share")}
          {post.shareCount > 0 ? <span className="tabular-nums" aria-hidden>· {post.shareCount}</span> : null}
        </button>
      </SheetTrigger>
      <SheetContent
        title={t("post.shareActions.title")}
        description={t("post.shareActions.description")}
        closeLabel={t("common.close")}
        onOpenAutoFocus={(event) => { event.preventDefault(); input.current?.focus(); input.current?.select() }}
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm leading-relaxed text-muted-foreground">{t("post.shareActions.accessNotice")}</p>
          <Field id={`${id}-link`} label={t("post.shareActions.link")} error={copyFailed ? t("post.shareActions.copyFailed") : undefined}>
            {(control) => <Input ref={input} id={control.id} value={link} readOnly onFocus={(event) => event.currentTarget.select()} aria-describedby={control.describedBy} />}
          </Field>
          <Button onClick={() => void copyLink()} aria-disabled={copying} aria-busy={copying}>
            <CopyIcon aria-hidden />{t("post.shareActions.copyLink")}
          </Button>
          {nativeAvailable ? (
            <Button variant="secondary" className="h-auto min-h-11 whitespace-normal py-2" onClick={() => void shareNatively()} aria-disabled={sharing} aria-busy={sharing}>
              <Share2Icon aria-hidden />{t("post.shareActions.nativeShare")}
            </Button>
          ) : null}
          {shareFailed ? <p role="alert" className="text-sm text-destructive">{t("post.shareActions.shareFailed")}</p> : null}
          {share && isShareable(post) ? (
            <Button variant="secondary" onClick={() => { setOpen(false); share(post) }}>
              <Repeat2Icon aria-hidden />{t("post.shareActions.quote")}
            </Button>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  )
}

/**
 * Une publication se partage si elle est lisible par tous les membres et publiée
 * (règle du moteur) ; un partage dont l'original n'est plus lisible ne se
 * repartage pas (partager un partage cite l'original).
 */
export function isShareable(post: PostView): boolean {
  return post.audience === "public" && post.moderation === "published" && (post.share === null || post.share.available)
}

/** Ce que l'on cite en partageant : l'original d'un partage, sinon la publication elle-même. */
export function sharedPreviewOf(post: PostView): SharedPostView {
  if (post.share?.available) return post.share
  return {
    available: true,
    postId: post.id,
    author: { kind: post.author.kind, handle: post.author.handle || null, displayName: post.author.displayName || null },
    body: post.body,
    media: post.media,
    publishedAt: post.createdAt,
  }
}

/**
 * L'original d'un partage cité, dans la carte qui le cite : son auteur, son
 * texte, ses médias. Retiré ou hors de portée du lecteur, il le dit et ne dit
 * que cela.
 */
export function SharedPostEmbed(props: { share: SharedPostView; now: number; className?: string; interactiveMedia?: boolean }) {
  const { t, locale } = useDiasporaGaT()
  const { routes, Link } = useRouting()
  const pagesOpen = useFeatureGate().isOpen("pages")
  const { share } = props
  if (!share.available) {
    return (
      <p className={cn("rounded-md border border-border bg-muted px-3 py-2.5 text-[13px] text-muted-foreground", props.className)}>
        {t("post.sharedUnavailable")}
      </p>
    )
  }
  const author = share.author
  // ADR-0041 : pages fermées, le nom d'une page citée reste, sans lien.
  const authorHref = author.handle ? (author.kind === "page" ? (pagesOpen ? routes.page(author.handle) : null) : routes.profile(author.handle)) : null
  return (
    // Une figure, pas une région : un fil de partages ne multiplie pas les repères de navigation.
    <figure aria-label={t("post.sharedLabel")} className={cn("rounded-md border border-border px-3 py-2.5", props.className)}>
      <p className="flex flex-wrap items-center gap-x-2 text-[13px] text-muted-foreground">
        {authorHref ? (
          <Link href={authorHref} className="font-semibold text-foreground hover:underline focus-visible:shadow-focus">
            {author.displayName ?? t("bell.someone")}
          </Link>
        ) : (
          <span className="font-semibold text-foreground">{author.displayName ?? t("bell.someone")}</span>
        )}
        <Link href={routes.post(share.postId)} className="rounded-sm hover:underline focus-visible:shadow-focus">
          <time dateTime={new Date(share.publishedAt).toISOString()} title={formatDate(share.publishedAt, locale)}>
            {formatRelative(share.publishedAt, props.now, locale)}
          </time>
        </Link>
      </p>
      {share.body.length > 0 ? (
        <p className="mt-1 line-clamp-6 whitespace-pre-line break-words text-[14px] leading-relaxed text-foreground">
          <RichText text={share.body} />
        </p>
      ) : null}
      <PostMediaGrid media={share.media} className="mt-2" interactive={props.interactiveMedia} />
    </figure>
  )
}

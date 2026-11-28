"use client"

import { api } from "@convex/_generated/api"
import { Button } from "@diaspora-ga/features"
import { useDataSource, useSession } from "@diaspora-ga/features/data"
import { useDiasporaGaT } from "@diaspora-ga/features/i18n/client"
import NextLink from "next/link"
import { useEffect, useState, type ReactNode } from "react"

import { useLoaded } from "@/data/engine-kit"
import { clearGuestTime, GUEST_READING_MS, readGuestTime, saveGuestTime } from "@/lib/guest-time"
import { rememberReturnPath } from "@/lib/return-path"
import { routes } from "@/lib/routes"
import { GateSkeleton } from "./gate"
import { Wordmark } from "./wordmark"

type Screen = "feed" | "profile" | "page" | "post"

export function GuestEntry({ screen, target, children }: { screen: Screen; target?: string; children: ReactNode }) {
  const source = useDataSource()
  const session = useSession()
  const admitted = session.status === "ready" && session.data.status === "signed_in"
  useEffect(() => { if (admitted) clearGuestTime() }, [admitted])
  if (source.kind !== "engine" || admitted) return children
  if (session.status !== "ready") return session.status === "error" ? children : <GateSkeleton />
  return <GuestReader key={JSON.stringify([screen, target])} screen={screen} target={target} />
}

function useGuestClock(readable: boolean, setExpired: (value: boolean) => void) {
  useEffect(() => {
    if (!readable) return
    let start: number | null = null
    let elapsed = readGuestTime()
    let timeout: ReturnType<typeof setTimeout> | undefined
    const pause = () => {
      clearTimeout(timeout)
      if (start === null) return
      elapsed = Math.min(GUEST_READING_MS, elapsed + Math.max(0, performance.now() - start))
      start = null
      saveGuestTime(elapsed)
    }
    const update = () => {
      pause()
      elapsed = readGuestTime()
      if (elapsed >= GUEST_READING_MS) { setExpired(true); return }
      if (document.visibilityState !== "visible") return
      start = performance.now()
      timeout = setTimeout(() => { saveGuestTime(GUEST_READING_MS); setExpired(true) }, GUEST_READING_MS - elapsed)
    }
    update()
    document.addEventListener("visibilitychange", update)
    window.addEventListener("pagehide", pause)
    window.addEventListener("pageshow", update)
    return () => {
      pause()
      document.removeEventListener("visibilitychange", update)
      window.removeEventListener("pagehide", pause)
      window.removeEventListener("pageshow", update)
    }
  }, [readable, setExpired])
}

function GuestReader({ screen, target }: { screen: Screen; target?: string }) {
  const { t, locale } = useDiasporaGaT()
  const [expired, setExpired] = useState(() => readGuestTime() >= GUEST_READING_MS)
  const [cursor, setCursor] = useState<string>()
  const result = useLoaded(api.modules.diaspora.guestReading.read, expired ? "skip" : { screen, ...(target ? { target } : {}), ...(cursor ? { cursor } : {}) })
  const view = result.state === "ready" ? result.value : null
  useGuestClock(!expired && view !== null, setExpired)
  const remember = () => rememberReturnPath(window.location.pathname === "/" ? { pathname: routes.feed(), search: "", hash: "" } : window.location)
  const entry = <Button asChild><NextLink onClick={remember} href={routes.enter()}>{t("guest.signIn")}</NextLink></Button>
  const profileIntent = (hash: string) => rememberReturnPath({ pathname: window.location.pathname, search: "", hash })
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-4 bg-background px-4 pb-10">
      <header className="sticky top-0 z-10 flex min-h-14 items-center justify-between gap-3 bg-background">
        <NextLink href={routes.feed()} aria-label={t("guest.feed")}><Wordmark className="w-32" /></NextLink>
        {!expired && entry}
      </header>
      {expired ? (
        <section className="grid gap-4 rounded-xl bg-card p-5" aria-live="polite">
          <h1 className="text-xl font-semibold">{t("guest.expired")}</h1>
          <div className="flex flex-wrap gap-2">{entry}<Button asChild variant="secondary"><NextLink onClick={remember} href={routes.register()}>{t("guest.join")}</NextLink></Button></div>
        </section>
      ) : result.state === "loading" ? <GateSkeleton /> : result.state === "error" ? <p role="alert">{t("guest.error")}</p> : !view ? <h1>{t("guest.unavailable")}</h1> : (
        <>
          {view.heading ? <section className="grid gap-2 rounded-xl bg-card p-5">
            {view.heading.image && <img alt="" src={view.heading.image} className="size-16 rounded-full object-cover" />}
            <h1 className="text-2xl font-semibold">{view.heading.name}</h1><p className="text-muted-foreground">@{view.heading.handle}</p>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="secondary"><NextLink href={routes.enter()} onClick={() => profileIntent("#suivre")}>{t("guest.follow")}</NextLink></Button>
              {view.heading.kind === "person" && <>
                <Button asChild variant="secondary"><NextLink href={routes.enter()} onClick={() => profileIntent("#relation")}>{t("relation.connect")}</NextLink></Button>
                <Button asChild variant="secondary"><NextLink href={routes.enter()} onClick={() => profileIntent("#ecrire")}>{t("contact.write")}</NextLink></Button>
              </>}
            </div>
          </section> : <h1 className="text-xl font-semibold">{t(screen === "post" ? "postScreen.title" : "guest.feed")}</h1>}
          {screen === "feed" && <GuestSearch />}
          {view.posts.map(post => <article key={post.id} className="grid gap-3 rounded-xl bg-card p-4">
            <div className="flex items-center gap-3">
              {post.author.image && <img alt="" src={post.author.image} className="size-10 rounded-full object-cover" />}
              <div><NextLink className="font-semibold" href={post.author.kind === "page" ? routes.page(post.author.handle) : routes.profile(post.author.handle)}>{post.author.name}</NextLink>
              <NextLink aria-label={t("guest.more")} className="block text-sm text-muted-foreground" href={routes.post(post.id)}>{new Date(post.time).toLocaleDateString(locale)}</NextLink></div>
            </div>
            {post.body && <p className="whitespace-pre-wrap break-words">{post.body}</p>}
            {post.media.map((item, i) => item.kind === "image" ? <img key={i} alt={item.alt || t("guest.alt")} src={item.url} loading="lazy" className="max-h-96 rounded-lg object-contain" />
              : <video key={i} controls playsInline preload="none" src={item.url} className="max-h-96 w-full rounded-lg" />)}
            <NextLink href={routes.enter()} onClick={() => rememberReturnPath({ pathname: routes.post(post.id), search: "", hash: "#commenter" })} className="justify-self-start text-sm font-medium text-primary">{t("guest.comment")}</NextLink>
          </article>)}
          {!view.posts.length && !view.next && <p className="text-muted-foreground">{t("guest.empty")}</p>}
          {view.next && <Button variant="secondary" onClick={() => { setCursor(view.next ?? undefined); window.scrollTo(0, 0) }}>{t("guest.next")}</Button>}
        </>
      )}
    </main>
  )
}

function GuestSearch() {
  const { t } = useDiasporaGaT()
  const [text, setText] = useState("")
  const [term, setTerm] = useState("")
  useEffect(() => {
    const timer = setTimeout(() => setTerm(text.trim()), 250)
    return () => clearTimeout(timer)
  }, [text])
  const result = useLoaded(api.modules.diaspora.guestReading.search, term.length >= 2 ? { term } : "skip")
  return <section role="search" className="grid gap-2">
    <input type="search" value={text} maxLength={80} onChange={event => setText(event.target.value)}
      aria-label={t("guest.search")} placeholder={t("guest.search")} className="min-h-11 rounded-xl bg-muted px-4 text-foreground" />
    {term.length >= 2 && term === text.trim() && result.state === "ready" && (result.value.length
      ? <ul className="grid gap-1">{result.value.map(person => <li key={person.kind + person.handle}>
        <NextLink className="flex min-h-11 items-center gap-2 rounded-lg bg-card px-3" href={person.kind === "page" ? routes.page(person.handle) : routes.profile(person.handle)}>
          {person.image && <img alt="" src={person.image} className="size-8 rounded-full object-cover" />}
          <span>{person.name}</span><span className="text-sm text-muted-foreground">@{person.handle}</span>
        </NextLink>
      </li>)}</ul> : <p className="text-sm text-muted-foreground">{t("guest.noResults")}</p>)}
  </section>
}

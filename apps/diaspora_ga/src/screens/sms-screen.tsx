"use client"

import { api, type Id } from "@antsia/api/engine"
import { useAuthenticatedConvexQuery, useAuthenticatedPaginatedQuery } from "@antsia/api/hooks"
import { Button } from "@antsia/ui"
import type { MembershipView } from "@diaspora-ga/features/data"
import { useDiasporaGaT } from "@diaspora-ga/features/i18n/client"
import { useMutation } from "convex/react"
import type { FunctionReturnType } from "convex/server"
import { ArrowLeft, MessageSquarePlus, Send } from "lucide-react"
import Link from "next/link"
import { Component, type FormEvent, type ReactNode, useEffect, useRef, useState } from "react"

import { AppShell } from "@/components/app-shell"
import { Gate, GateSkeleton } from "@/components/gate"
import { useIcomState } from "@/components/icom"
import { routes } from "@/lib/routes"

const sms = api.modules.diaspora.sms
type SmsThread = FunctionReturnType<typeof sms.inbox>["threads"][number]
type Invitation = FunctionReturnType<typeof sms.createPairing>
const statusLabels = {
  received: "sms.status.received", queued: "sms.status.queued", accepted: "sms.status.accepted",
  sent: "sms.status.sent", delivered: "sms.status.delivered", failed: "sms.status.failed",
} as const
const surface = "rounded-2xl bg-muted px-4 py-3"
const input = "min-h-11 w-full rounded-xl bg-background px-3 py-2 focus-visible:outline-2 focus-visible:outline-primary"

export function SmsScreen() {
  return <Gate require="member">{(session) => session.membership
    ? <AppShell membership={session.membership}><MemberSms key={session.membership.personId} membership={session.membership} /></AppShell>
    : null}</Gate>
}

function MemberSms({ membership }: { membership: MembershipView }) {
  const { t } = useDiasporaGaT()
  const icom = useIcomState()
  if (icom.status === "loading") return <GateSkeleton />
  if (icom.status !== "on" || !membership.canPublish || icom.network.personId !== membership.personId) {
    return <section><h1 className="text-2xl font-bold">{t("sms.title")}</h1><p role="status">{t("sms.unavailable")}</p></section>
  }
  return <SmsReadBoundary><SmsInbox personId={membership.personId} /></SmsReadBoundary>
}

function SmsInbox({ personId }: { personId: string }) {
  const { t } = useDiasporaGaT()
  const inbox = useAuthenticatedConvexQuery(sms.inbox, {})
  const [selected, setSelected] = useState<Id<"diasporaSmsThreads"> | null>(null)
  const [inviting, setInviting] = useState(false)
  if (inbox.isError) return <div role="alert"><p>{t("sms.failed")}</p><Button variant="ghost" onClick={() => void inbox.refetch()}>{t("sms.retry")}</Button></div>
  if (!inbox.data || inbox.data.personId !== personId) return <p role="status">{t("sms.loading")}</p>
  const { enabled, threads } = inbox.data
  const thread = threads.find((item) => item.id === selected)
  if (thread) return <SmsConversation key={thread.id} thread={thread} enabled={enabled} onBack={() => setSelected(null)} />
  return <section className="mx-auto grid w-full max-w-2xl gap-4">
    <Link href={routes.messages()} className="inline-flex min-h-11 w-fit items-center gap-2 rounded-md text-sm font-medium"><ArrowLeft size={18} />{t("sms.messages")}</Link>
    <header className="flex flex-wrap items-center justify-between gap-3">
      <h1 className="font-display text-2xl font-bold">{t("sms.title")}</h1>
      {enabled && !inviting ? <Button onClick={() => setInviting(true)}><MessageSquarePlus size={18} />{t("sms.invite")}</Button> : null}
    </header>
    {!enabled ? <p className={surface} role="status">{t("sms.unavailable")} {threads.length ? t("sms.unavailableHistory") : null}</p> : null}
    {enabled && inviting ? <PairingForm onClose={() => setInviting(false)} /> : null}
    {threads.length > 0 ? <ul className="grid gap-2" aria-label={t("sms.contacts")}>
      {threads.map((item) => <li key={item.id}><button type="button" className={surface + " flex min-h-14 w-full items-center justify-between gap-3 text-start"} onClick={() => setSelected(item.id)}>
        <span className="break-all font-medium">{item.label}</span>
        <small>{t(item.active ? "sms.active" : "sms.inactive")}</small>
      </button></li>)}
    </ul> : enabled && !inviting ? <p className="text-sm text-muted-foreground">{t("sms.empty")}</p> : null}
  </section>
}

function PairingForm({ onClose }: { onClose: () => void }) {
  const { t, locale } = useDiasporaGaT()
  const create = useMutation(sms.createPairing)
  const [name, setName] = useState("")
  const [pairing, setPairing] = useState<Invitation | null>(null)
  const [expired, setExpired] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<"sms.copied" | "sms.failed" | "sms.shareFailed" | null>(null)
  const lock = useRef(false)

  useEffect(() => {
    if (!pairing) return
    const timer = window.setTimeout(() => setExpired(true), Math.max(0, pairing.expiresAt - Date.now()))
    return () => window.clearTimeout(timer)
  }, [pairing])

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (lock.current || !name.trim()) return
    lock.current = true
    setBusy(true)
    setNotice(null)
    try {
      const result = await create({ label: name.trim() })
      setPairing(result)
      setExpired(result.expiresAt <= Date.now())
    } catch {
      setNotice("sms.failed")
    } finally {
      lock.current = false
      setBusy(false)
    }
  }

  const expiry = pairing ? new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "short" }).format(pairing.expiresAt) : ""
  const command = pairing ? "JOIN " + pairing.code : ""
  const invitation = pairing ? t("sms.invitation", { command, relay: pairing.relay, expiry }) : ""
  async function share() {
    if (!pairing || Date.now() >= pairing.expiresAt) { setExpired(true); return }
    setNotice(null)
    try {
      if (typeof navigator.share === "function") await navigator.share({ text: invitation })
      else { await navigator.clipboard.writeText(invitation); setNotice("sms.copied") }
    } catch (failure) {
      if (!(failure instanceof Error && failure.name === "AbortError")) setNotice("sms.shareFailed")
    }
  }

  return <section className={surface + " grid gap-3"} aria-label={t("sms.invite")}>
    {!pairing || expired ? <form onSubmit={submit} className="grid gap-3">
      {expired ? <p role="status">{t("sms.expired")}</p> : null}
      <label className="grid gap-1 text-sm font-medium">{t("sms.label")}
        <input value={name} maxLength={60} required onChange={(event) => setName(event.target.value)} className={input} autoComplete="off" />
      </label>
      <Button type="submit" disabled={busy || !name.trim()}>{t("sms.pair")}</Button>
    </form> : <>
      <p>{t("sms.instruction")}</p>
      <dl className="grid gap-2">
        <div><dt className="text-sm text-muted-foreground">{t("sms.code")}</dt><dd className="select-all font-mono text-lg">{command}</dd></div>
        <div><dt className="text-sm text-muted-foreground">{t("sms.relay")}</dt><dd className="select-all">{pairing.relay}</dd></div>
      </dl>
      <p className="text-sm">{t("sms.expires", { expiry })}</p>
      <Button onClick={() => void share()}>{t(typeof navigator.share === "function" ? "sms.share" : "sms.copy")}</Button>
      {notice === "sms.shareFailed" ? <p className="select-all">{invitation}</p> : null}
    </>}
    {notice ? <p role={notice === "sms.copied" ? "status" : "alert"}>{t(notice)}</p> : null}
    <Button variant="ghost" onClick={onClose}>{t("sms.close")}</Button>
  </section>
}

function SmsConversation({ thread, enabled, onBack }: { thread: SmsThread; enabled: boolean; onBack: () => void }) {
  const { t } = useDiasporaGaT()
  const send = useMutation(sms.send)
  const disconnect = useMutation(sms.disconnect)
  const [body, setBody] = useState("")
  const [pending, setPending] = useState<"send" | "close" | null>(null)
  const [failed, setFailed] = useState(false)
  const lock = useRef(false)
  const draft = useRef<{ body: string; id: string } | null>(null)
  const field = useRef<HTMLTextAreaElement>(null)
  const writable = enabled && thread.active

  async function submit(event: FormEvent) {
    event.preventDefault()
    const text = body.trim()
    if (!writable || lock.current || !text || text.length > 480) return
    if (!draft.current || draft.current.body !== text) draft.current = { body: text, id: crypto.randomUUID() }
    lock.current = true
    setPending("send")
    setFailed(false)
    try {
      await send({ threadId: thread.id, body: text, requestId: draft.current.id })
      draft.current = null
      setBody("")
      field.current?.focus()
    } catch {
      setFailed(true)
    } finally {
      lock.current = false
      setPending(null)
    }
  }

  async function close() {
    if (lock.current) return
    lock.current = true
    setPending("close")
    setFailed(false)
    try { await disconnect({ threadId: thread.id }) }
    catch { setFailed(true) }
    finally { lock.current = false; setPending(null) }
  }

  return <section className="mx-auto flex w-full max-w-2xl flex-col gap-3">
    <button type="button" onClick={onBack} className="inline-flex min-h-11 w-fit items-center gap-2 text-sm font-medium"><ArrowLeft size={18} />{t("sms.back")}</button>
    <header><p className="text-sm text-muted-foreground">{t("sms.title")}</p><h1 className="break-words font-display text-2xl font-bold">{thread.label}</h1></header>
    <SmsReadBoundary><History threadId={thread.id} /></SmsReadBoundary>
    {writable ? <form onSubmit={submit} className={surface + " flex items-end gap-2"}>
      <textarea ref={field} value={body} maxLength={480} rows={2} readOnly={pending === "send"} aria-label={t("sms.newMessage")} placeholder={t("sms.newMessage")}
        onChange={(event) => setBody(event.target.value)} className="min-h-11 min-w-0 flex-1 resize-y rounded-lg bg-transparent px-2 py-2 focus-visible:outline-2 focus-visible:outline-primary" />
      <Button type="submit" disabled={pending !== null || !body.trim()} aria-label={t("sms.send")}><Send size={18} /></Button>
    </form> : <p role="status" className={surface}>{t(thread.active ? "sms.unavailable" : "sms.readOnly")}</p>}
    {pending === "send" ? <p role="status" className="text-sm">{t("sms.sending")}</p> : null}
    {failed ? <p role="alert">{t("sms.failed")}</p> : null}
    {thread.active ? <details className="rounded-lg px-2 text-sm">
      <summary className="cursor-pointer py-2 font-medium">{t("sms.manage")}</summary>
      <p>{t("sms.stop")}</p>
      <p className="my-2 text-muted-foreground">{t("sms.disconnectHint")}</p>
      <Button variant="ghost" disabled={pending !== null} onClick={() => void close()}>{t("sms.disconnect")}</Button>
    </details> : null}
  </section>
}

function History({ threadId }: { threadId: Id<"diasporaSmsThreads"> }) {
  const { t, locale } = useDiasporaGaT()
  const history = useAuthenticatedPaginatedQuery(sms.history, { threadId }, { initialNumItems: 30 })
  const scroll = useRef<HTMLDivElement>(null)
  const nearEnd = useRef(true)
  const newest = history.results[0]?.id
  useEffect(() => {
    if (nearEnd.current && scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight
  }, [newest])
  const dateFormat = new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "short" })
  return <div ref={scroll} onScroll={(event) => {
    const pane = event.currentTarget
    nearEnd.current = pane.scrollHeight - pane.scrollTop - pane.clientHeight < 48
  }} className="max-h-[50dvh] min-h-24 overflow-y-auto overscroll-contain px-1">
    {history.status === "LoadingFirstPage" ? <p role="status">{t("sms.loading")}</p> : null}
    {history.status === "CanLoadMore" || history.status === "LoadingMore" ? <Button variant="ghost" disabled={history.isLoading} onClick={() => history.loadMore(30)}>{t("sms.older")}</Button> : null}
    {history.status === "Exhausted" && !newest ? <p className="py-3 text-muted-foreground">{t("sms.emptyThread")}</p> : null}
    <ol className="flex flex-col gap-2">
      {history.results.slice().reverse().map((message) => <li key={message.id} className={"grid max-w-[85%] gap-1 rounded-2xl px-3 py-2 " + (message.incoming ? "self-start bg-muted" : "self-end bg-primary/15")}>
        <p className="whitespace-pre-wrap break-words">{message.body}</p>
        <small className="text-muted-foreground"><time dateTime={new Date(message.createdAt).toISOString()}>{dateFormat.format(message.createdAt)}</time> · {t(statusLabels[message.status])}</small>
      </li>)}
    </ol>
  </div>
}

function SmsReadBoundary({ children }: { children: ReactNode }) {
  const { t } = useDiasporaGaT()
  return <ReadErrorBoundary message={t("sms.failed")} retry={t("sms.retry")}>{children}</ReadErrorBoundary>
}

class ReadErrorBoundary extends Component<{ children: ReactNode; message: string; retry: string }, { failed: boolean }> {
  override state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  override render() {
    if (this.state.failed) return <div role="alert"><p>{this.props.message}</p><Button variant="ghost" onClick={() => this.setState({ failed: false })}>{this.props.retry}</Button></div>
    return this.props.children
  }
}

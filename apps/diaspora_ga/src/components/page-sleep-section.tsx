"use client"

/**
 * AS-11a — le SOMMEIL d'une page, du côté de son équipe. PROPRIÉTAIRE : chantier
 * « gestion des pages ».
 *
 *   · `PageSleepSection` : « Mettre la page en sommeil », dans l'onglet identité de la
 *     gestion, pour un administrateur VIVANT d'une page de nature créable par un membre ;
 *     la confirmation dit chaque effet en clair, l'échéance comprise ;
 *   · `MySleepingPages` : la section « En sommeil » de « Mes pages », l'échéance et
 *     « Réactiver » (ou le délai passé, et l'adresse de contact) ;
 *   · `ManagedPageUnavailable` : la gestion d'une page endormie ouverte par son équipe dit
 *     « en sommeil » au lieu d'un « introuvable » générique ; pour tout autre lecteur, le même
 *     refus indistinct.
 *
 * Présentation seulement : le fournisseur (moteur ou démonstration) rejuge chaque geste, et
 * `canWake` vient du serveur. Une lecture du serveur ne bascule pas d'elle-même à l'échéance :
 * l'écran cesse de proposer « Réactiver » dès qu'elle est passée (`useSleepState`). Les délais
 * des objets de la page continuent de courir pendant le sommeil : la confirmation le dit.
 */
import { Avatar, Button, Card, EmptyState, Skeleton, TrustBadge, formatDate } from "@diaspora-ga/features"
import {
  isMemberPageKind,
  PAGE_SLEEP_DAYS,
  PAGE_SLEEP_MS,
  type ActionErrorCode,
  type ManagedPageDetailView,
  type PageManagement,
  type SleepingPageState,
  type SleepingPageView,
} from "@diaspora-ga/features/data"
import { useDiasporaGaT } from "@diaspora-ga/features/i18n/client"
import { AlarmClockIcon, MailIcon, MoonIcon, SunIcon, UserRoundXIcon } from "lucide-react"
import NextLink from "next/link"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import { routes } from "@/lib/routes"

import { ConfirmSheet, ErrorNotice, RoleChip } from "./page-admin-parts"

// ═══════════════════════════════════════════════════════════════
// Mettre la page en sommeil
// ═══════════════════════════════════════════════════════════════

/**
 * Le geste n'est proposé qu'à un administrateur vivant d'une page qu'un membre peut créer
 * (jamais une institution), et seulement quand le fournisseur le sert.
 */
export function canOfferPageSleep(management: PageManagement, page: ManagedPageDetailView): boolean {
  return management.putToSleep !== undefined && page.myRole === "admin" && isMemberPageKind(page.ownerKind)
}

/** Les effets dits à la confirmation, dans l'ordre de lecture ; `silent` en gras. */
const CONFIRM_EFFECTS = ["pageSleep.confirm.hidden", "pageSleep.confirm.deadlines", "pageSleep.confirm.live", "pageSleep.confirm.kept"] as const

export function PageSleepSection(props: { readonly management: PageManagement; readonly page: ManagedPageDetailView }) {
  const { t, locale } = useDiasporaGaT()
  const { page } = props
  /** L'échéance annoncée, figée à l'ouverture de la confirmation ; le serveur rend la sienne. */
  const [announcedEnd, setAnnouncedEnd] = useState<number | null>(null)
  const [refusal, setRefusal] = useState<ActionErrorCode | null>(null)
  const putToSleep = props.management.putToSleep
  if (!putToSleep) return null
  const confirm = async () => {
    setRefusal(null)
    const result = await putToSleep(page.id)
    if (!result.ok) {
      setRefusal(result.code)
      return false
    }
    toast.success(t("pageSleep.done", { name: page.name, date: formatDate(result.value.sleepEndsAt, locale) }))
    return true
  }
  return (
    <section aria-labelledby="mettre-en-sommeil" className="flex flex-col items-start gap-3">
      <h2 id="mettre-en-sommeil" className="flex items-center gap-2 font-display text-xl font-bold">
        <MoonIcon aria-hidden className="size-5 shrink-0" />
        {t("pageSleep.section.title")}
      </h2>
      <p className="text-[15px] leading-relaxed text-muted-foreground">{t("pageSleep.section.lead", { days: PAGE_SLEEP_DAYS })}</p>
      <Button
        variant="destructive"
        className="h-auto min-h-11 max-w-full whitespace-normal"
        aria-label={t("pageSleep.section.actionLabel", { name: page.name })}
        onClick={() => {
          setRefusal(null)
          setAnnouncedEnd(Date.now() + PAGE_SLEEP_MS)
        }}
      >
        <MoonIcon aria-hidden />
        {t("pageSleep.section.action")}
      </Button>
      <ConfirmSheet
        open={announcedEnd !== null}
        onOpenChange={(open) => { if (!open) setAnnouncedEnd(null) }}
        title={t("pageSleep.confirm.title", { name: page.name })}
        body={t("pageSleep.confirm.body")}
        confirm={t("pageSleep.confirm.action")}
        onConfirm={confirm}
      >
        <ul className="flex list-disc flex-col gap-2 pl-5 text-[15px] leading-relaxed">
          {CONFIRM_EFFECTS.map((effect) => <li key={effect}>{t(effect)}</li>)}
          <li className="font-semibold">{t("pageSleep.confirm.silent")}</li>
          <li>{t("pageSleep.confirm.reversible", { date: formatDate(announcedEnd ?? Date.now() + PAGE_SLEEP_MS, locale) })}</li>
          <li>{t("pageSleep.confirm.after")}</li>
        </ul>
        {refusal ? <ErrorNotice code={refusal} className="mt-4 text-sm text-destructive" /> : null}
      </ConfirmSheet>
    </section>
  )
}

// ═══════════════════════════════════════════════════════════════
// L'échéance, vue de l'écran
// ═══════════════════════════════════════════════════════════════

/** Le plus long délai qu'un minuteur du navigateur tient (au-delà, il partirait aussitôt). */
const MAX_TIMER_MS = 2_147_483_647

/**
 * L'état d'une page en sommeil À L'ÉCRAN : celui du serveur, mais échu dès que l'heure passe
 * `sleepEndsAt` (la lecture du serveur ne bascule pas d'elle-même). `canWake` suit : jamais
 * « Réactiver » sur une échéance passée, le serveur le refuserait (`page_sleep_expired`).
 */
function useSleepState(page: SleepingPageView): { readonly state: SleepingPageState; readonly canWake: boolean } {
  const [now, setNow] = useState(() => Date.now())
  const remaining = page.state === "asleep" ? page.sleepEndsAt - now : 0
  useEffect(() => {
    if (remaining <= 0) return
    const timer = setTimeout(() => setNow(Date.now()), Math.min(remaining, MAX_TIMER_MS))
    return () => clearTimeout(timer)
  }, [remaining])
  const state: SleepingPageState = page.state === "expired" || remaining <= 0 ? "expired" : "asleep"
  return { state, canWake: page.canWake && state === "asleep" }
}

// ═══════════════════════════════════════════════════════════════
// Réactiver
// ═══════════════════════════════════════════════════════════════

/** « Réactiver » : un geste réversible, sans confirmation ; double clic sans effet, refus dit tel quel. */
function WakeButton(props: { readonly management: PageManagement; readonly page: SleepingPageView; readonly filled?: boolean }) {
  const { t } = useDiasporaGaT()
  const [busy, setBusy] = useState(false)
  const [refusal, setRefusal] = useState<ActionErrorCode | null>(null)
  const running = useRef(false)
  const wake = props.management.wake
  if (!wake) return null
  const run = async () => {
    if (running.current) return
    running.current = true
    setBusy(true)
    setRefusal(null)
    try {
      const result = await wake(props.page.id)
      if (!result.ok) setRefusal(result.code)
      else toast.success(t("pageSleep.myPages.woken", { name: props.page.name }))
    } finally {
      running.current = false
      setBusy(false)
    }
  }
  return (
    <div className="flex min-w-0 flex-col items-start gap-2">
      <Button
        variant={props.filled ? "primary" : "outline"}
        className="h-auto min-h-11 max-w-full whitespace-normal"
        disabled={busy}
        aria-busy={busy}
        aria-label={t("pageSleep.myPages.wakeLabel", { name: props.page.name })}
        onClick={() => void run()}
      >
        <SunIcon aria-hidden />
        {busy ? t("common.pleaseWait") : t("pageSleep.myPages.wake")}
      </Button>
      {refusal ? <ErrorNotice code={refusal} /> : null}
    </div>
  )
}

/** Échue, la page ne se réactive plus d'ici : la sortie passe par l'équipe de la plateforme, par la route de contact du site. */
function PlatformContactLink(props: { readonly page: SleepingPageView }) {
  const { t } = useDiasporaGaT()
  return (
    <Button asChild variant="outline" className="h-auto min-h-11 max-w-full whitespace-normal">
      <NextLink href={routes.contact()} aria-label={t("pageSleep.expired.contactLabel", { name: props.page.name })}>
        <MailIcon aria-hidden />
        {t("pageSleep.expired.contact")}
      </NextLink>
    </Button>
  )
}

/** L'échéance, ou le délai passé : une icône ET des mots, jamais la seule couleur. */
function SleepDeadline(props: { readonly page: SleepingPageView; readonly state: SleepingPageState }) {
  const { t, locale } = useDiasporaGaT()
  const date = formatDate(props.page.sleepEndsAt, locale)
  return (
    <p className="flex min-w-0 items-start gap-1.5 break-words text-[13px] text-muted-foreground">
      <AlarmClockIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
      <span className="min-w-0">{props.state === "expired" ? t("pageSleep.myPages.expired", { date }) : t("pageSleep.myPages.until", { date })}</span>
    </p>
  )
}

/** « Mes pages », section « En sommeil » : montée seulement quand le fournisseur la sert ; vide, elle se tait. */
export function MySleepingPages(props: { readonly management: PageManagement }) {
  return props.management.useMySleepingPages ? <SleepingPagesList management={props.management} /> : null
}

function SleepingPagesList(props: { readonly management: PageManagement }) {
  const { t } = useDiasporaGaT()
  const pages = props.management.useMySleepingPages?.() ?? null
  if (pages === null || pages.status === "loading" || (pages.status === "ready" && pages.data.length === 0)) return null
  return (
    <section aria-labelledby="mes-pages-en-sommeil" className="flex flex-col gap-3">
      <div>
        <h2 id="mes-pages-en-sommeil" className="flex items-center gap-2 font-display text-xl font-bold">
          <MoonIcon aria-hidden className="size-5 shrink-0" />
          {t("pageSleep.myPages.title")}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("pageSleep.myPages.lead")}</p>
      </div>
      {pages.status === "error" ? (
        <ErrorNotice code={pages.code} />
      ) : (
        <ul className="flex flex-col gap-2">
          {pages.data.map((page) => <SleepingPageItem key={page.id} management={props.management} page={page} />)}
        </ul>
      )}
    </section>
  )
}

function SleepingPageItem(props: { readonly management: PageManagement; readonly page: SleepingPageView }) {
  const { t } = useDiasporaGaT()
  const { page } = props
  const { state, canWake } = useSleepState(page)
  return (
    <li>
      <Card className="flex flex-wrap items-center gap-3 p-4">
        <Avatar id={page.id} name={page.name} size="md" shape="square" />
        <div className="min-w-0 flex-1">
          {/* Aucun lien vers la fiche : elle ne se lit plus, pour personne. */}
          <p className="flex flex-wrap items-center gap-2 font-semibold">
            <span className="min-w-0 break-words">{page.name}</span>
            <TrustBadge badge={page.badge} />
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
            <RoleChip role={page.teamRole} />
            <span>{t(`pageAdmin.kind.${page.ownerKind}`)}</span>
          </div>
          <div className="mt-1">
            <SleepDeadline page={page} state={state} />
          </div>
        </div>
        {canWake ? (
          <WakeButton management={props.management} page={page} />
        ) : state === "expired" ? (
          <PlatformContactLink page={page} />
        ) : (
          <p className="text-[13px] text-muted-foreground">{t("pageSleep.myPages.adminOnly")}</p>
        )}
      </Card>
    </li>
  )
}

// ═══════════════════════════════════════════════════════════════
// La gestion d'une page endormie
// ═══════════════════════════════════════════════════════════════

function Unavailable() {
  const { t } = useDiasporaGaT()
  return <EmptyState icon={<UserRoundXIcon />} title={t("page.unavailableTitle")} description={t("page.unavailableBody")} />
}

/**
 * La page gérée ne se lit plus : si elle est l'une de MES pages en sommeil, l'écran le dit
 * (échéance, « Réactiver ») ; sinon, le refus indistinct habituel, sans rien dire de plus.
 */
export function ManagedPageUnavailable(props: { readonly management: PageManagement; readonly handle: string }) {
  return props.management.useMySleepingPages ? <SleepingLookup management={props.management} handle={props.handle} /> : <Unavailable />
}

function SleepingLookup(props: { readonly management: PageManagement; readonly handle: string }) {
  const { t } = useDiasporaGaT()
  const pages = props.management.useMySleepingPages?.() ?? null
  if (pages?.status === "loading") {
    return (
      <div role="status">
        <span className="sr-only">{t("common.pleaseWait")}</span>
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    )
  }
  const handle = props.handle.trim().replace(/^@/, "").toLowerCase()
  const page = pages?.status === "ready" ? pages.data.find((candidate) => candidate.handle === handle) ?? null : null
  return page === null ? <Unavailable /> : <SleepingPageState management={props.management} page={page} />
}

function SleepingPageState(props: { readonly management: PageManagement; readonly page: SleepingPageView }) {
  const { t, locale } = useDiasporaGaT()
  const { page } = props
  const { state, canWake } = useSleepState(page)
  const date = formatDate(page.sleepEndsAt, locale)
  return (
    <EmptyState
      icon={<MoonIcon />}
      title={t("pageSleep.manage.title")}
      description={
        <span className="flex flex-col items-center gap-2">
          <span className="break-words">
            {state === "expired" ? t("pageSleep.manage.expiredBody", { name: page.name, days: PAGE_SLEEP_DAYS }) : t("pageSleep.manage.asleepBody", { name: page.name, date })}
          </span>
          {state === "asleep" && !canWake ? <span>{t("pageSleep.myPages.adminOnly")}</span> : null}
        </span>
      }
      action={
        <div className="flex flex-wrap items-start justify-center gap-2">
          {canWake ? <WakeButton management={props.management} page={page} filled /> : null}
          {state === "expired" ? <PlatformContactLink page={page} /> : null}
          <Button asChild variant="outline" className="h-auto min-h-11 max-w-full whitespace-normal">
            <NextLink href={routes.myActivity("pages")}>{t("pageSleep.manage.myPages")}</NextLink>
          </Button>
        </div>
      }
    />
  )
}

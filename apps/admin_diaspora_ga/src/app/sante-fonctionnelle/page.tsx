// Dupliqué de ANTSIA/apps/admin_antsia_ga/src/app/sante-fonctionnelle/page.tsx @ c9006352 — adaptations : sonde et textes d'admin.diaspora.ga ; langue de la requête ; phrases des états en toutes lettres ; métadonnées.
import { engineAnswered } from "@antsia/api/health"
import { CircleCheck, TriangleAlert } from "lucide-react"
import type { Metadata } from "next"
import NextLink from "next/link"

import { getAppT } from "@/i18n/server"
import { adminHealthEnv, ENGINE_STATE_KEYS, probeAdminHealth } from "@/lib/health"
import { anchors, routes } from "@/lib/routes"

// Jamais figée au build : la santé décrit le service qui répond.
export const dynamic = "force-dynamic"

const OVERALL_KEYS = { ok: "health.overall.ok", degraded: "health.overall.degraded" } as const
const LEAD_KEYS = { ok: "health.lead.ok", degraded: "health.lead.degraded" } as const

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getAppT()
  return { title: t("health.title") }
}

/** État RÉEL de l'application (EX-03) : la page interroge le moteur, comme la route `/api/sante-fonctionnelle`. Ni adresse ni secret. */
export default async function HealthPage() {
  const [{ t }, report] = await Promise.all([getAppT(), probeAdminHealth(adminHealthEnv())])
  const { engine } = report
  const StatusIcon = report.status === "ok" ? CircleCheck : TriangleAlert
  return (
    <main id={anchors.contentId} className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-6 px-6 py-16">
      <h1 className="font-display text-3xl font-bold">{t("health.title")}</h1>
      <div role="status" data-status={report.status} className="flex items-start gap-3">
        <StatusIcon size={24} aria-hidden="true" className={report.status === "ok" ? "mt-0.5 shrink-0 text-success-ink" : "mt-0.5 shrink-0 text-destructive"} />
        <div className="min-w-0">
          <p className="text-lg font-semibold">{t(OVERALL_KEYS[report.status])}</p>
          <p className="text-muted-foreground">{t(LEAD_KEYS[report.status])}</p>
        </div>
      </div>
      <dl className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-6 gap-y-2 rounded-xl bg-card p-6 text-card-foreground [overflow-wrap:anywhere]">
        <dt className="text-muted-foreground">{t("health.application")}</dt>
        <dd className="font-mono">{report.application}</dd>
        <dt className="text-muted-foreground">{t("health.version")}</dt>
        <dd className="font-mono">{report.version}</dd>
        <dt className="text-muted-foreground">{t("health.backend")}</dt>
        <dd data-engine-state={engine.state}>{t(ENGINE_STATE_KEYS[engine.state])}</dd>
        <dt className="text-muted-foreground">{t("health.engineVersion")}</dt>
        <dd className={engine.version ? "font-mono" : undefined}>{engine.version ?? t(engineAnswered(engine) ? "health.undeclared" : "health.unknown")}</dd>
        <dt className="text-muted-foreground">{t("health.serverTime")}</dt>
        <dd>{engine.serverTime ? <time className="font-mono" dateTime={engine.serverTime}>{engine.serverTime}</time> : t("health.unknown")}</dd>
        <dt className="text-muted-foreground">{t("health.latency")}</dt>
        <dd>{engine.latencyMs === null ? t("health.notMeasured") : t("health.latencyValue", { latency: engine.latencyMs })}</dd>
      </dl>
      <NextLink className="inline-flex min-h-11 items-center self-start rounded-md text-primary underline underline-offset-4 focus-visible:shadow-focus" href={routes.dashboard()}>
        {t("health.backHome")}
      </NextLink>
    </main>
  )
}

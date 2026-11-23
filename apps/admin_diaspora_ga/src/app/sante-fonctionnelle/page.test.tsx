// Dupliqué de ANTSIA/apps/admin_antsia_ga/src/app/sante-fonctionnelle/page.test.tsx @ c9006352 — adaptations : sonde d'admin.diaspora.ga, phrases des états réelles (`ENGINE_STATE_KEYS`), traduction asynchrone, cas réduits aux états qui changent l'écran.
import type { HealthProbeReport } from "@antsia/api/health"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

const state = vi.hoisted(() => ({ report: null as HealthProbeReport | null }))

vi.mock("@/lib/health", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/health")>()),
  probeAdminHealth: async () => state.report,
  adminHealthEnv: () => ({}),
}))
vi.mock("@/i18n/server", () => ({
  getAppT: async () => ({ t: (key: string, options?: Record<string, unknown>) => (options ? `${key}:${JSON.stringify(options)}` : key) }),
}))

import HealthPage from "./page"

async function render(report: HealthProbeReport) {
  state.report = report
  return renderToStaticMarkup(await HealthPage())
}

const base = { application: "admin-diaspora-ga", version: "main-abc-production", backend: "configured" } as const

describe("page /sante-fonctionnelle d'admin.diaspora.ga — elle dit l'état réel (EX-03)", () => {
  it("moteur qui répond : « En service », état, versions, heure et temps de réponse", async () => {
    const html = await render({ ...base, status: "ok", engine: { state: "reachable", version: "main-fd58d73a1b2c-production", serverTime: "2026-11-10T09:30:00.000Z", latencyMs: 42 } })
    expect(html).toContain('data-status="ok"')
    expect(html).toContain("health.overall.ok")
    expect(html).toContain("health.lead.ok")
    expect(html).toContain('data-engine-state="reachable"')
    expect(html).toContain("health.engine.reachable")
    expect(html).toContain("admin-diaspora-ga")
    expect(html).toContain("main-fd58d73a1b2c-production")
    expect(html).toContain('health.latencyValue:{&quot;latency&quot;:42}')
  })

  it("moteur sans version déclarée : « non déclarée », jamais une valeur inventée", async () => {
    const html = await render({ ...base, status: "ok", engine: { state: "reachable", version: null, serverTime: "2026-11-10T09:30:00.000Z", latencyMs: 12 } })
    expect(html).toContain("health.undeclared")
    expect(html).not.toContain("health.unknown")
  })

  it.each(["slow", "unreachable", "timeout", "error", "missing"] as const)("moteur %s : « Service dégradé », et la phrase de cet état", async (engineState) => {
    const answered = engineState === "slow"
    const html = await render({ ...base, status: "degraded", backend: engineState === "missing" ? "missing" : "configured", engine: { state: engineState, version: null, serverTime: answered ? "2026-11-10T09:30:00.000Z" : null, latencyMs: answered ? 1_400 : null } })
    expect(html).toContain("health.overall.degraded")
    expect(html).toContain("health.lead.degraded")
    expect(html).toContain(`health.engine.${engineState}`)
    if (!answered) {
      expect(html).toContain("health.unknown")
      expect(html).toContain("health.notMeasured")
      expect(html).not.toContain("<time")
    }
  })
})

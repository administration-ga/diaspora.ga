// @vitest-environment jsdom
import { NETWORK_FEATURES } from "@antsia/social-domain/networkFeatures"
import { PILOT_DEFAULT_WINDOW_DAYS } from "@diaspora-ga/domain"
import { createAppI18n } from "@diaspora-ga/features/i18n"
import { cleanup, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { FunctionReference } from "convex/server"
import { I18nextProvider } from "react-i18next"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { APP_NAMESPACE, appResources } from "@/i18n/resources"
import { routes } from "@/lib/routes"

/**
 * CH-815 A6 — la section « Mesure » : fermée tant que la clé `pilotMetrics` l'est (aucune lecture
 * de la mesure, aucun chiffre, le chemin vers « Modules ») ; ouverte, la mesure lue avec sa portée
 * et sa période exactes, ses seuils et ses bases ; un refus de la lecture se dit comme un module
 * fermé. Agrégats fictifs.
 */
const NETWORK_ID = "network-diaspora"
const ADMIN = { personId: "person-admin", displayName: "Awa NDONG", networkId: NETWORK_ID, networkSlug: "diaspora-ga", networkName: "DIASPORA.GA", accessLogged: true } as never
const SETTINGS = "modules/networks/features:settings"
const METRICS = "modules/diaspora/pilotMetrics:pilotMetrics"

const mocks = vi.hoisted(() => ({
  open: false,
  metrics: undefined as unknown,
  metricsFailure: null as unknown,
  args: new Map<string, unknown[]>(),
}))

vi.mock("convex/react", async () => {
  const { getFunctionName: name } = await import("convex/server")
  return {
    useQuery: (reference: FunctionReference<"query">, args: unknown) => {
      const path = name(reference)
      mocks.args.set(path, [...(mocks.args.get(path) ?? []), args])
      if (path === SETTINGS) return SETTINGS_ROWS[mocks.open ? "open" : "closed"]
      if (path === "modules/diaspora/hubs:listOpenCountries") return HUBS
      if (path === METRICS) {
        if (mocks.metricsFailure) throw mocks.metricsFailure
        return mocks.metrics
      }
      throw new Error(`lecture inattendue : ${path}`)
    },
    useMutation: () => vi.fn(),
  }
})

const HUBS = [{ country: "FR" }, { country: "SN" }]
const rowsWith = (open: boolean) => NETWORK_FEATURES.map((feature) => ({ feature, enabled: feature === "pilotMetrics" && open, open: feature === "pilotMetrics" && open, requires: null, updatedAt: null }))
const SETTINGS_ROWS = { open: rowsWith(true), closed: rowsWith(false) }

const MEASURED = {
  measured: true,
  country: null,
  days: 30,
  threshold: 5,
  windowStartAt: Date.UTC(2026, 9, 20),
  windowEndAt: Date.UTC(2026, 10, 19),
  computedAt: Date.UTC(2026, 10, 19, 3, 15),
  daysMeasured: 30,
  indicators: [
    { id: "requests_sent", group: "services", kind: "count", value: { kind: "value", value: 42 } },
    {
      id: "requests_answered",
      group: "services",
      kind: "ratio",
      value: { kind: "value", value: 21 },
      denominatorId: "requests_sent",
      denominator: { kind: "value", value: 42 },
      rate: { kind: "value", percent: 50 },
    },
    { id: "first_response_hours", group: "services", kind: "duration", sample: { kind: "value", value: 21 }, median: { kind: "at_most", hours: 24 }, p75: { kind: "above", hours: 48 } },
    { id: "memberships_requested", group: "associations", kind: "count", value: { kind: "below_threshold", threshold: 5 } },
  ],
}

import { MetricsSection } from "./metrics-section"
import { NetworkAdminProvider } from "./network-admin-context"

const i18n = createAppI18n({ locale: "fr", appResources, defaultNS: APP_NAMESPACE })
const t = i18n.getFixedT("fr", APP_NAMESPACE)
/** Le texte tel que Testing Library le compare : espaces insécables de la typographie française ramenées à l'espace. */
const n = (text: string) => text.replace(/\s+/gu, " ")

function mount() {
  return render(
    <I18nextProvider i18n={i18n}>
      <NetworkAdminProvider admin={ADMIN}>
        <MetricsSection />
      </NetworkAdminProvider>
    </I18nextProvider>,
  )
}

beforeEach(() => {
  mocks.open = false
  mocks.metrics = MEASURED
  mocks.metricsFailure = null
  mocks.args.clear()
})
afterEach(() => cleanup())

describe("section Mesure — le module fermé", () => {
  it("la clé `pilotMetrics` fermée : une explication neutre et le lien vers « Modules », aucune lecture de la mesure, aucun chiffre", () => {
    mount()
    expect(mocks.args.get(SETTINGS)?.at(-1)).toEqual({ networkId: NETWORK_ID })
    expect(mocks.args.has(METRICS)).toBe(false)
    expect(screen.getByRole("heading", { level: 2, name: t("metrics.closed.title") })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: t("metrics.closed.link") })).toHaveAttribute("href", routes.modules())
    expect(screen.queryByRole("table")).toBeNull()
    expect(screen.queryByText("42")).toBeNull()
  })

  it("la clé refermée entre-temps : le refus de la lecture se dit comme un module fermé, jamais un faux chiffre", () => {
    mocks.open = true
    mocks.metricsFailure = Object.assign(new Error("refus"), { data: { code: "notFound" } })
    mount()
    expect(screen.getByRole("heading", { level: 2, name: t("metrics.closed.title") })).toBeInTheDocument()
    expect(screen.queryByRole("table")).toBeNull()
  })

  it("une panne de la lecture se dit à part et se relit", () => {
    mocks.open = true
    mocks.metricsFailure = Object.assign(new Error("panne"), { data: { code: "rateLimited" } })
    mount()
    expect(screen.getByRole("alert")).toHaveTextContent(i18n.getFixedT("fr", "errors")("rateLimited"))
    expect(screen.getByRole("button", { name: t("section.retry") })).toBeInTheDocument()
  })
})

describe("section Mesure — le module ouvert", () => {
  it("lit la mesure de tout le réseau sur la période par défaut, et la montre par tableau, seuils et bases compris", () => {
    mocks.open = true
    mount()
    expect(mocks.args.get(METRICS)?.at(-1)).toEqual({ networkId: NETWORK_ID, country: null, days: PILOT_DEFAULT_WINDOW_DAYS })
    const services = screen.getByRole("table", { name: t("metrics.group.services") })
    expect(within(within(services).getByRole("row", { name: new RegExp(t("metrics.indicator.requests_sent.label")) })).getByRole("cell")).toHaveTextContent("42")
    expect(within(services).getByRole("row", { name: new RegExp(t("metrics.indicator.requests_answered.label")) }).textContent).toContain(n(t("metrics.base.requests_sent", { value: "42" })))
    expect(within(services).getByText(n(t("metrics.hours.atMost", { hours: 24 })))).toBeInTheDocument()
    const associations = screen.getByRole("table", { name: t("metrics.group.associations") })
    expect(within(associations).getByText(n(t("metrics.value.belowThreshold", { threshold: 5 })))).toBeInTheDocument()
    expect(screen.getByText(n(t("metrics.summary.scope", { scope: t("metrics.scope.network") })))).toBeInTheDocument()
    expect(screen.getByRole("heading", { level: 2, name: t("metrics.notes.title") })).toBeInTheDocument()
  })

  it("portée et période se choisissent : la lecture part avec le pays ouvert et le nombre de jours demandés", async () => {
    mocks.open = true
    const user = userEvent.setup()
    mount()
    await user.selectOptions(screen.getByRole("combobox", { name: t("metrics.filters.country") }), "SN")
    await user.click(screen.getByRole("radio", { name: t("metrics.filters.days", { count: 7 }) }))
    expect(mocks.args.get(METRICS)?.at(-1)).toEqual({ networkId: NETWORK_ID, country: "SN", days: 7 })
  })

  it("aucun passage encore : la section le dit, sans tableau", () => {
    mocks.open = true
    mocks.metrics = { measured: false, country: null, days: 30, threshold: 5 }
    mount()
    expect(screen.getByText(t("metrics.notMeasuredTitle"))).toBeInTheDocument()
    expect(screen.queryByRole("table")).toBeNull()
  })
})

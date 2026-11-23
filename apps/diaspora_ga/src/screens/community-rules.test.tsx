// @vitest-environment jsdom
import { COMMUNITY_RULES, LEGAL_TEXTS } from "@diaspora-ga/domain"
import { DataSourceProvider, REPORT_REASON_RULES, REPORT_REASONS } from "@diaspora-ga/features/data"
import { DemoStore, createDemoDataSource } from "@diaspora-ga/features/demo"
import { getFixedT } from "@diaspora-ga/features/i18n"
import { I18nProvider } from "@diaspora-ga/features/i18n/client"
import { cleanup, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import CommunityRulesPage from "@/app/regles-communaute/page"
import { legalBodyLines } from "@/lib/legal-body"
import { COMMUNITY_RULE_ANCHORS, routes } from "@/lib/routes"

/**
 * Les règles de la communauté (MD-05), page PUBLIQUE rendue avec sa vraie coque, pour une
 * personne sans compte (démonstration sans session) : texte définitif, sans marqueur,
 * règles rédigées en entier, chaque motif de signalement nommé sous une règle et une seule,
 * une ancre par règle. Données fictives.
 */
const navigation = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }))
vi.mock("next/navigation", () => ({ useRouter: () => navigation }))
// Les métadonnées lisent la requête : hors sujet ici, seule la page est rendue.
vi.mock("@/i18n/server", () => ({ getAppT: vi.fn() }))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

/** Le texte tel que Testing Library le lit dans le DOM (espaces insécables normalisées). */
const normalized = (value: string) => value.replace(/\s+/g, " ")

/** Une personne sans compte : magasin de démonstration neuf, aucune session ouverte. */
function renderSignedOut(locale: "fr" | "en" = "fr") {
  const store = new DemoStore(null, () => Date.UTC(2026, 10, 10, 12), 0)
  return render(
    <I18nProvider locale={locale}>
      <DataSourceProvider source={createDemoDataSource(store)}>
        <CommunityRulesPage />
      </DataSourceProvider>
    </I18nProvider>,
  )
}

describe("Règles de la communauté — une page qui se lit sans compte (MD-05)", () => {
  it("se rend dans la coque publique, sans session, sans marqueur : le texte est définitif", () => {
    const t = getFixedT("fr")
    renderSignedOut()
    expect(screen.getByRole("heading", { level: 1, name: t("legal.community.title") })).toBeInTheDocument()
    // La coque publique propose d'entrer : personne n'est connecté.
    expect(screen.getAllByRole("link", { name: t("nav.enter") }).length).toBeGreaterThan(0)
    expect(LEGAL_TEXTS.community.status).toBe("final")
    expect(screen.queryByText(normalized(t("legal.provisional.heading")))).toBeNull()
    expect(screen.queryByText(normalized(t("legal.todoLawyer")))).toBeNull()
  })

  it("rend chaque règle, sous son ancre, dans l'ordre du domaine", () => {
    const t = getFixedT("fr")
    renderSignedOut()
    // Chaque règle est numérotée : son numéro, puis son titre.
    expect(screen.getAllByRole("heading", { level: 2 }).map((heading) => normalized(heading.textContent ?? ""))).toEqual(
      COMMUNITY_RULES.map((rule, index) => `${t("legal.sectionNumber", { number: index + 1 })} ${t(`legal.community.${rule}.title`)}`),
    )
    for (const rule of COMMUNITY_RULES) {
      const section = document.getElementById(COMMUNITY_RULE_ANCHORS[rule])
      expect(section, rule).not.toBeNull()
      expect(within(section!).getByRole("heading", { level: 2 })).toHaveTextContent(t(`legal.community.${rule}.title`))
      expect(routes.communityRule(rule)).toBe(`${routes.communityRules()}#${COMMUNITY_RULE_ANCHORS[rule]}`)
    }
    expect(new Set(Object.values(COMMUNITY_RULE_ANCHORS)).size).toBe(COMMUNITY_RULES.length)
  })

  it("chaque motif de signalement est nommé sous sa règle, et sous une seule", () => {
    const t = getFixedT("fr")
    renderSignedOut()
    const lists = screen.getAllByRole("list", { name: t("communityRules.reasonsLabel") })
    const named = lists.flatMap((list) => within(list).getAllByRole("listitem").map((item) => item.textContent))
    expect([...named].sort()).toEqual(REPORT_REASONS.map((reason) => t(`report.reason.${reason}`)).sort())
    for (const reason of REPORT_REASONS) {
      const section = document.getElementById(COMMUNITY_RULE_ANCHORS[REPORT_REASON_RULES[reason]])!
      const reasons = within(section).getByRole("list", { name: t("communityRules.reasonsLabel") })
      expect(within(reasons).getByText(t(`report.reason.${reason}`)), reason).toBeInTheDocument()
    }
  })

  it("chaque règle est rédigée en entier : plus aucun passage « À fournir », et son texte est à l'écran", () => {
    const t = getFixedT("fr")
    renderSignedOut()
    expect(LEGAL_TEXTS.community.awaiting).toEqual({})
    for (const rule of COMMUNITY_RULES) {
      const body = t(`legal.community.${rule}.body`)
      expect(body, rule).not.toMatch(/À fournir/)
      const section = within(document.getElementById(COMMUNITY_RULE_ANCHORS[rule])!)
      for (const line of legalBodyLines(body)) expect(section.getByText(normalized(line)), rule).toBeInTheDocument()
    }
  })

  it("dit les délais que la loi fixe, les mesures et les deux niveaux de recours", () => {
    const t = getFixedT("fr")
    expect(t("legal.community.reporting.body")).toMatch(/72 heures \(article 24\)/)
    expect(t("legal.community.reporting.body")).toMatch(/24 heures \(article 33\)/)
    expect(t("legal.community.measures.body")).toMatch(/365 jours au plus/)
    expect(t("legal.community.measures.body")).toMatch(/second recours/)
    expect(t("legal.community.measures.body")).toMatch(/Haute Autorité de la Communication/)
  })

  it("parle anglais : titre et règles rédigées, sans marqueur", () => {
    const t = getFixedT("en")
    renderSignedOut("en")
    expect(screen.getByRole("heading", { level: 1, name: "Community rules" })).toBeInTheDocument()
    expect(screen.queryByText(normalized(t("legal.provisional.heading")))).toBeNull()
    for (const rule of COMMUNITY_RULES) {
      const body = t(`legal.community.${rule}.body`)
      expect(body, rule).not.toMatch(/To be provided/)
      expect(body.length, rule).toBeGreaterThan(40)
    }
  })
})

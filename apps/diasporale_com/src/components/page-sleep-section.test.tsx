// @vitest-environment jsdom
import { DEFAULT_FACET_VISIBILITY } from "@diasporale/domain"
import { formatDate } from "@diasporale/features"
import {
  PAGE_SLEEP_DAYS,
  PAGE_SLEEP_MS,
  type ActionResult,
  type Loadable,
  type ManagedPageDetailView,
  type MembershipView,
  type PageAdminCapability,
  type PageClaimView,
  type PageManagement,
  type SleepingPageView,
} from "@diasporale/features/data"
import { getFixedT } from "@diasporale/features/i18n"
import { I18nProvider } from "@diasporale/features/i18n/client"
import { act, cleanup, getDefaultNormalizer, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { routes } from "@/lib/routes"
import { PageManageScreen } from "@/screens/page-admin-screens"

import { MyPagesPanel } from "./my-pages-panel"
import { PageOrphanNotice } from "./page-orphan-notice"

/**
 * AS-11a — le sommeil d'une page à l'écran : « Mettre la page en sommeil » pour un
 * administrateur seul, confirmation qui dit chaque effet ; « En sommeil » dans « Mes pages »
 * avec « Réactiver » ; la gestion d'une page endormie le dit ; le bandeau « sans responsable ».
 */
const mocks = vi.hoisted(() => ({
  membership: null as MembershipView | null,
  capability: null as PageAdminCapability | null,
  success: vi.fn(),
}))

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), prefetch: vi.fn() }) }))
vi.mock("sonner", () => ({ toast: { success: mocks.success, error: vi.fn() } }))
vi.mock("@/components/gate", () => ({
  Gate: (props: { children: (session: { membership: MembershipView | null }) => ReactNode }) => <>{props.children({ membership: mocks.membership })}</>,
}))
vi.mock("@/components/app-shell", () => ({ AppShell: ({ children }: { children: ReactNode }) => <>{children}</> }))
vi.mock("@diasporale/features/data", async (original) => ({
  ...(await original<typeof import("@diasporale/features/data")>()),
  usePageAdmin: () => mocks.capability,
  useDataSource: () => ({ kind: "engine" }),
  useServiceReviews: () => null,
  usePageDecisions: () => null,
  useJobs: () => null,
}))

const t = getFixedT("fr")
const normalize = getDefaultNormalizer()
/** Le texte tel que l'écran le lit (espaces insécables ramenées à l'espace simple). */
const text = (key: string, values: Record<string, unknown> = {}) => normalize(String(t(key, values)))
const named = (key: string, values: Record<string, unknown> = {}) => (name: string) => normalize(name) === text(key, values)

const MEMBER = {
  personId: "person-me",
  handle: "awa.demo",
  displayName: "Awa",
  status: "verifiee",
  badges: ["verified"],
  facet: { countryOfResidence: "FR", city: "Lyon", associationIds: [], helpAvailable: false, visibility: DEFAULT_FACET_VISIBILITY },
  joinedAt: 1,
  verifiedSince: 1,
  sponsoredBy: null,
  attestation: { outcome: "none", postSlug: null, requestedAt: null },
  root: { network: "antsia", status: "verifiee", derivedFrom: "diasporale" },
  canPublish: true,
  rateTier: "standard",
  directoryVisibility: "hidden",
} as MembershipView

const PAGE: ManagedPageDetailView = {
  id: "page-1",
  handle: "amicale-lyon",
  name: "Amicale de Lyon",
  ownerKind: "association",
  badge: "community",
  country: "FR",
  shortName: null,
  description: "Accueil des nouveaux arrivants.",
  logoUrl: null,
  bannerUrl: null,
  myRole: "admin",
}

/** Une échéance à venir à l'heure réelle du test (dix jours) : le test ne vieillit pas. */
const ENDS_AT = Date.now() + 10 * 24 * 60 * 60 * 1000
const ASLEEP: SleepingPageView = { id: "page-1", handle: "amicale-lyon", name: "Amicale de Lyon", ownerKind: "association", badge: "community", country: "FR", teamRole: "admin", sleepEndsAt: ENDS_AT, state: "asleep", canWake: true }

const ok = <T,>(value: T): Promise<ActionResult<T>> => Promise.resolve({ ok: true, value })
const ready = <T,>(data: T): Loadable<T> => ({ status: "ready", data })

function management(overrides: Partial<PageManagement> = {}): PageManagement {
  return {
    useManagedPage: () => ready(PAGE),
    useSignatories: () => ready([]),
    useMyInvitations: () => ready([]),
    useMyClaims: () => ready([]),
    createPage: vi.fn(() => ok({ pageId: "page-neuve", handle: "neuve" })),
    updateIdentity: vi.fn(() => ok({ changed: true })),
    grantRole: vi.fn(() => ok({ personId: "person-3", role: "signatory" as const, invited: true })),
    revokeRole: vi.fn(() => ok({ revoked: true })),
    respondToInvitation: vi.fn(() => ok({ role: "signatory" as const })),
    requestClaim: vi.fn(() => ok({ claimId: "claim-neuve" })),
    withdrawClaim: vi.fn(() => ok({ withdrawn: true })),
    putToSleep: vi.fn(() => ok({ sleepEndsAt: ENDS_AT })),
    wake: vi.fn(() => ok({ status: "active" as const })),
    useMySleepingPages: () => ready([]),
    ...overrides,
  }
}

function provide(manage: PageManagement | null): PageManagement | null {
  mocks.capability = { useMyPages: () => ready([]), ...(manage ? { management: manage } : {}) }
  return manage
}

const wrap = (ui: ReactNode) => render(<I18nProvider locale="fr">{ui}</I18nProvider>)

beforeEach(() => {
  mocks.membership = MEMBER
  mocks.capability = null
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe("AS-11a — « Mettre la page en sommeil » dans l'identité", () => {
  it("l'administrateur lit chaque effet avant de confirmer ; la confirmation endort la page et le dit", async () => {
    const manage = provide(management())!
    const user = userEvent.setup()
    wrap(<PageManageScreen handle="amicale-lyon" tab="identite" />)
    expect(screen.getByRole("heading", { name: named("pageSleep.section.title") })).toBeInTheDocument()
    expect(screen.getByText(text("pageSleep.section.lead", { days: PAGE_SLEEP_DAYS }))).toBeInTheDocument()
    const before = Date.now()
    await user.click(screen.getByRole("button", { name: named("pageSleep.section.actionLabel", { name: "Amicale de Lyon" }) }))
    const dialog = await screen.findByRole("dialog")
    expect(dialog).toHaveTextContent(text("pageSleep.confirm.title", { name: "Amicale de Lyon" }))
    for (const effect of ["hidden", "deadlines", "live", "kept", "silent", "after"]) expect(within(dialog).getByText(text(`pageSleep.confirm.${effect}`))).toBeInTheDocument()
    // L'échéance annoncée : trente jours après l'ouverture de la confirmation.
    expect(within(dialog).getByText(text("pageSleep.confirm.reversible", { date: formatDate(before + PAGE_SLEEP_MS, "fr") }))).toBeInTheDocument()
    expect(manage.putToSleep).not.toHaveBeenCalled()
    await user.click(within(dialog).getByRole("button", { name: named("pageSleep.confirm.action") }))
    await waitFor(() => expect(manage.putToSleep).toHaveBeenCalledExactlyOnceWith("page-1"))
    expect(mocks.success).toHaveBeenCalledWith(t("pageSleep.done", { name: "Amicale de Lyon", date: formatDate(ENDS_AT, "fr") }))
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
  })

  it("un refus du serveur se dit dans la confirmation, qui reste ouverte", async () => {
    provide(management({ putToSleep: vi.fn(() => Promise.resolve({ ok: false as const, code: "page_role_required" as const })) }))
    const user = userEvent.setup()
    wrap(<PageManageScreen handle="amicale-lyon" tab="identite" />)
    await user.click(screen.getByRole("button", { name: named("pageSleep.section.actionLabel", { name: "Amicale de Lyon" }) }))
    const dialog = await screen.findByRole("dialog")
    await user.click(within(dialog).getByRole("button", { name: named("pageSleep.confirm.action") }))
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(text("errors.page_role_required"))
    expect(mocks.success).not.toHaveBeenCalled()
  })

  it.each([
    { name: "à un éditeur", page: { ...PAGE, myRole: "signatory" as const } },
    { name: "pour une institution", page: { ...PAGE, ownerKind: "institution" as const, badge: "official" as const } },
  ])("n'est pas proposé $name", ({ page }) => {
    provide(management({ useManagedPage: () => ready(page) }))
    wrap(<PageManageScreen handle="amicale-lyon" tab="identite" />)
    expect(screen.queryByRole("heading", { name: named("pageSleep.section.title") })).not.toBeInTheDocument()
  })

  it("n'est pas proposé quand le fournisseur ne sert pas le geste, ni hors de l'onglet identité", () => {
    const { putToSleep: _omitted, ...withoutSleep } = management()
    provide(withoutSleep)
    const view = wrap(<PageManageScreen handle="amicale-lyon" tab="identite" />)
    expect(screen.queryByRole("heading", { name: named("pageSleep.section.title") })).not.toBeInTheDocument()
    provide(management())
    view.rerender(<I18nProvider locale="fr"><PageManageScreen handle="amicale-lyon" tab="equipe" /></I18nProvider>)
    expect(screen.queryByRole("heading", { name: named("pageSleep.section.title") })).not.toBeInTheDocument()
  })
})

describe("AS-11a — la gestion d'une page endormie", () => {
  it("dit « en sommeil » à son équipe, avec l'échéance et « Réactiver »", async () => {
    const manage = provide(management({ useManagedPage: () => ready(null), useMySleepingPages: () => ready([ASLEEP]) }))!
    const user = userEvent.setup()
    wrap(<PageManageScreen handle="Amicale-Lyon" tab="identite" />)
    expect(screen.getByText(text("pageSleep.manage.title"))).toBeInTheDocument()
    expect(screen.getByText(text("pageSleep.manage.asleepBody", { name: "Amicale de Lyon", date: formatDate(ENDS_AT, "fr") }))).toBeInTheDocument()
    expect(screen.getByRole("link", { name: named("pageSleep.manage.myPages") })).toHaveAttribute("href", routes.myActivity("pages"))
    await user.click(screen.getByRole("button", { name: named("pageSleep.myPages.wakeLabel", { name: "Amicale de Lyon" }) }))
    await waitFor(() => expect(manage.wake).toHaveBeenCalledExactlyOnceWith("page-1"))
    expect(mocks.success).toHaveBeenCalledWith(t("pageSleep.myPages.woken", { name: "Amicale de Lyon" }))
  })

  it("échue, elle ne se réactive plus d'ici, le dit et mène au contact de la plateforme", () => {
    provide(management({ useManagedPage: () => ready(null), useMySleepingPages: () => ready([{ ...ASLEEP, state: "expired" as const, canWake: false }]) }))
    wrap(<PageManageScreen handle="amicale-lyon" tab="identite" />)
    expect(screen.getByText(text("pageSleep.manage.expiredBody", { name: "Amicale de Lyon", days: PAGE_SLEEP_DAYS }))).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: named("pageSleep.myPages.wakeLabel", { name: "Amicale de Lyon" }) })).not.toBeInTheDocument()
    expect(screen.getByRole("link", { name: named("pageSleep.expired.contactLabel", { name: "Amicale de Lyon" }) })).toHaveAttribute("href", routes.contact())
  })

  it("l'échéance passée pendant la lecture retire « Réactiver » sans attendre le serveur", () => {
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] })
    try {
      vi.setSystemTime(ENDS_AT - 1_000)
      provide(management({ useManagedPage: () => ready(null), useMySleepingPages: () => ready([ASLEEP]) }))
      wrap(<PageManageScreen handle="amicale-lyon" tab="identite" />)
      expect(screen.getByRole("button", { name: named("pageSleep.myPages.wakeLabel", { name: "Amicale de Lyon" }) })).toBeInTheDocument()
      act(() => { vi.advanceTimersByTime(1_000) })
      expect(screen.queryByRole("button", { name: named("pageSleep.myPages.wakeLabel", { name: "Amicale de Lyon" }) })).not.toBeInTheDocument()
      expect(screen.getByText(text("pageSleep.manage.expiredBody", { name: "Amicale de Lyon", days: PAGE_SLEEP_DAYS }))).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it("une page qui n'est pas l'une des miennes en sommeil rend le refus indistinct habituel", () => {
    provide(management({ useManagedPage: () => ready(null), useMySleepingPages: () => ready([ASLEEP]) }))
    wrap(<PageManageScreen handle="autre-page" tab="identite" />)
    expect(screen.getByText(text("page.unavailableTitle"))).toBeInTheDocument()
    expect(screen.queryByText(text("pageSleep.manage.title"))).not.toBeInTheDocument()
  })
})

describe("AS-11a — « Mes pages », section « En sommeil »", () => {
  it("dit l'échéance de chaque page et réactive par un bouton qui porte le nom de la page", async () => {
    const manage = provide(management({
      useMySleepingPages: () => ready([
        ASLEEP,
        { ...ASLEEP, id: "page-2", handle: "amicale-nice", name: "Amicale de Nice", teamRole: "signatory" as const, canWake: false },
        { ...ASLEEP, id: "page-3", handle: "amicale-lille", name: "Amicale de Lille", state: "expired" as const, canWake: false },
      ]),
    }))!
    const user = userEvent.setup()
    wrap(<MyPagesPanel />)
    const section = screen.getByRole("region", { name: named("pageSleep.myPages.title") })
    expect(within(section).getAllByText(text("pageSleep.myPages.until", { date: formatDate(ENDS_AT, "fr") }))).toHaveLength(2)
    expect(within(section).getByText(text("pageSleep.myPages.expired", { date: formatDate(ENDS_AT, "fr") }))).toBeInTheDocument()
    // Un éditeur voit la page endormie sans pouvoir la réactiver ; une page échue n'a plus de bouton, mais le contact de la plateforme.
    expect(within(section).getByText(text("pageSleep.myPages.adminOnly"))).toBeInTheDocument()
    expect(within(section).getAllByRole("button")).toHaveLength(1)
    // Aucun lien vers la fiche, qui ne se lit plus : le seul lien est celui du contact, sur la page échue.
    expect(within(section).getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual([routes.contact()])
    expect(within(section).getByRole("link", { name: named("pageSleep.expired.contactLabel", { name: "Amicale de Lille" }) })).toBeInTheDocument()
    await user.click(within(section).getByRole("button", { name: named("pageSleep.myPages.wakeLabel", { name: "Amicale de Lyon" }) }))
    await waitFor(() => expect(manage.wake).toHaveBeenCalledExactlyOnceWith("page-1"))
    expect(mocks.success).toHaveBeenCalledWith(t("pageSleep.myPages.woken", { name: "Amicale de Lyon" }))
  })

  it("une échéance déjà passée à l'heure de l'écran se lit échue, même si la lecture du serveur dit encore « en sommeil »", () => {
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] })
    try {
      vi.setSystemTime(ENDS_AT - 5_000)
      provide(management({ useMySleepingPages: () => ready([ASLEEP]) }))
      wrap(<MyPagesPanel />)
      const section = screen.getByRole("region", { name: named("pageSleep.myPages.title") })
      expect(within(section).getByText(text("pageSleep.myPages.until", { date: formatDate(ENDS_AT, "fr") }))).toBeInTheDocument()
      act(() => { vi.advanceTimersByTime(5_000) })
      expect(within(section).queryByRole("button")).not.toBeInTheDocument()
      expect(within(section).getByText(text("pageSleep.myPages.expired", { date: formatDate(ENDS_AT, "fr") }))).toBeInTheDocument()
      expect(within(section).getByRole("link", { name: named("pageSleep.expired.contactLabel", { name: "Amicale de Lyon" }) })).toHaveAttribute("href", routes.contact())
    } finally {
      vi.useRealTimers()
    }
  })

  it("un refus de réactivation se dit tel quel, sans succès", async () => {
    provide(management({ useMySleepingPages: () => ready([ASLEEP]), wake: vi.fn(() => Promise.resolve({ ok: false as const, code: "page_sleep_expired" as const })) }))
    const user = userEvent.setup()
    wrap(<MyPagesPanel />)
    await user.click(screen.getByRole("button", { name: named("pageSleep.myPages.wakeLabel", { name: "Amicale de Lyon" }) }))
    expect(await screen.findByRole("alert")).toHaveTextContent(text("errors.page_sleep_expired"))
    // La durée vient du moteur, par les variables par défaut de l'instance : jamais écrite dans la phrase.
    expect(screen.getByRole("alert")).toHaveTextContent(`${PAGE_SLEEP_DAYS}`)
    expect(screen.getByRole("alert")).not.toHaveTextContent("{{")
    expect(mocks.success).not.toHaveBeenCalled()
  })

  it("seule page en sommeil : « Mes pages » ne dit pas « aucune page », et garde l'inscription d'une autre page", () => {
    provide(management({ useMySleepingPages: () => ready([ASLEEP]) }))
    const view = wrap(<MyPagesPanel />)
    expect(screen.getByRole("region", { name: named("pageSleep.myPages.title") })).toBeInTheDocument()
    expect(screen.queryByText(text("pageAdmin.myPages.emptyTitle"))).not.toBeInTheDocument()
    expect(screen.queryByText(text("pageAdmin.myPages.emptyBody"))).not.toBeInTheDocument()
    expect(screen.getByText(text("pageAdmin.myPages.onlyAsleep"))).toBeInTheDocument()
    expect(screen.getByRole("link", { name: text("pageAdmin.myPages.createAssociation") })).toHaveAttribute("href", routes.newPage("association"))
    expect(screen.getByRole("link", { name: text("pageAdmin.myPages.createCompany") })).toHaveAttribute("href", routes.newPage("company"))
    // Tant que la section « En sommeil » se lit, la phrase vide ne s'affiche pas non plus.
    provide(management({ useMySleepingPages: () => ({ status: "loading" }) }))
    view.rerender(<I18nProvider locale="fr"><MyPagesPanel /></I18nProvider>)
    expect(screen.queryByText(text("pageAdmin.myPages.emptyTitle"))).not.toBeInTheDocument()
    // Sans page en sommeil, l'état vide revient tel quel.
    provide(management())
    view.rerender(<I18nProvider locale="fr"><MyPagesPanel /></I18nProvider>)
    expect(screen.getByText(text("pageAdmin.myPages.emptyTitle"))).toBeInTheDocument()
    expect(screen.queryByText(text("pageAdmin.myPages.onlyAsleep"))).not.toBeInTheDocument()
  })

  it("vide, ou sans le fournisseur, la section se tait", () => {
    provide(management())
    const view = wrap(<MyPagesPanel />)
    expect(screen.queryByRole("region", { name: named("pageSleep.myPages.title") })).not.toBeInTheDocument()
    const { useMySleepingPages: _omitted, ...withoutSleep } = management()
    provide(withoutSleep)
    view.rerender(<I18nProvider locale="fr"><MyPagesPanel /></I18nProvider>)
    expect(screen.queryByRole("region", { name: named("pageSleep.myPages.title") })).not.toBeInTheDocument()
  })
})

describe("AS-11a — le bandeau « Cette page n'a plus de responsable »", () => {
  const PENDING: PageClaimView = {
    id: "claim-1",
    page: { id: "page-1", handle: "amicale-lyon", name: "Amicale de Lyon", ownerKind: "association", badge: "community", country: "FR" },
    claimant: { personId: "person-me", handle: "awa.demo", displayName: "Awa" },
    status: "pending",
    note: null,
    evidenceCount: 1,
    decisionReason: null,
    createdAt: 1,
    decidedAt: null,
  }

  it("propose « Revendiquer » quand la page est revendicable", () => {
    provide(management())
    wrap(<PageOrphanNotice pageId="page-1" handle="amicale-lyon" claimable />)
    const note = screen.getByRole("note", { name: named("pageSleep.orphan.title") })
    expect(note).toHaveTextContent(text("pageSleep.orphan.claimBody"))
    expect(within(note).getByRole("link", { name: named("pageSleep.orphan.claim") })).toHaveAttribute("href", routes.pageClaim("amicale-lyon"))
  })

  it("une revendication en cours se dit, sans second envoi", () => {
    provide(management({ useMyClaims: () => ready([PENDING]) }))
    wrap(<PageOrphanNotice pageId="page-1" handle="amicale-lyon" claimable />)
    const note = screen.getByRole("note", { name: named("pageSleep.orphan.title") })
    expect(note).toHaveTextContent(text("pageSleep.orphan.pendingBody"))
    expect(within(note).queryByRole("link")).not.toBeInTheDocument()
  })

  it.each([
    { name: "une page non revendicable", claimable: false, capability: true },
    { name: "un fournisseur sans gestion des pages", claimable: true, capability: false },
  ])("mène au contact pour $name", ({ claimable, capability }) => {
    provide(capability ? management() : null)
    wrap(<PageOrphanNotice pageId="page-1" handle="amicale-lyon" claimable={claimable} />)
    const note = screen.getByRole("note", { name: named("pageSleep.orphan.title") })
    expect(note).toHaveTextContent(text("pageSleep.orphan.contactBody"))
    expect(within(note).getByRole("link", { name: named("pageSleep.orphan.contact") })).toHaveAttribute("href", routes.contact())
  })
})

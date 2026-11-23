// @vitest-environment jsdom
import { DEFAULT_FACET_VISIBILITY } from "@diaspora-ga/domain"
import type {
  ActionResult,
  DeskCaseDetailView,
  DeskClaimDecisionInput,
  DeskClaimDetailView,
  DeskClaimsRequest,
  DeskClaimView,
  DeskCaseView,
  DeskDeadlineLane,
  DeskDeadlinesRequest,
  DeskDeadlineView,
  DeskDecisionInput,
  DeskPage,
  DeskPendingView,
  DeskPreviewView,
  DeskQueueRequest,
  Loadable,
  MembershipView,
  ModerationDeskCapability,
  ModerationDeskView,
} from "@diaspora-ga/features/data"
import { NETWORK_FEATURES } from "@diaspora-ga/features/data"
import { getFixedT } from "@diaspora-ga/features/i18n"
import { I18nProvider } from "@diaspora-ga/features/i18n/client"
import { act, cleanup, getDefaultNormalizer, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { DESK_ERROR_VALUES, deskDateTime } from "@/components/moderation-desk-parts"

import { ModerationDesk, parseDeskTab } from "./moderation-desk-screens"

/**
 * Le guichet de modération à l'écran, contre une capacité factice : refus
 * indistinct, onglets selon le rôle, filtres transmis, délais légaux en tête,
 * décision motivée, confirmation des mesures lourdes, partie au dossier, pages à
 * vérifier ; et (CH-815, lot A6) plus aucun onglet de décision du réseau, pour un
 * modérateur comme pour un administrateur. Données de fixture fictives.
 */
const mocks = vi.hoisted(() => ({
  params: new URLSearchParams(),
  desk: null as unknown,
  success: vi.fn(),
  /** La source montée, telle qu'un écran facultatif la lit ; aucune par défaut (le guichet est rendu seul). */
  source: null as unknown,
}))

vi.mock("next/navigation", () => ({
  useSearchParams: () => mocks.params,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/moderation",
}))
vi.mock("sonner", () => ({ toast: { success: mocks.success, error: vi.fn() } }))
vi.mock("@/components/gate", () => ({ Gate: (props: { children: (session: { membership: unknown }) => ReactNode }) => <>{props.children({ membership: null })}</> }))
vi.mock("@/components/app-shell", () => ({ AppShell: ({ children }: { children: ReactNode }) => <>{children}</> }))
vi.mock("@diaspora-ga/features/data", async (original) => ({
  ...(await original<typeof import("@diaspora-ga/features/data")>()),
  useModerationDesk: () => mocks.desk,
  useOptionalDataSource: () => mocks.source,
  useOpenCountries: () => ({ status: "ready", data: [{ country: "FR" }] }),
}))

const translate = getFixedT("fr")
const normalize = getDefaultNormalizer()
/** Le texte tel que l'écran le lit (espaces insécables ramenées à l'espace simple). */
const text = (key: string, values: Record<string, unknown> = {}) => normalize(String(translate(key, values)))
const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
/** Un nom accessible qui commence par le libellé (une option en carte porte aussi son aide). */
const named = (key: string) => new RegExp("^" + escapeRegExp(String(translate(key))))

const NOW = Date.UTC(2026, 9, 18, 12)
const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const ME = "person-me"

const MEMBER: MembershipView = {
  personId: ME,
  handle: "moderatrice.fixture",
  displayName: "Modératrice fictive",
  status: "verifiee",
  badges: ["verified"],
  facet: { countryOfResidence: "FR", associationIds: [], helpAvailable: false, visibility: DEFAULT_FACET_VISIBILITY },
  joinedAt: 1,
  verifiedSince: 1,
  sponsoredBy: null,
  attestation: { outcome: "none", postSlug: null, requestedAt: null },
  root: { network: "antsia", status: "verifiee", derivedFrom: "diaspora-ga" },
  canPublish: true,
  rateTier: "standard",
  directoryVisibility: "hidden",
}

const MODERATOR: ModerationDeskView = {
  role: "network_moderator",
  networkWide: true,
  canReviewAppeals: false,
  canManageTeams: false,
  canManagePolicy: false,
  canReviewClaims: true,
  teams: [{ teamId: "team-fr", name: "Équipe France (fixture)", scope: null, isMember: true }],
}
const ADMIN: ModerationDeskView = { ...MODERATOR, role: "network_admin", canReviewAppeals: true, canManageTeams: true, canManagePolicy: true }

/** AS-01 : une demande libre, une demande dont la personne signe la page, et leurs fiches. */
const CLAIM: DeskClaimView = {
  claimId: "claim-1",
  page: { id: "page-1", handle: "amicale-lyon", name: "Amicale de Lyon (fixture)", ownerKind: "association", badge: "community", country: "FR" },
  country: "FR", evidenceCount: 3, createdAt: NOW - HOUR, party: null,
}
const PARTY_CLAIM: DeskClaimView = { ...CLAIM, claimId: "claim-2", page: { ...CLAIM.page, id: "page-2", handle: "cercle-bordeaux", name: "Cercle de Bordeaux (fixture)" }, party: "page" }
const SERVER_REFUSED_CLAIM: DeskClaimView = { ...CLAIM, claimId: "claim-3", page: { ...CLAIM.page, id: "page-3", handle: "union-lille", name: "Union de Lille (fixture)" } }
const CLAIM_DETAIL: DeskClaimDetailView = {
  claimId: "claim-1",
  claimant: { personId: "person-awa", handle: "awa.fixture", displayName: "Awa Fixture" },
  note: "Mandat déclaré : présidence (fixture).",
  evidence: [{ url: null, withheld: "fileScanPending" }, { url: "https://depot.exemple.test/piece", withheld: null }, { url: null, withheld: "fileQuarantined" }],
  canDecide: null,
}

const CASE: DeskCaseView = {
  reportId: "report-1", surface: "post", country: "FR", ground: "harassment", status: "open", level: "network",
  teamName: null, createdAt: NOW - HOUR, hasAuthor: true, party: null,
}
const PARTY_CASE: DeskCaseView = { ...CASE, reportId: "report-2", surface: "page", ground: "misinformation", hasAuthor: false, party: "page" }
/** Le même dossier que `CASE`, tel que la voie des délais légaux le montre (SU01d du moteur). */
const DEADLINE: DeskDeadlineView = {
  reportId: CASE.reportId, surface: CASE.surface, ground: "harassment", status: "open", level: "team", teamId: "team-fr",
  createdAt: NOW - 30 * HOUR - 30 * MINUTE, basis: "art24", dueAt: NOW + 41 * HOUR + 30 * MINUTE, acknowledgedAt: NOW - 30 * HOUR - 30 * MINUTE,
}
const LATE: DeskDeadlineView = {
  ...DEADLINE, reportId: "report-7", surface: "comment", ground: "deepfake_of_me", status: "reviewing", level: "network", teamId: null,
  basis: "art33", dueAt: NOW - 65 * MINUTE, acknowledgedAt: null,
}
const EMPTY_LANE: DeskDeadlineLane = { items: [], truncated: false }
const ready = <T,>(data: T): Loadable<T> => ({ status: "ready", data })
const windowOf = <Row,>(items: readonly Row[]): Loadable<DeskPage<Row>> => ready({ items, continueCursor: null, isDone: true })
const OK: ActionResult = { ok: true, value: null }

/** Une capacité factice : chaque lecture rend une référence STABLE, comme les fournisseurs réels. */
function fakeDesk(options: {
  readonly view?: Loadable<ModerationDeskView | null>
  readonly demonstration?: boolean
  readonly deadlines?: Loadable<DeskDeadlineLane>
  /** Les dossiers de la file (par défaut `CASE` et `PARTY_CASE`). */
  readonly cases?: readonly DeskCaseView[]
  /** L'aperçu borné rendu pour tout dossier. */
  readonly preview?: DeskPreviewView
} = {}) {
  const view = options.view ?? ready(MODERATOR)
  const deadlines = options.deadlines ?? ready(EMPTY_LANE)
  const rows = options.cases ?? [CASE, PARTY_CASE]
  const cases = windowOf(rows)
  // La file ordinaire ne reprend pas les dossiers de la voie, comme les fournisseurs réels.
  const shown = new Set(deadlines.status === "ready" ? deadlines.data.items.map((row) => row.reportId) : [])
  const ordinary = windowOf(rows.filter((row) => !shown.has(row.reportId)))
  const deadlineReads: DeskDeadlinesRequest[] = []
  const pending = windowOf<DeskPendingView>([])
  const preview: Loadable<DeskPreviewView> = ready(options.preview ?? { available: true, title: null, body: "Texte signalé (fixture).", media: [] })
  const details = new Map<string, Loadable<DeskCaseDetailView>>(rows.map((row) => [row.reportId, ready({ case: row, history: [], historyMore: false })]))
  const missing: Loadable<DeskCaseDetailView> = { status: "error", code: "not_found" }
  const queueReads: DeskQueueRequest[] = []
  const decide = vi.fn(async (input: DeskDecisionInput): Promise<ActionResult<{ readonly status: "dismissed" | "actioned" }>> => ({ ok: true, value: { status: input.decision } }))
  const claims = windowOf([CLAIM, PARTY_CLAIM, SERVER_REFUSED_CLAIM])
  const claimReads: DeskClaimsRequest[] = []
  const claimDetails = new Map<string, Loadable<DeskClaimDetailView>>([
    [CLAIM.claimId, ready(CLAIM_DETAIL)],
    [PARTY_CLAIM.claimId, ready({ ...CLAIM_DETAIL, claimId: PARTY_CLAIM.claimId })],
    // Le serveur (PG-01 du moteur) dit que la personne ne peut pas trancher, sans conflit connu de la file.
    [SERVER_REFUSED_CLAIM.claimId, ready({ ...CLAIM_DETAIL, claimId: SERVER_REFUSED_CLAIM.claimId, canDecide: false })],
  ])
  const missingClaim: Loadable<DeskClaimDetailView> = { status: "error", code: "not_found" }
  const decideClaim = vi.fn(async (input: DeskClaimDecisionInput): Promise<ActionResult<{ readonly status: "approved" | "rejected" }>> => ({ ok: true, value: { status: input.decision } }))
  const desk: ModerationDeskCapability = {
    demonstration: options.demonstration ?? false,
    useDesk: () => view,
    useQueue: (request) => {
      queueReads.push(request)
      return request.lane === "ordinary" ? ordinary : cases
    },
    useDeadlines: (request) => {
      deadlineReads.push(request)
      return deadlines
    },
    useCase: ({ reportId }) => details.get(reportId) ?? missing,
    useCasePreview: () => preview,
    decide,
    usePending: () => pending,
    usePendingPreview: () => preview,
    reviewPending: vi.fn(async () => OK),
    useClaims: (request) => {
      claimReads.push(request)
      return claims
    },
    useClaim: ({ claimId }) => claimDetails.get(claimId) ?? missingClaim,
    decideClaim,
  }
  return { desk, queueReads, deadlineReads, decide, claimReads, decideClaim }
}

const tree = () => <I18nProvider locale="fr"><ModerationDesk membership={MEMBER} /></I18nProvider>

beforeEach(() => {
  mocks.params = new URLSearchParams()
  mocks.desk = null
  mocks.source = null
  mocks.success.mockReset()
})
afterEach(cleanup)

describe("Guichet — accès sans divulgation", () => {
  it("dit « indisponible » quand la capacité manque, pour un membre sans compétence et sur un refus d'accès", () => {
    render(tree())
    expect(screen.getByText(text("moderationDesk.unavailable.title"))).toBeInTheDocument()
    cleanup()

    const none = fakeDesk({ view: ready(null) })
    mocks.desk = none.desk
    render(tree())
    expect(screen.getByText(text("moderationDesk.unavailable.title"))).toBeInTheDocument()
    expect(screen.queryByRole("navigation", { name: text("moderationDesk.tabsLabel") })).toBeNull()
    expect(none.queueReads).toEqual([])
    cleanup()

    const refused = fakeDesk({ view: { status: "error", code: "not_found" } })
    mocks.desk = refused.desk
    render(tree())
    expect(screen.getByText(text("moderationDesk.unavailable.title"))).toBeInTheDocument()
    expect(refused.queueReads).toEqual([])
  })

  it("annonce la démonstration : dossiers fictifs, décisions sans effet", () => {
    mocks.desk = fakeDesk({ demonstration: true }).desk
    render(tree())
    expect(screen.getByText(text("moderationDesk.demoNotice"))).toBeInTheDocument()
  })

  it("lit l'onglet dans l'adresse, « File » par défaut", () => {
    expect(parseDeskTab(null)).toBe("file")
    expect(parseDeskTab("pages")).toBe("pages")
    expect(parseDeskTab("inconnu")).toBe("file")
    // CH-815 A6 : les anciennes adresses des onglets déménagés ramènent à la file.
    for (const moved of ["recours", "equipe", "reglages"]) expect(parseDeskTab(moved)).toBe("file")
  })
})

describe("Guichet — la file par pays", () => {
  it("montre la capacité, les onglets du rôle et transmet les filtres de pays et de nature", async () => {
    const fake = fakeDesk()
    mocks.desk = fake.desk
    const user = userEvent.setup()
    render(tree())
    expect(screen.getByText(text("moderationDesk.capacity.role.network_moderator"))).toBeInTheDocument()
    const nav = screen.getByRole("navigation", { name: text("moderationDesk.tabsLabel") })
    expect(within(nav).getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual(["/moderation?onglet=file", "/moderation?onglet=pages"])
    expect(screen.getByRole("heading", { name: text("moderationDesk.surface.post") })).toBeInTheDocument()
    expect(fake.queueReads.at(-1)).toMatchObject({ personId: ME, zone: { kind: "all" }, surface: null, teamId: null, cursor: null })

    await user.selectOptions(screen.getByLabelText(text("moderationDesk.filters.zone")), "FR")
    expect(fake.queueReads.at(-1)).toMatchObject({ zone: { kind: "country", country: "FR" } })
    await user.selectOptions(screen.getByLabelText(text("moderationDesk.filters.surface")), "page")
    expect(fake.queueReads.at(-1)).toMatchObject({ zone: { kind: "country", country: "FR" }, surface: "page" })
    await user.selectOptions(screen.getByLabelText(text("moderationDesk.filters.team")), "team-fr")
    expect(fake.queueReads.at(-1)).toMatchObject({ teamId: "team-fr" })
  })
})

describe("Guichet — délais légaux en tête (SU01d du moteur)", () => {
  afterEach(() => {
    vi.useRealTimers()
  })
  const laneRegion = () => screen.getByRole("region", { name: text("moderationDesk.deadlines.title") })
  const duration = (hours: number, minutes: number) => text("moderationDesk.deadlines.hoursMinutes", { hours, minutes })

  it("met la voie avant la file : fondement, chronomètre, échéance et accusé ; la file ordinaire ne la reprend pas", async () => {
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] })
    const fake = fakeDesk({ deadlines: ready({ items: [DEADLINE], truncated: false }) })
    mocks.desk = fake.desk
    const user = userEvent.setup()
    render(tree())
    const lane = laneRegion()
    const queue = screen.getByRole("region", { name: text("moderationDesk.queue.title") })
    expect(lane.compareDocumentPosition(queue) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(within(lane).getByText(text("moderationDesk.deadlines.lead", { ordinance: "0011/PR/2026" }))).toBeInTheDocument()
    expect(within(lane).getByRole("heading", { name: text("moderationDesk.surface.post") })).toBeInTheDocument()
    expect(within(lane).getByText(text("moderationDesk.deadlines.basis.art24", { hours: 72 }))).toBeInTheDocument()
    expect(within(lane).getByRole("timer")).toHaveTextContent(text("moderationDesk.deadlines.remaining", { duration: duration(41, 30) }))
    expect(within(lane).getByText(text("moderationDesk.deadlines.dueAt", { date: deskDateTime(DEADLINE.dueAt, "fr") }))).toBeInTheDocument()
    expect(within(lane).getByText(text("moderationDesk.deadlines.acknowledged", { date: deskDateTime(NOW - 30 * HOUR - 30 * MINUTE, "fr") }))).toBeInTheDocument()
    // Le nom de l'équipe du dossier se lit dans le guichet.
    expect(within(lane).getByText(new RegExp(escapeRegExp(text("moderationDesk.level.teamNamed", { name: "Équipe France (fixture)" }))))).toBeInTheDocument()

    // La file ordinaire est demandée à part et ne reprend pas le dossier de la voie.
    expect(fake.queueReads.at(-1)).toMatchObject({ lane: "ordinary" })
    expect(within(queue).queryByRole("heading", { name: text("moderationDesk.surface.post") })).toBeNull()
    expect(within(queue).getByRole("heading", { name: text("moderationDesk.surface.page") })).toBeInTheDocument()
    expect(within(queue).getByText(text("moderationDesk.deadlines.ordinaryNote"))).toBeInTheDocument()

    // La voie suit l'équipe choisie, jamais le pays ni la nature.
    expect(fake.deadlineReads.at(-1)).toEqual({ personId: ME, teamId: null })
    await user.selectOptions(screen.getByLabelText(text("moderationDesk.filters.zone")), "FR")
    await user.selectOptions(screen.getByLabelText(text("moderationDesk.filters.surface")), "page")
    expect(fake.deadlineReads.at(-1)).toEqual({ personId: ME, teamId: null })
    await user.selectOptions(screen.getByLabelText(text("moderationDesk.filters.team")), "team-fr")
    expect(fake.deadlineReads.at(-1)).toEqual({ personId: ME, teamId: "team-fr" })
    expect(fake.queueReads.at(-1)).toMatchObject({ teamId: "team-fr", zone: { kind: "country", country: "FR" }, surface: "page", lane: "ordinary" })
  })

  it("dit un retard, un dossier en examen et un accusé non remis ; le chronomètre avance sans relecture", () => {
    vi.useFakeTimers({ now: NOW, toFake: ["Date", "setInterval", "clearInterval"] })
    mocks.desk = fakeDesk({ deadlines: ready({ items: [LATE, DEADLINE], truncated: true }) }).desk
    render(tree())
    const lane = laneRegion()
    const [late, onTime] = within(lane).getAllByRole("timer")
    expect(late).toHaveTextContent(text("moderationDesk.deadlines.overdue", { duration: duration(1, 5) }))
    expect(late).toHaveClass("text-destructive")
    expect(onTime).toHaveTextContent(text("moderationDesk.deadlines.remaining", { duration: duration(41, 30) }))
    expect(onTime).not.toHaveClass("text-destructive")
    expect(within(lane).getByText(text("moderationDesk.deadlines.basis.art33", { hours: 24 }))).toBeInTheDocument()
    expect(within(lane).getByText(text("moderationDesk.deadlines.notAcknowledged"))).toBeInTheDocument()
    expect(within(lane).getByText(text("moderationDesk.case.reviewing"))).toBeInTheDocument()
    expect(within(lane).getByText(text("moderationDesk.deadlines.truncated", { max: 50 }))).toBeInTheDocument()

    // Trente secondes plus tard, sans nouvelle lecture : le retard gagne une minute, le reste en perd une.
    act(() => {
      vi.advanceTimersByTime(30_000)
    })
    expect(late).toHaveTextContent(text("moderationDesk.deadlines.overdue", { duration: duration(1, 6) }))
    expect(onTime).toHaveTextContent(text("moderationDesk.deadlines.remaining", { duration: duration(41, 29) }))
  })

  it("ouvre un dossier de la voie : la feuille rappelle son délai, le message d'issue revient dans la voie", async () => {
    const fake = fakeDesk({ deadlines: ready({ items: [DEADLINE], truncated: false }) })
    mocks.desk = fake.desk
    const user = userEvent.setup()
    render(tree())
    await user.click(within(laneRegion()).getByRole("button", { name: text("moderationDesk.case.open") }))
    const dialog = await screen.findByRole("dialog")
    const deadline = within(dialog).getByRole("region", { name: text("moderationDesk.deadlines.caseTitle") })
    expect(within(deadline).getByText(text("moderationDesk.deadlines.basis.art24", { hours: 72 }))).toBeInTheDocument()
    expect(within(deadline).getByRole("timer")).toBeInTheDocument()

    await user.click(within(dialog).getByRole("radio", { name: named("moderationDesk.decision.outcome.dismissed") }))
    await user.type(within(dialog).getByLabelText(text("moderationDesk.decision.reason")), "Signalement non fondé après lecture.")
    await act(async () => {
      await user.click(within(dialog).getByRole("button", { name: text("moderationDesk.decision.submit") }))
    })
    await waitFor(() => expect(fake.decide).toHaveBeenCalledExactlyOnceWith({
      personId: ME, reportId: DEADLINE.reportId, reason: "Signalement non fondé après lecture.",
      decision: "dismissed", removal: false, personMeasure: "none", durationDays: null,
    }))
    const done = await within(laneRegion()).findByText(text("moderationDesk.decision.done.dismissed"))
    await waitFor(() => expect(done).toHaveFocus())
  })

  it("dit une voie vide, puis « aucun autre dossier » quand la voie a pris toute la file", () => {
    mocks.desk = fakeDesk().desk
    render(tree())
    expect(within(laneRegion()).getByText(text("moderationDesk.deadlines.empty"))).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: text("moderationDesk.surface.post") })).toBeInTheDocument()
    cleanup()

    const everything: DeskDeadlineView[] = [DEADLINE, { ...DEADLINE, reportId: PARTY_CASE.reportId, surface: "page", ground: "institution_impersonation", basis: "art32" }]
    mocks.desk = fakeDesk({ deadlines: ready({ items: everything, truncated: false }) }).desk
    render(tree())
    expect(screen.getByText(text("moderationDesk.deadlines.ordinaryEmptyTitle"))).toBeInTheDocument()
    expect(screen.getByText(text("moderationDesk.deadlines.ordinaryEmptyBody"))).toBeInTheDocument()
    expect(within(laneRegion()).getByText(text("moderationDesk.deadlines.basis.art32", { hours: 24 }))).toBeInTheDocument()
  })

  it("dit une voie illisible sans rien retirer de la file", () => {
    mocks.desk = fakeDesk({ deadlines: { status: "error", code: "rate_limited" } }).desk
    render(tree())
    expect(within(laneRegion()).getByRole("alert")).toHaveTextContent(text("moderationDesk.deadlines.error"))
    expect(screen.getByRole("heading", { name: text("moderationDesk.surface.post") })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: text("moderationDesk.surface.page") })).toBeInTheDocument()
  })
})

describe("Guichet — décision motivée", () => {
  it("exige une issue et un motif, puis classe le dossier et rend le focus au message d'issue", async () => {
    const fake = fakeDesk()
    mocks.desk = fake.desk
    const user = userEvent.setup()
    render(tree())
    await user.click(screen.getAllByRole("button", { name: text("moderationDesk.case.open") })[0]!)
    const dialog = await screen.findByRole("dialog")
    expect(within(dialog).getByText("Texte signalé (fixture).")).toBeInTheDocument()
    expect(within(dialog).getByText(text("moderationDesk.history.empty"))).toBeInTheDocument()

    const submit = within(dialog).getByRole("button", { name: text("moderationDesk.decision.submit") })
    await user.click(submit)
    expect(await within(dialog).findByText(text("errors.moderation_desk_outcome_required"))).toBeInTheDocument()

    await user.click(within(dialog).getByRole("radio", { name: named("moderationDesk.decision.outcome.dismissed") }))
    const reason = within(dialog).getByLabelText(text("moderationDesk.decision.reason"))
    await user.type(reason, "Court")
    await user.click(submit)
    expect(await within(dialog).findByText(text("errors.moderation_desk_reason_length", DESK_ERROR_VALUES))).toBeInTheDocument()
    expect(fake.decide).not.toHaveBeenCalled()

    await user.clear(reason)
    await user.type(reason, "Signalement non fondé après lecture.")
    await act(async () => {
      await user.click(submit)
    })
    await waitFor(() => expect(fake.decide).toHaveBeenCalledExactlyOnceWith({
      personId: ME, reportId: CASE.reportId, reason: "Signalement non fondé après lecture.",
      decision: "dismissed", removal: false, personMeasure: "none", durationDays: null,
    }))
    const done = await screen.findByText(text("moderationDesk.decision.done.dismissed"))
    await waitFor(() => expect(done).toHaveFocus())
  })

  it("confirme une suspension avant de l'envoyer, avec sa durée", async () => {
    const fake = fakeDesk()
    mocks.desk = fake.desk
    const user = userEvent.setup()
    render(tree())
    await user.click(screen.getAllByRole("button", { name: text("moderationDesk.case.open") })[0]!)
    const dialog = await screen.findByRole("dialog")
    await user.click(within(dialog).getByRole("radio", { name: named("moderationDesk.decision.outcome.actioned") }))
    await user.selectOptions(within(dialog).getByLabelText(text("moderationDesk.decision.personMeasure")), "suspension")
    await user.selectOptions(within(dialog).getByLabelText(text("moderationDesk.decision.duration")), "7")
    await user.type(within(dialog).getByLabelText(text("moderationDesk.decision.reason")), "Menaces répétées envers un membre.")
    await user.click(within(dialog).getByRole("button", { name: text("moderationDesk.decision.submit") }))

    expect(await within(dialog).findByRole("heading", { name: text("moderationDesk.confirm.title") })).toHaveFocus()
    expect(within(dialog).getByText(text("moderationDesk.confirm.everywhere"))).toBeInTheDocument()
    expect(fake.decide).not.toHaveBeenCalled()
    await act(async () => {
      await user.click(within(dialog).getByRole("button", { name: text("moderationDesk.confirm.decide") }))
    })
    await waitFor(() => expect(fake.decide).toHaveBeenCalledExactlyOnceWith({
      personId: ME, reportId: CASE.reportId, reason: "Menaces répétées envers un membre.",
      decision: "actioned", removal: false, personMeasure: "suspension", durationDays: 7,
    }))
  })

  it("n'offre aucun formulaire à une personne partie au dossier", async () => {
    const fake = fakeDesk()
    mocks.desk = fake.desk
    const user = userEvent.setup()
    render(tree())
    await user.click(screen.getByRole("button", { name: text("moderationDesk.case.view") }))
    const dialog = await screen.findByRole("dialog")
    expect(within(dialog).getByText(text("moderationDesk.party.page"))).toBeInTheDocument()
    expect(within(dialog).queryByRole("button", { name: text("moderationDesk.decision.submit") })).toBeNull()
  })

  it("renvoie, sous le motif du dossier, à la règle de la communauté qu'il vise (MD-05)", async () => {
    mocks.desk = fakeDesk().desk
    const user = userEvent.setup()
    render(tree())
    await user.click(screen.getAllByRole("button", { name: text("moderationDesk.case.open") })[0]!)
    const dialog = await screen.findByRole("dialog")
    const rule = within(dialog).getByRole("link", { name: String(translate("communityRules.readRule", { rule: translate("legal.community.respect.title") })) })
    expect(rule).toHaveAttribute("href", "/regles-communaute#respect")
  })
})

describe("Guichet — groupe thématique et message personnel (MC-01 du moteur)", () => {
  const MESSAGE_CASE: DeskCaseView = { ...CASE, reportId: "report-11", surface: "personalMessage", country: null, ground: "spam" }
  const GROUP_CASE: DeskCaseView = { ...CASE, reportId: "report-10", surface: "thematicGroup", ground: "fraud", party: "group" }
  const MESSAGE_PREVIEW: DeskPreviewView = { available: true, title: null, body: "Message signalé (fixture).", media: [] }

  it("nomme les deux natures et ne montre du message que le texte signalé, sans pays", async () => {
    mocks.desk = fakeDesk({ cases: [MESSAGE_CASE, GROUP_CASE], preview: MESSAGE_PREVIEW }).desk
    const user = userEvent.setup()
    render(tree())
    expect(screen.getByRole("heading", { name: text("moderationDesk.surface.personalMessage") })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: text("moderationDesk.surface.thematicGroup") })).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: text("moderationDesk.case.open") }))
    const dialog = await screen.findByRole("dialog")
    expect(within(dialog).getByText(text("moderationDesk.case.title", { surface: translate("moderationDesk.surface.personalMessage") }))).toBeInTheDocument()
    expect(within(dialog).getByText(text("moderationDesk.zone.none"))).toBeInTheDocument()
    expect(within(dialog).getByText(text("moderationDesk.preview.bounded"))).toBeInTheDocument()
    expect(within(dialog).getByText("Message signalé (fixture).")).toBeInTheDocument()
    expect(within(dialog).queryByText(text("moderationDesk.preview.empty"))).toBeNull()
    expect(within(dialog).getByRole("button", { name: text("moderationDesk.decision.submit") })).toBeInTheDocument()
  })

  it("dit pourquoi qui tient le groupe visé ne le tranche pas, sans lui offrir de formulaire", async () => {
    mocks.desk = fakeDesk({ cases: [MESSAGE_CASE, GROUP_CASE] }).desk
    const user = userEvent.setup()
    render(tree())
    expect(screen.getByText(text("moderationDesk.party.group"))).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: text("moderationDesk.case.view") }))
    const dialog = await screen.findByRole("dialog")
    expect(within(dialog).getByText(text("moderationDesk.party.group"))).toBeInTheDocument()
    expect(within(dialog).queryByRole("button", { name: text("moderationDesk.decision.submit") })).toBeNull()
  })
})

describe("Guichet — pages à vérifier (AS-01)", () => {
  /** La carte d'une demande dans la file, par le nom de sa page. */
  function cardOf(name: string): HTMLElement {
    const card = screen.getByRole("heading", { name }).closest("li")
    if (!card) throw new Error(`carte absente : ${name}`)
    return card
  }

  it("n'offre pas l'onglet à un membre d'équipe sans rôle de réseau, et ne lit rien pour lui même par l'adresse", () => {
    mocks.params = new URLSearchParams("onglet=pages")
    const fake = fakeDesk({ view: ready({ ...MODERATOR, role: "team_member", networkWide: false, canReviewClaims: false }) })
    mocks.desk = fake.desk
    render(tree())
    const nav = screen.getByRole("navigation", { name: text("moderationDesk.tabsLabel") })
    expect(within(nav).queryByRole("link", { name: text("moderationDesk.tab.claims") })).toBeNull()
    expect(screen.getByText(text("moderationDesk.claims.restricted"))).toBeInTheDocument()
    expect(fake.claimReads).toEqual([])
  })

  it("liste les demandes par pays de la page et transmet le filtre ; le conflit d'intérêts se dit sur la carte", async () => {
    mocks.params = new URLSearchParams("onglet=pages")
    const fake = fakeDesk()
    mocks.desk = fake.desk
    const user = userEvent.setup()
    render(tree())
    const nav = screen.getByRole("navigation", { name: text("moderationDesk.tabsLabel") })
    expect(within(nav).getByRole("link", { name: text("moderationDesk.tab.claims") })).toHaveAttribute("aria-current", "page")
    expect(fake.claimReads.at(-1)).toMatchObject({ personId: ME, zone: { kind: "all" }, cursor: null })
    const free = cardOf(CLAIM.page.name)
    expect(within(free).getByText(text("moderationDesk.claims.evidenceCount", { count: 3 }), { exact: false })).toBeInTheDocument()
    expect(within(free).getByRole("button", { name: text("moderationDesk.claims.open") })).toBeInTheDocument()
    const party = cardOf(PARTY_CLAIM.page.name)
    expect(within(party).getByText(text("moderationDesk.claims.party.page"))).toBeInTheDocument()
    expect(within(party).getByRole("button", { name: text("moderationDesk.claims.view") })).toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText(text("moderationDesk.filters.zone")), "FR")
    expect(fake.claimReads.at(-1)).toMatchObject({ zone: { kind: "country", country: "FR" } })
  })

  it("instruit une demande : pièces servies par la garde, issue et motif exigés, décision transmise", async () => {
    mocks.params = new URLSearchParams("onglet=pages")
    const fake = fakeDesk()
    mocks.desk = fake.desk
    const user = userEvent.setup()
    render(tree())
    await user.click(within(cardOf(CLAIM.page.name)).getByRole("button", { name: text("moderationDesk.claims.open") }))
    const dialog = await screen.findByRole("dialog")
    expect(within(dialog).getByText("Awa Fixture (@awa.fixture)")).toBeInTheDocument()
    expect(within(dialog).getByText(CLAIM_DETAIL.note ?? "")).toBeInTheDocument()
    expect(within(dialog).getByText(text("moderationDesk.claims.evidencePending", { index: 1 }))).toBeInTheDocument()
    expect(within(dialog).getByRole("link", { name: text("moderationDesk.claims.evidenceOpen", { index: 2 }) })).toHaveAttribute("href", "https://depot.exemple.test/piece")
    expect(within(dialog).getByText(text("moderationDesk.claims.evidenceBlocked", { index: 3 }))).toBeInTheDocument()
    await user.click(within(dialog).getByRole("button", { name: text("moderationDesk.claims.submit") }))
    expect(await within(dialog).findByText(text("errors.moderation_desk_outcome_required"))).toBeInTheDocument()
    expect(within(dialog).getByText(text("errors.moderation_desk_reason_length", DESK_ERROR_VALUES))).toBeInTheDocument()
    expect(fake.decideClaim).not.toHaveBeenCalled()
    await user.click(within(dialog).getByRole("radio", { name: named("moderationDesk.claims.decision.approved") }))
    await user.type(within(dialog).getByLabelText(text("moderationDesk.decision.reason")), "Statuts et procès-verbal conformes.")
    await act(async () => {
      await user.click(within(dialog).getByRole("button", { name: text("moderationDesk.claims.submit") }))
    })
    await waitFor(() => expect(fake.decideClaim).toHaveBeenCalledExactlyOnceWith({ personId: ME, claimId: CLAIM.claimId, decision: "approved", reason: "Statuts et procès-verbal conformes." }))
    expect(mocks.success).toHaveBeenCalledWith(translate("moderationDesk.claims.decided.approved", { page: CLAIM.page.name }))
  })

  it("n'offre aucun formulaire à un signataire de la page, ni quand le serveur dit que la personne ne peut pas trancher", async () => {
    mocks.params = new URLSearchParams("onglet=pages")
    const fake = fakeDesk()
    mocks.desk = fake.desk
    const user = userEvent.setup()
    render(tree())
    await user.click(within(cardOf(PARTY_CLAIM.page.name)).getByRole("button", { name: text("moderationDesk.claims.view") }))
    let dialog = await screen.findByRole("dialog")
    expect(within(dialog).getByText(text("moderationDesk.claims.party.title"))).toBeInTheDocument()
    expect(within(dialog).queryByRole("button", { name: text("moderationDesk.claims.submit") })).toBeNull()
    await user.keyboard("{Escape}")
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())

    await user.click(within(cardOf(SERVER_REFUSED_CLAIM.page.name)).getByRole("button", { name: text("moderationDesk.claims.open") }))
    dialog = await screen.findByRole("dialog")
    expect(within(dialog).getByText(text("moderationDesk.claims.party.server"))).toBeInTheDocument()
    expect(within(dialog).queryByRole("radio")).toBeNull()
    expect(fake.decideClaim).not.toHaveBeenCalled()
  })
})

describe("Guichet — ce que le bureau ne décide plus (CH-815, D5, lot A6)", () => {
  /** Les adresses des onglets offerts. */
  const tabLinks = () => within(screen.getByRole("navigation", { name: text("moderationDesk.tabsLabel") })).getAllByRole("link").map((link) => link.getAttribute("href"))

  it.each([
    ["un modérateur du réseau", MODERATOR],
    ["un administrateur du réseau", ADMIN],
  ] as const)("%s n'a que la file et les pages à vérifier, même par l'ancienne adresse d'un onglet déménagé", (_who, view) => {
    for (const moved of ["recours", "equipe", "reglages"]) {
      mocks.params = new URLSearchParams(`onglet=${moved}`)
      const fake = fakeDesk({ view: ready(view) })
      mocks.desk = fake.desk
      render(tree())
      expect(tabLinks(), moved).toEqual(["/moderation?onglet=file", "/moderation?onglet=pages"])
      // L'adresse retombe sur la file : la capacité ne sert d'ailleurs plus aucune décision du réseau.
      expect(fake.queueReads.length, moved).toBeGreaterThan(0)
      for (const absent of ["useAppeals", "useRoster", "useResponsibles", "useSettings", "useBlockedTerms"]) expect(fake.desk, absent).not.toHaveProperty(absent)
      cleanup()
    }
  })

  it("les drapeaux de rôle de `myDesk` (recours, équipes, réglages) ne montent plus aucun onglet", () => {
    mocks.desk = fakeDesk({ view: ready({ ...ADMIN, canReviewAppeals: true, canManageTeams: true, canManagePolicy: true }) }).desk
    render(tree())
    expect(tabLinks()).toEqual(["/moderation?onglet=file", "/moderation?onglet=pages"])
    expect(within(screen.getByRole("navigation", { name: text("moderationDesk.tabsLabel") })).getAllByRole("link").map((link) => link.textContent)).toEqual([text("moderationDesk.tab.file"), text("moderationDesk.tab.claims")])
  })

  it("ne propose plus d'ouvrir ni de fermer les modules du réseau : admin.diaspora.ga les décide (CH-815, D5)", () => {
    mocks.params = new URLSearchParams("onglet=reglages")
    mocks.desk = fakeDesk({ view: ready(ADMIN) }).desk
    mocks.source = { networkFeatures: { useOpen: () => ready(NETWORK_FEATURES) } }
    render(tree())
    for (const feature of NETWORK_FEATURES) {
      expect(screen.queryByRole("heading", { name: text(`networkFeatures.names.${feature}`) })).toBeNull()
    }
  })

  it("dit à l'administrateur qu'il lit ici toute la file et que les décisions du réseau se prennent dans l'application d'administration, sans adresse", () => {
    mocks.desk = fakeDesk({ view: ready(ADMIN) }).desk
    render(tree())
    const sentence = text("moderationDesk.capacity.role.network_admin")
    const shown = screen.getByText(sentence)
    expect(shown).toBeInTheDocument()
    expect(sentence).toContain("toute la file")
    for (const decision of ["recours", "équipes", "règles", "modules"]) expect(sentence).toContain(decision)
    expect(sentence).toContain("application d'administration")
    // Ni l'ancienne promesse d'examiner les recours ici, ni aucune adresse codée en dur.
    expect(sentence).not.toContain("examinez")
    expect(sentence).not.toMatch(/https?:|www\.|\.ga\b/u)
  })

  it("un rôle retiré ferme le guichet au rendu suivant, sans rien révéler (LX-03)", () => {
    const fake = fakeDesk()
    let current: Loadable<ModerationDeskView | null> = ready(ADMIN)
    mocks.desk = { ...fake.desk, useDesk: () => current } satisfies ModerationDeskCapability
    const { rerender } = render(tree())
    expect(tabLinks()).toEqual(["/moderation?onglet=file", "/moderation?onglet=pages"])
    current = ready(null)
    rerender(tree())
    expect(screen.getByText(text("moderationDesk.unavailable.title"))).toBeInTheDocument()
    expect(screen.queryByRole("navigation", { name: text("moderationDesk.tabsLabel") })).toBeNull()
  })
})

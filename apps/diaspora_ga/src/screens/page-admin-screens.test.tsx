// @vitest-environment jsdom
import { DEFAULT_FACET_VISIBILITY } from "@diaspora-ga/domain"
import {
  DataSourceProvider,
  type ActionResult,
  type DiasporaGaDataSource,
  type Loadable,
  type ManagedPageDetailView,
  type ManagedPageView,
  type MembershipView,
  type PageAdminCapability,
  type PageClaimView,
  type PageDirectoryEntry,
  type PageDirectoryPage,
  type PageManagement,
  type PageSignatoryView,
} from "@diaspora-ga/features/data"
import { getFixedT } from "@diaspora-ga/features/i18n"
import { I18nProvider } from "@diaspora-ga/features/i18n/client"
import { cleanup, fireEvent, getDefaultNormalizer, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { MyPagesPanel } from "@/components/my-pages-panel"
import { PageAdminEntry } from "@/components/page-admin-entry"
import { routes } from "@/lib/routes"

import { NewPageScreen, PageClaimScreen, PageManageScreen } from "./page-admin-screens"

const mocks = vi.hoisted(() => ({
  membership: null as MembershipView | null,
  capability: null as PageAdminCapability | null,
  kind: "engine" as "engine" | "demo",
  jobs: null as unknown,
  push: vi.fn(),
  success: vi.fn(),
}))

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push, replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), prefetch: vi.fn() }) }))
vi.mock("sonner", () => ({ toast: { success: mocks.success, error: vi.fn() } }))
vi.mock("@/components/gate", () => ({
  Gate: (props: { children: (session: { membership: MembershipView | null }) => ReactNode }) => <>{props.children({ membership: mocks.membership })}</>,
}))
vi.mock("@/components/app-shell", () => ({ AppShell: ({ children }: { children: ReactNode }) => <>{children}</> }))
vi.mock("@diaspora-ga/features/data", async (original) => ({
  ...(await original<typeof import("@diaspora-ga/features/data")>()),
  usePageAdmin: () => mocks.capability,
  useDataSource: () => ({ kind: mocks.kind }),
  // Capacités voisines des onglets (avis DG-016, décisions P16) : absentes ici, sans fournisseur de données.
  useServiceReviews: () => null,
  usePageDecisions: () => null,
  // DG-025 : le fournisseur des emplois, présent ou absent selon le test.
  useJobs: () => mocks.jobs,
}))
// Le recrutement a son contrat de composant propre ; ici, seulement son montage pour LA page gérée.
vi.mock("@/components/job-recruiter-panel", () => ({
  JobRecruiterPanel: (props: { readonly pageId: string; readonly pageHandle: string }) => <section aria-label={`Recrutement de ${props.pageHandle}`} data-page={props.pageId} />,
}))

const t = getFixedT("fr")
const normalize = getDefaultNormalizer()
/** Le texte tel que l'écran le lit (espaces insécables ramenées à l'espace simple). */
const text = (key: string, values: Record<string, unknown> = {}) => normalize(String(t(key, values)))

function membership(status: MembershipView["status"] = "verifiee"): MembershipView {
  return {
    personId: "person-me",
    handle: "awa.demo",
    displayName: "Awa",
    status,
    badges: ["verified"],
    facet: { countryOfResidence: "FR", city: "Lyon", associationIds: [], helpAvailable: false, visibility: DEFAULT_FACET_VISIBILITY },
    joinedAt: 1,
    verifiedSince: 1,
    sponsoredBy: null,
    attestation: { outcome: "none", postSlug: null, requestedAt: null },
    root: { network: "antsia", status: "verifiee", derivedFrom: "diaspora-ga" },
    canPublish: true,
    rateTier: "standard",
    directoryVisibility: "hidden",
  } as MembershipView
}

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

const ME: PageSignatoryView = { personId: "person-me", handle: "awa.demo", displayName: "Awa", role: "admin", accepted: true, since: 1, isMe: true }
const OTHER: PageSignatoryView = { personId: "person-2", handle: "steeve.demo", displayName: "Steeve", role: "signatory", accepted: true, since: 2, isMe: false }

const PENDING_CLAIM: PageClaimView = {
  id: "claim-1",
  page: { id: "page-1", handle: "amicale-lyon", name: "Amicale de Lyon", ownerKind: "association", badge: "community", country: "FR" },
  claimant: { personId: "person-me", handle: "awa.demo", displayName: "Awa" },
  status: "pending",
  note: "Mandat déclaré : présidence.",
  evidenceCount: 2,
  decisionReason: null,
  createdAt: Date.UTC(2026, 9, 1),
  decidedAt: null,
}

const ok = <T,>(value: T): Promise<ActionResult<T>> => Promise.resolve({ ok: true, value })
const ready = <T,>(data: T): Loadable<T> => ({ status: "ready", data })

function management(overrides: Partial<PageManagement> = {}): PageManagement {
  return {
    useManagedPage: () => ready(PAGE),
    useSignatories: () => ready([ME, OTHER]),
    useMyInvitations: () => ready([]),
    useMyClaims: () => ready([]),
    createPage: vi.fn(() => ok({ pageId: "page-neuve", handle: "saveurs-de-lille" })),
    updateIdentity: vi.fn(() => ok({ changed: true })),
    grantRole: vi.fn(() => ok({ personId: "person-3", role: "signatory" as const, invited: true })),
    revokeRole: vi.fn(() => ok({ revoked: true })),
    respondToInvitation: vi.fn(() => ok({ role: "signatory" as const })),
    requestClaim: vi.fn(() => ok({ claimId: "claim-neuve" })),
    withdrawClaim: vi.fn(() => ok({ withdrawn: true })),
    ...overrides,
  }
}

function provide(manage: PageManagement | null, myPages: Loadable<readonly ManagedPageView[]> = ready([])) {
  mocks.capability = { useMyPages: () => myPages, ...(manage ? { management: manage } : {}) }
  return manage
}

const wrap = (ui: ReactNode) => render(<I18nProvider locale="fr">{ui}</I18nProvider>)

beforeEach(() => {
  mocks.membership = membership()
  mocks.capability = null
  mocks.kind = "engine"
  mocks.jobs = null
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

/**
 * Les noms accessibles se comparent sans normalisation : une espace insécable de la typographie
 * française y reste. Le prédicat ramène le nom lu à la forme de `text()`.
 */
const named = (key: string, values: Record<string, unknown> = {}) => (name: string) => normalize(name) === text(key, values)
/** Un libellé lu dans un nom accessible plus long (carte de nature, geste proposé). */
const nameWith = (key: string, values: Record<string, unknown> = {}) => (name: string) => normalize(name).includes(text(key, values))

const NEARBY: PageDirectoryEntry = {
  id: "page-agl",
  handle: "agl-lyon",
  name: "Association des Gabonais de Lyon",
  ownerKind: "association",
  trust: "community",
  badge: "community",
  country: "FR",
  city: "Lyon",
  description: "",
  followers: 0,
  claimable: false,
  following: false,
}

describe("inscrire une organisation (AS-05)", () => {
  it("inscrit une entreprise en trois étapes, puis propose ses premiers gestes", async () => {
    const manage = provide(management())!
    const user = userEvent.setup()
    wrap(<NewPageScreen kind="company" />)
    // La nature vient de l'adresse : l'inscription s'ouvre sur l'identité.
    expect(screen.getByRole("heading", { name: named("pageAdmin.register.identityTitle") })).toBeInTheDocument()
    await user.type(screen.getByLabelText(text("pageAdmin.create.name")), "Saveurs de Lille")
    expect(screen.getByText(text("pageAdmin.create.handlePreview", { handle: "saveurs-de-lille" }))).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: named("pageAdmin.register.next") }))
    expect(await screen.findByRole("heading", { name: named("pageAdmin.register.reviewTitle") })).toBeInTheDocument()
    expect(screen.getByText(text("pageAdmin.kind.company"))).toBeInTheDocument()
    expect(manage.createPage).not.toHaveBeenCalled()
    await user.click(screen.getByRole("button", { name: named("pageAdmin.create.submit") }))
    await waitFor(() => expect(manage.createPage).toHaveBeenCalledExactlyOnceWith({ ownerKind: "company", name: "Saveurs de Lille", country: "FR" }))
    expect(await screen.findByRole("heading", { name: named("pageAdmin.register.done.title", { name: "Saveurs de Lille" }) })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: named("pageAdmin.register.done.seePage") })).toHaveAttribute("href", routes.page("saveurs-de-lille"))
    expect(screen.getByRole("link", { name: nameWith("pageAdmin.register.done.verification.title") })).toHaveAttribute("href", routes.pageClaim("saveurs-de-lille"))
    expect(screen.getByRole("link", { name: nameWith("pageAdmin.register.done.identity.title") })).toHaveAttribute("href", routes.pageManage("saveurs-de-lille", "identite"))
    // Ni l'emploi ni les services ne sont servis ici : aucun geste ne mène à un onglet « indisponible ».
    expect(screen.queryByRole("link", { name: nameWith("pageAdmin.register.done.jobs.title") })).not.toBeInTheDocument()
    expect(screen.queryByRole("link", { name: nameWith("pageAdmin.register.done.services.title") })).not.toBeInTheDocument()
    expect(mocks.push).not.toHaveBeenCalled()
  })

  it("commence par la nature (association ou entreprise), puis refuse un nom vide et une adresse trop courte avant toute écriture", async () => {
    const manage = provide(management())!
    const user = userEvent.setup()
    wrap(<NewPageScreen kind={null} />)
    expect(screen.getByRole("heading", { name: named("pageAdmin.create.kindLegend") })).toBeInTheDocument()
    expect(screen.getAllByRole("radio")).toHaveLength(2)
    expect(screen.getByRole("radio", { name: nameWith("pageAdmin.kind.association") })).toBeChecked()
    expect(screen.queryByRole("radio", { name: nameWith("pageAdmin.kind.media") })).not.toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: named("pageAdmin.register.next") }))
    await user.type(await screen.findByLabelText(text("pageAdmin.create.handle")), "ab")
    await user.click(screen.getByRole("button", { name: named("pageAdmin.register.next") }))
    expect(await screen.findByText(text("errors.page_name_invalid"))).toBeInTheDocument()
    expect(screen.getByText(text("errors.page_handle_length"))).toBeInTheDocument()
    expect(screen.queryByRole("heading", { name: named("pageAdmin.register.reviewTitle") })).not.toBeInTheDocument()
    expect(manage.createPage).not.toHaveBeenCalled()
  })

  it("traduit le refus du serveur et explique comment obtenir une adhésion vérifiée", async () => {
    provide(management({ createPage: vi.fn(() => Promise.resolve({ ok: false as const, code: "page_verified_required" as const })) }))
    const user = userEvent.setup()
    wrap(<NewPageScreen kind="association" />)
    await user.type(screen.getByLabelText(text("pageAdmin.create.name")), "Amicale de Lille")
    await user.click(screen.getByRole("button", { name: named("pageAdmin.register.next") }))
    await user.click(await screen.findByRole("button", { name: named("pageAdmin.create.submit") }))
    expect(await screen.findByRole("alert")).toHaveTextContent(text("errors.page_verified_required"))
    expect(screen.getByRole("link", { name: named("pageAdmin.create.verifiedOnly.attestation") })).toHaveAttribute("href", routes.attestation())
    expect(screen.queryByRole("heading", { name: named("pageAdmin.register.done.title", { name: "Amicale de Lille" }) })).not.toBeInTheDocument()
  })

  it("une nature que DIASPORA.GA n'inscrit pas ramène au choix de la nature, sans écriture", async () => {
    const manage = provide(management())!
    const user = userEvent.setup()
    wrap(<NewPageScreen kind="media" />)
    await user.type(screen.getByLabelText(text("pageAdmin.create.name")), "Radio Diaspora")
    await user.click(screen.getByRole("button", { name: named("pageAdmin.register.next") }))
    await user.click(await screen.findByRole("button", { name: named("pageAdmin.create.submit") }))
    expect(await screen.findByRole("alert")).toHaveTextContent(text("errors.page_kind_reserved"))
    expect(screen.getByRole("heading", { name: named("pageAdmin.create.kindLegend") })).toBeInTheDocument()
    expect(manage.createPage).not.toHaveBeenCalled()
  })

  it("avant d'inscrire, propose de revendiquer une page au nom proche du même pays", async () => {
    provide(management())
    const useDirectory = vi.fn(() => ready<PageDirectoryPage>({ items: [NEARBY], continueCursor: null, isDone: true }))
    const user = userEvent.setup()
    render(
      <I18nProvider locale="fr">
        <DataSourceProvider source={{ pages: { useDirectory } } as unknown as DiasporaGaDataSource}>
          <NewPageScreen kind="association" />
        </DataSourceProvider>
      </I18nProvider>,
    )
    await user.type(screen.getByLabelText(text("pageAdmin.create.name")), "Association des Gabonais de Lyon")
    const claim = await screen.findByRole("link", { name: named("pageAdmin.register.nearby.claimLabel", { name: NEARBY.name }) }, { timeout: 2000 })
    expect(claim).toHaveAttribute("href", routes.pageClaim(NEARBY.handle))
    expect(useDirectory).toHaveBeenLastCalledWith({ query: "Association des Gabonais de Lyon", cursor: null, country: "FR" })
    await user.click(screen.getByRole("button", { name: named("pageAdmin.register.next") }))
    // Au récapitulatif, la revendication se propose encore, avant d'inscrire ; on peut l'écarter.
    expect(await screen.findByRole("heading", { name: named("pageAdmin.register.reviewTitle") })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: named("pageAdmin.register.nearby.claimLabel", { name: NEARBY.name }) })).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: named("pageAdmin.register.nearby.continue") }))
    expect(screen.queryByRole("link", { name: named("pageAdmin.register.nearby.claimLabel", { name: NEARBY.name }) })).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: named("pageAdmin.create.submit") })).toBeInTheDocument()
  })

  it("un membre déclaré lit pourquoi, sans formulaire", () => {
    mocks.membership = membership("declaree")
    provide(management())
    wrap(<NewPageScreen kind="association" />)
    expect(screen.getByRole("heading", { name: named("pageAdmin.create.verifiedOnly.title") })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: named("pageAdmin.create.submit") })).not.toBeInTheDocument()
  })

  it("dit « indisponible » quand le fournisseur ne sert pas la capacité", () => {
    provide(null)
    wrap(<NewPageScreen kind="association" />)
    expect(screen.getByText(text("pageAdmin.unavailable.title"))).toBeInTheDocument()
  })
})

describe("revendiquer une page", () => {
  const claimable: ManagedPageDetailView = { ...PAGE, myRole: null }

  async function fillClaim(user: ReturnType<typeof userEvent.setup>, files: File[]) {
    const input = document.querySelector<HTMLInputElement>('input[type="file"]')!
    fireEvent.change(input, { target: { files } })
    await user.click(screen.getByRole("radio", { name: text("pageAdmin.claim.mandate.legal_representative") }))
    await user.type(screen.getByLabelText(text("pageAdmin.claim.details")), "Élue le 3 mai.")
  }

  it("dépose les pièces, le mandat déclaré et le consentement explicite", async () => {
    const manage = provide(management({ useManagedPage: () => ready(claimable) }))!
    const user = userEvent.setup()
    wrap(<PageClaimScreen handle="amicale-lyon" />)
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(text("pageAdmin.claim.title", { name: "Amicale de Lyon" }))
    const statutes = new File(["statuts"], "statuts.pdf", { type: "application/pdf" })
    await fillClaim(user, [statutes])
    expect(screen.getByRole("checkbox")).not.toBeChecked()
    await user.click(screen.getByRole("checkbox"))
    await user.click(screen.getByRole("button", { name: text("pageAdmin.claim.submit") }))
    await waitFor(() => expect(manage.requestClaim).toHaveBeenCalledExactlyOnceWith({
      pageId: "page-1",
      note: String(t("pageAdmin.claim.noteWithDetails", { mandate: t("pageAdmin.claim.mandate.legal_representative"), details: "Élue le 3 mai." })),
      evidence: [statutes],
    }))
    expect(mocks.success).toHaveBeenCalledWith(t("pageAdmin.claim.sent"))
  })

  it("refuse sans pièce, une pièce d'un type refusé, ou sans consentement", async () => {
    const manage = provide(management({ useManagedPage: () => ready(claimable) }))!
    const user = userEvent.setup()
    wrap(<PageClaimScreen handle="amicale-lyon" />)
    await fillClaim(user, [new File(["gif"], "photo.gif", { type: "image/gif" })])
    expect(screen.getByText(text("errors.page_claim_evidence_type"))).toBeInTheDocument()
    expect(screen.queryByText("photo.gif")).not.toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: text("pageAdmin.claim.submit") }))
    expect(await screen.findByText(text("errors.page_claim_consent_required"))).toBeInTheDocument()
    await user.click(screen.getByRole("checkbox"))
    await user.click(screen.getByRole("button", { name: text("pageAdmin.claim.submit") }))
    expect(await screen.findByText(text("errors.page_claim_evidence_count"))).toBeInTheDocument()
    expect(manage.requestClaim).not.toHaveBeenCalled()
  })

  it("traduit un refus du serveur (déjà administrée)", async () => {
    provide(management({ useManagedPage: () => ready(claimable), requestClaim: vi.fn(() => Promise.resolve({ ok: false as const, code: "page_already_claimed" as const })) }))
    const user = userEvent.setup()
    wrap(<PageClaimScreen handle="amicale-lyon" />)
    await fillClaim(user, [new File(["pdf"], "statuts.pdf", { type: "application/pdf" })])
    await user.click(screen.getByRole("checkbox"))
    await user.click(screen.getByRole("button", { name: text("pageAdmin.claim.submit") }))
    expect(await screen.findByText(text("errors.page_already_claimed"))).toBeInTheDocument()
  })

  it("une demande en attente se suit et se retire après confirmation", async () => {
    const manage = provide(management({ useManagedPage: () => ready(claimable), useMyClaims: () => ready([PENDING_CLAIM]) }))!
    const user = userEvent.setup()
    wrap(<PageClaimScreen handle="amicale-lyon" />)
    expect(screen.getByRole("heading", { name: text("pageAdmin.claim.pendingTitle") })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: text("pageAdmin.claim.submit") })).not.toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: text("pageAdmin.claim.withdraw") }))
    const dialog = await screen.findByRole("dialog")
    await user.click(within(dialog).getByRole("button", { name: text("pageAdmin.claim.withdraw") }))
    await waitFor(() => expect(manage.withdrawClaim).toHaveBeenCalledExactlyOnceWith("claim-1"))
  })

  it("une page officielle ne se revendique pas, et « Vérifié » n'est jamais « Officiel »", () => {
    provide(management({ useManagedPage: () => ready({ ...PAGE, badge: "official", myRole: null }) }))
    wrap(<PageClaimScreen handle="poste" />)
    expect(screen.getByText(text("pageAdmin.claim.officialPage"))).toBeInTheDocument()
    expect(screen.getByText(text("pageAdmin.claim.how.notOfficial"))).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: text("pageAdmin.claim.submit") })).not.toBeInTheDocument()
  })
})

describe("gérer une page — équipe", () => {
  it("le dernier administrateur ne peut pas partir et le sait", () => {
    provide(management({ useSignatories: () => ready([ME, OTHER]) }))
    wrap(<PageManageScreen handle="amicale-lyon" tab="equipe" />)
    expect(screen.getByRole("button", { name: text("pageAdmin.team.leave") })).toBeDisabled()
    expect(screen.getByText(text("pageAdmin.team.lastAdmin"))).toBeInTheDocument()
  })

  it("traduit le refus du dernier administrateur rendu par le serveur", async () => {
    const SECOND: PageSignatoryView = { ...OTHER, role: "admin" }
    provide(management({
      useSignatories: () => ready([ME, SECOND]),
      revokeRole: vi.fn(() => Promise.resolve({ ok: false as const, code: "page_last_admin" as const })),
    }))
    const user = userEvent.setup()
    wrap(<PageManageScreen handle="amicale-lyon" tab="equipe" />)
    await user.click(screen.getByRole("button", { name: text("pageAdmin.team.leave") }))
    const dialog = await screen.findByRole("dialog")
    await user.click(within(dialog).getByRole("button", { name: text("pageAdmin.team.leave") }))
    expect(await screen.findByText(text("errors.page_last_admin"))).toBeInTheDocument()
  })

  it("retire un signataire après confirmation", async () => {
    const manage = provide(management())!
    const user = userEvent.setup()
    wrap(<PageManageScreen handle="amicale-lyon" tab="equipe" />)
    await user.click(screen.getByRole("button", { name: text("pageAdmin.team.removeLabel", { name: "Steeve" }) }))
    const dialog = await screen.findByRole("dialog")
    expect(dialog).toHaveTextContent(text("pageAdmin.team.removeConfirmTitle", { name: "Steeve" }))
    await user.click(within(dialog).getByRole("button", { name: text("pageAdmin.team.remove") }))
    await waitFor(() => expect(manage.revokeRole).toHaveBeenCalledExactlyOnceWith("page-1", "person-2"))
    expect(mocks.success).toHaveBeenCalledWith(t("pageAdmin.team.removed"))
  })

  it("retirer une invitation en attente dit ce qu'elle est : la personne n'avait encore aucun rôle", async () => {
    const INVITED: PageSignatoryView = { personId: "person-3", handle: "amina.demo", displayName: "Amina", role: "signatory", accepted: false, since: 3, isMe: false }
    const manage = provide(management({ useSignatories: () => ready([ME, OTHER, INVITED]) }))!
    const user = userEvent.setup()
    wrap(<PageManageScreen handle="amicale-lyon" tab="equipe" />)
    // Le nom accessible dit le geste (l'invitation), et « de » s'élide devant le nom.
    expect(text("pageAdmin.team.withdrawInviteLabel", { name: "Amina" })).toBe("Retirer l’invitation d’Amina")
    expect(screen.queryByRole("button", { name: text("pageAdmin.team.removeLabel", { name: "Amina" }) })).not.toBeInTheDocument()
    // WCAG 2.5.3 : le libellé visible (« Retirer l’invitation ») est contenu dans le nom accessible.
    const withdraw = screen.getByRole("button", { name: text("pageAdmin.team.withdrawInviteLabel", { name: "Amina" }) })
    expect(withdraw).toHaveTextContent(text("pageAdmin.team.withdrawInvite"))
    expect(text("pageAdmin.team.withdrawInviteLabel", { name: "Amina" })).toContain(text("pageAdmin.team.withdrawInvite"))
    await user.click(withdraw)
    const dialog = await screen.findByRole("dialog")
    expect(dialog).toHaveTextContent(text("pageAdmin.team.withdrawInviteConfirmTitle", { name: "Amina" }))
    expect(dialog).toHaveTextContent(text("pageAdmin.team.withdrawInviteConfirmBody", { name: "Amina" }))
    // Rien sur un rôle perdu : elle n'en avait aucun.
    expect(dialog).not.toHaveTextContent(text("pageAdmin.team.removeConfirmBody"))
    await user.click(within(dialog).getByRole("button", { name: text("pageAdmin.team.withdrawInvite") }))
    await waitFor(() => expect(manage.revokeRole).toHaveBeenCalledExactlyOnceWith("page-1", "person-3"))
    expect(mocks.success).toHaveBeenCalledWith(t("pageAdmin.team.inviteWithdrawn"))
    // Un membre qui a accepté garde la confirmation du retrait de l'équipe.
    await user.click(screen.getByRole("button", { name: text("pageAdmin.team.removeLabel", { name: "Steeve" }) }))
    expect(await screen.findByRole("dialog")).toHaveTextContent(text("pageAdmin.team.removeConfirmBody"))
  })

  it("en anglais aussi, le libellé visible d'une invitation à retirer est contenu dans son nom accessible", () => {
    const INVITED: PageSignatoryView = { personId: "person-3", handle: "amina.demo", displayName: "Amina", role: "signatory", accepted: false, since: 3, isMe: false }
    provide(management({ useSignatories: () => ready([ME, OTHER, INVITED]) }))
    render(<I18nProvider locale="en"><PageManageScreen handle="amicale-lyon" tab="equipe" /></I18nProvider>)
    const en = getFixedT("en")
    const withdraw = screen.getByRole("button", { name: String(en("pageAdmin.team.withdrawInviteLabel", { name: "Amina" })) })
    expect(withdraw).toHaveTextContent(String(en("pageAdmin.team.withdrawInvite")))
    expect(String(en("pageAdmin.team.withdrawInviteLabel", { name: "Amina" }))).toContain(String(en("pageAdmin.team.withdrawInvite")))
  })

  it("invite par identifiant ; un identifiant invalide est refusé avant le serveur", async () => {
    const manage = provide(management())!
    const user = userEvent.setup()
    wrap(<PageManageScreen handle="amicale-lyon" tab="equipe" />)
    const handle = screen.getByLabelText(text("pageAdmin.team.handle"))
    await user.type(handle, "a")
    await user.click(screen.getByRole("button", { name: text("pageAdmin.team.invite") }))
    expect(await screen.findByText(text("errors.handle_length"))).toBeInTheDocument()
    expect(manage.grantRole).not.toHaveBeenCalled()
    await user.clear(handle)
    await user.type(handle, "@Prisca.Abanga")
    await user.click(screen.getByRole("button", { name: text("pageAdmin.team.invite") }))
    await waitFor(() => expect(manage.grantRole).toHaveBeenCalledExactlyOnceWith("page-1", "prisca.abanga", "signatory"))
    expect(mocks.success).toHaveBeenCalledWith(t("pageAdmin.team.invitedToast"))
  })

  it("un rôle retiré ferme l'équipe (refus réactif) puis la gestion", () => {
    const manage = management({ useSignatories: () => ({ status: "error", code: "page_role_required" }) })
    provide(manage)
    const view = wrap(<PageManageScreen handle="amicale-lyon" tab="equipe" />)
    expect(screen.getByRole("alert")).toHaveTextContent(text("errors.page_role_required"))
    // La lecture de la page dit aussitôt qu'aucun rôle ne reste : l'écran se ferme.
    provide({ ...manage, useManagedPage: () => ready({ ...PAGE, myRole: null }) })
    view.rerender(<I18nProvider locale="fr"><PageManageScreen handle="amicale-lyon" tab="equipe" /></I18nProvider>)
    expect(screen.getByText(text("pageAdmin.manage.notManager.title"))).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: text("pageAdmin.team.invite") })).not.toBeInTheDocument()
  })

  it("un signataire voit l'équipe sans pouvoir la changer", () => {
    provide(management({ useManagedPage: () => ready({ ...PAGE, myRole: "signatory" }), useSignatories: () => ready([{ ...ME, role: "signatory" }, { ...OTHER, role: "admin" }]) }))
    wrap(<PageManageScreen handle="amicale-lyon" tab="equipe" />)
    expect(screen.getByText(text("pageAdmin.team.readOnly"))).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: text("pageAdmin.team.removeLabel", { name: "Steeve" }) })).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: text("pageAdmin.team.leave") })).toBeEnabled()
  })
})

describe("AS-10 — équipe à trois rôles et « Transmettre la page »", () => {
  it("dit les trois rôles, chacun en une phrase, et invite un modérateur", async () => {
    const manage = provide(management())!
    const user = userEvent.setup()
    wrap(<PageManageScreen handle="amicale-lyon" tab="equipe" />)
    const guide = screen.getByRole("region", { name: text("pageAdmin.team.rolesTitle") })
    for (const role of ["admin", "signatory", "moderator"] as const) {
      expect(within(guide).getByText(text(`pageAdmin.role.${role}`))).toBeInTheDocument()
      expect(within(guide).getByText(text(`pageAdmin.roleHint.${role}`))).toBeInTheDocument()
    }
    expect(text("pageAdmin.role.signatory")).toBe("Éditeur")
    await user.type(screen.getByLabelText(text("pageAdmin.team.handle")), "prisca.abanga")
    await user.selectOptions(screen.getByLabelText(text("pageAdmin.team.role")), "moderator")
    await user.click(screen.getByRole("button", { name: text("pageAdmin.team.invite") }))
    await waitFor(() => expect(manage.grantRole).toHaveBeenCalledExactlyOnceWith("page-1", "prisca.abanga", "moderator"))
  })

  it("changer le rôle d'un membre qui a déjà accepté vaut aussitôt, et l'écran le dit avant le geste", async () => {
    const manage = provide(management({ grantRole: vi.fn(() => ok({ personId: "person-2", role: "moderator" as const, invited: false })) }))!
    const user = userEvent.setup()
    wrap(<PageManageScreen handle="amicale-lyon" tab="equipe" />)
    const select = screen.getByLabelText(text("pageAdmin.team.changeRole", { name: "Steeve" }))
    expect(select).toHaveAccessibleDescription(String(t("pageAdmin.team.roleImmediate")))
    await user.selectOptions(select, "moderator")
    await waitFor(() => expect(manage.grantRole).toHaveBeenCalledExactlyOnceWith("page-1", "steeve.demo", "moderator"))
    expect(mocks.success).toHaveBeenCalledWith(t("pageAdmin.team.roleChanged"))
  })

  it("transmettre à un membre accepté : il est promu aussitôt, et l'écran le dit", async () => {
    const manage = provide(management({ grantRole: vi.fn(() => ok({ personId: "person-2", role: "admin" as const, invited: false })) }))!
    const user = userEvent.setup()
    wrap(<PageManageScreen handle="amicale-lyon" tab="equipe" />)
    const transfer = screen.getByRole("region", { name: text("pageAdmin.team.transfer.title") })
    expect(within(transfer).getByRole("radio", { name: nameWith("pageAdmin.team.transfer.member") })).toBeChecked()
    expect(within(transfer).getByText(text("pageAdmin.team.transfer.memberHint"))).toBeInTheDocument()
    // Aucun membre choisi : refusé avant le serveur.
    await user.click(within(transfer).getByRole("button", { name: text("pageAdmin.team.transfer.promote") }))
    expect(await within(transfer).findByText(text("errors.page_team_member_required"))).toBeInTheDocument()
    expect(manage.grantRole).not.toHaveBeenCalled()
    await user.selectOptions(within(transfer).getByLabelText(text("pageAdmin.team.transfer.memberSelect")), "person-2")
    await user.click(within(transfer).getByRole("button", { name: text("pageAdmin.team.transfer.promote") }))
    await waitFor(() => expect(manage.grantRole).toHaveBeenCalledExactlyOnceWith("page-1", "steeve.demo", "admin"))
    expect(mocks.success).toHaveBeenCalledWith(t("pageAdmin.team.transfer.promoted", { name: "Steeve" }))
  })

  it("transmettre à une autre personne : elle est invitée comme administrateur", async () => {
    const manage = provide(management({ grantRole: vi.fn(() => ok({ personId: "person-9", role: "admin" as const, invited: true })) }))!
    const user = userEvent.setup()
    wrap(<PageManageScreen handle="amicale-lyon" tab="equipe" />)
    const transfer = screen.getByRole("region", { name: text("pageAdmin.team.transfer.title") })
    await user.click(within(transfer).getByRole("radio", { name: nameWith("pageAdmin.team.transfer.newPerson") }))
    await user.type(within(transfer).getByLabelText(text("pageAdmin.team.transfer.personHandle")), "@Prisca.Abanga")
    await user.click(within(transfer).getByRole("button", { name: text("pageAdmin.team.transfer.invite") }))
    await waitFor(() => expect(manage.grantRole).toHaveBeenCalledExactlyOnceWith("page-1", "prisca.abanga", "admin"))
    expect(mocks.success).toHaveBeenCalledWith(t("pageAdmin.team.transfer.invited"))
  })

  it("« Se retirer » ne s'ouvre qu'avec un second administrateur accepté ; le refus du dernier administrateur se dit", async () => {
    const view = wrap(<></>)
    provide(management())
    view.rerender(<I18nProvider locale="fr"><PageManageScreen handle="amicale-lyon" tab="equipe" /></I18nProvider>)
    const stepDown = () => within(screen.getByRole("region", { name: text("pageAdmin.team.transfer.title") })).getByRole("button", { name: text("pageAdmin.team.transfer.leave") })
    expect(stepDown()).toBeDisabled()
    expect(stepDown()).toHaveAccessibleDescription(String(t("pageAdmin.team.transfer.leaveBlocked")))
    // Un second administrateur INVITÉ ne suffit pas : il doit avoir accepté.
    provide(management({ useSignatories: () => ready([ME, { ...OTHER, role: "admin", accepted: false }]) }))
    view.rerender(<I18nProvider locale="fr"><PageManageScreen handle="amicale-lyon" tab="equipe" /></I18nProvider>)
    expect(stepDown()).toBeDisabled()
    const manage = provide(management({
      useSignatories: () => ready([ME, { ...OTHER, role: "admin" }]),
      revokeRole: vi.fn(() => Promise.resolve({ ok: false as const, code: "page_last_admin" as const })),
    }))!
    view.rerender(<I18nProvider locale="fr"><PageManageScreen handle="amicale-lyon" tab="equipe" /></I18nProvider>)
    expect(stepDown()).toBeEnabled()
    expect(stepDown()).toHaveAccessibleDescription(String(t("pageAdmin.team.transfer.leaveReady")))
    const user = userEvent.setup()
    await user.click(stepDown())
    const dialog = await screen.findByRole("dialog")
    expect(dialog).toHaveTextContent(text("pageAdmin.team.transfer.leaveConfirmTitle"))
    await user.click(within(dialog).getByRole("button", { name: text("pageAdmin.team.transfer.leave") }))
    await waitFor(() => expect(manage.revokeRole).toHaveBeenCalledExactlyOnceWith("page-1", "person-me"))
    expect(await screen.findByText(text("errors.page_last_admin"))).toBeInTheDocument()
  })

  it("un modérateur voit l'équipe et la modération des commentaires — ni publication, ni gestion, ni transmission", () => {
    provide(management({
      useManagedPage: () => ready({ ...PAGE, myRole: null, myTeamRole: "moderator" }),
      useSignatories: () => ready([{ ...ME, role: "moderator" }, { ...OTHER, role: "admin" }]),
    }))
    wrap(<PageManageScreen handle="amicale-lyon" tab="publications" />)
    expect(screen.getByRole("heading", { level: 1, name: named("pageAdmin.manage.moderatorTitle", { name: "Amicale de Lyon" }) })).toBeInTheDocument()
    expect(screen.getByText(text("pageAdmin.manage.roleModerator"))).toBeInTheDocument()
    expect(screen.getByRole("link", { name: text("pageAdmin.manage.moderation.open") })).toHaveAttribute("href", routes.page("amicale-lyon"))
    expect(screen.getByText(text("pageAdmin.team.readOnly"))).toBeInTheDocument()
    expect(screen.getByRole("button", { name: text("pageAdmin.team.leave") })).toBeEnabled()
    expect(screen.queryByRole("navigation", { name: text("pageAdmin.manage.tabs") })).not.toBeInTheDocument()
    expect(screen.queryByRole("link", { name: text("pagePostManagement.tab") })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: text("pageAdmin.team.invite") })).not.toBeInTheDocument()
    expect(screen.queryByRole("region", { name: text("pageAdmin.team.transfer.title") })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: text("pageAdmin.team.removeLabel", { name: "Steeve" }) })).not.toBeInTheDocument()
  })

  it("« Mes pages » : un modérateur trouve l'équipe et les commentaires de sa page, sans gestion ni publication", () => {
    const manage = management()
    mocks.capability = {
      useMyPages: () => ready([]),
      useMyTeamPages: () => ready([
        { id: "page-1", handle: "amicale-lyon", name: "Amicale de Lyon", ownerKind: "association", teamRole: "admin", badge: "community" },
        { id: "page-2", handle: "saveurs", name: "Saveurs", ownerKind: "company", teamRole: "moderator", badge: "community" },
      ]),
      management: manage,
    }
    wrap(<MyPagesPanel />)
    expect(screen.getByRole("link", { name: text("pageAdmin.myPages.manageLabel", { name: "Amicale de Lyon" }) })).toHaveAttribute("href", routes.pageManage("amicale-lyon"))
    const moderated = screen.getByRole("link", { name: "Saveurs" }).closest("li")!
    expect(within(moderated).getByText(text("pageAdmin.role.moderator"))).toBeInTheDocument()
    expect(within(moderated).getByRole("link", { name: text("pageAdmin.myPages.moderateLabel", { name: "Saveurs" }) })).toHaveAttribute("href", routes.page("saveurs"))
    expect(within(moderated).getByRole("link", { name: text("pageAdmin.myPages.teamLabel", { name: "Saveurs" }) })).toHaveAttribute("href", routes.pageManage("saveurs", "equipe"))
    expect(within(moderated).queryByRole("link", { name: text("pageAdmin.myPages.manageLabel", { name: "Saveurs" }) })).not.toBeInTheDocument()
    expect(within(moderated).queryByRole("link", { name: text("pagePostManagement.tab") })).not.toBeInTheDocument()
    expect(screen.queryByText(text("pageAdmin.myPages.emptyTitle"))).not.toBeInTheDocument()
  })
})

describe("gérer une page — emplois (DG-025)", () => {
  it("l'onglet n'existe qu'avec le fournisseur des emplois, et monte le recrutement de CETTE page", () => {
    provide(management())
    const view = wrap(<PageManageScreen handle="amicale-lyon" tab="identite" />)
    expect(screen.queryByRole("link", { name: "Emplois" })).toBeNull()
    view.unmount()
    mocks.jobs = {}
    wrap(<PageManageScreen handle="amicale-lyon" tab="emplois" />)
    expect(screen.getByRole("link", { name: "Emplois" })).toHaveAttribute("href", routes.pageManage("amicale-lyon", "emplois"))
    expect(screen.getByRole("region", { name: "Recrutement de amicale-lyon" })).toHaveAttribute("data-page", "page-1")
  })
})

describe("gérer une page — identité et vérification", () => {
  it("enregistre l'identité ; un nom vide est refusé avant le serveur", async () => {
    const manage = provide(management())!
    const user = userEvent.setup()
    wrap(<PageManageScreen handle="amicale-lyon" tab="identite" />)
    const name = screen.getByLabelText(text("pageAdmin.create.name"))
    await user.clear(name)
    await user.click(screen.getByRole("button", { name: text("pageAdmin.identity.save") }))
    expect(await screen.findByText(text("errors.page_name_invalid"))).toBeInTheDocument()
    expect(manage.updateIdentity).not.toHaveBeenCalled()
    await user.type(name, "Amicale gabonaise de Lyon")
    await user.type(screen.getByLabelText(text("pageAdmin.create.shortName")), "AGL")
    await user.click(screen.getByRole("button", { name: text("pageAdmin.identity.save") }))
    await waitFor(() => expect(manage.updateIdentity).toHaveBeenCalledExactlyOnceWith("page-1", {
      name: "Amicale gabonaise de Lyon",
      shortName: "AGL",
      description: "Accueil des nouveaux arrivants.",
      country: "FR",
    }))
  })

  it("pose le logo par la garde des fichiers ; une image refusée ne part pas", async () => {
    const setImage = vi.fn(() => ok({ url: null, withheld: "fileScanPending" as const }))
    provide(management({ setImage }))
    wrap(<PageManageScreen handle="amicale-lyon" tab="identite" />)
    const logo = screen.getByLabelText(text("pageAdmin.images.chooseLogo"))
    fireEvent.change(logo, { target: { files: [new File(["gif"], "logo.gif", { type: "image/gif" })] } })
    expect(await screen.findByText(text("errors.page_image_type_invalid"))).toBeInTheDocument()
    expect(setImage).not.toHaveBeenCalled()
    const png = new File(["png"], "logo.png", { type: "image/png" })
    fireEvent.change(logo, { target: { files: [png] } })
    await waitFor(() => expect(setImage).toHaveBeenCalledExactlyOnceWith("page-1", "logo", png))
    expect(await screen.findByText(text("pageAdmin.images.pending"))).toBeInTheDocument()
  })

  it("dit l'analyse du logo indisponible sans succès ni nouvelle URL, en conservant l'image déjà délivrée", async () => {
    const heldUrl = "https://images.exemple.test/logo-retenu.png"
    const previousUrl = "https://images.exemple.test/logo-delivre.png"
    const setImage = vi.fn(() => ok({ url: heldUrl, withheld: "fileScanUnavailable" as const }))
    provide(management({ setImage, useManagedPage: () => ready({ ...PAGE, logoUrl: previousUrl }) }))
    const view = wrap(<PageManageScreen handle="amicale-lyon" tab="identite" />)
    const logo = screen.getByLabelText(text("pageAdmin.images.chooseLogo"))
    fireEvent.change(logo, { target: { files: [new File(["png"], "logo.png", { type: "image/png" })] } })
    await waitFor(() => expect(setImage).toHaveBeenCalledOnce())
    expect(await screen.findByRole("alert")).toHaveTextContent(t("errors:fileScanUnavailable"))
    expect(mocks.success).not.toHaveBeenCalled()
    expect(view.container.innerHTML).not.toContain(heldUrl)
    expect(view.container.querySelector(`img[src="${previousUrl}"]`)).toBeInTheDocument()
  })

  it("sans dépôt de fichier chez le fournisseur (démonstration), aucune commande d'image n'est promise", () => {
    provide(management())
    wrap(<PageManageScreen handle="amicale-lyon" tab="identite" />)
    expect(screen.queryByText(text("pageAdmin.images.title"))).not.toBeInTheDocument()
  })

  it("un signataire lit l'identité sans pouvoir la modifier", () => {
    provide(management({ useManagedPage: () => ready({ ...PAGE, myRole: "signatory" }) }))
    wrap(<PageManageScreen handle="amicale-lyon" tab="identite" />)
    expect(screen.getByText(text("pageAdmin.identity.adminOnly"))).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: text("pageAdmin.identity.save") })).not.toBeInTheDocument()
  })

  it("dit la confiance sans ambiguïté et propose la vérification à l'administrateur", () => {
    provide(management())
    wrap(<PageManageScreen handle="amicale-lyon" tab="revendications" />)
    expect(screen.getByText(text("pageAdmin.verification.state.community"))).toBeInTheDocument()
    expect(screen.getByRole("link", { name: text("pageAdmin.verification.request") })).toHaveAttribute("href", routes.pageClaim("amicale-lyon"))
  })

  it("une page illisible rend le même écran qu'une page inconnue", () => {
    provide(management({ useManagedPage: () => ready(null) }))
    wrap(<PageManageScreen handle="inconnue" tab="identite" />)
    expect(screen.getByText(text("page.unavailableTitle"))).toBeInTheDocument()
  })
})

describe("gestes depuis la fiche et « Mon activité »", () => {
  it("propose « Gérer » au signataire vivant et « Demander la vérification » à l'administrateur", () => {
    provide(management())
    wrap(<PageAdminEntry pageId="page-1" handle="amicale-lyon" viewerRole="admin" claimable />)
    expect(screen.getByRole("link", { name: text("pageAdmin.entry.manage") })).toHaveAttribute("href", routes.pageManage("amicale-lyon"))
    expect(screen.getByRole("link", { name: text("pageAdmin.entry.verify") })).toHaveAttribute("href", routes.pageClaim("amicale-lyon"))
  })

  it("propose « Revendiquer » à un lecteur sur une page revendicable, rien à un signataire", () => {
    provide(management())
    const view = wrap(<PageAdminEntry pageId="page-1" handle="amicale-lyon" viewerRole={null} claimable />)
    expect(screen.getByRole("link", { name: text("pageAdmin.entry.claim") })).toHaveAttribute("href", routes.pageClaim("amicale-lyon"))
    view.rerender(<I18nProvider locale="fr"><PageAdminEntry pageId="page-1" handle="amicale-lyon" viewerRole="signatory" claimable /></I18nProvider>)
    expect(screen.queryByRole("link", { name: text("pageAdmin.entry.claim") })).not.toBeInTheDocument()
    expect(screen.getByRole("link", { name: text("pageAdmin.entry.manage") })).toBeInTheDocument()
  })

  it("dit l'état de ma revendication en cours au lieu de proposer une seconde demande", () => {
    provide(management({ useMyClaims: () => ready([PENDING_CLAIM]) }))
    wrap(<PageAdminEntry pageId="page-1" handle="amicale-lyon" viewerRole={null} claimable />)
    expect(screen.getByRole("status")).toHaveTextContent(text("pageAdmin.entry.pending"))
    expect(screen.queryByRole("link", { name: text("pageAdmin.entry.claim") })).not.toBeInTheDocument()
  })

  it("ne promet rien sans la capacité", () => {
    mocks.capability = null
    const view = wrap(<PageAdminEntry pageId="page-1" handle="amicale-lyon" viewerRole={null} claimable />)
    expect(view.container).toBeEmptyDOMElement()
  })

  it("liste mes pages et mes invitations ; accepter répond au moteur", async () => {
    const manage = provide(
      management({ useMyInvitations: () => ready([{ page: { ...PENDING_CLAIM.page, id: "page-9", name: "Saveurs (démo)" }, role: "signatory" as const, invitedAt: 1 }]) }),
      ready([{ id: "page-1", handle: "amicale-lyon", name: "Amicale de Lyon", ownerKind: "association", role: "admin", badge: "community" }]),
    )!
    const user = userEvent.setup()
    wrap(<MyPagesPanel />)
    expect(screen.getByRole("link", { name: text("pageAdmin.myPages.manageLabel", { name: "Amicale de Lyon" }) })).toHaveAttribute("href", routes.pageManage("amicale-lyon"))
    expect(screen.getByRole("link", { name: text("pageAdmin.myPages.createAssociation") })).toHaveAttribute("href", routes.newPage("association"))
    await user.click(screen.getByRole("button", { name: text("pageAdmin.invitations.accept") }))
    await waitFor(() => expect(manage.respondToInvitation).toHaveBeenCalledExactlyOnceWith("page-9", true))
  })

  it("AS-01 : « Mon activité » garde mes revendications, sans file d'instruction (elle est au bureau de modération)", () => {
    provide(management({ useMyClaims: () => ready([PENDING_CLAIM]) }))
    wrap(<MyPagesPanel />)
    expect(screen.getByText(text("pageAdmin.myPages.emptyTitle"))).toBeInTheDocument()
    expect(screen.getByText(PENDING_CLAIM.page.name)).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: text("moderationDesk.claims.open") })).not.toBeInTheDocument()
    expect(screen.queryByRole("heading", { name: text("moderationDesk.claims.title") })).not.toBeInTheDocument()
  })
})

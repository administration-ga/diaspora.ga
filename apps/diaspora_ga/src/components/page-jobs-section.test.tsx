// @vitest-environment jsdom
import { DEFAULT_FACET_VISIBILITY } from "@diaspora-ga/domain"
import type { JobOfferCardView, JobsCapability, JobsPage, Loadable, MembershipView, SessionView } from "@diaspora-ga/features/data"
import { getFixedT } from "@diaspora-ga/features/i18n"
import { I18nProvider } from "@diaspora-ga/features/i18n/client"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { PAGE_JOBS_ANCHOR, routes } from "@/lib/routes"

import { PageJobsSection } from "./page-jobs-section"
import { QUIET_MAX_WINDOWS } from "./service-pager"

const t = getFixedT("fr")

const mocks = vi.hoisted(() => ({
  jobs: null as Pick<JobsCapability, "usePageOpenOffers"> | null,
  session: { status: "loading" } as Loadable<SessionView>,
  reads: [] as { pageId: string; cursor: string | null }[],
  windows: new Map<string | null, Loadable<JobsPage<JobOfferCardView> | null>>(),
}))

vi.mock("@diaspora-ga/features/data", async (original) => ({
  ...(await original<typeof import("@diaspora-ga/features/data")>()),
  useJobs: () => mocks.jobs,
  useDataSource: () => ({ kind: "demo" }),
  useSession: () => mocks.session,
}))

const MEMBER: MembershipView = {
  personId: "person-me", handle: "recette", displayName: "Recette", status: "declaree", badges: ["community"],
  facet: { countryOfResidence: "FR", city: "Paris", associationIds: [], helpAvailable: false, visibility: DEFAULT_FACET_VISIBILITY },
  joinedAt: 1, verifiedSince: null, sponsoredBy: null, attestation: { outcome: "none", postSlug: null, requestedAt: null },
  root: { network: "antsia", status: "declaree", derivedFrom: "diaspora-ga" }, canPublish: true, rateTier: "standard", directoryVisibility: "hidden",
}

const SIGNED_IN: Loadable<SessionView> = { status: "ready", data: { status: "signed_in", account: { id: "account-me", idn: null, local: null, nameHints: {} }, membership: MEMBER } }

function offer(id: string, title: string): JobOfferCardView {
  return {
    id, version: 1, title, description: "Offre fictive de recette.", contract: "cdi", country: "FR", city: "Paris", workMode: "onsite", languages: ["fr"],
    payRange: null, closesAt: null, publishedAt: Date.UTC(2026, 10, 1), updatedAt: Date.UTC(2026, 10, 1),
    employer: { id: "page-saveurs", handle: "saveurs-okoume-demo", name: "Saveurs d'Okoumé (fictif)", ownerKind: "company", badge: "community", logoUrl: null },
  }
}

function windowOf(items: JobOfferCardView[], next: string | null = null): Loadable<JobsPage<JobOfferCardView>> {
  return { status: "ready", data: { items, isDone: next === null, continueCursor: next ?? "" } }
}

function tree(canManage = false) {
  return (
    <I18nProvider locale="fr">
      <PageJobsSection pageId="page-saveurs" pageHandle="saveurs-okoume-demo" canManage={canManage} />
    </I18nProvider>
  )
}

beforeEach(() => {
  mocks.session = SIGNED_IN
  mocks.reads.length = 0
  mocks.windows.clear()
  mocks.jobs = {
    usePageOpenOffers: (request) => {
      mocks.reads.push(request)
      return mocks.windows.get(request.cursor) ?? { status: "loading" }
    },
  }
})

afterEach(cleanup)

const heading = () => screen.queryByRole("heading", { level: 2, name: t("jobs.pageSection.title") })

describe("rubrique « Emplois » de la fiche d'une page (EM-04)", () => {
  it("les offres ouvertes de la page, sans répéter la page qui recrute, chacune vers sa fiche", () => {
    mocks.windows.set(null, windowOf([offer("job-1", "Cuisinier (démo)"), offer("job-2", "Livreur (démo)")]))
    render(tree())
    const section = heading()?.closest("section")
    expect(section).toHaveAttribute("id", PAGE_JOBS_ANCHOR)
    const rubric = within(section!)
    expect(rubric.getByRole("link", { name: "Cuisinier (démo)" })).toHaveAttribute("href", routes.jobOffer("job-1"))
    expect(rubric.getByRole("link", { name: "Livreur (démo)" })).toHaveAttribute("href", routes.jobOffer("job-2"))
    expect(rubric.queryByText(t("jobs.card.by", { name: "Saveurs d'Okoumé (fictif)" }))).not.toBeInTheDocument()
    expect(rubric.queryByRole("link", { name: t("jobs.offer.manage") })).not.toBeInTheDocument()
    expect(new Set(mocks.reads.map((read) => JSON.stringify(read)))).toEqual(new Set([JSON.stringify({ pageId: "page-saveurs", cursor: null })]))
  })

  it("qui tient un rôle sur la page a le chemin de la gestion des emplois", () => {
    mocks.windows.set(null, windowOf([offer("job-1", "Cuisinier (démo)")]))
    render(tree(true))
    expect(screen.getByRole("link", { name: t("jobs.offer.manage") })).toHaveAttribute("href", routes.pageManage("saveurs-okoume-demo", "emplois"))
  })

  it.each([
    ["sans offre ouverte", windowOf([])],
    ["illisible pour ce lecteur", { status: "ready", data: null } as const],
    ["pendant le chargement", { status: "loading" } as const],
  ])("aucune rubrique pour une page %s", (_label, loadable) => {
    mocks.windows.set(null, loadable)
    const { container } = render(tree(true))
    expect(heading()).not.toBeInTheDocument()
    expect(container).toBeEmptyDOMElement()
  })

  it("aucune rubrique sans capacité d'emploi ni hors session", () => {
    mocks.windows.set(null, windowOf([offer("job-1", "Cuisinier (démo)")]))
    mocks.jobs = null
    expect(render(tree()).container).toBeEmptyDOMElement()
    cleanup()
    mocks.jobs = { usePageOpenOffers: () => windowOf([offer("job-1", "Cuisinier (démo)")]) }
    mocks.session = { status: "ready", data: { status: "anonymous" } }
    expect(render(tree()).container).toBeEmptyDOMElement()
    cleanup()
    // Un compte sans adhésion à DIASPORA.GA ne lit pas la rubrique non plus.
    mocks.session = { status: "ready", data: { status: "signed_in", account: { id: "account-me", idn: null, local: null, nameHints: {} }, membership: null } }
    expect(render(tree()).container).toBeEmptyDOMElement()
  })

  it("une suite annoncée se lit à la demande, par un bouton DANS la rubrique, sans doublon", () => {
    mocks.windows.set(null, windowOf([offer("job-1", "Cuisinier (démo)")], "suite-1"))
    mocks.windows.set("suite-1", windowOf([offer("job-1", "Cuisinier (démo)"), offer("job-3", "Plongeur (démo)")]))
    render(tree())
    const rubric = within(heading()!.closest("section")!)
    fireEvent.click(rubric.getByRole("button", { name: t("jobs.pageSection.more") }))
    expect(mocks.reads.map((read) => read.cursor)).toContain("suite-1")
    expect(screen.getAllByRole("link", { name: "Cuisinier (démo)" })).toHaveLength(1)
    expect(rubric.getByRole("link", { name: "Plongeur (démo)" })).toHaveAttribute("href", routes.jobOffer("job-3"))
  })

  it("une fenêtre vide qui annonce une suite (offres écartées après l'index) lit la suivante d'elle-même, jamais un bouton seul", () => {
    mocks.windows.set(null, windowOf([], "suite-1"))
    mocks.windows.set("suite-1", windowOf([offer("job-3", "Plongeur (démo)")]))
    render(tree())
    expect(within(heading()!.closest("section")!).getByRole("link", { name: "Plongeur (démo)" })).toBeInTheDocument()
    expect(screen.queryByRole("button")).not.toBeInTheDocument()
  })

  it("des fenêtres toutes vides : la lecture s'arrête au plafond, sans rubrique ni bouton", () => {
    for (let index = 0; index < 8; index += 1) mocks.windows.set(index === 0 ? null : `suite-${index}`, windowOf([], `suite-${index + 1}`))
    const { container } = render(tree())
    expect(container).toBeEmptyDOMElement()
    expect(new Set(mocks.reads.map((read) => read.cursor)).size).toBe(QUIET_MAX_WINDOWS)
  })

  it("une erreur sans offre lue se tait ; après des offres, elle se dit dans la rubrique", () => {
    mocks.windows.set(null, { status: "error", code: "unknown" })
    expect(render(tree()).container).toBeEmptyDOMElement()
    cleanup()
    mocks.windows.clear()
    mocks.windows.set(null, windowOf([offer("job-1", "Cuisinier (démo)")], "suite-1"))
    mocks.windows.set("suite-1", { status: "error", code: "unknown" })
    render(tree())
    const rubric = within(heading()!.closest("section")!)
    fireEvent.click(rubric.getByRole("button", { name: t("jobs.pageSection.more") }))
    expect(rubric.getByRole("alert")).toHaveTextContent(t("errors.unknown"))
  })

  it("arrivé par l'ancre de la rubrique, on y descend et le focus s'y pose", () => {
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView
    window.location.hash = `#${PAGE_JOBS_ANCHOR}`
    try {
      mocks.windows.set(null, windowOf([offer("job-1", "Cuisinier (démo)")]))
      render(tree())
      const section = heading()!.closest("section")!
      expect(scrollIntoView).toHaveBeenCalledWith({ block: "start" })
      expect(document.activeElement).toBe(section)
    } finally {
      window.location.hash = ""
    }
  })
})

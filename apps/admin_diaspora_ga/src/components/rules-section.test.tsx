// @vitest-environment jsdom
import { createAppI18n } from "@diaspora-ga/features/i18n"
import { cleanup, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { FunctionReference } from "convex/server"
import { I18nextProvider } from "react-i18next"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { APP_NAMESPACE, appResources } from "@/i18n/resources"
import { BLOCKED_TERMS_PAGE, POLICY_SURFACES } from "@/lib/moderation-rules"

import { RULE_VALUES } from "./rules-section"

/**
 * CH-815 A6 — la section « Règles » : les défauts du moteur, une ligne par rubrique servie, la
 * règle posée motif à l'appui (arguments exacts, bornes, refus nommé par le moteur), les mots
 * bloqués par fenêtres, leur ajout et leur retrait motivés.
 */
const NETWORK_ID = "network-diaspora"
const ADMIN = { personId: "person-admin", displayName: "Awa NDONG", networkId: NETWORK_ID, networkSlug: "diaspora-ga", networkName: "DIASPORA.GA", accessLogged: true } as never
const POLICIES = "modules/moderation/networkAdmin:policies"
const TERMS = "modules/moderation/networkAdmin:blockedTermsPage"
const SET_POLICY = "modules/moderation/networkAdmin:setPolicy"
const SET_TERM = "modules/moderation/networkAdmin:setBlockedTerm"
const MINUTE = 60_000

const DEFAULTS = { preReview: false, maxLinks: 3, maxWrites: 10, windowMs: MINUTE }
const SETTINGS = {
  defaults: DEFAULTS,
  surfaces: [
    { surface: "comment", withoutPolicy: "defaults", policy: null },
    { surface: "post", withoutPolicy: "defaults", policy: { preReview: true, maxLinks: 2, maxWrites: 5, windowMs: 2 * 60 * MINUTE, updatedAt: Date.UTC(2026, 10, 18) } },
    { surface: "serviceReview", withoutPolicy: "held", policy: null },
    { surface: "person", withoutPolicy: "defaults", policy: null },
  ],
}
const FIRST = { page: [{ termId: "term-1", term: "arnaque", updatedAt: Date.UTC(2026, 10, 1) }], isDone: false, continueCursor: "suite-1" }
const SECOND = { page: [{ termId: "term-2", term: "loterie", updatedAt: Date.UTC(2026, 10, 2) }], isDone: true, continueCursor: "" }

const mocks = vi.hoisted(() => ({
  args: new Map<string, unknown[]>(),
  writes: new Map<string, ReturnType<typeof vi.fn>>(),
  success: vi.fn(),
}))

vi.mock("sonner", () => ({ toast: { success: mocks.success, error: vi.fn() } }))
vi.mock("convex/react", async () => {
  const { getFunctionName: name } = await import("convex/server")
  return {
    useQuery: (reference: FunctionReference<"query">, args: { paginationOpts?: { cursor: string | null } }) => {
      const path = name(reference)
      mocks.args.set(path, [...(mocks.args.get(path) ?? []), args])
      if (path === POLICIES) return SETTINGS
      if (path === TERMS) return args.paginationOpts?.cursor === "suite-1" ? SECOND : FIRST
      throw new Error(`lecture inattendue : ${path}`)
    },
    useMutation: (reference: FunctionReference<"mutation">) => {
      const write = mocks.writes.get(name(reference))
      if (!write) throw new Error(`écriture inattendue : ${name(reference)}`)
      return write
    },
  }
})

import { NetworkAdminProvider } from "./network-admin-context"
import { RulesSection } from "./rules-section"

const i18n = createAppI18n({ locale: "fr", appResources, defaultNS: APP_NAMESPACE })
const t = i18n.getFixedT("fr", APP_NAMESPACE)
const members = i18n.getFixedT("fr", "diaspora-ga")
/** Le texte tel que Testing Library le compare : espaces insécables de la typographie française ramenées à l'espace. */
const n = (text: string) => text.replace(/\s+/gu, " ")
const refusal = (data: Record<string, unknown>) => Object.assign(new Error("refus"), { data })

function mount() {
  return render(
    <I18nextProvider i18n={i18n}>
      <NetworkAdminProvider admin={ADMIN}>
        <RulesSection />
      </NetworkAdminProvider>
    </I18nextProvider>,
  )
}

const surfaceCard = (surface: string) => within(screen.getByRole("heading", { level: 3, name: members(`moderationDesk.surface.${surface}`) }).closest("li")!)

async function openPolicy(surface: string) {
  const user = userEvent.setup()
  await user.click(surfaceCard(surface).getByRole("button"))
  return { user, dialog: within(await screen.findByRole("dialog")) }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.args.clear()
  mocks.writes = new Map([
    [SET_POLICY, vi.fn().mockResolvedValue({ policyId: "policy-1" })],
    [SET_TERM, vi.fn().mockResolvedValue({ termId: "term-9" })],
  ])
})
afterEach(() => cleanup())

describe("section Règles — lectures", () => {
  it("lit les règles et la première fenêtre des mots bloqués du réseau administré, sans rien écrire", () => {
    mount()
    expect(mocks.args.get(POLICIES)?.at(-1)).toEqual({ networkId: NETWORK_ID })
    expect(mocks.args.get(TERMS)?.at(-1)).toEqual({ networkId: NETWORK_ID, paginationOpts: { cursor: null, numItems: BLOCKED_TERMS_PAGE } })
    for (const write of mocks.writes.values()) expect(write).not.toHaveBeenCalled()
  })

  it("les défauts du moteur viennent de sa réponse ; une ligne par rubrique servie, dans l'ordre de l'écran", () => {
    mount()
    expect(screen.getByText(n(t("rules.defaults.links", { count: 3 })))).toBeInTheDocument()
    const order = screen.getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent)
    const served = POLICY_SURFACES.filter((surface) => ["comment", "post", "serviceReview"].includes(surface)).map((surface) => members(`moderationDesk.surface.${surface}`))
    expect(order.filter((name) => served.includes(name ?? ""))).toEqual(served)
    // Le compte (`person`) n'est pas une rubrique de DIASPORA.GA : aucune ligne.
    expect(screen.queryByRole("heading", { level: 3, name: members("moderationDesk.surface.person") })).toBeNull()
    expect(surfaceCard("post").getByText(n(t("rules.policy.preReviewOn")))).toBeInTheDocument()
    expect(surfaceCard("serviceReview").getByText(n(t("rules.without.held")))).toBeInTheDocument()
  })
})

describe("section Règles — poser une règle", () => {
  it("hors bornes, le champ le dit et rien n'est envoyé ; dans les bornes, l'appel exact au moteur", async () => {
    mount()
    const { user, dialog } = await openPolicy("comment")
    const links = dialog.getByLabelText(t("rules.sheet.maxLinks"))
    await user.clear(links)
    await user.type(links, "999")
    await user.type(dialog.getByLabelText(t("decision.reason")), "Trop de liens publicitaires en commentaire.")
    await user.click(dialog.getByRole("button", { name: t("rules.sheet.submit") }))
    expect(await dialog.findByText(n(t("rules.refusal.links", RULE_VALUES)))).toBeInTheDocument()
    expect(mocks.writes.get(SET_POLICY)).not.toHaveBeenCalled()
    await user.clear(links)
    await user.type(links, "1")
    const window = dialog.getByLabelText(t("rules.sheet.window"))
    await user.clear(window)
    await user.type(window, "5")
    await user.click(dialog.getByRole("checkbox"))
    await user.click(dialog.getByRole("button", { name: t("rules.sheet.submit") }))
    await waitFor(() =>
      expect(mocks.writes.get(SET_POLICY)).toHaveBeenCalledWith({
        networkId: NETWORK_ID,
        surface: "comment",
        preReview: true,
        maxLinks: 1,
        maxWrites: 10,
        windowMs: 5 * MINUTE,
        reason: "Trop de liens publicitaires en commentaire.",
      }),
    )
    expect(mocks.success).toHaveBeenCalledWith(t("rules.sheet.saved", { surface: members("moderationDesk.surface.comment") }))
  })

  it("une rubrique relue d'office part de « tout relire » ; le champ refusé par le moteur est dit par sa phrase", async () => {
    mocks.writes.get(SET_POLICY)!.mockRejectedValueOnce(refusal({ code: "invalidArgument", field: "maxWrites" }))
    mount()
    const { user, dialog } = await openPolicy("serviceReview")
    expect(dialog.getByRole("checkbox")).toBeChecked()
    expect(dialog.getByText(n(t("rules.sheet.liftsHeld.reviews")))).toBeInTheDocument()
    await user.type(dialog.getByLabelText(t("decision.reason")), "Avis relus par la modération du pays.")
    await user.click(dialog.getByRole("button", { name: t("rules.sheet.submit") }))
    expect(await dialog.findByText(n(t("rules.refusal.writes", RULE_VALUES)))).toBeInTheDocument()
    expect(mocks.success).not.toHaveBeenCalled()
  })
})

describe("section Règles — mots bloqués", () => {
  it("par fenêtres : « Afficher plus » lit la suivante à son curseur, les deux s'affichent", async () => {
    const user = userEvent.setup()
    mount()
    expect(screen.getByText("arnaque")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: t("section.loadMore") }))
    expect(mocks.args.get(TERMS)?.at(-1)).toEqual({ networkId: NETWORK_ID, paginationOpts: { cursor: "suite-1", numItems: BLOCKED_TERMS_PAGE } })
    expect(await screen.findByText("loterie")).toBeInTheDocument()
    expect(screen.getByText("arnaque")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: t("section.loadMore") })).toBeNull()
  })

  it("bloquer un mot : borné, motivé ; le plafond atteint se dit en clair", async () => {
    mocks.writes.get(SET_TERM)!.mockRejectedValueOnce(refusal({ code: "policyRefused" }))
    const user = userEvent.setup()
    mount()
    const add = within(screen.getByRole("heading", { level: 3, name: t("rules.terms.addTitle") }).closest("div")!)
    await user.type(add.getByLabelText(t("rules.terms.term")), "a")
    await user.type(add.getByLabelText(t("decision.reason")), "Escroquerie signalée dans plusieurs pays.")
    await user.click(add.getByRole("button", { name: t("rules.terms.add") }))
    expect(await add.findByText(n(t("rules.refusal.termLength", RULE_VALUES)))).toBeInTheDocument()
    expect(mocks.writes.get(SET_TERM)).not.toHaveBeenCalled()
    await user.type(add.getByLabelText(t("rules.terms.term")), "rnaqueur")
    await user.click(add.getByRole("button", { name: t("rules.terms.add") }))
    await waitFor(() => expect(mocks.writes.get(SET_TERM)).toHaveBeenCalledWith({ networkId: NETWORK_ID, term: "arnaqueur", active: true, reason: "Escroquerie signalée dans plusieurs pays." }))
    expect(await add.findByText(n(t("rules.refusal.termsFull", RULE_VALUES)))).toBeInTheDocument()
  })

  it("débloquer un mot : une feuille, un motif, l'appel exact au moteur", async () => {
    const user = userEvent.setup()
    mount()
    await user.click(screen.getByRole("button", { name: t("rules.terms.removeFor", { term: "arnaque" }) }))
    const dialog = within(await screen.findByRole("dialog"))
    await user.type(dialog.getByLabelText(t("decision.reason")), "Le mot visait une association légitime.")
    await user.click(dialog.getByRole("button", { name: t("rules.terms.removeConfirm") }))
    await waitFor(() => expect(mocks.writes.get(SET_TERM)).toHaveBeenCalledWith({ networkId: NETWORK_ID, term: "arnaque", active: false, reason: "Le mot visait une association légitime." }))
    expect(mocks.success).toHaveBeenCalledWith(t("rules.terms.removed", { term: "arnaque" }))
  })
})

describe("section Règles — noms accessibles des gestes de ligne", () => {
  it("chaque réglage et chaque mot bloqué est nommé dans son geste ; le texte visible reste le même", () => {
    mount()
    const post = members("moderationDesk.surface.post")
    const review = members("moderationDesk.surface.serviceReview")
    // Une rubrique réglée se change, une rubrique sans réglage s'en pose un : chaque bouton nomme sa rubrique.
    expect(surfaceCard("post").getByRole("button", { name: t("rules.policy.changeFor", { surface: post }) })).toHaveTextContent(t("rules.policy.change"))
    expect(surfaceCard("serviceReview").getByRole("button", { name: t("rules.policy.setFor", { surface: review }) })).toHaveTextContent(t("rules.policy.set"))
    expect(screen.getByRole("button", { name: t("rules.terms.removeFor", { term: "arnaque" }) })).toHaveTextContent(t("rules.terms.remove"))
  })
})

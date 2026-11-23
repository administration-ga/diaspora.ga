// @vitest-environment jsdom
import { AUDIT_CAPACITIES } from "@antsia/social-domain/audit"
import { createAppI18n } from "@diaspora-ga/features/i18n"
import { cleanup, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { FunctionReference } from "convex/server"
import { I18nextProvider } from "react-i18next"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { APP_NAMESPACE, appResources } from "@/i18n/resources"
import { JOURNAL_ACTION_LABEL_KEYS, JOURNAL_CAPACITY_LABEL_KEYS, JOURNAL_FILTER_ACTIONS, JOURNAL_PAGE, type JournalEntry } from "@/lib/journal"

/**
 * CH-815 A7 — la section « Journal » : la lecture du journal d'administration avec ses arguments
 * exacts, le filtre par action, une fenêtre filtrée vide qui annonce sa suite (« Charger la
 * suite », jamais « aucun résultat » tant que le journal n'est pas lu jusqu'au bout), les
 * libellés d'action et de qualité, le libellé neutre d'une action inconnue, le refus de lecture.
 * Personnes et décisions fictives.
 */
const NETWORK_ID = "network-diaspora"
const ADMIN = { personId: "person-admin", displayName: "Awa NDONG", networkId: NETWORK_ID, networkSlug: "diaspora-ga", networkName: "DIASPORA.GA", accessLogged: true } as never
const JOURNAL = "modules/platform/audit:paginateNetworkAdminAudit"

type Window = { page: JournalEntry[]; isDone: boolean; continueCursor: string }

const mocks = vi.hoisted(() => ({
  windows: new Map<string, unknown>(),
  failure: null as unknown,
  args: [] as unknown[],
}))

vi.mock("convex/react", async () => {
  const { getFunctionName: name } = await import("convex/server")
  return {
    useQuery: (reference: FunctionReference<"query">, args: { action?: string; paginationOpts: { cursor: string | null } }) => {
      const path = name(reference)
      if (path !== JOURNAL) throw new Error(`lecture inattendue : ${path}`)
      mocks.args.push(args)
      if (mocks.failure) throw mocks.failure
      return mocks.windows.get(`${args.action ?? "*"}:${args.paginationOpts.cursor ?? ""}`)
    },
    useMutation: () => {
      throw new Error("aucune écriture attendue")
    },
  }
})

import { JournalSection } from "./journal-section"
import { NetworkAdminProvider } from "./network-admin-context"

const i18n = createAppI18n({ locale: "fr", appResources, defaultNS: APP_NAMESPACE })
const t = i18n.getFixedT("fr", APP_NAMESPACE)
const members = i18n.getFixedT("fr", "diaspora-ga")
const errors = i18n.getFixedT("fr", "errors")
/** Le texte tel que Testing Library le compare : espaces insécables de la typographie française ramenées à l'espace. */
const n = (text: string) => text.replace(/\s+/gu, " ")

/** Une ligne fictive : identifiants en clair (le moteur les rend opaques). */
function entry(overrides: Partial<Record<keyof JournalEntry, unknown>> = {}): JournalEntry {
  return {
    auditId: "audit-1",
    action: "network.feature_set",
    capacity: "network_admin",
    actor: { personId: "person-admin", displayName: "Awa NDONG", handle: "awa.ndong" },
    networkId: NETWORK_ID,
    subject: { table: "networks", id: NETWORK_ID },
    details: { reason: "Ouverture des pages pour le lancement.", feature: "pages", enabled: true },
    at: Date.UTC(2026, 10, 22, 10, 0),
    reason: "Ouverture des pages pour le lancement.",
    ...overrides,
  } as unknown as JournalEntry
}

const done = (page: JournalEntry[]): Window => ({ page, isDone: true, continueCursor: "" })

function mount() {
  return render(
    <I18nextProvider i18n={i18n}>
      <NetworkAdminProvider admin={ADMIN}>
        <JournalSection />
      </NetworkAdminProvider>
    </I18nextProvider>,
  )
}

beforeEach(() => {
  mocks.windows.clear()
  mocks.failure = null
  mocks.args = []
})
afterEach(() => cleanup())

describe("section Journal — lecture", () => {
  it("lit la première fenêtre du journal d'administration, sans filtre, pour le réseau administré", () => {
    mocks.windows.set("*:", done([entry()]))
    mount()
    expect(mocks.args.at(-1)).toEqual({ networkId: NETWORK_ID, paginationOpts: { cursor: null, numItems: JOURNAL_PAGE } })
  })

  it("qui, quoi, quand, à quel titre, avec quel motif ; le module nommé par son libellé", () => {
    mocks.windows.set("*:", done([entry()]))
    mount()
    const line = within(screen.getByRole("listitem"))
    expect(line.getByText(t("journal.action.featureSet"))).toBeInTheDocument()
    expect(line.getByText(n(t("journal.detail.featureOpened", { module: members("networkFeatures.names.pages") })))).toBeInTheDocument()
    expect(line.getByText("Awa NDONG")).toBeInTheDocument()
    expect(line.getByText(t("journal.capacity.networkAdmin"))).toBeInTheDocument()
    expect(line.getByText("Ouverture des pages pour le lancement.")).toBeInTheDocument()
    expect(line.getByText((_, element) => element?.tagName === "TIME")).toHaveAttribute("dateTime", new Date(Date.UTC(2026, 10, 22, 10, 0)).toISOString())
  })

  it("un acte du moteur n'a pas d'auteur ; un profil non publié reçoit un nom neutre ; sans motif, pas de ligne « Motif »", () => {
    mocks.windows.set(
      "*:",
      done([
        entry({ auditId: "a-1", action: "moderation.report_decide", capacity: "system", actor: null, details: null, reason: null }),
        entry({ auditId: "a-2", action: "network.admin_access", actor: { personId: "person-x", displayName: null, handle: null }, details: null, reason: null }),
      ]),
    )
    mount()
    const [first, second] = screen.getAllByRole("listitem").map((item) => within(item))
    expect(first!.getByText(t("journal.systemActor"))).toBeInTheDocument()
    expect(first!.getByText(t("journal.capacity.system"))).toBeInTheDocument()
    expect(second!.getByText(t("journal.neutralActor"))).toBeInTheDocument()
    expect(second!.getByText(t("journal.action.adminAccess"))).toBeInTheDocument()
    expect(screen.queryByText(t("journal.reason"))).toBeNull()
  })

  it("une action que l'écran ne nomme pas reçoit le libellé neutre, son code à l'appui", () => {
    mocks.windows.set("*:", done([entry({ action: "file.release", details: null, reason: null })]))
    mount()
    expect(screen.getByText(t("journal.action.other", { code: "file.release" }))).toBeInTheDocument()
  })

  it("le changement d'un rôle se lit de l'ancien au nouveau", () => {
    mocks.windows.set("*:", done([entry({ action: "membership.role_set", details: { reason: "Relève de la modération.", from: "member", to: "network_moderator" } })]))
    mount()
    expect(screen.getByText(n(t("journal.detail.role", { from: t("journal.detail.roleMember"), to: t("responsibles.role.network_moderator") })))).toBeInTheDocument()
  })

  it("un pays ouvert, relais attestés ; le pays posé sur une équipe, ou retiré (CH-815 A7)", () => {
    mocks.windows.set(
      "*:",
      done([
        entry({ auditId: "c-1", action: "diaspora.country_set", details: { reason: "Équipe en place.", country: "BE", open: true, activeModerators: 1, relayAssociationsAttested: true } }),
        entry({ auditId: "c-2", action: "moderation.team_country_set", details: { reason: "Équipe de Belgique.", country: "BE", previousCountry: null } }),
        entry({ auditId: "c-3", action: "moderation.team_country_set", details: { reason: "Équipe transversale.", country: null, previousCountry: "BE" } }),
      ]),
    )
    mount()
    const [opened, set, removed] = screen.getAllByRole("listitem").map((item) => within(item))
    expect(opened!.getByText(t("journal.action.countrySet"))).toBeInTheDocument()
    expect(opened!.getByText(`${t("journal.detail.countryOpened", { country: "Belgique" })} · ${t("journal.detail.relaysAttested")}`)).toBeInTheDocument()
    expect(set!.getByText(n(t("journal.detail.teamCountry", { country: "Belgique" })))).toBeInTheDocument()
    expect(removed!.getByText(t("journal.detail.teamCountryRemoved"))).toBeInTheDocument()
  })

  it("journal vide et lu jusqu'au bout : il le dit", () => {
    mocks.windows.set("*:", done([]))
    mount()
    expect(screen.getByText(t("journal.emptyTitle"))).toBeInTheDocument()
  })

  it("pendant la lecture : un état de chargement, aucune ligne inventée", () => {
    mount()
    expect(screen.getByRole("status")).toHaveTextContent(t("section.loading"))
    expect(screen.queryByRole("listitem")).toBeNull()
  })

  it("un refus de lecture reste dans la section, traduit, avec « Relire »", () => {
    mocks.failure = Object.assign(new Error("refus"), { data: { code: "notFound" } })
    mount()
    expect(screen.getByRole("alert")).toHaveTextContent(errors("notFound"))
    expect(screen.getByRole("button", { name: t("section.retry") })).toBeInTheDocument()
  })
})

describe("section Journal — filtre et suite", () => {
  it("filtrer par action relit le journal avec cette action, depuis le début", async () => {
    const user = userEvent.setup()
    mocks.windows.set("*:", done([entry()]))
    mocks.windows.set("diaspora.founder_admit:", done([entry({ auditId: "f-1", action: "diaspora.founder_admit", details: { reason: "Fondatrice de l'association.", seniorityWaiver: true }, reason: "Fondatrice de l'association." })]))
    mount()
    await user.selectOptions(screen.getByLabelText(t("journal.filter")), "diaspora.founder_admit")
    expect(mocks.args.at(-1)).toEqual({ networkId: NETWORK_ID, action: "diaspora.founder_admit", paginationOpts: { cursor: null, numItems: JOURNAL_PAGE } })
    expect(screen.getByText(t("journal.detail.seniorityWaiver"))).toBeInTheDocument()
  })

  it("une fenêtre filtrée vide qui annonce sa suite : « Charger la suite », jamais « aucun résultat », puis la suite lue à son curseur", async () => {
    const user = userEvent.setup()
    mocks.windows.set("*:", done([]))
    mocks.windows.set("page.sleep:", { page: [], isDone: false, continueCursor: "suite-1" })
    mocks.windows.set("page.sleep:suite-1", done([entry({ auditId: "s-1", action: "page.sleep", details: { reason: "Mise à jour des statuts.", sleepEndsAt: Date.UTC(2026, 11, 22) }, reason: "Mise à jour des statuts." })]))
    mount()
    await user.selectOptions(screen.getByLabelText(t("journal.filter")), "page.sleep")
    expect(screen.getByText(n(t("journal.scanning")))).toBeInTheDocument()
    expect(screen.queryByText(t("journal.emptyFilteredTitle"))).toBeNull()
    await user.click(screen.getByRole("button", { name: t("journal.loadMore") }))
    expect(mocks.args.at(-1)).toEqual({ networkId: NETWORK_ID, action: "page.sleep", paginationOpts: { cursor: "suite-1", numItems: JOURNAL_PAGE } })
    expect(within(await screen.findByRole("listitem")).getByText(t("journal.action.pageSleep"))).toBeInTheDocument()
    expect(screen.queryByText(n(t("journal.scanning")))).toBeNull()
    expect(screen.queryByRole("button", { name: t("journal.loadMore") })).toBeNull()
  })

  it("filtré et lu jusqu'au bout sans ligne : « aucune décision de ce type »", async () => {
    const user = userEvent.setup()
    mocks.windows.set("*:", done([]))
    mocks.windows.set("page.wake:", done([]))
    mount()
    await user.selectOptions(screen.getByLabelText(t("journal.filter")), "page.wake")
    expect(screen.getByText(t("journal.emptyFilteredTitle"))).toBeInTheDocument()
  })

  it("le filtre propose chaque action nommée, dans l'ordre de la table, après « Toutes les décisions »", () => {
    mocks.windows.set("*:", done([]))
    mount()
    const options = within(screen.getByLabelText(t("journal.filter"))).getAllByRole("option")
    expect(options.map((option) => (option as HTMLOptionElement).value)).toEqual(["", ...JOURNAL_FILTER_ACTIONS])
  })
})

describe("libellés du journal", () => {
  it("toutes les actions que l'administration produit ici ont leur libellé", () => {
    const produced = [
      "network.admin_access",
      "network.feature_set",
      "membership.role_set",
      "moderation.team_create",
      "moderation.team_member_set",
      "moderation.policy_set",
      "moderation.term_set",
      "moderation.appeal_decide",
      "page.create_official",
      "page.signatory_grant",
      "page.signatory_revoke",
      "page.sleep",
      "page.wake",
      "diaspora.founder_admit",
      "diaspora.founder_withdraw",
      "diaspora.country_set",
      "moderation.team_country_set",
    ]
    for (const action of produced) expect(Object.keys(JOURNAL_ACTION_LABEL_KEYS), action).toContain(action)
  })

  it("chaque qualité du moteur a son libellé", () => {
    expect(Object.keys(JOURNAL_CAPACITY_LABEL_KEYS).sort()).toEqual([...AUDIT_CAPACITIES].sort())
  })
})

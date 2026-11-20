// @vitest-environment jsdom
import { DEFAULT_FACET_VISIBILITY } from "@diasporale/domain"
import { DataSourceProvider, type DiasporaleDataSource, type MembershipView } from "@diasporale/features/data"
import { createDemoDataSource, createDemoSeed, DemoStore } from "@diasporale/features/demo"
import { I18nProvider } from "@diasporale/features/i18n/client"
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import type { ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { routes } from "@/lib/routes"

import { AssociationMembersScreen, MyAssociationsScreen } from "./association-screens"

const mocks = vi.hoisted(() => ({ gate: vi.fn() }))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/mes-associations",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}))
// La garde et le chrome sont isolés : ces tests vérifient l'écran branché sur la
// vraie démonstration ; l'autorisation reste jugée par le fournisseur.
vi.mock("@/components/gate", () => ({
  Gate: (props: { require: string; children: (session: { membership: MembershipView | null }) => ReactNode }) => {
    mocks.gate(props.require)
    return <>{props.children({ membership: MEMBER })}</>
  },
  GateSkeleton: () => <div role="status" />,
}))
vi.mock("@/components/app-shell", () => ({ AppShell: (props: { children: ReactNode }) => <>{props.children}</> }))

const NOW = Date.UTC(2026, 9, 18, 9)
const MEMBER: MembershipView = {
  personId: "p-viewer", handle: "recette", displayName: "Recette", status: "verifiee", badges: ["verified"],
  facet: { countryOfResidence: "FR", associationIds: [], helpAvailable: false, visibility: DEFAULT_FACET_VISIBILITY },
  joinedAt: 1, verifiedSince: 1, sponsoredBy: null, attestation: { outcome: "none", postSlug: null, requestedAt: null },
  root: { network: "antsia", status: "verifiee", derivedFrom: "diasporale" }, canPublish: true, rateTier: "standard", directoryVisibility: "hidden",
}

function memoryStorage(): Storage {
  const items = new Map<string, string>()
  return {
    get length() { return items.size },
    clear: () => items.clear(),
    getItem: (key) => items.get(key) ?? null,
    key: (index) => [...items.keys()][index] ?? null,
    removeItem: (key) => void items.delete(key),
    setItem: (key, value) => void items.set(key, value),
  }
}

function mount(viewer: string, screenNode: ReactNode, options: { withCapability?: boolean; locale?: "fr" | "en"; withdrawnProfiles?: readonly string[] } = {}) {
  const seed = createDemoSeed(NOW)
  // Un profil retiré : la liste ne dit plus son nom.
  for (const personId of options.withdrawnProfiles ?? []) {
    const person = seed.persons[personId]
    if (person) seed.persons[personId] = { ...person, withdrawnAt: NOW - 1 }
  }
  const state = { ...seed, session: { personId: viewer } }
  const store = new DemoStore({ getItem: () => JSON.stringify(state), setItem: () => undefined, removeItem: () => undefined }, () => NOW, 0)
  const source = options.withCapability === false ? ({} as DiasporaleDataSource) : createDemoDataSource(store)
  render(
    <I18nProvider locale={options.locale ?? "fr"}>
      <DataSourceProvider source={source}>{screenNode}</DataSourceProvider>
    </I18nProvider>,
  )
  return { store, source }
}

/** Les onglets Radix s'activent à la pression du bouton principal. */
function openTab(name: string) {
  fireEvent.mouseDown(screen.getByRole("tab", { name }), { button: 0, ctrlKey: false })
}

beforeEach(() => {
  Object.defineProperty(window, "localStorage", { value: memoryStorage(), configurable: true })
})
afterEach(cleanup)

// L'équipe vivante du collectif lyonnais (jeu fictif des pages) : Steeve l'administre et
// y a invité Mireille comme signataire ; une invitation non acceptée ne donne aucun droit.
describe("/pages/<handle>/adherents — les responsables de l'association", () => {
  it("l'administrateur accepte une demande puis la retrouve parmi les adhérents", async () => {
    mount("p-steeve", <AssociationMembersScreen handle="collectif-ivindo-lyon" />)
    expect(mocks.gate).toHaveBeenCalledWith("member")
    expect(screen.getByRole("heading", { level: 1, name: "Adhérents et demandes" })).toBeInTheDocument()
    expect(screen.getByText("Collectif Ivindo de Lyon (démo)")).toBeInTheDocument()
    expect(screen.getByText(/ne constitue pas un registre légal des adhérents/)).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Retour à la page de l'association" })).toHaveAttribute("href", routes.page("collectif-ivindo-lyon"))
    expect(screen.getByRole("tab", { name: "Demandes" })).toHaveAttribute("aria-selected", "true")
    const request = screen.getByRole("listitem")
    expect(within(request).getByRole("link", { name: "Rodrigue KOMO" })).toHaveAttribute("href", routes.profile("rodrigue.komo"))
    expect(within(request).getByText(/Son mot : J'arrive à Lyon en janvier/)).toBeInTheDocument()

    await act(async () => { fireEvent.click(within(request).getByRole("button", { name: "Accepter la demande de Rodrigue KOMO" })) })
    expect(await screen.findByText("Demande acceptée.")).toBeInTheDocument()
    expect(await screen.findByText("Aucune demande en attente.")).toBeInTheDocument()

    openTab("Adhérents")
    const accepted = await screen.findAllByRole("listitem")
    expect(accepted.map((item) => within(item).getAllByRole("link")[0]!.textContent)).toEqual(["Nadia MPASSA", "Clarisse MBÉI", "Rodrigue KOMO"])
    expect(within(accepted[0]!).getByText("Rôle : Animateur")).toBeInTheDocument()
  })

  it("exclure exige un motif ; la personne exclue peut ensuite être autorisée à redemander", async () => {
    mount("p-steeve", <AssociationMembersScreen handle="collectif-ivindo-lyon" />)
    openTab("Adhérents")
    const nadia = (await screen.findAllByRole("listitem"))[0]!
    fireEvent.click(within(nadia).getByRole("button", { name: "Exclure Nadia MPASSA de l'association" }))
    const sheet = await screen.findByRole("dialog", { name: "Exclure Nadia MPASSA de l'association ?" })
    const reason = within(sheet).getByLabelText("Motif (obligatoire)")
    fireEvent.change(reason, { target: { value: "bref" } })
    await act(async () => { fireEvent.click(within(sheet).getByRole("button", { name: "Exclure" })) })
    expect(await within(sheet).findByText("Une exclusion se motive : précisez le motif.")).toBeInTheDocument()
    fireEvent.change(reason, { target: { value: "Propos injurieux répétés" } })
    await act(async () => { fireEvent.click(within(sheet).getByRole("button", { name: "Exclure" })) })
    expect(await screen.findByText("Exclusion enregistrée.")).toBeInTheDocument()
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()

    openTab("Exclusions")
    const removed = await screen.findByRole("listitem")
    expect(within(removed).getByText("Motif : Propos injurieux répétés")).toBeInTheDocument()
    await act(async () => { fireEvent.click(within(removed).getByRole("button", { name: "Autoriser une nouvelle demande de Nadia MPASSA" })) })
    // L'issue annoncée, et la ligne qui le dit désormais.
    await waitFor(() => expect(screen.getAllByText("Nouvelle demande autorisée.")).toHaveLength(2))
    expect(screen.queryByRole("button", { name: /^Autoriser une nouvelle demande/ })).not.toBeInTheDocument()
  })

  it("confier l'animation puis la retirer", async () => {
    mount("p-steeve", <AssociationMembersScreen handle="collectif-ivindo-lyon" />)
    openTab("Adhérents")
    const clarisse = (await screen.findAllByRole("listitem"))[1]!
    const entrust = within(clarisse).getByRole("button", { name: "Confier l'animation à Clarisse MBÉI" })
    expect(entrust).toHaveTextContent("Confier l'animation")
    await act(async () => { fireEvent.click(entrust) })
    expect(await screen.findByText("Rôle mis à jour.")).toBeInTheDocument()
    expect(within((await screen.findAllByRole("listitem"))[1]!).getByRole("button", { name: "Retirer l'animation à Clarisse MBÉI" })).toHaveTextContent("Retirer l'animation")
  })

  it("chaque geste sur une personne la nomme dans son nom accessible, et dit « un profil non publié » quand le nom manque", async () => {
    mount("p-steeve", <AssociationMembersScreen handle="collectif-ivindo-lyon" />)
    const request = screen.getByRole("listitem")
    // Le libellé visible reste le verbe, en tête du nom accessible.
    expect(within(request).getByRole("button", { name: "Accepter la demande de Rodrigue KOMO" })).toHaveTextContent("Accepter")
    expect(within(request).getByRole("button", { name: "Refuser la demande de Rodrigue KOMO" })).toHaveTextContent("Refuser")
    openTab("Adhérents")
    const [nadia] = await screen.findAllByRole("listitem")
    expect(within(nadia!).getByRole("button", { name: "Retirer l'animation à Nadia MPASSA" })).toBeInTheDocument()
    expect(within(nadia!).getByRole("button", { name: "Exclure Nadia MPASSA de l'association" })).toHaveTextContent("Exclure")
    cleanup()

    mount("p-steeve", <AssociationMembersScreen handle="collectif-ivindo-lyon" />, { withdrawnProfiles: ["p-rodrigue"] })
    const unnamed = screen.getByRole("listitem")
    expect(within(unnamed).getByText("Profil non publié")).toBeInTheDocument()
    expect(within(unnamed).getByRole("button", { name: "Accepter la demande d’un profil non publié" })).toBeInTheDocument()
    expect(within(unnamed).getByRole("button", { name: "Refuser la demande d’un profil non publié" })).toBeInTheDocument()
  })

  it("en anglais aussi, chaque geste nomme la personne", () => {
    mount("p-steeve", <AssociationMembersScreen handle="collectif-ivindo-lyon" />, { locale: "en" })
    const request = screen.getByRole("listitem")
    expect(within(request).getByRole("button", { name: "Accept the request from Rodrigue KOMO" })).toHaveTextContent("Accept")
    expect(within(request).getByRole("button", { name: "Decline the request from Rodrigue KOMO" })).toHaveTextContent("Decline")
  })

  it("la signataire, son invitation acceptée, refuse avec un motif facultatif, sans aucun geste de gouvernance", async () => {
    const { source } = mount("p-mireille", <AssociationMembersScreen handle="collectif-ivindo-lyon" />)
    // Seulement invitée : le même refus indistinct, aucune liste.
    expect(screen.getByText("Cette liste n'est pas disponible.")).toBeInTheDocument()
    expect(screen.queryByRole("tab")).not.toBeInTheDocument()
    // Son propre geste, par le port des pages (celui de « Mes pages ») ; le rôle vivant est relu aussitôt.
    await act(async () => {
      expect(await source.pageAdmin!.management!.respondToInvitation("page-asso-lyon", true)).toEqual({ ok: true, value: { role: "signatory" } })
    })
    expect(screen.getByText(/Vous publiez au nom de la page : vous traitez les demandes/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Refuser la demande de Rodrigue KOMO" }))
    const sheet = await screen.findByRole("dialog", { name: "Refuser la demande de Rodrigue KOMO ?" })
    expect(within(sheet).getByText(/Elle pourra redemander dans 7 jours/)).toBeInTheDocument()
    await act(async () => { fireEvent.click(within(sheet).getByRole("button", { name: "Refuser la demande" })) })
    expect(await screen.findByText("Demande refusée.")).toBeInTheDocument()
    openTab("Adhérents")
    await screen.findAllByRole("listitem")
    expect(screen.queryByRole("button", { name: /^Exclure/ })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /^Confier l'animation/ })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /^Retirer l'animation/ })).not.toBeInTheDocument()
  })

  it("R-G14 : pour une adhérente ou tout autre membre, la liste n'existe pas", () => {
    mount("p-nadia", <AssociationMembersScreen handle="collectif-ivindo-lyon" />)
    expect(screen.getByText("Cette liste n'est pas disponible.")).toBeInTheDocument()
    expect(screen.queryByRole("tab")).not.toBeInTheDocument()
    expect(screen.queryByText("Nadia MPASSA")).not.toBeInTheDocument()
  })

  it("dit l'indisponibilité quand le fournisseur ne sert pas les associations", () => {
    mount("p-steeve", <AssociationMembersScreen handle="collectif-ivindo-lyon" />, { withCapability: false })
    expect(screen.getByText("Les associations ne sont pas disponibles ici.")).toBeInTheDocument()
  })

  it("parle anglais", () => {
    mount("p-steeve", <AssociationMembersScreen handle="collectif-ivindo-lyon" />, { locale: "en" })
    expect(screen.getByRole("heading", { level: 1, name: "Members and requests" })).toBeInTheDocument()
    expect(screen.getByRole("tab", { name: "Requests" })).toBeInTheDocument()
  })
})

describe("/mes-associations — mes adhésions et mes demandes", () => {
  it("une adhérente voit son association, son rôle, et quitte après confirmation", async () => {
    mount("p-nadia", <MyAssociationsScreen />)
    expect(screen.getByRole("heading", { level: 1, name: "Mes associations" })).toBeInTheDocument()
    const item = screen.getByRole("listitem")
    expect(within(item).getByRole("link", { name: "Collectif Ivindo de Lyon (démo)" })).toHaveAttribute("href", routes.page("collectif-ivindo-lyon"))
    expect(within(item).getByText("Adhésion acceptée")).toBeInTheDocument()
    expect(within(item).getByText("Rôle : Animateur")).toBeInTheDocument()
    fireEvent.click(within(item).getByRole("button", { name: "Quitter l'association" }))
    const sheet = await screen.findByRole("dialog", { name: "Quitter l'association ?" })
    await act(async () => { fireEvent.click(within(sheet).getByRole("button", { name: "Quitter" })) })
    expect(await screen.findByText("Vous avez quitté l'association.")).toBeInTheDocument()
    expect(await screen.findByText("Adhésion quittée")).toBeInTheDocument()
  })

  it("une demande en attente s'annule d'ici", async () => {
    mount("p-rodrigue", <MyAssociationsScreen />)
    expect(screen.getByText("Demande en attente")).toBeInTheDocument()
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Annuler ma demande" })) })
    expect(await screen.findByText("Votre demande est annulée.")).toBeInTheDocument()
    expect(await screen.findByText("Demande annulée")).toBeInTheDocument()
  })

  it("sans adhésion : un état vide qui mène au hub de son pays", () => {
    mount("p-prisca", <MyAssociationsScreen />)
    expect(screen.getByText("Vous n'avez encore demandé à rejoindre aucune association.")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Voir le hub de mon pays" })).toHaveAttribute("href", routes.hub("FR"))
  })

  it("dit l'indisponibilité quand le fournisseur ne sert pas les associations", () => {
    mount("p-prisca", <MyAssociationsScreen />, { withCapability: false })
    expect(screen.getByText("Les associations ne sont pas disponibles ici.")).toBeInTheDocument()
  })
})

// @vitest-environment jsdom
import { DIASPORA_GA_DEMO_ACTORS, diasporaGaDemoEmailOf } from "@diaspora-ga/domain"
import {
  DataSourceProvider,
  type DemoAccountEntry,
  type DemoAccountsCapability,
  type DiasporaGaActions,
  type DiasporaGaDataSource,
} from "@diaspora-ga/features/data"
import { DemoStore, createDemoDataSource } from "@diaspora-ga/features/demo"
import { getFixedT } from "@diaspora-ga/features/i18n"
import { I18nProvider } from "@diaspora-ga/features/i18n/client"
import { cleanup, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

import { DEMO_ACCOUNT_KEY } from "@/lib/demo-account-pending"
import { routes } from "@/lib/routes"

import { DemoAccountsButton } from "./demo-accounts-panel"

const t = getFixedT("fr")
const ALL: readonly DemoAccountEntry[] = DIASPORA_GA_DEMO_ACTORS.map((actor) => ({ actor, email: diasporaGaDemoEmailOf(actor) }))

function capability(entries: readonly DemoAccountEntry[] = ALL) {
  const readLocalCode = vi.fn<DemoAccountsCapability["readLocalCode"]>().mockResolvedValue("654321")
  const welcomeOutsider = vi.fn<DemoAccountsCapability["welcomeOutsider"]>()
  const equip = vi.fn<DemoAccountsCapability["equip"]>()
  const value: DemoAccountsCapability = { useCatalogue: () => ({ status: "ready", data: entries }), readLocalCode, welcomeOutsider, equip }
  return { value, readLocalCode, equip }
}

function setup(options: { kind?: DiasporaGaDataSource["kind"]; demoAccounts?: DemoAccountsCapability } = {}) {
  const demo = createDemoDataSource(new DemoStore(null, () => Date.UTC(2026, 9, 19, 12), 0))
  const requestCode = vi.fn<DiasporaGaActions["requestCode"]>().mockResolvedValue({ ok: true, value: { demoCode: "123456" } })
  const verifyCode = vi.fn<DiasporaGaActions["verifyCode"]>().mockResolvedValue({ ok: true, value: null })
  const source: DiasporaGaDataSource = {
    ...demo,
    kind: options.kind ?? "engine",
    actions: { ...demo.actions, requestCode, verifyCode },
    ...(options.demoAccounts ? { demoAccounts: options.demoAccounts } : {}),
  }
  render(
    <I18nProvider locale="fr">
      <DataSourceProvider source={source}>
        <DemoAccountsButton />
      </DataSourceProvider>
    </I18nProvider>,
  )
  return { requestCode, verifyCode, user: userEvent.setup() }
}

/** La ligne d'un acteur dans la feuille, par son titre. */
function actorButton(title: string) {
  return screen.getByRole("button", { name: new RegExp(`^${title}`) })
}

afterEach(() => {
  cleanup()
  window.sessionStorage.clear()
  vi.clearAllMocks()
})

describe("Porte — bouton des comptes de démonstration", () => {
  it("n'affiche rien quand le fournisseur ne sert pas les comptes de démonstration", () => {
    setup()
    expect(screen.queryByRole("button", { name: new RegExp(t("demoAccounts.open")) })).not.toBeInTheDocument()
  })

  it("n'affiche rien hors des outils de développement locaux (catalogue vide)", () => {
    setup({ demoAccounts: capability([]).value })
    expect(screen.queryByRole("button", { name: new RegExp(t("demoAccounts.open")) })).not.toBeInTheDocument()
  })

  it("mène aux comptes fictifs en démonstration", () => {
    setup({ kind: "demo" })
    expect(screen.getByRole("link", { name: new RegExp(t("demoAccounts.open")) })).toHaveAttribute("href", routes.demo())
  })

  it("ouvre la feuille des acteurs, groupés en membres, pages, rôles et services, accès restreints", async () => {
    const { user } = setup({ demoAccounts: capability().value })
    await user.click(screen.getByRole("button", { name: new RegExp(t("demoAccounts.open")) }))

    const sheet = screen.getByRole("dialog", { name: t("demoAccounts.title") })
    for (const group of ["members", "pages", "roles", "access"] as const) {
      expect(within(sheet).getByRole("heading", { name: t(`demoAccounts.groups.${group}`) })).toBeInTheDocument()
    }
    expect(DIASPORA_GA_DEMO_ACTORS).toHaveLength(21)
    expect(within(sheet).getAllByRole("button", { name: /./ }).filter((button) => button.closest("li"))).toHaveLength(DIASPORA_GA_DEMO_ACTORS.length)
    expect(actorButton(t("demoAccounts.actors.verifie.title"))).toHaveAccessibleName(/Patrice MBOUMBA/)
    expect(actorButton(t("demoAccounts.actors.nouveau.title"))).toHaveAccessibleName(new RegExp(t("demoAccounts.newcomer")))
    expect(actorButton(t("demoAccounts.actors.suspendu.title"))).toHaveAccessibleName(new RegExp(t("membership.status.suspendue")))
  })

  it("range les accès restreints ensemble : suspensions, blocage, extérieur au réseau sans statut", async () => {
    const { user } = setup({ demoAccounts: capability().value })
    await user.click(screen.getByRole("button", { name: new RegExp(t("demoAccounts.open")) }))

    const section = screen.getByRole("heading", { name: t("demoAccounts.groups.access") }).closest("section")
    if (!section) throw new Error("Groupe des accès restreints absent")
    expect(within(section).getAllByRole("button")).toHaveLength(4)
    for (const actor of ["suspendu", "suspendu-racine", "bloque", "exterieur"] as const) {
      expect(within(section).getByRole("button", { name: new RegExp(`^${t(`demoAccounts.actors.${actor}.title`)}`) })).toBeInTheDocument()
    }
    // La suspension de la racine se lit « suspendue » dans DIASPORA.GA ; le bloqué garde son statut.
    expect(actorButton(t("demoAccounts.actors.suspendu-racine.title"))).toHaveAccessibleName(new RegExp(`Christelle IVANGA.*${t("membership.status.suspendue")}`))
    expect(actorButton(t("demoAccounts.actors.bloque.title"))).toHaveAccessibleName(new RegExp(`Yannick MBADINGA.*${t("membership.status.verifiee")}`))
    // L'extérieur n'a aucun statut dans DIASPORA.GA : « hors réseau ».
    const outsider = actorButton(t("demoAccounts.actors.exterieur.title"))
    expect(outsider).toHaveAccessibleName(new RegExp(`Brice MOUNDOUNGA.*${t("demoAccounts.outsider")}`))
    for (const status of ["en_attente", "declaree", "verifiee", "suspendue"] as const) expect(outsider).not.toHaveAccessibleName(new RegExp(t(`membership.status.${status}`)))
  })

  it("connecte l'acteur par le vrai code : envoi à son adresse réservée, code lu, vérification", async () => {
    const { user, requestCode, verifyCode } = setup({ demoAccounts: capability().value })
    await user.click(screen.getByRole("button", { name: new RegExp(t("demoAccounts.open")) }))
    await user.click(actorButton(t("demoAccounts.actors.entreprise.title")))

    await waitFor(() => expect(verifyCode).toHaveBeenCalledExactlyOnceWith("123456"))
    expect(requestCode).toHaveBeenCalledExactlyOnceWith({ kind: "email", value: "entreprise@demo.diaspora-ga.test" })
    // L'acteur reste mémorisé pour l'amorçage, après le rechargement de la connexion.
    expect(window.sessionStorage.getItem(DEMO_ACCOUNT_KEY)).toBe("entreprise")
  })

  it("relit le code local quand l'envoi ne le rend pas", async () => {
    const demoAccounts = capability()
    const { user, requestCode, verifyCode } = setup({ demoAccounts: demoAccounts.value })
    requestCode.mockResolvedValue({ ok: true, value: { demoCode: null } })
    await user.click(screen.getByRole("button", { name: new RegExp(t("demoAccounts.open")) }))
    await user.click(actorButton(t("demoAccounts.actors.mentor.title")))

    await waitFor(() => expect(verifyCode).toHaveBeenCalledExactlyOnceWith("654321"))
    expect(demoAccounts.readLocalCode).toHaveBeenCalledExactlyOnceWith("mentor@demo.diaspora-ga.test")
  })

  it("annonce l'échec, oublie l'acteur et rend la main", async () => {
    const { user, verifyCode } = setup({ demoAccounts: capability().value })
    verifyCode.mockResolvedValue({ ok: false, code: "code_invalid" })
    await user.click(screen.getByRole("button", { name: new RegExp(t("demoAccounts.open")) }))
    await user.click(actorButton(t("demoAccounts.actors.media.title")))

    expect(await screen.findByRole("alert")).toHaveTextContent(t("demoAccounts.failed").replace(/\s+/g, " "))
    expect(window.sessionStorage.getItem(DEMO_ACCOUNT_KEY)).toBeNull()
    expect(actorButton(t("demoAccounts.actors.media.title"))).toBeEnabled()
  })
})

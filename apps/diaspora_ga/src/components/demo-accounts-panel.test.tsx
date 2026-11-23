// @vitest-environment jsdom
import { DIASPORA_GA_DEMO_ACTORS, diasporaGaDemoEmailOf } from "@diaspora-ga/domain"
import {
  DataSourceProvider,
  type DemoAccountEntry,
  type DemoAccountsCapability,
  type DemoGateCapability,
  type DemoGateSessionView,
  type DemoGateState,
  type DiasporaGaActions,
  type DiasporaGaDataSource,
} from "@diaspora-ga/features/data"
import { DemoStore, createDemoDataSource } from "@diaspora-ga/features/demo"
import { getFixedT } from "@diaspora-ga/features/i18n"
import { I18nProvider } from "@diaspora-ga/features/i18n/client"
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useSyncExternalStore } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { DEMO_ACCOUNT_KEY } from "@/lib/demo-account-pending"
import { routes } from "@/lib/routes"
import { filledButtons } from "@/test-utils"

import { DemoAccountsPill } from "./demo-accounts-panel"

const mocks = vi.hoisted(() => ({ toast: { success: vi.fn(), error: vi.fn(), loading: vi.fn() } }))
vi.mock("sonner", () => ({ toast: mocks.toast }))

const t = getFixedT("fr")
const flat = (text: string) => text.replace(/\s+/g, " ")
/** La phrase d'appui de la feuille, telle que le lecteur d'écran la reçoit (espaces normalisées). */
const descriptionOf = (dialog: HTMLElement) => flat(document.getElementById(dialog.getAttribute("aria-describedby") ?? "")?.textContent ?? "")
const ALL: readonly DemoAccountEntry[] = DIASPORA_GA_DEMO_ACTORS.map((actor) => ({ actor, email: diasporaGaDemoEmailOf(actor) }))
/** Valeurs FICTIVES : un numéro d'essai, un identifiant de défi de forme seule. */
const PHONE = "+33600000000"
const CHALLENGE = "c".repeat(32)

function accounts(entries: readonly DemoAccountEntry[] = ALL) {
  const readLocalCode = vi.fn<DemoAccountsCapability["readLocalCode"]>().mockResolvedValue("654321")
  const value: DemoAccountsCapability = { useCatalogue: () => ({ status: "ready", data: entries }), readLocalCode, welcomeOutsider: vi.fn(), equip: vi.fn() }
  return { value, readLocalCode }
}

/** Une porte factice : l'état, la joignabilité, et une session de porte réactive. */
function gate(options: { state?: DemoGateState | "loading"; reachable?: boolean; session?: boolean; expiresInMs?: number } = {}) {
  const listeners = new Set<() => void>()
  let session: DemoGateSessionView | null = options.session ? { expiresAt: Date.now() + 30 * 60_000 } : null
  const setSession = (next: DemoGateSessionView | null) => {
    session = next
    for (const listener of listeners) listener()
  }
  const subscribe = (listener: () => void) => {
    listeners.add(listener)
    return () => void listeners.delete(listener)
  }
  const requestCode = vi.fn<DemoGateCapability["requestCode"]>(async () => ({ ok: true, value: { challengeId: CHALLENGE, expiresAt: Date.now() + (options.expiresInMs ?? 5 * 60_000) } }))
  const verifyCode = vi.fn<DemoGateCapability["verifyCode"]>(async () => {
    const opened = { expiresAt: Date.now() + 30 * 60_000 }
    setSession(opened)
    return { ok: true, value: opened }
  })
  const forget = vi.fn(() => setSession(null))
  const state = options.state ?? "gated"
  const value: DemoGateCapability = {
    useGateState: () => (state === "loading" ? { status: "loading" } : { status: "ready", data: state }),
    reachable: options.reachable ?? true,
    useSession: () => useSyncExternalStore(subscribe, () => session),
    requestCode,
    verifyCode,
    forget,
  }
  return { value, requestCode, verifyCode, forget }
}

function setup(options: { kind?: DiasporaGaDataSource["kind"]; demoAccounts?: DemoAccountsCapability; demoGate?: DemoGateCapability } = {}) {
  const demo = createDemoDataSource(new DemoStore(null, () => Date.UTC(2026, 10, 23, 12), 0))
  const requestCode = vi.fn<DiasporaGaActions["requestCode"]>().mockResolvedValue({ ok: true, value: { demoCode: "123456" } })
  const verifyCode = vi.fn<DiasporaGaActions["verifyCode"]>().mockResolvedValue({ ok: true, value: null })
  const source: DiasporaGaDataSource = {
    ...demo,
    kind: options.kind ?? "engine",
    actions: { ...demo.actions, requestCode, verifyCode },
    ...(options.demoAccounts ? { demoAccounts: options.demoAccounts } : {}),
    ...(options.demoGate ? { demoGate: options.demoGate } : {}),
  }
  const view = render(
    <I18nProvider locale="fr">
      <DataSourceProvider source={source}>
        <DemoAccountsPill />
      </DataSourceProvider>
    </I18nProvider>,
  )
  return { requestCode, verifyCode, view, user: userEvent.setup() }
}

const pill = () => screen.getByRole("button", { name: t("demoGate.pill") })
const queryPill = () => screen.queryByRole("button", { name: t("demoGate.pill") }) ?? screen.queryByRole("link", { name: t("demoGate.pill") })
const sheet = () => screen.getByRole("dialog", { name: t("demoAccounts.title") })
/** La ligne d'un acteur dans la feuille, par son titre. */
const actorButton = (title: string) => screen.getByRole("button", { name: new RegExp(`^${title}`) })

/** Porte armée : la pastille, le numéro, puis le code demandé. */
async function reachCodeStep(user: ReturnType<typeof userEvent.setup>) {
  await user.click(pill())
  await user.type(screen.getByRole("textbox", { name: t("demoGate.phone.label") }), "+33 6 00 00 00 00")
  await user.click(screen.getByRole("button", { name: t("demoGate.phone.submit") }))
  return await screen.findByRole("textbox", { name: t("demoGate.code.label") })
}

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  window.sessionStorage.clear()
  vi.clearAllMocks()
})

describe("Porte — pastille « Compte démo » : quand elle s'affiche", () => {
  it("démonstration (données fictives) : elle mène aux comptes fictifs, sans porte", () => {
    setup({ kind: "demo" })
    expect(screen.getByRole("link", { name: t("demoGate.pill") })).toHaveAttribute("href", routes.demo())
  })

  it("rien sans les capacités du moteur, pendant la lecture, ni porte fermée (production comprise)", () => {
    setup()
    expect(queryPill()).toBeNull()
    cleanup()
    setup({ demoAccounts: accounts().value, demoGate: gate({ state: "loading" }).value })
    expect(queryPill()).toBeNull()
    cleanup()
    setup({ demoAccounts: accounts().value, demoGate: gate({ state: "closed" }).value })
    expect(queryPill()).toBeNull()
  })

  it("porte armée sans origine des actions HTTP du moteur (variable absente) : rien, jamais un geste mort", () => {
    setup({ demoAccounts: accounts().value, demoGate: gate({ state: "gated", reachable: false }).value })
    expect(queryPill()).toBeNull()
  })

  it("porte non armée : seulement si le catalogue propose un acteur", () => {
    setup({ demoAccounts: accounts([]).value, demoGate: gate({ state: "open" }).value })
    expect(queryPill()).toBeNull()
    cleanup()
    setup({ demoAccounts: accounts().value, demoGate: gate({ state: "open", reachable: false }).value })
    expect(pill()).toBeInTheDocument()
  })

  it("une pastille discrète, cible de 44 px, focus visible, couleurs du repère de démonstration", () => {
    setup({ demoAccounts: accounts().value, demoGate: gate().value })
    expect(pill()).toHaveClass("min-h-11", "rounded-full", "focus-visible:shadow-focus")
    expect(pill()).toHaveAttribute("aria-haspopup", "dialog")
    const body = pill().querySelector("span")
    expect(body).toHaveClass("bg-demo", "text-demo-foreground")
    // Aucun bouton plein : la pastille ne rivalise pas avec la carte d'accès.
    expect(filledButtons(document.body)).toHaveLength(0)
  })
})

describe("Porte — porte non armée : les acteurs directement", () => {
  it("ouvre la feuille des acteurs, groupés en membres, pages, rôles et services, accès restreints", async () => {
    const { user } = setup({ demoAccounts: accounts().value, demoGate: gate({ state: "open" }).value })
    await user.click(pill())

    const dialog = sheet()
    for (const group of ["members", "pages", "roles", "access"] as const) {
      expect(within(dialog).getByRole("heading", { name: t(`demoAccounts.groups.${group}`) })).toBeInTheDocument()
    }
    expect(within(dialog).getAllByRole("button").filter((button) => button.closest("li"))).toHaveLength(DIASPORA_GA_DEMO_ACTORS.length)
    expect(actorButton(t("demoAccounts.actors.verifie.title"))).toHaveAccessibleName(/Patrice MBOUMBA/)
    expect(actorButton(t("demoAccounts.actors.nouveau.title"))).toHaveAccessibleName(new RegExp(t("demoAccounts.newcomer")))
    expect(actorButton(t("demoAccounts.actors.suspendu.title"))).toHaveAccessibleName(new RegExp(t("membership.status.suspendue")))
    // Aucun numéro demandé, aucun accès à fermer : la porte n'est pas armée.
    expect(within(dialog).queryByRole("textbox")).toBeNull()
    expect(within(dialog).queryByRole("button", { name: t("demoGate.actors.forget") })).toBeNull()
  })

  it("les descriptions de l'association et de l'entreprise ne promettent aucun geste d'un module fermé", async () => {
    const { user } = setup({ demoAccounts: accounts().value, demoGate: gate({ state: "open" }).value })
    await user.click(pill())
    for (const actor of ["association", "entreprise"] as const) {
      expect(actorButton(t(`demoAccounts.actors.${actor}.title`))).not.toHaveAccessibleName(/mission|événement|évènement|offre/i)
    }
  })

  it("connecte l'acteur par le vrai code : envoi à son adresse réservée, code lu, vérification", async () => {
    const { user, requestCode, verifyCode } = setup({ demoAccounts: accounts().value, demoGate: gate({ state: "open" }).value })
    await user.click(pill())
    await user.click(actorButton(t("demoAccounts.actors.entreprise.title")))

    const destination = { kind: "email", value: "entreprise@demo.diaspora-ga.test" }
    // L'adresse vient du catalogue : les deux requêtes le disent à la source (CH-817 E5).
    await waitFor(() => expect(verifyCode).toHaveBeenCalledExactlyOnceWith("123456", destination, { demoActor: true }))
    expect(requestCode).toHaveBeenCalledExactlyOnceWith(destination, { demoActor: true })
    expect(window.sessionStorage.getItem(DEMO_ACCOUNT_KEY)).toBe("entreprise")
  })

  it("relit le code local quand l'envoi ne le rend pas", async () => {
    const demoAccounts = accounts()
    const { user, requestCode, verifyCode } = setup({ demoAccounts: demoAccounts.value, demoGate: gate({ state: "open" }).value })
    requestCode.mockResolvedValue({ ok: true, value: { demoCode: null } })
    await user.click(pill())
    await user.click(actorButton(t("demoAccounts.actors.mentor.title")))

    await waitFor(() => expect(verifyCode).toHaveBeenCalledExactlyOnceWith("654321", { kind: "email", value: "mentor@demo.diaspora-ga.test" }, { demoActor: true }))
    expect(demoAccounts.readLocalCode).toHaveBeenCalledExactlyOnceWith("mentor@demo.diaspora-ga.test")
  })

  it("aucun code lisible, porte non armée : l'échec ordinaire, la feuille reste aux acteurs", async () => {
    const demoAccounts = accounts()
    demoAccounts.readLocalCode.mockResolvedValue(null)
    const demoGate = gate({ state: "open" })
    const { user, requestCode, verifyCode } = setup({ demoAccounts: demoAccounts.value, demoGate: demoGate.value })
    requestCode.mockResolvedValue({ ok: true, value: { demoCode: null } })
    await user.click(pill())
    await user.click(actorButton(t("demoAccounts.actors.verifie.title")))

    expect(await screen.findByRole("alert")).toHaveTextContent(flat(t("demoAccounts.failed")))
    expect(verifyCode).not.toHaveBeenCalled()
    expect(demoGate.forget).not.toHaveBeenCalled()
    expect(actorButton(t("demoAccounts.actors.verifie.title"))).toBeEnabled()
  })

  it("annonce l'échec, oublie l'acteur et rend la main", async () => {
    const { user, verifyCode } = setup({ demoAccounts: accounts().value, demoGate: gate({ state: "open" }).value })
    verifyCode.mockResolvedValue({ ok: false, code: "code_invalid" })
    await user.click(pill())
    await user.click(actorButton(t("demoAccounts.actors.media.title")))

    expect(await screen.findByRole("alert")).toHaveTextContent(flat(t("demoAccounts.failed")))
    expect(window.sessionStorage.getItem(DEMO_ACCOUNT_KEY)).toBeNull()
    expect(actorButton(t("demoAccounts.actors.media.title"))).toBeEnabled()
  })

  it("Échap referme la feuille et rend le focus à la pastille", async () => {
    const { user } = setup({ demoAccounts: accounts().value, demoGate: gate({ state: "open" }).value })
    await user.click(pill())
    expect(sheet()).toBeInTheDocument()
    await user.keyboard("{Escape}")
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(pill()).toHaveFocus()
  })
})

describe("Porte — porte incomplète : indisponible pour le moment", () => {
  it("la feuille le dit, sans formulaire ni acteur", async () => {
    const { user } = setup({ demoAccounts: accounts().value, demoGate: gate({ state: "unavailable", reachable: false }).value })
    await user.click(pill())
    const dialog = sheet()
    expect(descriptionOf(dialog)).toBe(flat(t("demoGate.step.unavailable.lead")))
    expect(within(dialog).getByRole("status")).toHaveTextContent(flat(t("demoGate.unavailable")))
    expect(within(dialog).queryByRole("textbox")).toBeNull()
    expect(within(dialog).queryByRole("heading", { name: t("demoAccounts.groups.members") })).toBeNull()
  })
})

describe("Porte — porte armée : numéro WhatsApp, code, puis acteurs", () => {
  it("le numéro : champ téléphone avec son aide ; un numéro sans indicatif est refusé avant tout envoi", async () => {
    const demoGate = gate()
    const { user } = setup({ demoAccounts: accounts().value, demoGate: demoGate.value })
    await user.click(pill())
    const dialog = sheet()
    expect(descriptionOf(dialog)).toBe(flat(t("demoGate.step.phone.lead")))
    const field = within(dialog).getByRole("textbox", { name: t("demoGate.phone.label") })
    expect(field).toHaveAttribute("type", "tel")
    expect(field).toHaveAttribute("inputmode", "tel")
    expect(field).toHaveAttribute("autocomplete", "tel")
    expect(field).toHaveAccessibleDescription(flat(t("demoGate.phone.hint")))
    // Aucun acteur avant le code : le catalogue d'une porte armée ne s'ouvre pas sans session.
    expect(within(dialog).queryByRole("heading", { name: t("demoAccounts.groups.members") })).toBeNull()

    await user.type(field, "06 00 00 00 00")
    await user.click(within(dialog).getByRole("button", { name: t("demoGate.phone.submit") }))
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(flat(t("errors.phone_invalid")))
    expect(demoGate.requestCode).not.toHaveBeenCalled()
    expect(filledButtons(dialog)).toHaveLength(1)
  })

  it("le code demandé : la phrase de la fiche, jamais « envoyé », le numéro masqué, le champ du code prêt", async () => {
    const demoGate = gate()
    const { user } = setup({ demoAccounts: accounts().value, demoGate: demoGate.value })
    const code = await reachCodeStep(user)

    expect(demoGate.requestCode).toHaveBeenCalledExactlyOnceWith(PHONE, "fr")
    const dialog = sheet()
    expect(descriptionOf(dialog)).toBe(flat(t("demoGate.step.code.lead")))
    expect(within(dialog).getByText(flat(t("demoGate.code.delivery")))).toHaveAttribute("role", "status")
    expect(t("demoGate.code.delivery")).toBe("Si ce numéro est autorisé, le code arrive sur WhatsApp ; sans message après une minute, l'envoi n'a pas abouti.")
    expect(dialog.textContent ?? "").not.toMatch(/envoyé/i)
    expect(dialog.textContent ?? "").not.toContain(PHONE)
    expect(code).toHaveFocus()
    expect(code).toHaveAttribute("autocomplete", "one-time-code")
    // Le champ dit son format, puis la phrase de la fiche : le lecteur d'écran l'entend au focus.
    expect(flat(code.getAttribute("aria-describedby")?.split(" ").map((id) => document.getElementById(id)?.textContent ?? "").join(" ") ?? "")).toBe(flat(`${t("demoGate.code.hint")} ${t("demoGate.code.delivery")}`))
    // Le renvoi attend une minute : le décompte se lit à côté du bouton.
    expect(within(dialog).getByRole("button", { name: t("demoGate.code.resend") })).toBeDisabled()
    expect(filledButtons(dialog)).toHaveLength(1)
  })

  it("le code se met en majuscules et se groupe ; validé, les acteurs s'ouvrent et l'accès s'annonce", async () => {
    const demoGate = gate()
    const { user } = setup({ demoAccounts: accounts().value, demoGate: demoGate.value })
    const code = await reachCodeStep(user)

    await user.type(code, "123456k")
    expect(code).toHaveValue("123 456 K")
    await user.click(screen.getByRole("button", { name: t("demoGate.code.submit") }))

    await waitFor(() => expect(demoGate.verifyCode).toHaveBeenCalledExactlyOnceWith(CHALLENGE, "123 456 K"))
    const dialog = sheet()
    expect(await within(dialog).findByRole("heading", { name: t("demoAccounts.groups.members") })).toBeInTheDocument()
    expect(descriptionOf(dialog)).toBe(flat(t("demoGate.step.actors.lead")))
    expect(mocks.toast.success).toHaveBeenCalledWith(t("demoGate.opened", { minutes: 30 }))
    // L'échéance de l'accès se lit et prend le focus : le lecteur d'écran sait où il est.
    const opened = within(dialog).getByText(new RegExp(flat(t("demoGate.actors.openUntil", { time: "" })).slice(0, 30)))
    await waitFor(() => expect(opened).toHaveFocus())
    expect(within(dialog).getByRole("button", { name: t("demoGate.actors.forget") })).toBeInTheDocument()
  })

  it("un code hors de la forme est refusé avant tout envoi", async () => {
    const demoGate = gate()
    const { user } = setup({ demoAccounts: accounts().value, demoGate: demoGate.value })
    const code = await reachCodeStep(user)
    await user.type(code, "123456")
    await user.click(screen.getByRole("button", { name: t("demoGate.code.submit") }))
    expect(await screen.findByRole("alert")).toHaveTextContent(flat(t("errors.demo_gate_code_format")))
    expect(demoGate.verifyCode).not.toHaveBeenCalled()
  })

  it("un code faux ou expiré : un seul message, le champ reste ouvert", async () => {
    const demoGate = gate()
    demoGate.verifyCode.mockResolvedValueOnce({ ok: false, code: "demo_gate_code_invalid" })
    const { user } = setup({ demoAccounts: accounts().value, demoGate: demoGate.value })
    const code = await reachCodeStep(user)
    await user.type(code, "123456K")
    await user.click(screen.getByRole("button", { name: t("demoGate.code.submit") }))
    expect(await screen.findByRole("alert")).toHaveTextContent(flat(t("errors.demo_gate_code_invalid")))
    expect(code).toHaveFocus()
    expect(code).toHaveAttribute("aria-invalid", "true")
  })

  it("trop d'essais : l'attente du moteur se dit, et la validation attend", async () => {
    const demoGate = gate()
    demoGate.verifyCode.mockResolvedValueOnce({ ok: false, code: "too_many_attempts", retryAfterMs: 125_000 })
    const { user } = setup({ demoAccounts: accounts().value, demoGate: demoGate.value })
    const code = await reachCodeStep(user)
    await user.type(code, "123456K")
    await user.click(screen.getByRole("button", { name: t("demoGate.code.submit") }))
    const alert = await screen.findByRole("alert")
    expect(alert).toHaveTextContent(/Trop d.essais/)
    // Le texte lu est normalisé (espaces insécables comprises).
    expect(alert).toHaveTextContent(/2 min 0[4-6] s/)
    expect(screen.getByRole("button", { name: t("demoGate.code.submit") })).toBeDisabled()
  })

  it("une panne du réseau se dit ; la validation se reprend", async () => {
    const demoGate = gate()
    demoGate.verifyCode.mockResolvedValueOnce({ ok: false, code: "network_unavailable" })
    const { user } = setup({ demoAccounts: accounts().value, demoGate: demoGate.value })
    const code = await reachCodeStep(user)
    await user.type(code, "123456K")
    await user.click(screen.getByRole("button", { name: t("demoGate.code.submit") }))
    expect(await screen.findByRole("alert")).toHaveTextContent(flat(t("errors.network_unavailable")))
    await user.click(screen.getByRole("button", { name: t("demoGate.code.submit") }))
    await waitFor(() => expect(demoGate.verifyCode).toHaveBeenCalledTimes(2))
    expect(await screen.findByRole("heading", { name: t("demoAccounts.groups.members") })).toBeInTheDocument()
  })

  it("la porte indisponible au moment de la demande se dit sous le numéro", async () => {
    const demoGate = gate()
    demoGate.requestCode.mockResolvedValueOnce({ ok: false, code: "demo_gate_unavailable" })
    const { user } = setup({ demoAccounts: accounts().value, demoGate: demoGate.value })
    await user.click(pill())
    await user.type(screen.getByRole("textbox", { name: t("demoGate.phone.label") }), PHONE)
    await user.click(screen.getByRole("button", { name: t("demoGate.phone.submit") }))
    expect(await screen.findByRole("alert")).toHaveTextContent(flat(t("errors.demo_gate_unavailable")))
    expect(screen.queryByRole("textbox", { name: t("demoGate.code.label") })).toBeNull()
  })

  it("un code expiré se dit, et la validation se ferme", async () => {
    const demoGate = gate({ expiresInMs: -1_000 })
    const { user } = setup({ demoAccounts: accounts().value, demoGate: demoGate.value })
    await reachCodeStep(user)
    expect(screen.getAllByText(flat(t("demoGate.code.expired"))).length).toBeGreaterThan(0)
    expect(screen.getByRole("button", { name: t("demoGate.code.submit") })).toBeDisabled()
  })

  it("après une minute, un nouveau code se demande au même numéro et l'écran l'annonce", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const demoGate = gate()
    setup({ demoAccounts: accounts().value, demoGate: demoGate.value })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    await reachCodeStep(user)
    const resend = screen.getByRole("button", { name: t("demoGate.code.resend") })
    expect(resend).toBeDisabled()
    await act(async () => {
      vi.advanceTimersByTime(61_000)
    })
    await waitFor(() => expect(resend).toBeEnabled())
    await user.click(resend)
    await waitFor(() => expect(demoGate.requestCode).toHaveBeenCalledTimes(2))
    expect(demoGate.requestCode).toHaveBeenLastCalledWith(PHONE, "fr")
    expect(await screen.findByText(t("demoGate.code.resent"))).toHaveAttribute("role", "status")
  })

  it("« Changer de numéro » revient au numéro, le champ prêt", async () => {
    const { user } = setup({ demoAccounts: accounts().value, demoGate: gate().value })
    await reachCodeStep(user)
    await user.click(screen.getByRole("button", { name: t("demoGate.code.changeNumber") }))
    await waitFor(() => expect(screen.getByRole("textbox", { name: t("demoGate.phone.label") })).toHaveFocus())
  })

  it("le défi survit à la feuille refermée : rouverte, elle reprend au code", async () => {
    const { user } = setup({ demoAccounts: accounts().value, demoGate: gate().value })
    await reachCodeStep(user)
    await user.keyboard("{Escape}")
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(pill()).toHaveFocus()
    await user.click(pill())
    expect(screen.getByRole("textbox", { name: t("demoGate.code.label") })).toBeInTheDocument()
  })

  it("avec une session de porte valide, les acteurs directement ; « Fermer l'accès » revient au numéro", async () => {
    const demoGate = gate({ session: true })
    const { user } = setup({ demoAccounts: accounts().value, demoGate: demoGate.value })
    await user.click(pill())
    expect(screen.getByRole("heading", { name: t("demoAccounts.groups.members") })).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: t("demoGate.actors.forget") }))
    expect(demoGate.forget).toHaveBeenCalledOnce()
    await waitFor(() => expect(screen.getByRole("textbox", { name: t("demoGate.phone.label") })).toHaveFocus())
  })

  it("la session échue pendant que la feuille est ouverte : retour au numéro", async () => {
    const demoGate = gate({ session: true })
    const { user } = setup({ demoAccounts: accounts().value, demoGate: demoGate.value })
    await user.click(pill())
    act(() => demoGate.value.forget())
    expect(await screen.findByRole("textbox", { name: t("demoGate.phone.label") })).toBeInTheDocument()
  })

  it("porte armée, catalogue vide malgré la session : la feuille le dit", async () => {
    const { user } = setup({ demoAccounts: accounts([]).value, demoGate: gate({ session: true }).value })
    await user.click(pill())
    expect(within(sheet()).getAllByRole("status").some((node) => node.textContent === t("demoGate.actors.empty"))).toBe(true)
  })
})

describe("Porte — porte armée : refus du moteur (CH-817 E5)", () => {
  const VERIFIE = { kind: "email", value: "verifie@demo.diaspora-ga.test" } as const

  it("l'acteur entre par le code relu par la feuille, l'envoi et la connexion marqués comme venant du catalogue", async () => {
    const demoAccounts = accounts()
    const { user, requestCode, verifyCode } = setup({ demoAccounts: demoAccounts.value, demoGate: gate({ session: true }).value })
    // Porte armée, la source ne rend jamais le code : la feuille le relit avec son jeton.
    requestCode.mockResolvedValue({ ok: true, value: { demoCode: null } })
    await user.click(pill())
    await user.click(actorButton(t("demoAccounts.actors.verifie.title")))
    await waitFor(() => expect(verifyCode).toHaveBeenCalledExactlyOnceWith("654321", VERIFIE, { demoActor: true }))
    expect(requestCode).toHaveBeenCalledExactlyOnceWith(VERIFIE, { demoActor: true })
    expect(demoAccounts.readLocalCode).toHaveBeenCalledExactlyOnceWith(VERIFIE.value)
  })

  it.each([
    ["aucun code lisible après l'envoi", "unreadable"],
    ["le code refusé à la connexion (INVALID_OTP)", "refused"],
  ] as const)("%s : la session de porte s'oublie, retour au numéro avec la phrase neutre", async (_label, kind) => {
    const demoAccounts = accounts()
    if (kind === "unreadable") demoAccounts.readLocalCode.mockResolvedValue(null)
    const demoGate = gate({ session: true })
    const { user, requestCode, verifyCode } = setup({ demoAccounts: demoAccounts.value, demoGate: demoGate.value })
    requestCode.mockResolvedValue({ ok: true, value: { demoCode: null } })
    if (kind === "refused") verifyCode.mockResolvedValue({ ok: false, code: "code_invalid" })
    await user.click(pill())
    await user.click(actorButton(t("demoAccounts.actors.verifie.title")))

    const phone = await screen.findByRole("textbox", { name: t("demoGate.phone.label") })
    await waitFor(() => expect(phone).toHaveFocus())
    expect(demoGate.forget).toHaveBeenCalledOnce()
    const dialog = sheet()
    expect(descriptionOf(dialog)).toBe(flat(t("demoGate.step.phone.lead")))
    // La phrase de tout échec de connexion : aucun nouveau message, rien ne dit qu'une porte a refusé.
    expect(within(dialog).getByRole("alert")).toHaveTextContent(flat(t("demoAccounts.failed")))
    expect(dialog.textContent ?? "").not.toMatch(/porte|refus|jeton|session/i)
    expect(window.sessionStorage.getItem(DEMO_ACCOUNT_KEY)).toBeNull()
    if (kind === "unreadable") expect(verifyCode).not.toHaveBeenCalled()

    // Un nouveau code demandé efface la phrase.
    await user.type(phone, PHONE)
    await user.click(within(dialog).getByRole("button", { name: t("demoGate.phone.submit") }))
    await screen.findByRole("textbox", { name: t("demoGate.code.label") })
    expect(within(sheet()).queryByText(flat(t("demoAccounts.failed")))).toBeNull()
  })

  it("une autre panne de connexion garde la session de porte et la feuille des acteurs", async () => {
    const demoGate = gate({ session: true })
    const { user, requestCode } = setup({ demoAccounts: accounts().value, demoGate: demoGate.value })
    requestCode.mockResolvedValue({ ok: false, code: "rate_limited" })
    await user.click(pill())
    await user.click(actorButton(t("demoAccounts.actors.verifie.title")))
    expect(await screen.findByRole("alert")).toHaveTextContent(flat(t("demoAccounts.failed")))
    expect(demoGate.forget).not.toHaveBeenCalled()
    expect(actorButton(t("demoAccounts.actors.verifie.title"))).toBeEnabled()
  })

  it("trop de demandes depuis cette adresse (429) : l'attente du moteur se dit sous le numéro, la demande attend", async () => {
    const demoGate = gate()
    demoGate.requestCode.mockResolvedValueOnce({ ok: false, code: "rate_limited", retryAfterMs: 125_000 })
    const { user } = setup({ demoAccounts: accounts().value, demoGate: demoGate.value })
    await user.click(pill())
    await user.type(screen.getByRole("textbox", { name: t("demoGate.phone.label") }), PHONE)
    await user.click(screen.getByRole("button", { name: t("demoGate.phone.submit") }))
    const alert = await screen.findByRole("alert")
    expect(alert).toHaveTextContent(/Trop d.essais/)
    expect(alert).toHaveTextContent(/2 min 0[4-6] s/)
    expect(screen.getByRole("button", { name: t("demoGate.phone.submit") })).toBeDisabled()
    // Le champ du numéro est décrit par l'attente : le lecteur d'écran l'entend au focus.
    expect(screen.getByRole("textbox", { name: t("demoGate.phone.label") }).getAttribute("aria-describedby")?.split(" ")).toContain(alert.id)
    expect(screen.queryByRole("textbox", { name: t("demoGate.code.label") })).toBeNull()
    expect(demoGate.requestCode).toHaveBeenCalledOnce()
  })

  it("trop de demandes au renvoi (429) : l'attente se dit près du renvoi, qui attend ; le code en cours reste saisissable", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const demoGate = gate()
    setup({ demoAccounts: accounts().value, demoGate: demoGate.value })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    await reachCodeStep(user)
    demoGate.requestCode.mockResolvedValueOnce({ ok: false, code: "rate_limited", retryAfterMs: 125_000 })
    const resend = screen.getByRole("button", { name: t("demoGate.code.resend") })
    await act(async () => {
      vi.advanceTimersByTime(61_000)
    })
    await waitFor(() => expect(resend).toBeEnabled())
    await user.click(resend)
    const alert = await screen.findByRole("alert")
    expect(alert).toHaveTextContent(/Trop d.essais/)
    expect(alert).toHaveTextContent(/2 min 0[4-6] s/)
    expect(resend).toBeDisabled()
    expect(screen.getByRole("button", { name: t("demoGate.code.submit") })).toBeEnabled()
  })

  it("après un renvoi, le premier code reste bon : rien ne le dit annulé, et il ouvre la démonstration", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const demoGate = gate()
    const FIRST = "a".repeat(32)
    const SECOND = "b".repeat(32)
    demoGate.requestCode
      .mockResolvedValueOnce({ ok: true, value: { challengeId: FIRST, expiresAt: Date.now() + 5 * 60_000 } })
      .mockResolvedValueOnce({ ok: true, value: { challengeId: SECOND, expiresAt: Date.now() + 6 * 60_000 } })
    setup({ demoAccounts: accounts().value, demoGate: demoGate.value })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const code = await reachCodeStep(user)
    await act(async () => {
      vi.advanceTimersByTime(61_000)
    })
    const resend = screen.getByRole("button", { name: t("demoGate.code.resend") })
    await waitFor(() => expect(resend).toBeEnabled())
    await user.click(resend)
    await screen.findByText(t("demoGate.code.resent"))
    for (const locale of ["fr", "en"] as const) {
      expect(getFixedT(locale)("demoGate.code.resent")).not.toMatch(/annul|remplac|invalid|ne vaut plus|cancel|replac|void|no longer/i)
    }
    expect(sheet().textContent ?? "").not.toMatch(/annul|remplac|ne vaut plus/i)

    // Le premier code, arrivé en retard : refusé par le défi le plus récent, accepté par le premier.
    demoGate.verifyCode.mockResolvedValueOnce({ ok: false, code: "demo_gate_code_invalid" })
    await user.type(code, "123456K")
    await user.click(screen.getByRole("button", { name: t("demoGate.code.submit") }))
    await waitFor(() => expect(demoGate.verifyCode).toHaveBeenCalledTimes(2))
    expect(demoGate.verifyCode.mock.calls.map(([challengeId]) => challengeId)).toEqual([SECOND, FIRST])
    expect(await screen.findByRole("heading", { name: t("demoAccounts.groups.members") })).toBeInTheDocument()
  })

  it("un code faux contre tous les défis valables : un seul message ; trop d'essais arrête la recherche", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const demoGate = gate()
    demoGate.requestCode
      .mockResolvedValueOnce({ ok: true, value: { challengeId: "a".repeat(32), expiresAt: Date.now() + 5 * 60_000 } })
      .mockResolvedValueOnce({ ok: true, value: { challengeId: "b".repeat(32), expiresAt: Date.now() + 6 * 60_000 } })
    setup({ demoAccounts: accounts().value, demoGate: demoGate.value })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const code = await reachCodeStep(user)
    await act(async () => {
      vi.advanceTimersByTime(61_000)
    })
    const resend = screen.getByRole("button", { name: t("demoGate.code.resend") })
    await waitFor(() => expect(resend).toBeEnabled())
    await user.click(resend)
    await screen.findByText(t("demoGate.code.resent"))

    demoGate.verifyCode.mockResolvedValueOnce({ ok: false, code: "demo_gate_code_invalid" }).mockResolvedValueOnce({ ok: false, code: "demo_gate_code_invalid" })
    await user.type(code, "123456K")
    await user.click(screen.getByRole("button", { name: t("demoGate.code.submit") }))
    expect(await screen.findByRole("alert")).toHaveTextContent(flat(t("errors.demo_gate_code_invalid")))
    expect(demoGate.verifyCode).toHaveBeenCalledTimes(2)

    demoGate.verifyCode.mockResolvedValueOnce({ ok: false, code: "too_many_attempts", retryAfterMs: 60_000 })
    await user.click(screen.getByRole("button", { name: t("demoGate.code.submit") }))
    await waitFor(() => expect(screen.getByRole("button", { name: t("demoGate.code.submit") })).toBeDisabled())
    expect(demoGate.verifyCode).toHaveBeenCalledTimes(3)
  })
})

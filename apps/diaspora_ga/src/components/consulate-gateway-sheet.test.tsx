// @vitest-environment jsdom
import { getFixedT } from "@diaspora-ga/features/i18n"
import { I18nProvider } from "@diaspora-ga/features/i18n/client"
import { cleanup, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useRef, useState } from "react"
import { afterEach, describe, expect, it } from "vitest"

import { consulateGatewayLinks } from "@/lib/consulate-gateway"

import { ConsulateGatewaySheet } from "./consulate-gateway-sheet"

/**
 * La feuille d'information de la passerelle « consulat.ga » (CH-863, lot D1) : montrée la première
 * fois, elle dit que consulat.ga est une autre application, avec sa propre connexion, à qui
 * DIASPORA.GA ne transmet rien ; puis, selon la personne, ouvrir son espace ou s'inscrire.
 */
afterEach(() => cleanup())

const LINKS = consulateGatewayLinks("https://consulat.example")!
const IDN_PORTAL = "https://identite.example"
/** Les espaces insécables du français (« étapes : ») se lisent comme des espaces simples. */
const flat = (text: string) => text.replace(/\s+/g, " ").trim()
/** Un nom accessible comparé sans tenir compte des espaces insécables. */
const named = (text: string) => (name: string) => flat(name) === flat(text)
/** La description d'un élément (`aria-describedby`), en texte aplati. */
const descriptionOf = (element: HTMLElement) => flat(document.getElementById(element.getAttribute("aria-describedby") ?? "")?.textContent ?? "")

function Harness(props: { readonly state: "idn" | "light"; readonly idnPortalUrl?: string | null; readonly locale?: "fr" | "en" }) {
  const [open, setOpen] = useState(true)
  const avatar = useRef<HTMLButtonElement>(null)
  return (
    <I18nProvider locale={props.locale ?? "fr"}>
      <button ref={avatar} type="button">
        Avatar
      </button>
      <ConsulateGatewaySheet open={open} onOpenChange={setOpen} links={LINKS} state={props.state} idnPortalUrl={props.idnPortalUrl ?? null} returnFocus={() => avatar.current} />
    </I18nProvider>
  )
}

/** Un lien vers une autre application : même onglet, ni ouvreur ni référent. */
function expectOutbound(link: HTMLElement, href: string) {
  expect(link).toHaveAttribute("href", href)
  expect(link).toHaveAttribute("rel", "noopener noreferrer")
  expect(link).toHaveAttribute("referrerpolicy", "no-referrer")
  expect(link).not.toHaveAttribute("target")
}

describe("feuille consulat.ga — ce qu'elle dit toujours", () => {
  const t = getFixedT("fr")

  it("un dialogue titré, qui dit en une phrase que consulat.ga est une autre application et ne reçoit rien", () => {
    render(<Harness state="idn" />)
    const sheet = screen.getByRole("dialog", { name: t("consulateGateway.sheet.title") })
    expect(descriptionOf(sheet)).toBe(flat(t("consulateGateway.sheet.separate")))
    expect(within(sheet).getByText(flat(t("consulateGateway.sheet.sameTab")))).toBeInTheDocument()
  })

  it("le focus va sur son titre ; à la fermeture, il revient à l'avatar qui l'a ouverte", async () => {
    const user = userEvent.setup()
    render(<Harness state="light" />)
    const sheet = screen.getByRole("dialog", { name: t("consulateGateway.sheet.title") })
    await waitFor(() => expect(within(sheet).getByRole("heading", { name: t("consulateGateway.sheet.title") })).toHaveFocus())
    await user.keyboard("{Escape}")
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(screen.getByRole("button", { name: "Avatar" })).toHaveFocus()
  })
})

describe("feuille consulat.ga — selon la personne", () => {
  const t = getFixedT("fr")

  it("compte relié à identite.ga : « Ouvrir mon espace consulat.ga » d'abord, « M'inscrire au consulat » ensuite, sans les étapes", () => {
    render(<Harness state="idn" idnPortalUrl={IDN_PORTAL} />)
    const sheet = screen.getByRole("dialog")
    expect(within(sheet).getByText(flat(t("consulateGateway.sheet.idnLead")))).toBeInTheDocument()
    const links = within(sheet).getAllByRole("link")
    expect(links.map((link) => link.textContent)).toEqual([t("consulateGateway.sheet.openMySpace"), t("consulateGateway.sheet.register")])
    expectOutbound(links[0]!, LINKS.mySpace)
    expectOutbound(links[1]!, LINKS.register)
    expect(within(sheet).queryByRole("list", { name: named(t("consulateGateway.sheet.stepsLead")) })).toBeNull()
  })

  it("compte léger ou en attente : les trois étapes dans l'ordre, puis s'inscrire, « J'ai déjà un compte » et identite.ga", () => {
    render(<Harness state="light" idnPortalUrl={IDN_PORTAL} />)
    const sheet = screen.getByRole("dialog")
    const steps = within(sheet).getByRole("list", { name: named(t("consulateGateway.sheet.stepsLead")) })
    expect(within(steps).getAllByRole("listitem").map((item) => within(item).getByRole("heading").textContent)).toEqual([
      t("consulateGateway.sheet.steps.identityTitle"),
      t("consulateGateway.sheet.steps.registrationTitle"),
      t("consulateGateway.sheet.steps.accessTitle"),
    ])
    expect(within(sheet).getByText(flat(t("consulateGateway.sheet.registerCreatesIdentity")))).toBeInTheDocument()
    const links = within(sheet).getAllByRole("link")
    expect(links.map((link) => link.textContent)).toEqual([t("consulateGateway.sheet.register"), t("consulateGateway.sheet.alreadyRegistered"), t("consulateGateway.sheet.idnPortal")])
    expectOutbound(links[0]!, LINKS.register)
    expectOutbound(links[1]!, LINKS.mySpace)
    expectOutbound(links[2]!, IDN_PORTAL)
  })

  it("sans portail identite.ga configuré : aucun lien vers lui, jamais un lien mort", () => {
    render(<Harness state="light" idnPortalUrl={null} />)
    const links = within(screen.getByRole("dialog")).getAllByRole("link")
    expect(links.map((link) => link.getAttribute("href"))).toEqual([LINKS.register, LINKS.mySpace])
  })

  it("parle anglais", () => {
    const en = getFixedT("en")
    render(<Harness state="light" locale="en" />)
    const sheet = screen.getByRole("dialog", { name: en("consulateGateway.sheet.title") })
    expect(within(sheet).getByRole("link", { name: en("consulateGateway.sheet.register") })).toHaveAttribute("href", LINKS.register)
    expect(within(sheet).getByRole("button", { name: en("consulateGateway.sheet.close") })).toBeInTheDocument()
  })
})

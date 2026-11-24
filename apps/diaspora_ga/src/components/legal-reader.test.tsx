// @vitest-environment jsdom
import { COMMUNITY_RULES, LEGAL_TEXTS, type LegalTextKind } from "@diaspora-ga/domain"
import { reportReasonsOfRule } from "@diaspora-ga/features/data"
import { getFixedT } from "@diaspora-ga/features/i18n"
import { I18nProvider } from "@diaspora-ga/features/i18n/client"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState, type ComponentProps } from "react"
import { renderToString } from "react-dom/server"
import { afterEach, describe, expect, it, vi } from "vitest"

import { legalSectionAnchor, legalSectionFragment } from "@/lib/legal-texts"

import { LegalReader } from "./legal-reader"

/**
 * Le lecteur des textes du site (« une page = une vue », § 5) : sommaire, UNE rubrique, Précédent
 * et Suivant. Le serveur rend le texte entier, rien de masqué ; après l'hydratation, une seule
 * rubrique est montrée, les autres portent `data-inactive` (jamais l'attribut `hidden`). En jsdom,
 * `data-inactive` ne prouve pas le masquage : seul le navigateur le prouve.
 */
const t = getFixedT("fr")
const SECTIONS = LEGAL_TEXTS.privacy.sections

type ReaderProps = ComponentProps<typeof LegalReader>

function Reader(props: Partial<ReaderProps> & { readonly locale?: "fr" | "en" }) {
  const { locale = "fr", ...rest } = props
  const kind = rest.kind ?? "privacy"
  return (
    <I18nProvider locale={locale}>
      <LegalReader kind={kind} active={null} sectionHref={(section) => legalSectionFragment(kind, section)} headingLevel={2} {...rest} />
    </I18nProvider>
  )
}

/** Un lecteur dont le choix reste interne (comme dans la page flottante) : le clic simple choisit la rubrique. */
function SelectingReader(props: { readonly kind: LegalTextKind }) {
  const [active, setActive] = useState<string | null>(null)
  return <Reader kind={props.kind} active={active} onSelect={setActive} />
}

const sectionOf = (kind: LegalTextKind, section: string) => document.getElementById(legalSectionAnchor(kind, section))!
const inactiveOf = (kind: LegalTextKind) => LEGAL_TEXTS[kind].sections.filter((section) => sectionOf(kind, section).hasAttribute("data-inactive"))
const reader = () => document.querySelector("[data-legal-reader]")!
const summary = () => screen.getByRole("navigation", { name: t("legal.summary") })
const pager = () => screen.getByRole("navigation", { name: t("legal.pager") })
const title = (kind: LegalTextKind, section: string) => t(`legal.${kind}.${section}.title`)

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe("LegalReader — le serveur rend le texte entier", () => {
  it("aucune rubrique marquée inactive, aucun pagineur : sans script, tout se lit et les ancres répondent", () => {
    const html = renderToString(<Reader />)
    expect(html).not.toContain("data-inactive")
    expect(html).not.toMatch(/\shidden=""/)
    expect(html).toContain('data-view="summary"')
    expect(html).not.toContain('rel="next"')
    for (const section of SECTIONS) expect(html).toContain(`id="${legalSectionAnchor("privacy", section)}"`)
  })

  it("après l'hydratation, une seule rubrique reste montrée, sans écart avec le HTML du serveur", () => {
    const mismatch = vi.spyOn(console, "error")
    const container = document.createElement("div")
    container.innerHTML = renderToString(<Reader />)
    document.body.append(container)
    render(<Reader />, { container, hydrate: true })
    expect(mismatch).not.toHaveBeenCalled()
    expect(inactiveOf("privacy")).toEqual(SECTIONS.slice(1))
    expect(within(pager()).getByRole("link", { name: new RegExp(t("legal.next")) })).toHaveAttribute("rel", "next")
  })
})

describe("LegalReader — une rubrique à la fois, après l'hydratation", () => {
  it("sans rubrique choisie : la vue du sommaire, la première rubrique montrée (au bureau), Suivant seul", () => {
    render(<Reader />)
    expect(reader()).toHaveAttribute("data-view", "summary")
    expect(inactiveOf("privacy")).toEqual(SECTIONS.slice(1))
    const links = within(summary()).getAllByRole("link")
    expect(links.map((link) => link.getAttribute("href"))).toEqual(SECTIONS.map((section) => legalSectionFragment("privacy", section)))
    expect(links.filter((link) => link.getAttribute("aria-current") === "true")).toEqual([links[0]])
    expect(within(pager()).queryByRole("link", { name: new RegExp(t("legal.previous")) })).toBeNull()
    const next = within(pager()).getByRole("link", { name: new RegExp(t("legal.next")) })
    expect(next).toHaveAttribute("rel", "next")
    expect(next).toHaveAttribute("href", legalSectionFragment("privacy", SECTIONS[1]!))
    expect(next).toHaveTextContent(title("privacy", SECTIONS[1]!))
  })

  it("une rubrique choisie : elle seule montrée et marquée au sommaire, ses voisines au pagineur", () => {
    const active = SECTIONS[3]!
    render(<Reader active={active} />)
    expect(reader()).toHaveAttribute("data-view", "section")
    expect(inactiveOf("privacy")).toEqual(SECTIONS.filter((section) => section !== active))
    expect(within(summary()).getByRole("link", { current: true })).toHaveTextContent(title("privacy", active))
    expect(within(pager()).getByRole("link", { name: new RegExp(t("legal.previous")) })).toHaveAttribute("href", legalSectionFragment("privacy", SECTIONS[2]!))
    expect(within(pager()).getByRole("link", { name: new RegExp(t("legal.previous")) })).toHaveAttribute("rel", "prev")
    expect(within(pager()).getByRole("link", { name: new RegExp(t("legal.next")) })).toHaveAttribute("href", legalSectionFragment("privacy", SECTIONS[4]!))
  })

  it("la dernière rubrique : Précédent seul ; une rubrique inconnue vaut la vue du sommaire", () => {
    const last = SECTIONS[SECTIONS.length - 1]!
    render(<Reader active={last} />)
    expect(within(pager()).queryByRole("link", { name: new RegExp(t("legal.next")) })).toBeNull()
    expect(within(pager()).getByRole("link", { name: new RegExp(t("legal.previous")) })).toHaveTextContent(title("privacy", SECTIONS[SECTIONS.length - 2]!))
    cleanup()
    render(<Reader active="inconnue" />)
    expect(reader()).toHaveAttribute("data-view", "summary")
    expect(inactiveOf("privacy")).toEqual(SECTIONS.slice(1))
  })

  it("le sommaire est un volet qui défile seul, nommé et joignable au clavier ; la rubrique aussi", () => {
    render(<Reader active={SECTIONS[1]!} />)
    expect(summary()).toHaveAttribute("data-view-pane")
    expect(summary().tabIndex).toBe(0)
    const text = screen.getByRole("region", { name: t("legal.privacy.title") })
    expect(text).toHaveAttribute("data-view-pane")
    expect(text).toContainElement(sectionOf("privacy", SECTIONS[1]!))
    expect(text).toContainElement(pager())
  })

  it("le niveau des intitulés suit la page qui l'accueille (h3 sous le titre d'une feuille)", () => {
    render(<Reader headingLevel={3} />)
    expect(screen.queryAllByRole("heading", { level: 2 })).toEqual([])
    expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(SECTIONS.length)
    for (const heading of screen.getAllByRole("heading", { level: 3 })) expect(heading.tabIndex).toBe(-1)
  })

  it("les règles de la communauté : une règle montrée porte les motifs de signalement qui y renvoient", () => {
    const rule = COMMUNITY_RULES.find((candidate) => reportReasonsOfRule(candidate).length > 0)!
    render(<Reader kind="community" active={rule} />)
    expect(inactiveOf("community")).toEqual(COMMUNITY_RULES.filter((candidate) => candidate !== rule))
    const reasons = within(sectionOf("community", rule)).getByRole("list", { name: t("communityRules.reasonsLabel") })
    expect(within(reasons).getAllByRole("listitem").map((item) => item.textContent)).toEqual(reportReasonsOfRule(rule).map((reason) => t(`report.reason.${reason}`)))
  })

  it("parle anglais : sommaire et pagineur dans la langue de la personne", () => {
    const en = getFixedT("en")
    render(<Reader locale="en" active={SECTIONS[1]!} />)
    expect(screen.getByRole("navigation", { name: "Contents" })).toBeInTheDocument()
    const englishPager = screen.getByRole("navigation", { name: en("legal.pager") })
    expect(within(englishPager).getByRole("link", { name: /Previous/ })).toHaveTextContent(en(`legal.privacy.${SECTIONS[0]!}.title`))
    expect(within(englishPager).getByRole("link", { name: /Next/ })).toBeInTheDocument()
  })
})

describe("LegalReader — dans la page flottante, le clic simple reste dans la feuille", () => {
  it("un clic simple choisit la rubrique sans suivre le lien ; Cmd-clic laisse le navigateur ouvrir la page", () => {
    const onSelect = vi.fn()
    render(<Reader onSelect={onSelect} sectionHref={(section) => `/confidentialite#${section ?? "sommaire"}`} />)
    const third = within(summary()).getAllByRole("link")[2]!
    expect(fireEvent.click(third)).toBe(false)
    expect(onSelect).toHaveBeenCalledExactlyOnceWith(SECTIONS[2])
    expect(fireEvent.click(third, { metaKey: true })).toBe(true)
    expect(fireEvent.click(third, { button: 1 })).toBe(true)
    expect(onSelect).toHaveBeenCalledOnce()
  })

  it("le focus suit la rubrique choisie : sur son intitulé, au sommaire comme au pagineur", async () => {
    const user = userEvent.setup()
    render(<SelectingReader kind="privacy" />)
    await user.click(within(summary()).getAllByRole("link")[4]!)
    expect(within(sectionOf("privacy", SECTIONS[4]!)).getByRole("heading")).toHaveFocus()
    within(pager()).getByRole("link", { name: new RegExp(t("legal.next")) }).focus()
    await user.keyboard("{Enter}")
    expect(within(sectionOf("privacy", SECTIONS[5]!)).getByRole("heading")).toHaveFocus()
    expect(inactiveOf("privacy")).toEqual(SECTIONS.filter((section) => section !== SECTIONS[5]))
  })
})

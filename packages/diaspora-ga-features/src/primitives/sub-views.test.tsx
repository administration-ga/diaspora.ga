import { cleanup, render, screen, within } from "@testing-library/react"
import { UserRoundIcon } from "lucide-react"
import { afterEach, describe, expect, it } from "vitest"

import { SubViews, type SubViewItem } from "./sub-views"

/**
 * « Une page = une vue », lot 2 (plan du 24/11/2026, § 2) : une page trop longue se découpe en
 * sous-vues, liste maître et détail. Au large, côte à côte ; à l'étroit, un niveau à la fois (la
 * liste, puis une sous-vue et sa ligne de retour). Toutes les sous-vues restent montées : une
 * saisie non enregistrée survit au changement. En jsdom, `data-inactive` ne prouve pas le
 * masquage (les classes du conteneur non plus) : seul le navigateur le prouve.
 */
type Id = "compte" | "profil" | "pays"

const ITEMS: readonly SubViewItem<Id>[] = [
  { id: "compte", label: "Compte", href: "#adhesions", icon: UserRoundIcon },
  { id: "profil", label: "Profil", href: "#profil" },
  { id: "pays", label: "Pays", href: "#facette" },
]

function Views(props: { readonly active: Id | null; readonly footer?: boolean }) {
  return (
    <SubViews
      label="Rubriques"
      detailLabel="Détail"
      items={ITEMS}
      active={props.active}
      back={{ href: "#rubriques", label: "Toutes les rubriques" }}
      listId="rubriques"
      {...(props.footer ? { listFooter: <a href="/informations">Informations</a> } : {})}
    >
      {(id) => (
        <p>
          Contenu {id} <input aria-label={`Saisie ${id}`} />
        </p>
      )}
    </SubViews>
  )
}

const root = () => document.querySelector<HTMLElement>("[data-sub-views]")!
const list = () => screen.getByRole("navigation", { name: "Rubriques" })
const detail = () => screen.getByRole("region", { name: "Détail" })
const group = (name: string) => screen.getByRole("group", { name })
const shownGroups = () => Array.from(document.querySelectorAll<HTMLElement>("[data-sub-view]:not([data-inactive])")).map((node) => node.dataset.subView)

afterEach(cleanup)

describe("SubViews — la liste maître", () => {
  it("est une navigation nommée qui défile seule (un volet), faite de liens natifs de 44 px", () => {
    render(<Views active="profil" />)
    const nav = list()
    expect(nav).toHaveAttribute("data-view-pane")
    expect(nav).toHaveAttribute("id", "rubriques")
    const links = within(nav).getAllByRole("link")
    expect(links.map((link) => [link.textContent, link.getAttribute("href")])).toEqual([
      ["Compte", "#adhesions"],
      ["Profil", "#profil"],
      ["Pays", "#facette"],
    ])
    for (const link of links) expect(link).toHaveClass("min-h-11", "focus-visible:shadow-focus")
  })

  it("marque la sous-vue montrée (`aria-current`), et elle seule", () => {
    render(<Views active="profil" />)
    expect(within(list()).getAllByRole("link").filter((link) => link.getAttribute("aria-current") === "true").map((link) => link.textContent)).toEqual(["Profil"])
  })

  it("une icône d'entrée est décorative : le nom du lien reste son libellé", () => {
    render(<Views active={null} />)
    const link = within(list()).getByRole("link", { name: "Compte" })
    expect(link.querySelector("svg")).toHaveAttribute("aria-hidden", "true")
  })

  it("porte son pied (la ligne « Informations » des réglages) dans le même volet, après les entrées", () => {
    render(<Views active={null} footer />)
    const links = within(list()).getAllByRole("link")
    expect(links.map((link) => link.textContent)).toEqual(["Compte", "Profil", "Pays", "Informations"])
  })
})

describe("SubViews — le détail", () => {
  it("toutes les sous-vues restent montées dans UN volet nommé ; les inactives portent `data-inactive`, jamais l'attribut `hidden`", () => {
    render(<Views active="pays" />)
    const pane = detail()
    expect(pane).toHaveAttribute("data-view-pane")
    for (const id of ["compte", "profil", "pays"] as const) expect(within(pane).getByRole("textbox", { name: `Saisie ${id}` })).toBeInTheDocument()
    expect(shownGroups()).toEqual(["pays"])
    for (const node of document.querySelectorAll("[data-sub-view]")) {
      expect(node).not.toHaveAttribute("hidden")
      expect(node).toHaveClass("data-[inactive]:hidden")
    }
    expect(screen.getAllByRole("region")).toHaveLength(1)
  })

  it("chaque sous-vue est un groupe nommé par son entrée, focalisable par le code seulement (tabIndex -1)", () => {
    render(<Views active="compte" />)
    for (const item of ITEMS) {
      const node = group(item.label)
      expect(node).toHaveAttribute("data-sub-view", item.id)
      expect(node.tabIndex).toBe(-1)
      // Aucun identifiant : les ancres des sections qu'il porte restent uniques dans la page.
      expect(node).not.toHaveAttribute("id")
    }
  })

  it("une saisie non enregistrée survit au changement de sous-vue", () => {
    const view = render(<Views active="profil" />)
    const input = screen.getByRole("textbox", { name: "Saisie profil" })
    input.setAttribute("value", "brouillon")
    ;(input as HTMLInputElement).value = "brouillon"
    view.rerender(<Views active="pays" />)
    expect(screen.getByRole("textbox", { name: "Saisie profil" })).toBe(input)
    expect(input).toHaveValue("brouillon")
  })
})

describe("SubViews — la vue : la liste ou une sous-vue", () => {
  it("sans sous-vue choisie : la vue de la liste (`data-view=list`), la première sous-vue montrée au large", () => {
    render(<Views active={null} />)
    expect(root()).toHaveAttribute("data-view", "list")
    expect(shownGroups()).toEqual(["compte"])
    expect(within(list()).getByRole("link", { name: "Compte" })).toHaveAttribute("aria-current", "true")
  })

  it("une sous-vue choisie : la vue du détail (`data-view=detail`)", () => {
    render(<Views active="profil" />)
    expect(root()).toHaveAttribute("data-view", "detail")
    expect(root()).toHaveClass("@container/subviews")
  })

  it("la ligne de retour est un lien natif HORS du volet : à l'étroit, elle reste visible quand le détail défile", () => {
    render(<Views active="profil" />)
    const back = screen.getByRole("link", { name: "Toutes les rubriques" })
    expect(back).toHaveAttribute("href", "#rubriques")
    expect(back).toHaveClass("min-h-11", "focus-visible:shadow-focus")
    expect(detail().contains(back)).toBe(false)
    expect(list().contains(back)).toBe(false)
  })

  it("aucune transition sur ce qui change de taille ou d'affichage : la racine, la colonne du détail, chaque sous-vue", () => {
    // En mouvement réduit, la charte pose une transition de 0,01 ms sur toutes les propriétés de tout
    // élément : un bloc qui bascule passerait par une image écrasée (leçon du lot 1).
    render(<Views active="profil" />)
    expect(root()).toHaveClass("transition-none")
    expect(detail().parentElement).toHaveClass("transition-none")
    for (const node of document.querySelectorAll("[data-sub-view]")) expect(node).toHaveClass("transition-none")
  })
})

describe("SubViews — le focus suit la vue (règle du lecteur des textes)", () => {
  it("à l'arrivée, aucun vol de focus", () => {
    render(<Views active="pays" />)
    expect(document.body).toHaveFocus()
  })

  it("une sous-vue choisie depuis la liste : le focus va sur son groupe", () => {
    const view = render(<Views active={null} />)
    within(list()).getByRole("link", { name: "Pays" }).focus()
    view.rerender(<Views active="pays" />)
    expect(group("Pays")).toHaveFocus()
  })

  it("le retour à la liste : le focus revient au lien de la sous-vue quittée", () => {
    const view = render(<Views active={null} />)
    within(list()).getByRole("link", { name: "Profil" }).focus()
    view.rerender(<Views active="profil" />)
    expect(group("Profil")).toHaveFocus()
    view.rerender(<Views active={null} />)
    expect(within(list()).getByRole("link", { name: "Profil" })).toHaveFocus()
  })

  it("le focus perdu dans une sous-vue qui se masque (retour du navigateur) passe à la sous-vue montrée", () => {
    const view = render(<Views active="profil" />)
    screen.getByRole("textbox", { name: "Saisie profil" }).focus()
    view.rerender(<Views active="pays" />)
    expect(group("Pays")).toHaveFocus()
  })

  it("un geste hors de la primitive (un lien de la page) garde son focus", () => {
    const view = render(
      <>
        <button type="button">Ailleurs</button>
        <Views active={null} />
      </>,
    )
    const outside = screen.getByRole("button", { name: "Ailleurs" })
    outside.focus()
    view.rerender(
      <>
        <button type="button">Ailleurs</button>
        <Views active="pays" />
      </>,
    )
    expect(outside).toHaveFocus()
  })

  it("à chaque changement, le volet du détail repart du haut", () => {
    const view = render(<Views active="compte" />)
    const pane = detail()
    pane.scrollTop = 240
    view.rerender(<Views active="pays" />)
    expect(pane.scrollTop).toBe(0)
  })
})

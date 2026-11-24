import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import { render, screen } from "@testing-library/react"
import { createRef } from "react"
import { describe, expect, it } from "vitest"

import { ViewFrame, ViewPane } from "./view-frame"

/**
 * « Une page = une vue » (décision du 24/11/2026, § 3) : le cadre tient l'écran, et le seul
 * élément qui défile est un volet nommé, joignable au clavier et marqué pour le relevé du
 * navigateur (`data-view-pane`).
 */
describe("ViewFrame — le cadre d'une vue", () => {
  it("pose l'en-tête, le corps puis le pied, dans cet ordre ; le corps peut rétrécir (min-h-0)", () => {
    render(
      <ViewFrame header={<h1>Titre</h1>} footer={<p>Pied</p>}>
        <p>Corps</p>
      </ViewFrame>,
    )
    const frame = document.querySelector("[data-view-frame]")!
    expect(frame).not.toBeNull()
    expect(Array.from(frame.children).map((child) => child.textContent)).toEqual(["Titre", "Corps", "Pied"])
    const body = frame.querySelector("[data-view-frame-body]")!
    expect(body).toHaveTextContent("Corps")
    expect(body.className).toMatch(/\btall:min-h-0\b/)
    // Sous 600 px de haut, le cadre se relâche : ses contraintes ne valent qu'avec la variante `tall`.
    expect(frame.className).not.toMatch(/(^|\s)(h-dvh|h-full|overflow-hidden)(\s|$)/)
  })

  it("sans en-tête ni pied, il ne rend que le corps", () => {
    render(
      <ViewFrame className="px-4">
        <p>Seul</p>
      </ViewFrame>,
    )
    const frame = document.querySelector("[data-view-frame]")!
    expect(frame.children).toHaveLength(1)
    expect(frame).toHaveClass("px-4")
  })
})

describe("ViewPane — le seul élément qui défile", () => {
  it("est une région nommée, focalisable (tabIndex 0) et marquée `data-view-pane`", () => {
    render(
      <ViewPane label="Texte">
        <p>Long contenu</p>
      </ViewPane>,
    )
    const pane = screen.getByRole("region", { name: "Texte" })
    expect(pane.tabIndex).toBe(0)
    expect(pane).toHaveAttribute("data-view-pane")
    // Le défilement reste dans le volet, et ne vaut que cadre tenu (fenêtre d'au moins 600 px de haut).
    expect(pane).toHaveClass("overscroll-contain", "tall:overflow-y-auto", "min-h-0", "focus-visible:shadow-focus")
    expect(pane.className).not.toMatch(/(^|\s)overflow-y-auto(\s|$)/)
  })

  it("un sommaire reste une navigation : le volet en prend le rôle, sans région en double", () => {
    render(
      <ViewPane label="Sommaire" landmark="navigation">
        <a href="#un">Un</a>
      </ViewPane>,
    )
    expect(screen.getByRole("navigation", { name: "Sommaire" })).toHaveAttribute("data-view-pane")
    expect(screen.queryByRole("region")).toBeNull()
  })

  it("garde ses classes, ses attributs et sa référence", () => {
    const ref = createRef<HTMLDivElement>()
    render(
      <ViewPane ref={ref} label="Rubrique" id="volet" className="px-2" data-testid="volet">
        <p>Corps</p>
      </ViewPane>,
    )
    expect(ref.current).toBe(screen.getByTestId("volet"))
    expect(ref.current).toHaveAttribute("id", "volet")
    expect(ref.current).toHaveClass("px-2", "overscroll-contain")
  })

  it("ne joue aucune transition : sa bascule de taille à l'hydratation est d'un seul coup, même en mouvement réduit", () => {
    // En mouvement réduit, la charte pose une transition de 0,01 ms sur toutes les propriétés de tout
    // élément : sans `transition-none`, le volet passait par une image écrasée (constaté au navigateur).
    render(<ViewPane label="Sommaire">corps</ViewPane>)
    expect(screen.getByRole("region", { name: "Sommaire" })).toHaveClass("transition-none")
  })
})

describe("la variante `tall` de la couche Tailwind", () => {
  it("est déclarée : une fenêtre d'au moins 600 px de haut, à l'écran (l'impression suit le document)", () => {
    // Chemin de fichier, pas d'URL : sous jsdom, `URL` n'est pas celle de Node.
    const layer = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../styles/tailwind-theme.css"), "utf8")
    expect(layer).toContain("@custom-variant tall (@media screen and (min-height: 600px));")
  })
})

// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react"
import { renderToString } from "react-dom/server"
import { afterEach, describe, expect, it } from "vitest"

import { useHashView, viewOfHash } from "./use-hash-view"

/**
 * La vue choisie par l'ancre de l'adresse (« une page = une vue », § 3) : le serveur ne la connaît
 * pas (instantané vide), le navigateur la lit et la suit à chaque changement d'ancre.
 */
const IDS = ["esprit", "respect", "droits-d-auteur"] as const

function Probe() {
  return <p data-testid="vue">{useHashView(IDS) ?? "aucune"}</p>
}

/** Une ancre posée comme le fait un lien natif `<a href="#…">` : l'adresse change, puis `hashchange`. */
function follow(hash: string) {
  act(() => {
    window.history.pushState(null, "", hash)
    window.dispatchEvent(new HashChangeEvent("hashchange"))
  })
}

afterEach(() => {
  cleanup()
  window.history.replaceState(null, "", "/")
})

describe("useHashView — la vue que dit l'ancre", () => {
  it("le serveur ne lit aucune ancre : aucune vue, quelle que soit l'adresse du navigateur", () => {
    window.history.replaceState(null, "", "/regles-communaute#respect")
    expect(renderToString(<Probe />)).toContain("aucune")
  })

  it("lit l'ancre de l'arrivée, puis suit chaque ancre suivie", () => {
    window.history.replaceState(null, "", "/regles-communaute#respect")
    render(<Probe />)
    expect(screen.getByTestId("vue")).toHaveTextContent("respect")
    follow("#droits-d-auteur")
    expect(screen.getByTestId("vue")).toHaveTextContent("droits-d-auteur")
  })

  it("une ancre inconnue, ou aucune ancre, ne choisit aucune vue", () => {
    render(<Probe />)
    expect(screen.getByTestId("vue")).toHaveTextContent("aucune")
    follow("#sommaire")
    expect(screen.getByTestId("vue")).toHaveTextContent("aucune")
  })

  it("le retour du navigateur remonte d'une vue (popstate)", () => {
    window.history.replaceState(null, "", "/regles-communaute#esprit")
    render(<Probe />)
    follow("#respect")
    act(() => {
      window.history.replaceState(null, "", "/regles-communaute#esprit")
      window.dispatchEvent(new PopStateEvent("popstate"))
    })
    expect(screen.getByTestId("vue")).toHaveTextContent("esprit")
  })

  it("une ancre poussée par l'historique (le routeur de Next) prévient les abonnés, en différé", async () => {
    window.history.replaceState(null, "", "/parametres")
    render(<Probe />)
    // Next pousse l'adresse sans `hashchange` (« Obtenir un parrainage » suivi depuis la page même).
    act(() => {
      window.history.pushState(null, "", "/parametres#respect")
    })
    // Pas dans le même tour : Next pousse l'adresse dans un `useInsertionEffect`, où un avis
    // synchrone ferait lever une alerte à React.
    expect(screen.getByTestId("vue")).toHaveTextContent("aucune")
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(screen.getByTestId("vue")).toHaveTextContent("respect")
    // `replaceState` aussi, et chaque abonné est prévenu.
    render(<Probe />)
    act(() => {
      window.history.replaceState(null, "", "/parametres#esprit")
    })
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(screen.getAllByTestId("vue").map((node) => node.textContent)).toEqual(["esprit", "esprit"])
  })

  it("l'enveloppe de l'historique laisse l'adresse et l'état poussés intacts, et ne se pose qu'une fois", () => {
    render(<Probe />)
    const wrapped = window.history.pushState
    render(<Probe />)
    expect(window.history.pushState).toBe(wrapped)
    window.history.pushState({ marque: 1 }, "", "/parametres#droits-d-auteur")
    expect(window.location.pathname).toBe("/parametres")
    expect(window.location.hash).toBe("#droits-d-auteur")
    expect(window.history.state).toEqual({ marque: 1 })
  })
})

describe("viewOfHash — règle pure", () => {
  it("retire le croisillon, décode l'ancre et ne rend qu'un identifiant connu", () => {
    expect(viewOfHash("#esprit", IDS)).toBe("esprit")
    expect(viewOfHash("esprit", IDS)).toBe("esprit")
    expect(viewOfHash("#droits%2Dd%2Dauteur", IDS)).toBe("droits-d-auteur")
    expect(viewOfHash("", IDS)).toBeNull()
    expect(viewOfHash("#inconnue", IDS)).toBeNull()
    // Une ancre mal encodée ne casse rien : elle n'est simplement pas une vue.
    expect(viewOfHash("#%E0%A4%A", IDS)).toBeNull()
  })
})

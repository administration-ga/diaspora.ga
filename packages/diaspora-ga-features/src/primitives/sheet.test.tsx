import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { useState } from "react"
import { describe, expect, it, vi } from "vitest"

import { Sheet, SheetContent, SheetTrigger, useSheetOpen } from "./sheet"

function Probe() {
  return <span data-testid="probe">{useSheetOpen() ? "ouverte" : "fermée"}</span>
}

/** Une feuille ouverte, la pile des avis (sonner) à côté, et un autre élément de la page. */
function Page() {
  const [open, setOpen] = useState(true)
  return (
    <>
      <Probe />
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent title="Nouvelle publication" description="Rédiger un message" closeLabel="Fermer">
          <p>Contenu</p>
        </SheetContent>
      </Sheet>
      <section aria-label="Avis">
        <ol data-sonner-toaster="">
          <li>
            <button type="button">Écarter cet avis</button>
          </li>
        </ol>
      </section>
      <button type="button">Ailleurs</button>
    </>
  )
}

/** Radix n'écoute les clics hors de la feuille qu'un tour après son ouverture. */
async function nextTurn() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

/** Un clic complet : Radix diffère le retrait hors de la feuille jusqu'au `click`. */
function clickOn(element: Element) {
  fireEvent.pointerDown(element, { button: 0 })
  fireEvent.mouseDown(element, { button: 0 })
  fireEvent.pointerUp(element, { button: 0 })
  fireEvent.mouseUp(element, { button: 0 })
  fireEvent.click(element, { button: 0 })
}

/** Une feuille à niveaux : un geste avant le titre, un corps dont les volets défilent seuls. */
function Levels(props: { onCloseAutoFocus?: (event: Event) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger>Ouvrir</SheetTrigger>
      <SheetContent
        title="Confidentialité"
        description="Version 2"
        closeLabel="Fermer"
        leading={<button type="button">Retour</button>}
        bodyClassName="flex flex-col tall:overflow-hidden"
        {...(props.onCloseAutoFocus ? { onCloseAutoFocus: props.onCloseAutoFocus } : {})}
      >
        <p>Rubrique</p>
      </SheetContent>
    </Sheet>
  )
}

describe("Sheet — une feuille à niveaux (page flottante)", () => {
  it("pose le geste `leading` avant le titre, hors du titre : le nom de la feuille ne change pas", async () => {
    render(<Levels />)
    fireEvent.click(screen.getByText("Ouvrir"))
    const dialog = await screen.findByRole("dialog", { name: "Confidentialité" })
    const back = within(dialog).getByRole("button", { name: "Retour" })
    const title = within(dialog).getByRole("heading", { name: "Confidentialité" })
    expect(title).not.toContainElement(back)
    expect(back.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it("le titre se laisse focaliser par le code (tabIndex -1), hors de l'ordre de tabulation", async () => {
    render(<Levels />)
    fireEvent.click(screen.getByText("Ouvrir"))
    const title = within(await screen.findByRole("dialog")).getByRole("heading", { name: "Confidentialité" })
    expect(title.tabIndex).toBe(-1)
    expect(title).toHaveAttribute("data-slot", "sheet-title")
  })

  it("les classes du corps s'ajoutent aux siennes", async () => {
    render(<Levels />)
    fireEvent.click(screen.getByText("Ouvrir"))
    const body = (await screen.findByText("Rubrique")).parentElement!
    expect(body).toHaveAttribute("data-slot", "sheet-body")
    expect(body).toHaveClass("flex", "flex-col", "tall:overflow-hidden", "min-h-0", "px-5")
  })

  it("sans `onCloseAutoFocus`, le focus revient au déclencheur ; avec, la feuille le laisse décider", async () => {
    render(<Levels />)
    fireEvent.click(screen.getByText("Ouvrir"))
    await screen.findByRole("dialog")
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" })
    await waitFor(() => expect(screen.getByText("Ouvrir")).toHaveFocus())
    cleanup()

    const onCloseAutoFocus = vi.fn((event: Event) => event.preventDefault())
    render(<Levels onCloseAutoFocus={onCloseAutoFocus} />)
    fireEvent.click(screen.getByText("Ouvrir"))
    await screen.findByRole("dialog")
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" })
    await waitFor(() => expect(onCloseAutoFocus).toHaveBeenCalledOnce())
    expect(screen.getByText("Ouvrir")).not.toHaveFocus()
  })
})

describe("Sheet — la feuille et les cartes flottantes", () => {
  it("annonce qu'elle est ouverte, puis fermée (les cartes persistantes s'écartent en attendant)", async () => {
    render(<Page />)
    expect(screen.getByTestId("probe")).toHaveTextContent("ouverte")
    await nextTurn()
    clickOn(screen.getByText("Ailleurs"))
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(screen.getByTestId("probe")).toHaveTextContent("fermée")
  })

  it("un geste dans la pile des avis ne ferme pas la feuille", async () => {
    render(<Page />)
    await nextTurn()
    clickOn(screen.getByText("Écarter cet avis"))
    expect(screen.getByRole("dialog")).toBeInTheDocument()
    expect(screen.getByTestId("probe")).toHaveTextContent("ouverte")
  })
})

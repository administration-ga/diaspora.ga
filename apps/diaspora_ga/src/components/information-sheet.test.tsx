// @vitest-environment jsdom
import { LEGAL_TEXTS } from "@diaspora-ga/domain"
import { getFixedT } from "@diaspora-ga/features/i18n"
import { I18nProvider } from "@diaspora-ga/features/i18n/client"
import { MEMBER_INFORMATION_ENTRIES, MEMBER_MENU_ENTRIES, MEMBER_MENU_ICONS } from "@diaspora-ga/features/navigation"
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useRef, useState, type ComponentProps } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { formatLegalTextDate, legalSectionAnchor, legalSectionHref, type InformationEntryId } from "@/lib/legal-texts"
import { memberMenuHref } from "@/lib/member-menu"
import { routes } from "@/lib/routes"

import { InformationSheet } from "./information-sheet"

/**
 * La page flottante « Informations » (« une page = une vue », § 4) : trois niveaux, une vue
 * chacun — l'index des six entrées, un texte (titre, version, sommaire), une rubrique (corps,
 * Précédent et Suivant). L'adresse ne change pas ; chaque entrée reste un vrai lien.
 */
const mocks = vi.hoisted(() => ({ followed: vi.fn() }))

// Un lien ordinaire : le test note les liens que le navigateur suivrait (clic non intercepté).
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.followed }) }))

vi.mock("next/link", () => ({
  default: ({ href, children, onClick, ...rest }: Omit<ComponentProps<"a">, "href"> & { href: string }) => (
    <a
      href={href}
      {...rest}
      onClick={(event) => {
        onClick?.(event)
        if (!event.defaultPrevented) mocks.followed(href)
        event.preventDefault()
      }}
    >
      {children}
    </a>
  ),
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const t = getFixedT("fr")
const INFORMATION = [
  ["Mentions légales", routes.legalNotice()],
  ["Confidentialité", routes.privacy()],
  ["Conditions d'utilisation", routes.terms()],
  ["Règles de la communauté", routes.communityRules()],
  ["Contact", routes.contact()],
  ["Charte graphique", routes.charte()],
]

function entries(current: InformationEntryId | null) {
  return MEMBER_INFORMATION_ENTRIES.map((id) => ({
    id,
    href: memberMenuHref(MEMBER_MENU_ENTRIES[id], "awa.demo"),
    icon: MEMBER_MENU_ICONS[id],
    labelKey: MEMBER_MENU_ENTRIES[id].labelKey,
    active: id === current,
  }))
}

/** La coque, réduite : l'avatar qui a ouvert le menu, la page flottante ouverte. */
function Harness(props: { readonly current?: InformationEntryId; readonly locale?: "fr" | "en"; readonly onOpenChange?: (open: boolean) => void }) {
  const [open, setOpen] = useState(true)
  const avatar = useRef<HTMLButtonElement>(null)
  return (
    <I18nProvider locale={props.locale ?? "fr"}>
      <button ref={avatar} type="button">
        Avatar
      </button>
      <InformationSheet
        open={open}
        onOpenChange={(next) => {
          props.onOpenChange?.(next)
          setOpen(next)
        }}
        entries={entries(props.current ?? null)}
        returnFocus={() => avatar.current}
      />
    </I18nProvider>
  )
}

const dialog = (name = "Informations") => screen.getByRole("dialog", { name })
const titleOf = (element: HTMLElement) => within(element).getByRole("heading", { level: 2 })
const indexOf = (element: HTMLElement, name = "Informations") => within(element).getByRole("navigation", { name })
const linksOf = (container: HTMLElement) => within(container).getAllByRole("link").map((link) => [link.textContent, link.getAttribute("href")])
const edition = (kind: keyof typeof LEGAL_TEXTS) => t("legal.edition", { version: LEGAL_TEXTS[kind].version, date: formatLegalTextDate(LEGAL_TEXTS[kind].date, "fr") })

describe("Page flottante « Informations » — l'index", () => {
  it("les six entrées du menu, dans son ordre, chacune un vrai lien ; version et date sous chaque texte", async () => {
    render(<Harness />)
    const sheet = dialog()
    await waitFor(() => expect(titleOf(sheet)).toHaveFocus())
    expect(sheet).toHaveAccessibleDescription(t("nav.information.description"))
    const index = indexOf(sheet)
    expect(linksOf(index)).toEqual(INFORMATION)
    expect(within(index).getByRole("link", { name: "Confidentialité" })).toHaveAccessibleDescription(edition("privacy"))
    expect(within(index).getByRole("link", { name: "Contact" })).toHaveAccessibleDescription(edition("contact"))
    // La charte n'est pas un texte : un lien ordinaire, qui dit ouvrir sa page.
    expect(within(index).getByRole("link", { name: "Charte graphique" })).toHaveAccessibleDescription(t("nav.information.opensPage"))
    // À l'index, rien à remonter : pas de « Retour ».
    expect(within(sheet).queryByRole("button", { name: t("nav.information.back") })).toBeNull()
  })

  it("la page courante y est marquée, et elle seule", () => {
    render(<Harness current="privacy" />)
    const current = within(indexOf(dialog())).getAllByRole("link").filter((link) => link.getAttribute("aria-current") === "page")
    expect(current.map((link) => link.textContent)).toEqual(["Confidentialité"])
  })

  it("Cmd-clic sur un texte : le navigateur ouvre sa page publique, la feuille reste à l'index", () => {
    render(<Harness />)
    fireEvent.click(within(indexOf(dialog())).getByRole("link", { name: "Confidentialité" }), { metaKey: true })
    expect(mocks.followed).toHaveBeenCalledExactlyOnceWith(routes.privacy())
    expect(dialog()).toBeInTheDocument()
  })

  it("la charte : un lien ordinaire, qui quitte la feuille", async () => {
    const onOpenChange = vi.fn()
    render(<Harness onOpenChange={onOpenChange} />)
    await userEvent.setup().click(within(indexOf(dialog())).getByRole("link", { name: "Charte graphique" }))
    expect(mocks.followed).toHaveBeenCalledExactlyOnceWith(routes.charte())
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  it("Échap ferme la feuille et rend le focus à l'avatar", async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await waitFor(() => expect(titleOf(dialog())).toHaveFocus())
    await user.keyboard("{Escape}")
    expect(screen.queryByRole("dialog")).toBeNull()
    await waitFor(() => expect(screen.getByRole("button", { name: "Avatar" })).toHaveFocus())
  })
})

describe("Page flottante « Informations » — un texte, puis une rubrique", () => {
  it("un clic simple ouvre le texte dans la feuille : son titre, sa version, son sommaire numéroté ; le focus sur le titre", async () => {
    render(<Harness />)
    const link = within(indexOf(dialog())).getByRole("link", { name: "Confidentialité" })
    act(() => {
      fireEvent.click(link)
    })
    expect(mocks.followed).not.toHaveBeenCalled()
    const sheet = dialog(t("legal.privacy.title"))
    expect(sheet).toHaveAccessibleDescription(edition("privacy"))
    await waitFor(() => expect(titleOf(sheet)).toHaveFocus())
    const summary = within(sheet).getByRole("navigation", { name: t("legal.summary") })
    const sections = LEGAL_TEXTS.privacy.sections
    expect(within(summary).getAllByRole("link").map((item) => item.getAttribute("href"))).toEqual(sections.map((section) => legalSectionHref("privacy", section)))
    within(summary).getAllByRole("link").forEach((item, index) => expect(item).toHaveTextContent(`${index + 1}.`))
    // Les intitulés de rubrique passent sous le titre de la feuille : h3.
    expect(within(sheet).getAllByRole("heading", { level: 3 })).toHaveLength(sections.length)
  })

  it("une rubrique : son corps, Précédent et Suivant ; « Retour » remonte d'un niveau, deux fois jusqu'à l'index", async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(within(indexOf(dialog())).getByRole("link", { name: "Règles de la communauté" }))
    let sheet = dialog(t("legal.community.title"))
    const rules = LEGAL_TEXTS.community.sections
    await user.click(within(within(sheet).getByRole("navigation", { name: t("legal.summary") })).getAllByRole("link")[2]!)
    // L'adresse ne change pas : la rubrique est un état de la feuille.
    expect(mocks.followed).not.toHaveBeenCalled()
    const shown = document.getElementById(legalSectionAnchor("community", rules[2]!))!
    expect(shown).not.toHaveAttribute("data-inactive")
    expect(within(shown).getByRole("heading", { level: 3 })).toHaveFocus()
    const pager = within(sheet).getByRole("navigation", { name: t("legal.pager") })
    expect(within(pager).getByRole("link", { name: new RegExp(t("legal.previous")) })).toHaveAttribute("href", legalSectionHref("community", rules[1]!))
    expect(within(pager).getByRole("link", { name: new RegExp(t("legal.next")) })).toHaveAttribute("href", legalSectionHref("community", rules[3]!))

    await user.click(within(sheet).getByRole("button", { name: t("nav.information.back") }))
    sheet = dialog(t("legal.community.title"))
    expect(sheet.querySelector("[data-legal-reader]")).toHaveAttribute("data-view", "summary")
    await waitFor(() => expect(titleOf(sheet)).toHaveFocus())

    await user.click(within(sheet).getByRole("button", { name: t("nav.information.back") }))
    sheet = dialog()
    expect(linksOf(indexOf(sheet))).toEqual(INFORMATION)
    await waitFor(() => expect(titleOf(sheet)).toHaveFocus())
  })

  it("au bureau, le panneau s'élargit et prend une hauteur fixe pour un texte ; l'index garde la largeur d'une feuille", async () => {
    render(<Harness />)
    const index = dialog()
    expect(index.className).not.toMatch(/920px/)
    await userEvent.setup().click(within(indexOf(index)).getByRole("link", { name: "Contact" }))
    const text = dialog(t("legal.contact.title"))
    expect(text).toHaveClass("md:w-[min(920px,calc(100vw-2rem))]", "md:h-[min(680px,88dvh)]")
    // Les volets défilent seuls : le corps de la feuille ne défile plus, cadre tenu.
    expect(text.querySelector('[data-slot="sheet-body"]')).toHaveClass("tall:overflow-hidden")
  })

  it("parle anglais", async () => {
    const en = getFixedT("en")
    render(<Harness locale="en" />)
    const index = indexOf(dialog("Information"), "Information")
    expect(within(index).getByRole("link", { name: "Privacy" })).toHaveAttribute("href", routes.privacy())
    await userEvent.setup().click(within(index).getByRole("link", { name: "Terms of use" }))
    const sheet = dialog(en("legal.terms.title"))
    expect(within(sheet).getByRole("navigation", { name: "Contents" })).toBeInTheDocument()
    expect(within(sheet).getByRole("button", { name: "Back" })).toBeInTheDocument()
    expect(within(sheet).getByRole("button", { name: "Close information" })).toBeInTheDocument()
  })
})

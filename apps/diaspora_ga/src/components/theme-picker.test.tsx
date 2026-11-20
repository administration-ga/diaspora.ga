// @vitest-environment jsdom
import { AppearanceProvider } from "@antsia/social-features/shell/appearance"
import { getFixedT } from "@diaspora-ga/features/i18n"
import { I18nProvider } from "@diaspora-ga/features/i18n/client"
import { act, cleanup, render, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { APPEARANCE, DEFAULT_CHARTE } from "@/lib/appearance"

import { APPEARANCE_BOOT_SCRIPT } from "./appearance-boot-script"
import { ThemePicker } from "./theme-picker"

const t = getFixedT("fr")
const THEME_KEY = "antsia:diaspora-ga:theme"

function mount(locale: "fr" | "en" = "fr") {
  return render(
    <I18nProvider locale={locale}>
      <AppearanceProvider storagePrefix={APPEARANCE.storagePrefix} themes={APPEARANCE.themes}>
        <ThemePicker />
      </AppearanceProvider>
    </I18nProvider>,
  )
}

const radios = () => within(screen.getByRole("radiogroup")).getAllByRole("radio")
const radio = (id: string) => radios().find((candidate) => candidate.getAttribute("value") === id)!

beforeEach(() => {
  window.localStorage.clear()
  document.documentElement.dataset.charte = DEFAULT_CHARTE
})

afterEach(() => cleanup())

describe("ThemePicker — le thème au choix du membre", () => {
  it("propose Sable, coché par défaut, puis Gaboma, chacun peint dans sa propre charte", () => {
    mount()
    expect(screen.getByRole("radiogroup", { name: t("preferences.theme") })).toBeDefined()
    expect(radios().map((candidate) => candidate.getAttribute("data-charte"))).toEqual(["diaspora-ga", "diaspora-ga-gaboma"])
    expect(radios().map((candidate) => candidate.textContent)).toEqual([
      `${t("preferences.palette.sable.name")}${t("preferences.palette.sable.description")}`,
      `${t("preferences.palette.gaboma.name")}${t("preferences.palette.gaboma.description")}`,
    ])
    expect(radio("sable").getAttribute("aria-checked")).toBe("true")
    expect(radio("gaboma").getAttribute("aria-checked")).toBe("false")
  })

  it("choisir Gaboma l'applique à la page et le mémorise sur l'appareil ; revenir à Sable efface la clé", async () => {
    mount()
    await act(async () => radio("gaboma").click())
    expect(radio("gaboma").getAttribute("aria-checked")).toBe("true")
    expect(document.documentElement.dataset.charte).toBe("diaspora-ga-gaboma")
    expect(window.localStorage.getItem(THEME_KEY)).toBe("gaboma")

    await act(async () => radio("sable").click())
    expect(document.documentElement.dataset.charte).toBe("diaspora-ga")
    expect(window.localStorage.getItem(THEME_KEY)).toBeNull()
  })

  it("relit le thème mémorisé au montage", async () => {
    window.localStorage.setItem(THEME_KEY, "gaboma")
    await act(async () => {
      mount()
    })
    expect(radio("gaboma").getAttribute("aria-checked")).toBe("true")
    expect(document.documentElement.dataset.charte).toBe("diaspora-ga-gaboma")
  })

  it("les libellés existent aussi en anglais", () => {
    mount("en")
    expect(radios().map((candidate) => candidate.textContent?.startsWith(getFixedT("en")(`preferences.palette.${candidate.getAttribute("value")}.name`)))).toEqual([true, true])
  })

  it("hors du fournisseur d'apparence, rien ne s'affiche", () => {
    const { container } = render(
      <I18nProvider locale="fr">
        <ThemePicker />
      </I18nProvider>,
    )
    expect(container.innerHTML).toBe("")
  })
})

describe("script d'amorçage de l'apparence", () => {
  const boot = () => new Function(APPEARANCE_BOOT_SCRIPT)()

  it("pose la charte mémorisée avant l'affichage, Sable pour une valeur inconnue", () => {
    window.localStorage.setItem(THEME_KEY, "gaboma")
    boot()
    expect(document.documentElement.dataset.charte).toBe("diaspora-ga-gaboma")
    window.localStorage.setItem(THEME_KEY, "corail")
    boot()
    expect(document.documentElement.dataset.charte).toBe("diaspora-ga")
  })

  it("pose le mode sombre choisi", () => {
    window.localStorage.setItem("antsia:diaspora-ga:appearance", "dark")
    boot()
    expect(document.documentElement.classList.contains("dark")).toBe(true)
    window.localStorage.setItem("antsia:diaspora-ga:appearance", "light")
    boot()
    expect(document.documentElement.classList.contains("dark")).toBe(false)
  })
})

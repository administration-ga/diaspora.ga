// @vitest-environment jsdom
import { DataSourceProvider } from "@diaspora-ga/features/data"
import { DemoStore, createDemoDataSource } from "@diaspora-ga/features/demo"
import { getFixedT } from "@diaspora-ga/features/i18n"
import { I18nProvider } from "@diaspora-ga/features/i18n/client"
import { cleanup, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { routes } from "@/lib/routes"

import { DoorVision } from "./door-vision"

/**
 * La vision sous la porte (CH-816) : elle n'annonce que ce qui est ouvert au lancement, selon la
 * déclaration de l'application (`lib/public-offer.ts`). `consular` remplace la déclaration de la
 * vérification consulaire le temps d'un essai ; `null` garde la vraie.
 */
const offer = vi.hoisted(() => ({ consular: null as boolean | null }))
vi.mock("@/lib/public-offer", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/public-offer")>()
  return {
    ...actual,
    get CONSULAR_ATTESTATION_ANNOUNCED() {
      return offer.consular ?? actual.CONSULAR_ATTESTATION_ANNOUNCED
    },
  }
})

const t = getFixedT("fr")
/** Les phrases rendues passent les espaces insécables en espaces simples. */
const flat = (text: string | null | undefined) => (text ?? "").replace(/\s+/g, " ").trim()

function mount(showJoin = true) {
  const source = createDemoDataSource(new DemoStore(null, () => Date.UTC(2026, 10, 22, 12), 0))
  return render(
    <I18nProvider locale="fr">
      <DataSourceProvider source={source}>
        <DoorVision showJoin={showJoin} />
      </DataSourceProvider>
    </I18nProvider>,
  )
}

const offerCards = () => within(screen.getByRole("region", { name: t("landing.vision.offerTitle") })).getAllByRole("listitem")
const trustCards = () => within(screen.getByRole("region", { name: t("landing.vision.trustTitle") })).getAllByRole("listitem")
const steps = () => within(screen.getByRole("region", { name: t("landing.vision.stepsTitle") })).getAllByRole("listitem")

const CLOSED_CARDS = ["groupsAndEvents", "services", "jobs", "mutualAid", "mentoring", "arrivalKit"] as const

afterEach(() => {
  cleanup()
  offer.consular = null
})

describe("DoorVision — la page d'entrée n'annonce que ce qui est ouvert", () => {
  it("au lancement : le pays, les personnes, les pages et le contact, dans cet ordre", () => {
    mount()
    const cards = offerCards()
    expect(cards.map((card) => flat(card.querySelector("p")?.textContent))).toEqual(
      ["country", "people", "pages", "contact"].map((id) => flat(t(`landing.vision.offer.${id}.title`))),
    )
    for (const id of ["country", "people", "pages", "contact"]) {
      expect(screen.getByText(flat(t(`landing.vision.offer.${id}.body`)))).toBeInTheDocument()
    }
  })

  it("ne montre aucune carte d'un module fermé, dont les textes restent écrits", () => {
    const { container } = mount()
    for (const id of CLOSED_CARDS) {
      for (const part of ["title", "body"] as const) {
        const key = `landing.vision.offer.${id}.${part}`
        expect(t(key), key).not.toBe(key)
        expect(screen.queryByText(flat(t(key))), key).not.toBeInTheDocument()
      }
    }
    // Ni kit d'arrivée, ni emploi, ni services, ni mentorat, ni entraide, ni agenda.
    expect(flat(container.textContent)).not.toMatch(/kit d'arrivée|emploi|talents|rendez-vous|mentor|entraid|bénévole|agenda|évènement/i)
  })

  it("quatre cartes : deux colonnes au bureau, aucune carte seule sur sa ligne ; la confiance garde trois colonnes", () => {
    mount()
    expect(offerCards()).toHaveLength(4)
    const offerList = offerCards()[0]!.parentElement!
    expect(offerList.className).toContain("min-[960px]:grid-cols-2")
    expect(offerList.className).not.toContain("min-[960px]:grid-cols-3")
    const trustList = trustCards()[0]!.parentElement!
    expect(trustList.className).toContain("min-[960px]:grid-cols-3")
  })

  it("vérification consulaire non annoncée : elle arrive, consulat.ga ne confirmera que l'inscription ; on publie après un parrainage", () => {
    offer.consular = false
    const { container } = mount()
    expect(screen.getByText(flat(t("landing.vision.trust.verifiedSoon.title")))).toBeInTheDocument()
    expect(screen.getByText(flat(t("landing.vision.trust.verifiedSoon.body")))).toBeInTheDocument()
    expect(screen.queryByText(flat(t("landing.vision.trust.verified.title")))).not.toBeInTheDocument()
    expect(screen.queryByText(flat(t("landing.vision.trust.verified.body")))).not.toBeInTheDocument()
    expect(flat(steps()[2]!.textContent)).toBe(`3${flat(t("landing.vision.steps.publishSponsored"))}`)
    expect(flat(container.textContent)).not.toMatch(/consulat\.ga confirme une|après la vérification consulaire/i)
    // La garantie reste : consulat.ga confirmera une inscription consulaire, et rien d'autre.
    expect(flat(t("landing.vision.trust.verifiedSoon.body"))).toMatch(/consulat\.ga confirmera une inscription consulaire, et rien d'autre/)
  })

  it("vérification consulaire annoncée : consulat.ga confirme l'inscription ; on publie après la vérification ou un parrainage", () => {
    offer.consular = true
    mount()
    expect(screen.getByText(flat(t("landing.vision.trust.verified.title")))).toBeInTheDocument()
    expect(screen.getByText(flat(t("landing.vision.trust.verified.body")))).toBeInTheDocument()
    expect(screen.queryByText(flat(t("landing.vision.trust.verifiedSoon.title")))).not.toBeInTheDocument()
    expect(flat(steps()[2]!.textContent)).toBe(`3${flat(t("landing.vision.steps.publish"))}`)
  })

  it("garde ses six repères de confiance, ses trois étapes et l'appel à rejoindre", () => {
    mount()
    expect(trustCards()).toHaveLength(6)
    expect(steps()).toHaveLength(3)
    expect(screen.getByRole("link", { name: t("landing.vision.join") })).toHaveAttribute("href", routes.register())
    cleanup()
    mount(false)
    expect(screen.queryByRole("link", { name: t("landing.vision.join") })).not.toBeInTheDocument()
  })
})

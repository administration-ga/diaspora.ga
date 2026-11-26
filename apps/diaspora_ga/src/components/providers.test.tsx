// @vitest-environment jsdom
import { LEGAL_TEXT_KINDS, LEGAL_TEXTS } from "@diaspora-ga/domain"
import { getFixedT } from "@diaspora-ga/features/i18n"
import { cleanup, render, screen } from "@testing-library/react"
import { renderToString } from "react-dom/server"
import { afterEach, describe, expect, it, vi } from "vitest"

import { formatLegalTextDate, LEGAL_TEXT_ROUTES } from "@/lib/legal-texts"
import { DEMO_MEDIA_ASSETS } from "@/lib/routes"
import { LegalScreen } from "@/screens/legal-screen"

import { Providers } from "./providers"

const SESSION_LOADING = "Ouverture de votre session…"

const navigation = vi.hoisted(() => ({ pathname: "/", router: { push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() } }))
vi.mock("next/navigation", () => ({ usePathname: () => navigation.pathname, useRouter: () => navigation.router }))

const env = vi.hoisted(() => ({
  dataSource: "engine" as "engine" | "demo",
  convexUrl: "https://moteur.invalid",
  convexSiteUrl: null,
  idnPortalUrl: null,
  consulateUrl: null,
}))
vi.mock("@/lib/env", () => ({ publicEnv: env }))

// La démonstration, observée : chaque magasin fictif créé et ce que l'application lui a demandé (vitrine des médias).
const demoStores = vi.hoisted(() => [] as unknown[][])
vi.mock("@diaspora-ga/features/demo", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@diaspora-ga/features/demo")>()
  class ObservedDemoStore extends actual.DemoStore {
    constructor(...args: ConstructorParameters<typeof actual.DemoStore>) {
      super(...args)
      demoStores.push(args)
    }
  }
  return { ...actual, DemoStore: ObservedDemoStore }
})

// Le fournisseur du moteur, tel que le serveur le rend avant toute session : la coque d'attente,
// jamais les pages (garde de session d'`@antsia/api/next-provider`).
vi.mock("@/data/engine-providers", () => ({
  EngineDataProviders: () => <div role="status">{SESSION_LOADING}</div>,
}))

afterEach(() => {
  cleanup()
  env.dataSource = "engine"
  navigation.pathname = "/"
})

const t = getFixedT("fr")

/** Un texte tel que React l'écrit dans le HTML du serveur (apostrophes et guillemets échappés). */
const asHtml = (text: string) =>
  text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll("'", "&#x27;").replaceAll('"', "&quot;")

/** Le HTML que le serveur envoie pour un texte du site, sur le moteur, sans session. */
function serverHtml(kind: (typeof LEGAL_TEXT_KINDS)[number]): string {
  navigation.pathname = LEGAL_TEXT_ROUTES[kind]()
  return renderToString(
    <Providers locale="fr">
      <LegalScreen kind={kind} />
    </Providers>,
  )
}

describe("Textes du site rendus côté serveur, sans attendre la session", () => {
  it.each(LEGAL_TEXT_KINDS)("%s : le HTML initial porte le titre, la version et chaque rubrique", (kind) => {
    const html = serverHtml(kind)
    const edition = LEGAL_TEXTS[kind]
    expect(html).not.toContain(SESSION_LOADING)
    expect(html).toContain(asHtml(t(`legal.${kind}.title`)))
    expect(html).toContain(asHtml(t("legal.edition", { version: edition.version, date: formatLegalTextDate(edition.date, "fr") })))
    for (const section of edition.sections) expect(html).toContain(asHtml(t(`legal.${kind}.${section}.title`)))
  })

  it("une adresse finie par une barre oblique reste un texte du site", () => {
    navigation.pathname = `${LEGAL_TEXT_ROUTES.notice()}/`
    const html = renderToString(
      <Providers locale="fr">
        <LegalScreen kind="notice" />
      </Providers>,
    )
    expect(html).toContain(asHtml(t("legal.notice.title")))
  })

  it("toute autre page attend la session du moteur, comme avant", () => {
    navigation.pathname = "/fil"
    const html = renderToString(
      <Providers locale="fr">
        <p>page de l'application</p>
      </Providers>,
    )
    expect(html).toContain(SESSION_LOADING)
    expect(html).not.toContain("page de l'application")
  })

  it("quitter un texte pour l'application remonte la session du moteur, sans retour en arrière", () => {
    navigation.pathname = LEGAL_TEXT_ROUTES.privacy()
    const view = render(
      <Providers locale="fr">
        <p>contenu</p>
      </Providers>,
    )
    expect(screen.getByText("contenu")).toBeInTheDocument()
    navigation.pathname = "/fil"
    view.rerender(
      <Providers locale="fr">
        <p>contenu</p>
      </Providers>,
    )
    expect(screen.getByRole("status")).toHaveTextContent(SESSION_LOADING)
    // Revenir sur un texte depuis l'application garde la session ouverte (iCom, appels).
    navigation.pathname = LEGAL_TEXT_ROUTES.terms()
    view.rerender(
      <Providers locale="fr">
        <p>contenu</p>
      </Providers>,
    )
    expect(screen.getByRole("status")).toHaveTextContent(SESSION_LOADING)
  })

  it("sur le moteur, aucune démonstration n'est montée : le clip fictif (absent de l'image de production) n'est jamais demandé", () => {
    demoStores.length = 0
    navigation.pathname = "/fil"
    const html = renderToString(
      <Providers locale="fr">
        <p>page de l'application</p>
      </Providers>,
    )
    expect(demoStores).toEqual([])
    expect(html).not.toContain(DEMO_MEDIA_ASSETS.clip)
    render(<Providers locale="fr"><p>page de l'application</p></Providers>)
    expect(demoStores).toEqual([])
    expect(document.body.innerHTML).not.toContain(DEMO_MEDIA_ASSETS.clip)
  })

  it("en démonstration seulement, la vitrine des médias reçoit le clip fictif de l'application", () => {
    demoStores.length = 0
    env.dataSource = "demo"
    navigation.pathname = "/fil"
    render(<Providers locale="fr"><p>page de démonstration</p></Providers>)
    expect(demoStores.length).toBeGreaterThan(0)
    expect(demoStores[0]?.[3]).toEqual({ mediaShowcase: { clipUrl: DEMO_MEDIA_ASSETS.clip } })
  })

  it("la démonstration ne change pas : ses données fictives restent montées sous les textes", () => {
    env.dataSource = "demo"
    const html = serverHtml("community")
    expect(html).toContain(asHtml(t("legal.community.title")))
    expect(html).not.toContain(SESSION_LOADING)
  })
})

// @vitest-environment jsdom
import { reportDecisionDelayHours } from "@antsia/social-domain/moderation"
import { PAGE_SLEEP_DAYS } from "@antsia/social-domain/pages"
import { LEGAL_TEXT_KINDS, LEGAL_TEXTS, PUBLISHER, type LegalTextKind } from "@diaspora-ga/domain"
import { ERASURE_GRACE_DAYS } from "@diaspora-ga/features/data"
import { getFixedT } from "@diaspora-ga/features/i18n"
import { I18nProvider } from "@diaspora-ga/features/i18n/client"
import { cleanup, render, screen, within } from "@testing-library/react"
import type { ReactNode } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import CommunityRulesPage from "@/app/regles-communaute/page"
import ContactPage from "@/app/contact/page"
import PrivacyPage from "@/app/confidentialite/page"
import LegalNoticePage from "@/app/mentions-legales/page"
import TermsPage from "@/app/conditions-utilisation/page"
import { legalBodyLines, parseLegalBody } from "@/lib/legal-body"
import { formatLegalTextDate, LEGAL_SECTION_LINKS, LEGAL_TEXT_LABELS, LEGAL_TEXT_ROUTES, legalSectionAnchor } from "@/lib/legal-texts"
import { anchors, routes } from "@/lib/routes"

import { LegalScreen } from "./legal-screen"

// La coque publique (en-tête, pied de page) a ses propres tests : ici, le texte seul.
vi.mock("@/components/site-chrome", () => ({ PublicShell: (props: { children: ReactNode }) => <main>{props.children}</main> }))
// Les métadonnées lisent la requête : hors sujet ici, seule la page est rendue.
vi.mock("@/i18n/server", () => ({ getAppT: vi.fn() }))

afterEach(cleanup)

/** Le texte tel que Testing Library le lit dans le DOM (espaces insécables normalisées). */
const normalized = (value: string) => value.replace(/\s+/g, " ")

const LOCALES = ["fr", "en"] as const

function renderText(kind: LegalTextKind, locale: "fr" | "en" = "fr") {
  return render(<I18nProvider locale={locale}><LegalScreen kind={kind} /></I18nProvider>)
}

/** La rubrique rendue, retrouvée par son ancre. */
function sectionOf(kind: LegalTextKind, section: string) {
  return within(document.getElementById(legalSectionAnchor(kind, section))!)
}

/** L'intitulé d'une rubrique tel que l'écran le rend : son numéro, puis son titre. */
function numbered(t: ReturnType<typeof getFixedT>, kind: LegalTextKind, section: string, index: number) {
  return `${t("legal.sectionNumber", { number: index + 1 })} ${t(`legal.${kind}.${section}.title`)}`
}

describe("Textes du site — chaque page dit sa version et sa date (LX-05)", () => {
  it.each(LEGAL_TEXT_KINDS)("« %s » : titre, version et date du domaine, aucun marqueur, toutes ses rubriques numérotées", (kind) => {
    const t = getFixedT("fr")
    const edition = LEGAL_TEXTS[kind]
    renderText(kind)
    expect(screen.getByRole("heading", { level: 1, name: t(`legal.${kind}.title`) })).toBeInTheDocument()
    expect(screen.getByText(normalized(t("legal.edition", { version: edition.version, date: formatLegalTextDate(edition.date, "fr") })))).toBeInTheDocument()
    // Un texte définitif n'a aucun marqueur : ni « à fournir », ni « provisoire ».
    expect(edition.status).toBe("final")
    expect(screen.queryByRole("note")).toBeNull()
    expect(screen.queryByText(normalized(t("legal.provisional.heading")))).toBeNull()
    expect(screen.queryByText(normalized(t("legal.todoLawyer")))).toBeNull()
    expect(screen.getAllByRole("heading", { level: 2 }).map((heading) => normalized(heading.textContent ?? ""))).toEqual(
      edition.sections.map((section, index) => numbered(t, kind, section, index)),
    )
  })

  it.each(LEGAL_TEXT_KINDS)("« %s » : chaque paragraphe et chaque élément de liste de chaque rubrique est rendu", (kind) => {
    const t = getFixedT("fr")
    renderText(kind)
    for (const section of LEGAL_TEXTS[kind].sections) {
      const region = sectionOf(kind, section)
      for (const block of parseLegalBody(t(`legal.${kind}.${section}.body`))) {
        if (block.kind === "paragraph") {
          expect(region.getByText(normalized(block.text)), `${kind}.${section}`).toBeInTheDocument()
        } else {
          const items = region.getAllByRole("listitem").map((item) => normalized(item.textContent ?? ""))
          expect(items, `${kind}.${section}`).toEqual(expect.arrayContaining(block.items.map(normalized)))
        }
      }
    }
  })

  it("un texte long s'ouvre sur un sommaire dont chaque entrée mène à l'ancre de sa rubrique", () => {
    const t = getFixedT("fr")
    renderText("privacy")
    const summary = within(screen.getByRole("navigation", { name: t("legal.summary") }))
    const sections = LEGAL_TEXTS.privacy.sections
    expect(summary.getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual(sections.map((section) => `#${legalSectionAnchor("privacy", section)}`))
    for (const [index, section] of sections.entries()) {
      const link = summary.getAllByRole("link")[index]!
      expect(link).toHaveTextContent(t("legal.sectionNumber", { number: index + 1 }))
      expect(link).toHaveTextContent(t(`legal.privacy.${section}.title`))
      expect(document.getElementById(legalSectionAnchor("privacy", section)), section).not.toBeNull()
    }
    expect(new Set(sections.map((section) => legalSectionAnchor("privacy", section))).size).toBe(sections.length)
  })

  it("une ancre s'écrit en minuscules et tirets ; celle d'une règle est celle que citent les signalements", () => {
    expect(legalSectionAnchor("notice", "intellectualProperty")).toBe("intellectual-property")
    expect(legalSectionAnchor("contact", "report")).toBe("report")
    expect(legalSectionAnchor("community", "prohibited")).toBe("contenus-interdits")
    expect(`${routes.communityRules()}#${legalSectionAnchor("community", "measures")}`).toBe(routes.communityRule("measures"))
  })

  it("parle anglais : titre, version et date dans la langue de la personne, sans marqueur", () => {
    const t = getFixedT("en")
    const edition = LEGAL_TEXTS.terms
    renderText("terms", "en")
    expect(screen.getByRole("heading", { level: 1, name: "Terms of use" })).toBeInTheDocument()
    expect(screen.getByText(t("legal.edition", { version: edition.version, date: formatLegalTextDate(edition.date, "en") }))).toBeInTheDocument()
    expect(screen.queryByRole("note")).toBeNull()
  })

  it("une date civile ne recule pas d'un jour selon le fuseau", () => {
    expect(formatLegalTextDate("2026-11-10", "fr")).toBe("10 novembre 2026")
    expect(formatLegalTextDate("2026-10-14", "en")).toBe("October 14, 2026")
  })
})

describe("Textes du site — rédigés en entier, dans les deux langues", () => {
  it.each(LOCALES)("[%s] aucune rubrique ne reste à fournir, et aucune variable n'est restée sans valeur", (locale) => {
    const t = getFixedT(locale)
    for (const kind of LEGAL_TEXT_KINDS) {
      for (const section of LEGAL_TEXTS[kind].sections) {
        const key = `legal.${kind}.${section}`
        expect(t(`${key}.title`).trim().length, key).toBeGreaterThan(0)
        const body = t(`${key}.body`)
        expect(body.length, key).toBeGreaterThan(40)
        expect(body, key).not.toMatch(/À fournir|To be provided|TODO|à remplir|à désigner|à confirmer/i)
        expect(body, key).not.toMatch(/\{\{|\}\}/)
      }
    }
  })

  it("le français et l'anglais ont la même charpente : mêmes paragraphes, mêmes listes, mêmes longueurs de liste", () => {
    const fr = getFixedT("fr")
    const en = getFixedT("en")
    const shape = (body: string) => parseLegalBody(body).map((block) => (block.kind === "list" ? block.items.length : "p"))
    for (const kind of LEGAL_TEXT_KINDS) {
      for (const section of LEGAL_TEXTS[kind].sections) {
        const key = `legal.${kind}.${section}.body`
        expect(shape(en(key)), key).toEqual(shape(fr(key)))
      }
    }
  })
})

describe("Textes du site — les faits cités sont ceux du domaine et du moteur", () => {
  it.each(LOCALES)("[%s] les mentions légales donnent l'identité de l'éditeur, son directeur de la publication et son hébergeur", (locale) => {
    const t = getFixedT(locale)
    const publisher = t("legal.notice.publisher.body")
    for (const fact of [PUBLISHER.name, PUBLISHER.capital, PUBLISHER.address, PUBLISHER.rccm, PUBLISHER.nif, PUBLISHER.phone, PUBLISHER.email, PUBLISHER.representative]) {
      expect(publisher, fact).toContain(fact)
    }
    expect(t("legal.notice.director.body")).toContain(PUBLISHER.representative)
    expect(t("legal.notice.hosting.body")).toMatch(/Vercel Inc\./)
    expect(t("legal.notice.hosting.body")).toMatch(/Convex, Inc\./)
  })

  it.each(LOCALES)("[%s] la confidentialité nomme le responsable, l'autorité et la voie pour écrire", (locale) => {
    const t = getFixedT(locale)
    expect(t("legal.privacy.controller.body")).toContain(PUBLISHER.name)
    expect(t("legal.privacy.controller.body")).toContain(PUBLISHER.email)
    expect(t("legal.privacy.complaint.body")).toContain("APDPVP")
    expect(t("legal.privacy.exercise.body")).toContain(PUBLISHER.email)
    expect(t("legal.contact.publisher.body")).toContain(PUBLISHER.phone)
  })

  it("les durées écrites sont celles que le service applique : un écart oblige à corriger le texte et sa version", () => {
    const t = getFixedT("fr")
    const en = getFixedT("en")
    // Effacement du compte : délai de grâce de « Mes données ».
    expect(t("legal.privacy.retention.body")).toContain(`${ERASURE_GRACE_DAYS} jours`)
    expect(t("legal.terms.termination.body")).toContain(`${ERASURE_GRACE_DAYS} jours`)
    expect(en("legal.privacy.retention.body")).toContain(`${ERASURE_GRACE_DAYS} days`)
    // Délais légaux des signalements : ceux du moteur (ordonnance n° 0011/PR/2026, articles 24, 32 et 33).
    const reporting = legalBodyLines(t("legal.community.reporting.body"))
    expect(reporting.find((line) => line.includes("article 24"))).toContain(`${reportDecisionDelayHours("art24")} heures`)
    expect(reporting.find((line) => line.includes("article 33"))).toContain(`${reportDecisionDelayHours("art33")} heures`)
    expect(reporting.find((line) => line.includes("article 32"))).toContain(`${reportDecisionDelayHours("art32")} heures`)
    const reportingEn = legalBodyLines(en("legal.community.reporting.body"))
    expect(reportingEn.find((line) => line.includes("Article 24"))).toContain(`${reportDecisionDelayHours("art24")} hours`)
    // Sommeil d'une page : la durée du moteur.
    expect(t("legal.terms.pages.body")).toContain(`${PAGE_SLEEP_DAYS} jours`)
  })

  it.each(LOCALES)("[%s] la confidentialité dit que les messages ne sont pas chiffrés de bout en bout", (locale) => {
    const t = getFixedT(locale)
    expect(t("legal.privacy.security.body")).toMatch(locale === "fr" ? /ne sont pas chiffrés de bout en bout/ : /not end-to-end encrypted/)
  })
})

describe("Textes du site — les renvois d'une rubrique mènent à ce qui existe", () => {
  it("chaque renvoi vise une rubrique du registre", () => {
    for (const kind of LEGAL_TEXT_KINDS) {
      for (const section of Object.keys(LEGAL_SECTION_LINKS[kind])) expect(LEGAL_TEXTS[kind].sections, `${kind}.${section}`).toContain(section)
    }
  })

  it("le contact renvoie à « Mes données », aux règles, à la confidentialité et aux mentions légales", () => {
    const t = getFixedT("fr")
    renderText("contact")
    const link = (section: string) => sectionOf("contact", section).getByRole("link")
    expect(link("data")).toHaveAttribute("href", routes.myData())
    expect(link("data")).toHaveTextContent(t("footer.myData"))
    expect(link("report")).toHaveAttribute("href", routes.communityRules())
    expect(link("dataProtection")).toHaveAttribute("href", routes.privacy())
    expect(link("legalRequests")).toHaveAttribute("href", routes.legalNotice())
    // Les coordonnées de l'éditeur sont dans le texte : la rubrique n'invente aucun lien.
    expect(sectionOf("contact", "publisher").queryByRole("link")).toBeNull()
    expect(sectionOf("contact", "publisher").getByText(new RegExp(PUBLISHER.email.replaceAll(".", "\\.")))).toBeInTheDocument()
  })

  it("les mentions légales et les conditions renvoient aux autres textes", () => {
    renderText("notice")
    expect(sectionOf("notice", "personalData").getByRole("link")).toHaveAttribute("href", routes.privacy())
    expect(sectionOf("notice", "contact").getByRole("link")).toHaveAttribute("href", routes.contact())
    cleanup()
    renderText("terms")
    expect(sectionOf("terms", "conduct").getByRole("link")).toHaveAttribute("href", routes.communityRules())
    expect(sectionOf("terms", "termination").getByRole("link")).toHaveAttribute("href", routes.myData())
  })
})

describe("Textes du site — une page par texte, branchée sur sa route", () => {
  it.each([
    ["mentions légales", LegalNoticePage, "notice"],
    ["confidentialité", PrivacyPage, "privacy"],
    ["conditions d'utilisation", TermsPage, "terms"],
    ["règles de la communauté", CommunityRulesPage, "community"],
    ["contact", ContactPage, "contact"],
  ] as const)("la page des %s rend son texte", (_label, Page, kind) => {
    const t = getFixedT("fr")
    render(<I18nProvider locale="fr"><Page /></I18nProvider>)
    expect(screen.getByRole("heading", { level: 1, name: t(`legal.${kind}.title`) })).toBeInTheDocument()
  })

  it("chaque nouveau texte a sa propre adresse dans la table des routes", () => {
    expect([routes.terms(), routes.communityRules(), routes.contact()]).toEqual(["/conditions-utilisation", "/regles-communaute", "/contact"])
  })
})

describe("Textes du site — une page, une vue : l'ancre choisit la rubrique (24/11/2026)", () => {
  afterEach(() => window.history.replaceState(null, "", "/"))

  /** Les rubriques montrées après l'hydratation (les autres portent `data-inactive`). */
  const shownSections = (kind: LegalTextKind) =>
    LEGAL_TEXTS[kind].sections.filter((section) => !document.getElementById(legalSectionAnchor(kind, section))!.hasAttribute("data-inactive"))

  it("l'adresse d'une règle montre cette règle seule : les liens des signalements ne changent pas", () => {
    window.history.replaceState(null, "", routes.communityRule("reporting"))
    renderText("community")
    expect(shownSections("community")).toEqual(["reporting"])
    expect(document.querySelector("[data-legal-reader]")).toHaveAttribute("data-view", "section")
    const t = getFixedT("fr")
    expect(within(screen.getByRole("navigation", { name: t("legal.summary") })).getByRole("link", { current: true })).toHaveAttribute(
      "href",
      `#${legalSectionAnchor("community", "reporting")}`,
    )
  })

  it("sans ancre : la vue du sommaire, la première rubrique montrée (au bureau), aucun retour au sommaire", () => {
    const t = getFixedT("fr")
    renderText("privacy")
    expect(shownSections("privacy")).toEqual([LEGAL_TEXTS.privacy.sections[0]])
    expect(document.querySelector("[data-legal-reader]")).toHaveAttribute("data-view", "summary")
    expect(screen.queryByRole("link", { name: t("legal.summary") })).toBeNull()
  })

  it("une rubrique ouverte offre le retour au sommaire, par son ancre (le téléphone n'en montre qu'un niveau)", () => {
    const t = getFixedT("fr")
    window.history.replaceState(null, "", `${routes.privacy()}#${legalSectionAnchor("privacy", "controller")}`)
    renderText("privacy")
    expect(screen.getByRole("link", { name: t("legal.summary") })).toHaveAttribute("href", anchors.legalSummary)
  })

  it.each(LEGAL_TEXT_KINDS)("« %s » : les cinq textes en onglets, dans l'ordre du pied de page, celui de la page courant", (kind) => {
    const t = getFixedT("fr")
    renderText(kind)
    const tabs = within(screen.getByRole("navigation", { name: t("legal.texts") }))
    expect(tabs.getAllByRole("link").map((link) => [link.textContent, link.getAttribute("href")])).toEqual(
      LEGAL_TEXT_KINDS.map((other) => [t(LEGAL_TEXT_LABELS[other]), LEGAL_TEXT_ROUTES[other]()]),
    )
    expect(tabs.getAllByRole("link").filter((link) => link.getAttribute("aria-current") === "page").map((link) => link.textContent)).toEqual([t(LEGAL_TEXT_LABELS[kind])])
    // Des cibles de 44 px au doigt.
    for (const link of tabs.getAllByRole("link")) expect(link).toHaveClass("min-h-11")
  })

  it("parle anglais : onglets et retour au sommaire", () => {
    window.history.replaceState(null, "", routes.communityRule("respect"))
    renderText("community", "en")
    const en = getFixedT("en")
    expect(within(screen.getByRole("navigation", { name: en("legal.texts") })).getByRole("link", { current: "page" })).toHaveTextContent("Community rules")
    expect(screen.getByRole("link", { name: "Contents" })).toHaveAttribute("href", anchors.legalSummary)
  })
})

describe("Textes du site — au téléphone, l'onglet du texte ouvert est ramené dans sa piste", () => {
  afterEach(() => {
    delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView
  })

  it("l'onglet courant, et lui seul, est ramené en vue, sans défilement vertical", () => {
    const t = getFixedT("fr")
    const reveal = vi.fn()
    Element.prototype.scrollIntoView = reveal
    renderText("contact")
    const current = within(screen.getByRole("navigation", { name: t("legal.texts") })).getByRole("link", { current: "page" })
    expect(reveal.mock.contexts).toEqual([current])
    expect(reveal).toHaveBeenCalledWith({ block: "nearest", inline: "center" })
  })
})

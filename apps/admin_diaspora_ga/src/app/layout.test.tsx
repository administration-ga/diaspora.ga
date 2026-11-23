import type { ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

/**
 * CH-815 A1b — le gabarit racine pose `<meta name="referrer" content="no-referrer">` dans
 * `<head>`, AVANT tout script (revue A1, F2), en plus de l'en-tête `Referrer-Policy`.
 */
vi.mock("@/i18n/server", () => ({ getAppT: async () => ({ locale: "fr", t: (key: string) => key }) }))
vi.mock("@/components/providers", () => ({ Providers: (props: { children: ReactNode }) => props.children }))
// La feuille de styles (Tailwind, PostCSS) n'est pas l'objet du test.
vi.mock("./globals.css", () => ({}))

import RootLayout from "./layout"

describe("gabarit racine d'admin.diaspora.ga", () => {
  it("la balise referrer est dans <head>, avant le script d'amorçage, une seule fois", async () => {
    const html = renderToStaticMarkup(await RootLayout({ children: <p>contenu</p> }))
    const head = /<head>([\s\S]*?)<\/head>/.exec(html)?.[1] ?? ""
    expect(head).toContain('<meta name="referrer" content="no-referrer"/>')
    expect(html.match(/name="referrer"/g)).toHaveLength(1)
    expect(head.indexOf('name="referrer"')).toBeLessThan(head.indexOf("<script"))
  })
})

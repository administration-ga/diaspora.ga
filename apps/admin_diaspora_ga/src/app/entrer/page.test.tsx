import type { Metadata } from "next"
import type { ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"

/**
 * L'onglet de `/entrer` : le titre de la page est déjà le nom de l'application, le gabarit racine
 * (« %s · Administration de … ») ne doit pas le redoubler ; les autres pages gardent leur gabarit.
 */
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "accept-language": "fr" }) }))
vi.mock("@/components/sign-in-screen", () => ({ SignInScreen: () => null }))
vi.mock("@/components/providers", () => ({ Providers: (props: { children: ReactNode }) => props.children }))
vi.mock("../globals.css", () => ({}))

import { generateMetadata as rootMetadata } from "../layout"
import { generateMetadata as signInMetadata } from "./page"

/** Le titre que Next.js affiche : `absolute` tel quel, sinon le titre inséré dans le gabarit de la racine. */
function documentTitle(root: Metadata, page: Metadata): string {
  const template = typeof root.title === "object" && root.title !== null && "template" in root.title ? root.title.template : null
  const title = page.title
  if (typeof title === "object" && title !== null && "absolute" in title) return String(title.absolute)
  if (typeof title === "string") return template ? template.replace("%s", title) : title
  return ""
}

describe("titre de l'onglet de /entrer", () => {
  it("dit le nom de l'application une seule fois", async () => {
    const title = documentTitle(await rootMetadata(), await signInMetadata())
    expect(title).toBe("Administration de DIASPORA.GA")
    expect(title.match(/Administration de/g)).toHaveLength(1)
  })

  it("une autre page garde « <Section> · Administration de … »", async () => {
    expect(documentTitle(await rootMetadata(), { title: "Modules" })).toBe("Modules · Administration de DIASPORA.GA")
  })
})

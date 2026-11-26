// @vitest-environment jsdom
import { DEFAULT_FACET_VISIBILITY } from "@diaspora-ga/domain"
import type { MembershipView } from "@diaspora-ga/features/data"
import { getFixedT } from "@diaspora-ga/features/i18n"
import { I18nProvider } from "@diaspora-ga/features/i18n/client"
import { act, cleanup, render, screen } from "@testing-library/react"
import type { ComponentProps } from "react"
import { Toaster } from "sonner"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { consulateGatewayLinks } from "@/lib/consulate-gateway"

const env = vi.hoisted(() => ({ consulateUrl: null as string | null }))
vi.mock("@/lib/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/env")>()
  return {
    ...actual,
    publicEnv: {
      ...actual.publicEnv,
      get consulateUrl() {
        return env.consulateUrl
      },
      idnPortalUrl: null,
    },
  }
})
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: Omit<ComponentProps<"a">, "href"> & { href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

import { StatusBanner } from "./status-banner"

/**
 * CH-863, lot D1 — la carte de statut : « M'inscrire au consulat » mène à la destination
 * `register` du contrat DIASPORA-PASSERELLE-V1 (`/register?type=long_stay`), et non plus à la
 * racine de consulat.ga ; même onglet, sans référent. Sans adresse configurée : aucun lien.
 */
const t = getFixedT("fr")
const ORIGIN = "https://consulat.example"
const DECLARED: MembershipView = {
  personId: "persons_awa",
  handle: "awa.demo",
  displayName: "Awa OGOOUÉ",
  status: "declaree",
  badges: ["community"],
  facet: { countryOfResidence: "FR", city: "Lyon", associationIds: [], helpAvailable: false, visibility: DEFAULT_FACET_VISIBILITY },
  joinedAt: 1,
  verifiedSince: null,
  sponsoredBy: null,
  attestation: { outcome: "none", postSlug: null, requestedAt: null },
  root: { network: "antsia", status: "declaree", derivedFrom: "diaspora-ga" },
  canPublish: true,
  rateTier: "reinforced",
  directoryVisibility: "hidden",
}

function mount() {
  return render(
    <I18nProvider locale="fr">
      <Toaster />
      <StatusBanner membership={DECLARED} />
    </I18nProvider>,
  )
}

beforeEach(() => {
  env.consulateUrl = ORIGIN
  window.localStorage.clear()
})
afterEach(() => cleanup())

describe("carte de statut — « M'inscrire au consulat »", () => {
  it("mène à l'inscription consulaire du contrat, dans le même onglet, sans référent", async () => {
    mount()
    const link = await screen.findByRole("link", { name: t("status.registerConsulate") })
    expect(link).toHaveAttribute("href", consulateGatewayLinks(ORIGIN)!.register)
    expect(link).toHaveAttribute("rel", "noopener noreferrer")
    expect(link).toHaveAttribute("referrerpolicy", "no-referrer")
    expect(link).not.toHaveAttribute("target")
  })

  it("sans adresse de consulat.ga configurée : aucun lien, jamais un lien mort", async () => {
    env.consulateUrl = null
    mount()
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20))
    })
    expect(screen.queryByRole("link", { name: t("status.registerConsulate") })).toBeNull()
  })
})

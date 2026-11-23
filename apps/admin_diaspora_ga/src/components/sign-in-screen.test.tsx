// @vitest-environment jsdom
import { createAppI18n } from "@diaspora-ga/features/i18n"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { getFunctionName, type FunctionReference } from "convex/server"
import { I18nextProvider } from "react-i18next"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { APP_NAMESPACE, appResources } from "@/i18n/resources"

/** CH-815 A4 — `/entrer` : l'identité numérique seule (D3), un refus d'IDN dit en phrase neutre. */
const mocks = vi.hoisted(() => ({
  auth: { isAuthenticated: false, isLoading: false },
  configuration: undefined as unknown,
  queried: [] as string[],
  oauth2: vi.fn(),
}))
vi.mock("@/lib/env", () => ({ publicEnv: { convexUrl: "configured", membersSiteUrl: null } }))
vi.mock("@/lib/sign-out", () => ({ signOutAndRedirect: vi.fn() }))
vi.mock("@/lib/auth-client", () => ({ authClient: { signIn: { oauth2: mocks.oauth2 } } }))
vi.mock("convex/react", () => ({
  useConvexAuth: () => mocks.auth,
  useQuery: (reference: FunctionReference<"query">) => {
    mocks.queried.push(getFunctionName(reference))
    return mocks.configuration
  },
}))

import { SignInScreen } from "./sign-in-screen"

const OPEN = { idn: true, emailOtp: true, smsOtp: true, localCodes: true }

function mount(path = "/entrer") {
  window.history.replaceState(null, "", path)
  const i18n = createAppI18n({ locale: "fr", appResources, defaultNS: APP_NAMESPACE })
  return render(
    <I18nextProvider i18n={i18n}>
      <SignInScreen />
    </I18nextProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.auth = { isAuthenticated: false, isLoading: false }
  mocks.configuration = OPEN
  mocks.queried = []
  mocks.oauth2.mockResolvedValue({ data: { url: "https://idn.exemple/autoriser", redirect: true }, error: null })
})
afterEach(() => cleanup())

describe("entrée d'admin.diaspora.ga — l'identité numérique seule", () => {
  it("un seul bouton, « Se connecter avec l'identité numérique », et aucun champ de code, même si le moteur sert les codes", () => {
    mount()
    const buttons = screen.getAllByRole("button")
    expect(buttons.map((button) => button.textContent)).toEqual(["Se connecter avec l’identité numérique"])
    expect(buttons[0]).toBeEnabled()
    expect(screen.queryAllByRole("textbox")).toEqual([])
    expect(document.querySelectorAll("input")).toHaveLength(0)
    expect(screen.queryByText(/courriel|e-mail|SMS/i, { selector: "button, a, label" })).toBeNull()
    expect(mocks.queried).toEqual(["modules/platform/authentication:configuration"])
  })

  it("IDN indisponible pour ce déploiement : le bouton reste seul, inactif, et le dit", () => {
    mocks.configuration = { ...OPEN, idn: false }
    mount()
    expect(screen.getAllByRole("button")).toHaveLength(1)
    expect(screen.getByRole("button", { name: "Se connecter avec l’identité numérique" })).toBeDisabled()
    expect(screen.getByText("La connexion par l’identité numérique n’est pas disponible pour le moment.")).toBeDefined()
  })

  it("le départ vers IDN revient sur cette origine, au tableau de bord, et un échec à l'entrée", async () => {
    mount()
    await userEvent.click(screen.getByRole("button", { name: "Se connecter avec l’identité numérique" }))
    expect(mocks.oauth2).toHaveBeenCalledOnce()
    const [args] = mocks.oauth2.mock.calls[0] as [{ providerId: string; callbackURL: string; errorCallbackURL: string }]
    expect(args.providerId).toBe("idn")
    expect(args.callbackURL).toBe(`${window.location.origin}/`)
    expect(args.errorCallbackURL).toBe(`${window.location.origin}/entrer`)
  })

  it("une section demandée inconnue du registre n'est jamais suivie", async () => {
    mount("/entrer?retour=https%3A%2F%2Failleurs.exemple%2F")
    await userEvent.click(screen.getByRole("button", { name: "Se connecter avec l’identité numérique" }))
    const [args] = mocks.oauth2.mock.calls[0] as [{ callbackURL: string }]
    expect(args.callbackURL).toBe(`${window.location.origin}/`)
  })

  it.each([
    ["access_denied", "Vous n’avez pas autorisé la connexion avec IDN. Vous pouvez recommencer quand vous le souhaitez."],
    ["une-raison-du-serveur", "La connexion avec IDN n’a pas abouti. Vous pouvez recommencer."],
  ])("un retour d'échec d'IDN (%s) se dit en phrase neutre, puis quitte l'adresse", async (code, sentence) => {
    mount(`/entrer?error=${code}&error_description=detail-du-serveur`)
    expect(screen.getByRole("alert").textContent).toBe(sentence)
    expect(screen.queryByText(/detail-du-serveur|une-raison-du-serveur/)).toBeNull()
    await waitFor(() => expect(window.location.search).toBe(""))
  })

  it("un départ refusé par le moteur se dit sans quitter l'entrée", async () => {
    mocks.oauth2.mockResolvedValueOnce({ data: null, error: { status: 429, code: "rateLimited" } })
    mount()
    await userEvent.click(screen.getByRole("button", { name: "Se connecter avec l’identité numérique" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("Trop de tentatives")
    expect(screen.getAllByRole("button")).toHaveLength(1)
  })

  it("une sortie incomplète avec une session encore ouverte propose d'abord de la refaire", () => {
    mocks.auth = { isAuthenticated: true, isLoading: false }
    mount("/entrer?deconnexion=incomplete")
    expect(screen.getByRole("alert").textContent).toContain("La déconnexion complète n’a pas pu être confirmée")
    expect(screen.getAllByRole("button").map((button) => button.textContent)).toEqual(["Se déconnecter partout"])
  })
})

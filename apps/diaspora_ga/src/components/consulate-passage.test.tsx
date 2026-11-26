// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ConsulatePassage } from "./consulate-passage"

const mocks = vi.hoisted(() => ({
  session: { current: {} as unknown }, oauth: vi.fn(), redeem: vi.fn(), take: vi.fn(), start: vi.fn(), replace: vi.fn(),
}))
vi.mock("@diaspora-ga/features/data", () => ({ useSession: () => mocks.session.current }))
vi.mock("@diaspora-ga/features/i18n/client", () => ({ useDiasporaGaT: () => ({ t: (key: string) => key }) }))
vi.mock("@/lib/auth-client", () => ({ authClient: { signIn: { oauth2: mocks.oauth }, $fetch: mocks.redeem } }))
vi.mock("@/lib/consulate-gateway", () => ({ configuredConsulateGateway: () => ({ mySpace: "https://consulat.ga/my-space" }) }))
vi.mock("@/lib/consulate-pass", () => ({ takePass: mocks.take, startPass: mocks.start, passMode: () => "web" }))
vi.mock("./consulate-transition", () => ({ ConsulateTransition: () => <main role="status">DIASPORA.GA</main> }))

beforeEach(() => {
  vi.clearAllMocks()
  sessionStorage.clear()
  localStorage.clear()
  vi.stubGlobal("location", { origin: "https://diaspora.ga", pathname: "/passerelle/retour", search: "", hash: "", replace: mocks.replace })
  mocks.take.mockReturnValue({ code: "ticket", verifier: "verifier", mode: "web", afterIdn: false })
  mocks.session.current = { status: "loading" }
  mocks.oauth.mockResolvedValue({ data: { url: "https://identite.ga" } })
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe("bascule depuis Consulat.ga", () => {
  it("garde uniquement le logo pendant la lecture, puis ouvre directement le fil du membre", async () => {
    const view = render(<ConsulatePassage legacy />)
    expect(screen.getByRole("status")).toHaveTextContent("DIASPORA.GA")
    expect(screen.queryByRole("button")).toBeNull()
    expect(mocks.oauth).not.toHaveBeenCalled()
    mocks.session.current = { status: "ready", data: { status: "signed_in", membership: { status: "verifiee", facet: { countryOfResidence: "FR" } } } }
    view.rerender(<ConsulatePassage legacy />)
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/fil"))
    expect(mocks.oauth).not.toHaveBeenCalled()
  })
  it("ouvre IDN sans exposer la porte publique quand la V1 ne connaît pas la session", async () => {
    mocks.session.current = { status: "ready", data: { status: "anonymous" } }
    render(<ConsulatePassage legacy />)
    await waitFor(() => expect(mocks.oauth).toHaveBeenCalledTimes(1))
    expect(mocks.oauth.mock.calls[0]?.[0]).toMatchObject({ callbackURL: "https://diaspora.ga/passerelle/consentement?origine=idn" })
    expect(screen.queryByRole("textbox")).toBeNull()
  })
  it("transmet uniquement le repère IDN retourné par le serveur puis vérifie un nouveau ticket au retour", async () => {
    mocks.redeem.mockResolvedValue({ data: { ok: true, next: "idn", loginHint: "citoyen@idn.ga" } })
    render(<ConsulatePassage returning />)
    await waitFor(() => expect(mocks.oauth).toHaveBeenCalledTimes(1))
    expect(mocks.redeem.mock.calls[0]?.[1].body).toEqual({ code:"ticket", verifier:"verifier", version:2 })
    const request = mocks.oauth.mock.calls[0]?.[0]
    expect(request.callbackURL).toEqual("https://diaspora.ga/passerelle/consulat?apres=idn&mode=web")
    expect(request.additionalData.loginHint).toBe("citoyen@idn.ga")
  })
  it("un sujet différent au retour ne relance jamais IDN en boucle", async () => {
    mocks.take.mockReturnValue({ code: "ticket", verifier: "verifier", mode: "web", afterIdn: true })
    mocks.redeem.mockResolvedValue({ data: { ok: true, next: "idn" } })
    await act(async () => { render(<ConsulatePassage returning />) })
    expect(screen.getByRole("alert")).toBeInTheDocument()
    expect(mocks.oauth).not.toHaveBeenCalled()
  })
})

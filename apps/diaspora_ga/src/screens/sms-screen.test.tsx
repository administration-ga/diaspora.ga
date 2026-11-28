// @vitest-environment jsdom
import { I18nProvider } from "@diaspora-ga/features/i18n/client"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { getFunctionName } from "convex/server"
import type { ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { SmsScreen } from "./sms-screen"

const mocks = vi.hoisted(() => ({
  owner: "member-a", member: true, allowed: true, enabled: true, threads: [] as {id: string; label: string; active: boolean}[],
  gate: vi.fn(), inbox: vi.fn(), history: vi.fn(), send: vi.fn(), pairing: vi.fn(), disconnect: vi.fn(),
}))
vi.mock("@/components/gate", () => ({
  Gate: ({ require, children }: { require: string; children: (value: unknown) => ReactNode }) => {
    mocks.gate(require)
    return children({ membership: mocks.member ? { personId: "member-a", canPublish: mocks.allowed } : null })
  },
  GateSkeleton: () => null,
}))
vi.mock("@/components/app-shell", () => ({ AppShell: ({ children }: {children: ReactNode}) => children }))
vi.mock("@/components/icom", () => ({ useIcomState: () => ({ status: "on", network: { personId: "member-a" } }) }))
vi.mock("@antsia/api/hooks", () => ({
  useAuthenticatedConvexQuery: () => { mocks.inbox(); return { data: { personId: mocks.owner, enabled: mocks.enabled, threads: mocks.threads } } },
  useAuthenticatedPaginatedQuery: () => mocks.history(),
}))
vi.mock("convex/react", () => ({
  useMutation: (ref: Parameters<typeof getFunctionName>[0]) => {
    const name = getFunctionName(ref)
    if (name.endsWith(":send")) return mocks.send
    if (name.endsWith(":createPairing")) return mocks.pairing
    if (name.endsWith(":disconnect")) return mocks.disconnect
    throw new Error(name)
  },
}))

function mount(locale: "fr" | "en" = "fr") {
  return render(<I18nProvider locale={locale}><SmsScreen /></I18nProvider>)
}
beforeEach(() => {
  vi.clearAllMocks()
  mocks.member = true
  mocks.owner = "member-a"
  mocks.allowed = true
  mocks.enabled = true
  mocks.threads = [{ id: "sms_1", label: "Awa", active: true }]
  mocks.history.mockReturnValue({ results: [], status: "Exhausted" })
  mocks.send.mockResolvedValue("sms_1_msg_1")
  mocks.disconnect.mockResolvedValue(null)
})
afterEach(cleanup)

describe("SMS iCom", () => {
  it("ne lit aucune conversation quand la personne est hors session ou ne peut pas communiquer", () => {
    mocks.member = false
    const view = mount()
    expect(mocks.gate).toHaveBeenCalledWith("member")
    expect(mocks.inbox).not.toHaveBeenCalled()
    mocks.member = true
    mocks.allowed = false
    view.rerender(<I18nProvider locale="fr"><SmsScreen /></I18nProvider>)
    expect(screen.getByRole("status")).toHaveTextContent("indisponible")
    expect(mocks.inbox).not.toHaveBeenCalled()
  })

  it("masque immédiatement la liste mise en cache pour un autre membre", () => {
    mocks.owner = "previous-member"
    mount()
    expect(screen.getByRole("status")).toHaveTextContent("Chargement")
    expect(screen.queryByText("Awa")).toBeNull()
  })

  it("invite par un code à usage unique, sans envoyer de SMS", async () => {
    mocks.threads = []
    mocks.pairing.mockResolvedValue({ code: "AX82", relay: "+15550000000", expiresAt: Date.now() + 30 * 60000 })
    mount()
    fireEvent.click(screen.getByRole("button", {name: "Inviter un contact"}))
    fireEvent.change(screen.getByLabelText("Nom du contact"), { target: { value: " Awa " } })
    fireEvent.click(screen.getByRole("button", {name: "Créer une invitation"}))
    expect(await screen.findByText("JOIN AX82")).toBeInTheDocument()
    expect(screen.getByText("+15550000000")).toBeInTheDocument()
    expect(mocks.pairing).toHaveBeenCalledWith({ label: "Awa" })
    expect(mocks.send).not.toHaveBeenCalled()
  })

  it("conserve le texte et la clé d’envoi après une réponse perdue, puis vide le champ au succès", async () => {
    mocks.send.mockRejectedValueOnce(new Error("offline"))
    mount()
    fireEvent.click(screen.getByRole("button", {name: /Awa/}))
    const input = screen.getByLabelText("Votre SMS")
    fireEvent.change(input, { target: { value: " Bonjour " } })
    fireEvent.click(screen.getByRole("button", {name: "Envoyer"}))
    await screen.findByRole("alert")
    expect(input).toHaveValue(" Bonjour ")
    fireEvent.click(screen.getByRole("button", {name: "Envoyer"}))
    await waitFor(() => expect(input).toHaveValue(""))
    expect(mocks.send).toHaveBeenCalledTimes(2)
    expect(mocks.send.mock.calls[0]?.[0]).toEqual({ threadId: "sms_1", body: "Bonjour", requestId: expect.any(String) })
    expect(mocks.send.mock.calls[0]?.[0]).toEqual(mocks.send.mock.calls[1]?.[0])
  })

  it("preserves history and lets a member disconnect when delivery is disabled", async () => {
    mocks.enabled = false
    mocks.history.mockReturnValue({ results: [{ id: "message-1", body: "Hello", incoming: true, createdAt: 20, status: "received" }], status: "Exhausted" })
    mount("en")
    expect(screen.queryByText("Invite a contact")).toBeNull()
    fireEvent.click(screen.getByRole("button", {name: /Awa/}))
    expect(screen.getByText("Hello")).toBeInTheDocument()
    expect(screen.queryByRole("textbox")).toBeNull()
    fireEvent.click(screen.getByText("Manage conversation"))
    expect(screen.getByText(/text STOP/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", {name: "Close conversation"}))
    await waitFor(() => expect(mocks.disconnect).toHaveBeenCalledWith({ threadId: "sms_1" }))
    expect(mocks.send).not.toHaveBeenCalled()
  })

  it("historise les états de livraison et empêche d’écrire dans un fil déjà fermé", () => {
    mocks.threads[0]!.active = false
    mocks.history.mockReturnValue({ results: [
      { id: "2", body: "Deux", incoming: false, createdAt: 21, status: "delivered" },
      { id: "1", body: "Un", incoming: false, createdAt: 10, status: "failed" },
    ], status: "Exhausted" })
    mount()
    fireEvent.click(screen.getByRole("button", {name: /Awa/}))
    const entries = screen.getAllByRole("listitem")
    expect(entries[0]).toHaveTextContent("Un")
    expect(entries[0]).toHaveTextContent("Échec de livraison")
    expect(entries[1]).toHaveTextContent("Distribué")
    expect(screen.queryByRole("button", {name: "Envoyer"})).toBeNull()
  })
})

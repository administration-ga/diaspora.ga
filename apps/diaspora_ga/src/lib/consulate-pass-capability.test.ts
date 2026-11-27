import { describe, expect, it, vi } from "vitest"
import { supportsConsulatePass } from "./consulate-pass-capability"

const query = vi.hoisted(() => vi.fn())
vi.mock("convex/browser", () => ({ ConvexHttpClient: class { query = query } }))

describe("capacité de passage consulaire du moteur servi", () => {
  const engine = "https://moteur.example"
  const host = "diaspora.example"

  it("ouvre la V2 sur l’origine configurée uniquement", async () => {
    query.mockResolvedValue({ consulatePassOrigin: "https://diaspora.example" })
    expect(await supportsConsulatePass(engine, host)).toBe(true)
    expect(await supportsConsulatePass(engine, "autre.example")).toBe(false)
  })

  it("conserve le parcours IDN avec un ancien moteur ou une panne de transport", async () => {
    query.mockResolvedValueOnce({ idn: true }).mockRejectedValueOnce(new Error("indisponible"))
    expect(await supportsConsulatePass(engine, host)).toBe(false)
    expect(await supportsConsulatePass(engine, host)).toBe(false)
  })
})

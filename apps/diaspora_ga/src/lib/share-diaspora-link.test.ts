import { afterEach, expect, it, vi } from "vitest"

import { shareDiasporaLink } from "./share-diaspora-link"

afterEach(() => { vi.unstubAllGlobals() })

it("ouvre le choix de contact WhatsApp avec le seul lien du fil", async () => {
  const assign = vi.fn()
  const nativeShare = vi.fn()
  vi.stubGlobal("window", { location: { origin: "https://diaspora.ga", assign }, diasporaMobileShare: nativeShare })
  await expect(shareDiasporaLink("/fil", "whatsapp")).resolves.toBe("opened")
  expect(assign).toHaveBeenCalledWith("https://wa.me/?text=https%3A%2F%2Fdiaspora.ga%2Ffil")
  expect(nativeShare).not.toHaveBeenCalled()
  await expect(shareDiasporaLink("https://ailleurs.test/fil", "whatsapp")).rejects.toThrow()
  expect(assign).toHaveBeenCalledTimes(1)
})

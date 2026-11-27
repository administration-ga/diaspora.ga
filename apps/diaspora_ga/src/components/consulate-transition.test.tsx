// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"
import { ConsulateTransition } from "./consulate-transition"

vi.mock("@diaspora-ga/features/i18n/client", () => ({ useDiasporaGaT: () => ({ t: (key: string) => key }) }))
vi.mock("./liquid-wordmark", () => ({ LiquidWordmark: () => <span>DIASPORA.GA</span> }))

afterEach(() => {
  cleanup()
  window.history.replaceState(null, "", "/")
  vi.useRealTimers()
})

it.each([["app", true], ["web", false]])("attente %s : secours IDN seulement si le passage doit revenir dans l’application", (mode, hasFallback) => {
  vi.useFakeTimers()
  window.history.replaceState(null, "", "/passerelle/consulat?mode=" + mode)
  render(<ConsulateTransition mobileHandoff />)
  expect(screen.queryByRole("link")).toBeNull()
  act(() => { vi.advanceTimersByTime(4000) })
  if (hasFallback) expect(screen.getByRole("link")).toHaveAttribute("href", "/passerelle/consulat?secours=idn")
  else expect(screen.queryByRole("link")).toBeNull()
})

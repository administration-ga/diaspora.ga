// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

import { clearGuestTime, readGuestTime } from "@/lib/guest-time"
import { peekReturnPath } from "@/lib/return-path"
import { GuestEntry } from "./guest-reader"

const subject = vi.hoisted(() => ({ signedIn: false, loading: false, unavailable: false }))
vi.mock("@diaspora-ga/features/data", () => ({
  useDataSource: () => ({ kind: "engine" }),
  useSession: () => ({ status: "ready", data: { status: subject.signedIn ? "signed_in" : "anonymous" } }),
}))
vi.mock("@diaspora-ga/features/i18n/client", () => ({ useDiasporaGaT: () => ({ t: (key: string) => key, locale: "fr" }) }))
vi.mock("@diaspora-ga/features", () => ({ Button: ({ children }: { children: ReactNode }) => <>{children}</> }))
vi.mock("./gate", () => ({ GateSkeleton: () => <div>loading</div> }))
vi.mock("./wordmark", () => ({ Wordmark: () => <span>DIASPORA</span> }))
vi.mock("next/link", () => ({ default: ({ href, onClick, children, ...rest }: React.AnchorHTMLAttributes<HTMLAnchorElement>) =>
  <a {...rest} href={href} onClick={e => { e.preventDefault(); onClick?.(e) }}>{children}</a> }))
vi.mock("@/data/engine-kit", () => ({ useLoaded: (_query: unknown, args: { screen: string } | string) => {
  if (typeof args === "string" || subject.loading) return { state: "loading" }
  if (subject.unavailable) return { state: "ready", value: null }
  const author = { kind: "person", handle: "marie", name: "Marie", image: null }
  return { state: "ready", value: { heading: args.screen === "profile" ? author : null, posts: [{ id: "post-public", time: 1, body: "Public", author, media: [] }], next: null } }
} }))

let visible: DocumentVisibilityState
beforeEach(() => {
  subject.signedIn = false
  subject.loading = false
  subject.unavailable = false
  visible = "visible"
  vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visible)
  vi.useFakeTimers()
  window.sessionStorage.clear()
  clearGuestTime()
})
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks() })

it("counts only time in the foreground across routes and asks for login after 30 seconds", () => {
  const { rerender } = render(<GuestEntry screen="feed">private</GuestEntry>)
  act(() => { vi.advanceTimersByTime(15_000); visible = "hidden"; document.dispatchEvent(new Event("visibilitychange")) })
  act(() => { vi.advanceTimersByTime(90_000); visible = "visible"; document.dispatchEvent(new Event("visibilitychange")) })
  rerender(<GuestEntry screen="profile" target="marie">private</GuestEntry>)
  expect(screen.getByText("Public")).toBeVisible()
  act(() => vi.advanceTimersByTime(15_000))
  expect(screen.getByText("guest.expired")).toBeVisible()
  expect(screen.queryByText("Public")).toBeNull()
  subject.signedIn = true
  rerender(<GuestEntry screen="profile" target="marie">private</GuestEntry>)
  expect(screen.getByText("private")).toBeVisible()
  expect(readGuestTime()).toBe(0)
})

it("starts the reading clock when the content is available and pauses on unavailable routes", () => {
  subject.loading = true
  const { rerender } = render(<GuestEntry screen="feed">member</GuestEntry>)
  act(() => vi.advanceTimersByTime(45_000))
  subject.loading = false
  rerender(<GuestEntry screen="feed">member</GuestEntry>)
  expect(screen.getByText("Public")).toBeVisible()
  act(() => vi.advanceTimersByTime(12_000))
  subject.unavailable = true
  rerender(<GuestEntry screen="post" target="absent">member</GuestEntry>)
  act(() => vi.advanceTimersByTime(60_000))
  expect(readGuestTime()).toBe(12_000)
  subject.unavailable = false
  rerender(<GuestEntry screen="feed">member</GuestEntry>)
  act(() => vi.advanceTimersByTime(18_000))
  expect(screen.getByText("guest.expired")).toBeVisible()
})

it("retains the exact target and action through sign-in", () => {
  history.replaceState({}, "", "/@marie")
  render(<GuestEntry screen="profile" target="marie">private</GuestEntry>)
  fireEvent.click(screen.getByRole("link", { name: "guest.follow" }))
  expect(peekReturnPath()?.path).toBe("/@marie#suivre")
  fireEvent.click(screen.getByRole("link", { name: "relation.connect" }))
  expect(peekReturnPath()?.path).toBe("/@marie#relation")
  fireEvent.click(screen.getByRole("link", { name: "contact.write" }))
  expect(peekReturnPath()?.path).toBe("/@marie#ecrire")
  fireEvent.click(screen.getByRole("link", { name: "guest.comment" }))
  expect(peekReturnPath()?.path).toBe("/publication/post-public#commenter")
})

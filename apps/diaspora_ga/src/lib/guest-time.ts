/** The visitor clock is a reading affordance. Access to data is always enforced by Convex. */
export const GUEST_READING_MS = 30_000
const key = "diaspora.guest-visible-ms.v1"
let memory = 0

export function readGuestTime(): number {
  try {
    const stored = Number(window.sessionStorage.getItem(key))
    if (Number.isFinite(stored)) memory = Math.max(memory, Math.min(GUEST_READING_MS, Math.max(0, stored)))
  } catch { /* Private browsing can deny storage; the tab still has a clock. */ }
  return memory
}

export function saveGuestTime(value: number) {
  memory = Math.min(GUEST_READING_MS, Math.max(readGuestTime(), value))
  try { window.sessionStorage.setItem(key, String(memory)) } catch { /* Keep the in-memory reading time. */ }
}

export function clearGuestTime() {
  memory = 0
  try { window.sessionStorage.removeItem(key) } catch { /* No persistent clock. */ }
}

/** Restore keyboard focus after authentication without performing a social action. */
export function focusGuestIntent(element: HTMLElement | null) {
  if (element?.id && window.location.hash === "#" + element.id) element.focus()
}

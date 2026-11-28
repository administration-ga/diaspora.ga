import { whatsAppShareHref } from "./routes"

export type ShareMode = "share" | "sms" | "whatsapp" | "copy"
export type ShareOutcome = "shared" | "opened" | "copied" | "cancelled"

declare global {
  interface Window {
    diasporaMobileShare?: (url: string, action: "share" | "sms", title?: string) => Promise<ShareOutcome>
  }
}

/** Share only after an explicit user gesture. The address book stays with the system application. */
export async function shareDiasporaLink(href: string, mode: ShareMode, title?: string): Promise<ShareOutcome> {
  const url = new URL(href, window.location.origin)
  if (url.origin !== window.location.origin || url.username || url.password) throw new Error("Invalid link")
  if (mode === "whatsapp") {
    window.location.assign(whatsAppShareHref(url.href))
    return "opened"
  }
  if (mode !== "copy" && typeof window.diasporaMobileShare === "function") {
    return window.diasporaMobileShare(url.href, mode, title)
  }
  if (mode === "sms") {
    const apple = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
    window.location.assign((apple ? "sms:&body=" : "sms:?body=") + encodeURIComponent(url.href))
    return "opened"
  }
  if (mode === "share" && typeof navigator.share === "function") {
    try {
      await navigator.share({ url: url.href, title })
      return "shared"
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return "cancelled"
      throw error
    }
  }
  await navigator.clipboard.writeText(url.href)
  return "copied"
}

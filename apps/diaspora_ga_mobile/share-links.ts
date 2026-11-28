const SHARE_ORIGIN = "https://diaspora.ga"

const handle = "[a-z0-9][a-z0-9._-]{0,63}"
const publicResource = new RegExp("^(?:/@" + handle + "|/pages/" + handle + "|/publication/[a-z0-9_-]{1,160}|/fil)$", "i")
const groupInvitation = /^[a-z0-9_-]{16,256}$/i
const contentTabs = ["publications", "photos", "videos", "avis"]

/** The native bridge shares canonical links. It cannot share private callback credentials or member contact details. */
export function publicShareUrl(url: URL): string | null {
  if (url.origin !== SHARE_ORIGIN || url.username || url.password) return null
  if (url.pathname === "/messages") {
    const tokens = url.searchParams.getAll("invitation-groupe")
    return tokens.length === 1 && groupInvitation.test(tokens[0])
      ? SHARE_ORIGIN + "/messages?invitation-groupe=" + tokens[0] : null
  }
  if (!publicResource.test(url.pathname)) return null
  const clean = new URL(url.pathname, SHARE_ORIGIN)
  if (url.pathname.startsWith("/pages/")) {
    const tab = url.searchParams.get("contenu")
    if (tab && contentTabs.includes(tab)) clean.searchParams.set("contenu", tab)
    if (["#page-publications", "#services-de-la-page", "#emplois-de-la-page"].includes(url.hash)) clean.hash = url.hash
  }
  return clean.href
}

export interface ShareRequest {
  id: string
  action: "share" | "sms"
  url: string
  title?: string
}

export function readShareRequest(source: string, data: string): ShareRequest | null {
  try {
    if (new URL(source).origin !== SHARE_ORIGIN || data.length > 4096) return null
    const value = JSON.parse(data)
    if (value?.type !== "diaspora-share-v1" || typeof value.id !== "string" || !/^\d{1,16}-\d{1,12}$/.test(value.id)) return null
    if (!["share", "sms"].includes(value.action) || typeof value.url !== "string") return null
    const url = publicShareUrl(new URL(value.url))
    if (url === null) return null
    const title = typeof value.title === "string" ? value.title.replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, 160) : undefined
    return { id: value.id, action: value.action, url, title }
  } catch { return null }
}

/** Empty recipient: the owner always chooses the contact and approves sending in Messages. */
export function smsComposerUrl(url: string, ios: boolean): string {
  return (ios ? "sms:&body=" : "sms:?body=") + encodeURIComponent(url)
}

/** Installed only on top-level pages of the product. Auth providers keep their own browser environment. */
export const installShareBridge = `
(function () {
  if (window.top !== window || location.origin !== "https://diaspora.ga" || window.diasporaMobileShare) return;
  let counter = 0;
  const pending = new Map();
  window.addEventListener("diaspora-share-result", function (event) {
    const response = event.detail;
    const request = response && pending.get(response.id);
    if (!request) return;
    pending.delete(response.id);
    clearTimeout(request.timer);
    if (response.result === "failed") request.reject(new Error("Share unavailable"));
    else request.resolve(response.result);
  });
  window.diasporaMobileShare = function (url, action, title) {
    if (!window.ReactNativeWebView || (navigator.userActivation && !navigator.userActivation.isActive)) {
      return Promise.reject(new Error("Share requires user activation"));
    }
    return new Promise(function (resolve, reject) {
      const id = Date.now() + "-" + (++counter);
      const timer = setTimeout(function () {
        pending.delete(id);
        reject(new Error("Share unavailable"));
      }, 120000);
      pending.set(id, { resolve, reject, timer });
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: "diaspora-share-v1", id, action, url, title }));
    });
  };
  if (typeof navigator.share !== "function") {
    Object.defineProperty(navigator, "share", { configurable: true, value: async function (data) {
      const result = await window.diasporaMobileShare(data.url, "share", data.title);
      if (result === "cancelled") throw new DOMException("Share cancelled", "AbortError");
    } });
  }
})(); true;`

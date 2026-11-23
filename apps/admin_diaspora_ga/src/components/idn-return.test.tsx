// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import type { FunctionReference } from "convex/server"
import type { ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { REQUESTED_SECTION_KEY } from "@/lib/requested-section"

/**
 * CH-815 A1b — le retour d'IDN sur `/entrer?ott=…` (revue A1, F2), à travers les VRAIS
 * fournisseurs de l'application (`Providers` → `EngineConvexProvider` →
 * `StableConvexBetterAuthProvider` du moteur, amorçage `refreshCrossDomainSession`
 * réel). Seuls le client d'authentification, le transport Convex et le routeur sont
 * simulés. Ce qui est prouvé : le jeton à usage unique quitte la barre d'adresse avant
 * toute requête, il est échangé avant toute navigation ou tout appel au moteur, il
 * n'est ni journalisé, ni affiché, ni rendu ; la section reprise vient de l'onglet.
 */
const OTT = "ott-secret-a-usage-unique-7f3c"
const SESSION = { session: { id: "session-1", userId: "user-1", token: "jeton-de-session-1" }, user: { id: "user-1" } }

function jwtFor(sessionId: string): string {
  const part = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url")
  return `${part({ alg: "none" })}.${part({ sessionId })}.signature`
}

const mocks = vi.hoisted(() => ({
  events: [] as string[],
  authenticated: false,
  authClient: null as unknown,
  replace: vi.fn(),
  ensurePerson: vi.fn(),
}))

vi.mock("@/lib/env", () => ({ publicEnv: { convexUrl: "https://moteur.exemple", membersSiteUrl: null } }))
vi.mock("@/lib/sign-out", () => ({ signOutAndRedirect: vi.fn() }))
vi.mock("@/lib/auth-client", () => ({
  get authClient() {
    return mocks.authClient
  },
}))
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: (target: string) => {
      mocks.events.push(`navigate:${target}`)
      mocks.replace(target)
    },
  }),
}))
// L'apparence n'est pas l'objet du test.
vi.mock("@antsia/social-features/shell/appearance", () => ({ AppearanceProvider: (props: { children: ReactNode }) => props.children }))
/*
 * Les deux paquets Convex que lit le fournisseur DU MOTEUR, simulés à l'adresse où le moteur
 * les résout (`ANTSIA/packages/api`, installation isolée de bun) : l'application ne les
 * déclare pas, un nom nu ne désignerait pas le même module.
 * Le transport Convex : aucune connexion réelle, la connexion est seulement notée.
 */
vi.mock("../../../../../ANTSIA/packages/api/node_modules/@convex-dev/react-query/dist/esm/index.js", () => ({
  ConvexQueryClient: class {
    convexClient = { clearAuth: () => mocks.events.push("convex:clearAuth") }
    hashFn = () => () => "clé"
    queryFn = () => async () => null
    connect = () => mocks.events.push("convex:connect")
  },
}))
// Le fournisseur amont reçoit le jeton Convex issu de l'amorçage : la session est alors ouverte.
vi.mock("../../../../../ANTSIA/packages/api/node_modules/@convex-dev/better-auth/dist/react/index.js", () => ({
  ConvexBetterAuthProvider: (props: { initialToken?: string | null; children: ReactNode }) => {
    mocks.authenticated = typeof props.initialToken === "string" && props.initialToken.length > 0
    return props.children
  },
}))
vi.mock("convex/react", async () => {
  const { getFunctionName: name } = await import("convex/server")
  return {
    ConvexProviderWithAuth: (props: { children: ReactNode }) => {
      mocks.authenticated = false
      return props.children
    },
    useConvexAuth: () => ({ isAuthenticated: mocks.authenticated, isLoading: false }),
    useQuery: (reference: FunctionReference<"query">, args: unknown) => {
      const path = name(reference)
      if (args === "skip") return undefined
      if (path === "modules/platform/authentication:configuration") return { idn: true, emailOtp: false, smsOtp: false, localCodes: false }
      if (path === "modules/platform/authentication:mySession") return true
      throw new Error(`lecture inattendue : ${path}`)
    },
    useMutation: (reference: FunctionReference<"mutation">) => {
      expect(name(reference)).toBe("modules/people/persons:ensureMyPerson")
      return mocks.ensurePerson
    },
  }
})

import { Providers } from "./providers"
import { SignInScreen } from "./sign-in-screen"

type Outcome = "accepted" | "rejected"

/** Le client d'authentification de l'application, tel que l'amorçage du moteur le lit. */
function fakeAuthClient(outcome: Outcome) {
  const seenAtVerify: { href: string; dom: string }[] = []
  const client = {
    signIn: { oauth2: vi.fn() },
    getCookie: () => "",
    getSessionData: () => null,
    updateSession: () => mocks.events.push("auth:updateSession"),
    $store: { atoms: { session: { get: () => ({}), set: () => undefined } } },
    crossDomain: {
      oneTimeToken: {
        verify: vi.fn(async (args: { token: string }) => {
          mocks.events.push("auth:verify")
          seenAtVerify.push({ href: window.location.href, dom: document.documentElement.outerHTML })
          return outcome === "accepted" && args.token === OTT ? { data: SESSION } : { data: null, error: { status: 401 } }
        }),
      },
    },
    getSession: vi.fn(async () => {
      mocks.events.push("auth:getSession")
      return { data: SESSION }
    }),
    convex: {
      token: vi.fn(async () => {
        mocks.events.push("auth:convexToken")
        return { data: { token: jwtFor(SESSION.session.id) } }
      }),
    },
  }
  return { client, seenAtVerify }
}

/** Tout ce que l'application pourrait journaliser. */
const LOG_METHODS = ["log", "info", "warn", "error", "debug", "trace"] as const
let logged: unknown[][] = []
let rendered: string[] = []
let observer: MutationObserver | null = null

/** Chaque texte et attribut que la page a montré, même un instant. */
function collect(records: MutationRecord[]) {
  for (const record of records) {
    rendered.push(record.target.textContent ?? "")
    if (record.type === "attributes" && record.attributeName && record.target instanceof Element) rendered.push(record.target.getAttribute(record.attributeName) ?? "")
    for (const node of record.addedNodes) rendered.push(node instanceof Element ? node.outerHTML : (node.textContent ?? ""))
  }
}

function watchDom() {
  rendered = []
  observer = new MutationObserver(collect)
  observer.observe(document, { subtree: true, childList: true, attributes: true, characterData: true })
}

function storageText(storage: Storage): string {
  const entries: string[] = []
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index)
    if (key !== null) entries.push(`${key}=${storage.getItem(key) ?? ""}`)
  }
  return entries.join("\n")
}

function mountReturn(path: string) {
  window.history.replaceState(null, "", path)
  const replaceState = window.history.replaceState.bind(window.history)
  vi.spyOn(window.history, "replaceState").mockImplementation((state, unused, url) => {
    mocks.events.push(`address:${String(url)}`)
    replaceState(state, unused, url)
  })
  watchDom()
  return render(
    <Providers locale="fr">
      <SignInScreen />
    </Providers>,
  )
}

beforeEach(() => {
  mocks.events = []
  mocks.authenticated = false
  mocks.replace.mockReset()
  mocks.ensurePerson.mockReset()
  mocks.ensurePerson.mockImplementation(async () => {
    mocks.events.push("convex:ensurePerson")
    return null
  })
  window.sessionStorage.clear()
  logged = []
  for (const method of LOG_METHODS) vi.spyOn(console, method).mockImplementation((...args: unknown[]) => void logged.push(args))
  // Aucune requête ne doit partir hors du client d'authentification simulé.
  vi.stubGlobal("fetch", vi.fn(async () => {
    mocks.events.push("fetch")
    throw new Error("requête inattendue")
  }))
  vi.stubGlobal(
    "WebSocket",
    class {
      constructor() {
        mocks.events.push("websocket")
        throw new Error("connexion inattendue")
      }
    },
  )
})
afterEach(() => {
  observer?.disconnect()
  observer = null
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function expectTokenNeverExposed() {
  if (observer) collect(observer.takeRecords())
  // Le transport simulé a servi (connecté une fois par fichier, au premier montage) : aucune connexion réelle.
  expect(mocks.events).not.toContain("websocket")
  expect(rendered.length).toBeGreaterThan(0)
  expect(JSON.stringify(logged)).not.toContain(OTT)
  expect(rendered.some((text) => text.includes(OTT))).toBe(false)
  expect(document.documentElement.outerHTML).not.toContain(OTT)
  expect(window.location.href).not.toContain(OTT)
  expect(window.location.search).toBe("")
  expect(JSON.stringify(window.history.state ?? null)).not.toContain(OTT)
  expect(storageText(window.sessionStorage)).not.toContain(OTT)
  expect(storageText(window.localStorage)).not.toContain(OTT)
}

describe("retour d'IDN sur admin.diaspora.ga — le jeton à usage unique (revue A1, F2)", () => {
  it("échangé AVANT toute navigation et tout appel au moteur, retiré de l'adresse avant l'échange, jamais journalisé ni rendu", async () => {
    const { client, seenAtVerify } = fakeAuthClient("accepted")
    mocks.authClient = client
    window.sessionStorage.setItem(REQUESTED_SECTION_KEY, "/modules")
    mountReturn(`/entrer?ott=${OTT}`)

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/modules"))

    // Le jeton est échangé une fois, par le greffon `crossDomain`, avec la valeur de l'adresse.
    expect(client.crossDomain.oneTimeToken.verify).toHaveBeenCalledOnce()
    expect(client.crossDomain.oneTimeToken.verify.mock.calls[0]?.[0]).toMatchObject({ token: OTT })
    // Au moment de l'échange, l'adresse ne le porte déjà plus, et la page ne l'a jamais affiché.
    expect(seenAtVerify).toHaveLength(1)
    expect(seenAtVerify[0]?.href).toBe(`${window.location.origin}/entrer`)
    expect(seenAtVerify[0]?.dom).not.toContain(OTT)

    // L'ordre : l'adresse nettoyée d'abord, puis l'échange, puis seulement le reste.
    const events = mocks.events
    const cleaned = events.findIndex((event) => event.startsWith("address:") && !event.includes(OTT))
    const verified = events.indexOf("auth:verify")
    expect(events[0]).toBe(events[cleaned])
    expect(events.filter((event) => event.startsWith("address:")).every((event) => !event.includes(OTT))).toBe(true)
    expect(verified).toBeGreaterThan(cleaned)
    for (const later of ["navigate:/modules", "convex:ensurePerson", "auth:getSession", "auth:convexToken"]) {
      expect(events.indexOf(later), later).toBeGreaterThan(verified)
    }
    // Le client Convex (simulé, d'où aucune connexion réelle) ne se connecte qu'une fois l'adresse nettoyée.
    expect(events.indexOf("convex:connect")).toBeGreaterThan(cleaned)
    expect(events).not.toContain("fetch")

    // La section reprise vient de l'onglet, et n'y reste pas.
    expect(mocks.replace.mock.calls).toEqual([["/modules"]])
    expect(window.sessionStorage.getItem(REQUESTED_SECTION_KEY)).toBeNull()
    expectTokenNeverExposed()
  })

  it("sans section retenue : le tableau de bord, toujours après l'échange", async () => {
    const { client } = fakeAuthClient("accepted")
    mocks.authClient = client
    mountReturn(`/entrer?ott=${OTT}`)
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/"))
    expect(mocks.events.indexOf("navigate:/")).toBeGreaterThan(mocks.events.indexOf("auth:verify"))
    expectTokenNeverExposed()
  })

  it("jeton refusé : aucune session, aucune navigation, l'entrée reste ; le jeton n'apparaît nulle part", async () => {
    const { client } = fakeAuthClient("rejected")
    mocks.authClient = client
    window.sessionStorage.setItem(REQUESTED_SECTION_KEY, "/modules")
    mountReturn(`/entrer?ott=${OTT}`)

    expect(await screen.findByRole("button", { name: "Se connecter avec l’identité numérique" })).toBeEnabled()
    expect(client.crossDomain.oneTimeToken.verify).toHaveBeenCalledOnce()
    // Refus : ni lecture du résidu de session, ni jeton Convex, ni appel au moteur.
    expect(client.getSession).not.toHaveBeenCalled()
    expect(client.convex.token).not.toHaveBeenCalled()
    expect(mocks.ensurePerson).not.toHaveBeenCalled()
    expect(mocks.replace).not.toHaveBeenCalled()
    // La section reste retenue pour la prochaine tentative, bornée au registre.
    expect(window.sessionStorage.getItem(REQUESTED_SECTION_KEY)).toBe("/modules")
    expectTokenNeverExposed()
  })
})

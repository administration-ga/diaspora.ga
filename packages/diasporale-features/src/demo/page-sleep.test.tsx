// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { PAGE_SLEEP_MS, type PageAdminCapability, type PageManagement } from "../data/page-admin-port"
import type { DiasporaleDataSource } from "../data/port"
import type { Loadable } from "../data/types"
import { demoPageClaimsDesk } from "./page-admin"
import { countryHubView, feedView } from "./selectors"
import { createDemoDataSource } from "./source"
import { createDemoSeed } from "./state"
import { DEMO_STORAGE_KEY, DemoStore } from "./store"

/**
 * AS-11a — le sommeil d'une page en démonstration, avec les règles du moteur : seul un
 * administrateur vivant endort ou réveille ; endormie, la page est absente PARTOUT comme une
 * page retirée (fiche, annuaire, hub, fil, offres, emplois, évènements), ses offres ne se
 * contactent plus et rien n'est écrit sur ses objets ; le réveil rend tout ; passé trente
 * jours, la réactivation est refusée et rien n'est effacé. Le bandeau « sans responsable »
 * se calcule comme le moteur.
 */
const NOW = Date.UTC(2026, 10, 19, 12)
const DAY = 24 * 60 * 60 * 1000
const HOUR = 60 * 60 * 1000
const LYON = "page-asso-lyon"
const LYON_HANDLE = "collectif-ivindo-lyon"
const LYON_POST = "post-3"
const LYON_EVENT = "evt-4"
const LYON_OFFER = "offer-demo-traduction"
const LYON_JOB = "job-demo-stage-lyon"
const REQUEST_KEY = "5e0c1f2a-3b4c-4d5e-8f60-7a8b9c0d1e2f"
const APPLY = { message: "Candidature fictive de recette, motivée et sans coordonnée.", shareName: true, shareTalentProfile: false, idempotencyKey: "candidature-sommeil-0001" }

function setup() {
  let clock = NOW
  const stored = new Map([[DEMO_STORAGE_KEY, JSON.stringify(createDemoSeed(NOW))]])
  const storage = {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => { stored.set(key, value) },
    removeItem: (key: string) => { stored.delete(key) },
  }
  const store = new DemoStore(storage, () => clock, 0)
  const source = createDemoDataSource(store)
  const capability = source.pageAdmin as PageAdminCapability
  const management = capability.management as PageManagement
  const as = async (personId: string) => act(async () => { await store.switchTo(personId) })
  const advance = (ms: number) => { clock += ms }
  return { store, source, capability, management, as, advance }
}

type Demo = ReturnType<typeof setup>

function data<T>(loadable: Loadable<T>): T {
  if (loadable.status !== "ready") throw new Error(`lecture non prête : ${JSON.stringify(loadable)}`)
  return loadable.data
}

/** Tout ce que lit un membre extérieur à la page, d'un coup d'œil : présent ou absent. */
function visibility(demo: Demo, viewerId: string) {
  const source = demo.source as Required<Pick<DiasporaleDataSource, "pages" | "services" | "jobs">> & DiasporaleDataSource
  const sheet = data(renderHook(() => source.pages.usePage(LYON_HANDLE)).result.current)
  const directory = data(renderHook(() => source.pages.useDirectory({ query: "", cursor: null })).result.current)
  const hubPages = data(renderHook(() => source.pages.useHubPages("FR")).result.current)
  const hub = countryHubView(demo.store.getState(), "FR", NOW)
  const feed = feedView(demo.store.getState(), viewerId, "mon_pays", NOW)
  const offers = data(renderHook(() => source.services.useSearch({ cursor: null })).result.current)
  const offer = data(renderHook(() => source.services.useOffer(LYON_OFFER)).result.current)
  const jobs = data(renderHook(() => source.jobs.useSearch({ cursor: null })).result.current)
  const job = data(renderHook(() => source.jobs.useOffer(LYON_JOB)).result.current)
  return {
    sheet: sheet !== null,
    directory: directory.items.some((entry) => entry.id === LYON),
    hubPages: hubPages.associations.some((page) => page.id === LYON),
    hubAssociations: hub.associations.some((page) => page.id === LYON),
    hubEvent: hub.events.some((event) => event.id === LYON_EVENT),
    feed: feed.some((post) => post.id === LYON_POST),
    offers: offers.items.some((item) => item.id === LYON_OFFER),
    offer: offer !== null,
    jobs: jobs.items.some((item) => item.id === LYON_JOB),
    job: job !== null,
  }
}

const EVERYWHERE = { sheet: true, directory: true, hubPages: true, hubAssociations: true, hubEvent: true, feed: true, offers: true, offer: true, jobs: true, job: true }
const NOWHERE = { sheet: false, directory: false, hubPages: false, hubAssociations: false, hubEvent: false, feed: false, offers: false, offer: false, jobs: false, job: false }

function sendInput(offerVersion: number) {
  return {
    offerId: LYON_OFFER, offerVersion, need: "Traduction fictive d'un acte pour un dossier de recette.", windows: [{ startAt: NOW + DAY, endAt: NOW + DAY + 4 * HOUR }],
    timeZone: "Europe/Paris", shareIdentityWithPage: true, idempotencyKey: REQUEST_KEY,
  }
}

afterEach(cleanup)

describe("AS-11a — démonstration : mettre une page en sommeil", () => {
  it("seul un administrateur vivant endort sa page ; l'échéance est à trente jours", async () => {
    const demo = setup()
    // Mireille n'a qu'une invitation d'éditrice en attente : aucun droit.
    await demo.as("p-mireille")
    expect(await demo.management.putToSleep!(LYON)).toEqual({ ok: false, code: "page_role_required" })
    // Éditrice acceptée : elle publie, elle ne gère pas.
    expect(await demo.management.respondToInvitation(LYON, true)).toEqual({ ok: true, value: { role: "signatory" } })
    expect(await demo.management.putToSleep!(LYON)).toEqual({ ok: false, code: "page_role_required" })
    // Une page inconnue : le refus indistinct.
    expect(await demo.management.putToSleep!("page-inconnue")).toEqual({ ok: false, code: "not_found" })
    await demo.as("p-steeve")
    expect(await demo.management.putToSleep!(LYON)).toEqual({ ok: true, value: { sleepEndsAt: NOW + PAGE_SLEEP_MS } })
    expect(PAGE_SLEEP_MS).toBe(30 * DAY)
    // Déjà endormie : elle n'est plus gérée, le geste ne se répète pas.
    expect(await demo.management.putToSleep!(LYON)).toEqual({ ok: false, code: "not_found" })
  })

  it("une page endormie est absente partout, ses offres ne se contactent plus, rien n'est écrit sur ses objets ; le réveil rend tout", async () => {
    const demo = setup()
    await demo.as("p-prisca")
    expect(visibility(demo, "p-prisca")).toEqual(EVERYWHERE)
    const before = demo.store.getBaseState()

    await demo.as("p-steeve")
    expect(await demo.management.putToSleep!(LYON)).toMatchObject({ ok: true })
    await demo.as("p-prisca")
    expect(visibility(demo, "p-prisca")).toEqual(NOWHERE)
    // Aucune offre de la page ne se contacte, aucun emploi ne reçoit de candidature.
    expect(await demo.source.serviceRequests!.send(sendInput(1))).toEqual({ ok: false, code: "not_found" })
    expect(await demo.source.jobs!.apply({ jobId: LYON_JOB, offerVersion: 1, ...APPLY })).toEqual({ ok: false, code: "not_found" })
    // Rien n'est écrit sur les objets de la page : publications, évènements, pages du jeu fictif.
    const during = demo.store.getBaseState()
    expect(during.posts).toBe(before.posts)
    expect(during.events).toBe(before.events)
    expect(during.pages).toBe(before.pages)

    // Son équipe elle-même ne la gère plus, ne publie plus en son nom et ne la lit plus.
    await demo.as("p-steeve")
    expect(visibility(demo, "p-steeve")).toEqual(NOWHERE)
    expect(renderHook(() => demo.management.useManagedPage(LYON_HANDLE)).result.current).toEqual({ status: "ready", data: null })
    expect(data(renderHook(() => demo.capability.useMyTeamPages!()).result.current).map((page) => page.id)).not.toContain(LYON)
    expect(await demo.management.updateIdentity(LYON, { name: "Collectif renommé (démo)", shortName: null, description: null, country: "FR" })).toEqual({ ok: false, code: "not_found" })
    expect(await demo.management.grantRole(LYON, "rodrigue.komo", "signatory")).toEqual({ ok: false, code: "not_found" })

    expect(await demo.management.wake!(LYON)).toEqual({ ok: true, value: { status: "active" } })
    await demo.as("p-prisca")
    expect(visibility(demo, "p-prisca")).toEqual(EVERYWHERE)
    // Réveillée, son offre se contacte de nouveau.
    const offer = data(renderHook(() => demo.source.services!.useOffer(LYON_OFFER)).result.current)
    expect(await demo.source.serviceRequests!.send(sendInput(offer?.version ?? 0))).toMatchObject({ ok: true, value: { created: true } })
  })

  it("« Mes pages » dit l'échéance à toute l'équipe ; seul un administrateur réactive", async () => {
    const demo = setup()
    await demo.as("p-mireille")
    expect(await demo.management.respondToInvitation(LYON, true)).toMatchObject({ ok: true })
    await demo.as("p-steeve")
    expect(data(renderHook(() => demo.management.useMySleepingPages!()).result.current)).toEqual([])
    expect(await demo.management.putToSleep!(LYON)).toMatchObject({ ok: true })
    const card = { id: LYON, handle: LYON_HANDLE, name: expect.any(String), ownerKind: "association", badge: "verified", country: "FR", sleepEndsAt: NOW + PAGE_SLEEP_MS, state: "asleep" }
    expect(data(renderHook(() => demo.management.useMySleepingPages!()).result.current)).toEqual([{ ...card, teamRole: "admin", canWake: true }])

    // L'éditrice voit la page endormie, sans pouvoir la réactiver.
    await demo.as("p-mireille")
    expect(data(renderHook(() => demo.management.useMySleepingPages!()).result.current)).toEqual([{ ...card, teamRole: "signatory", canWake: false }])
    expect(await demo.management.wake!(LYON)).toEqual({ ok: false, code: "page_role_required" })
    // Hors de l'équipe : rien à lire, refus indistinct.
    await demo.as("p-prisca")
    expect(data(renderHook(() => demo.management.useMySleepingPages!()).result.current)).toEqual([])
    expect(await demo.management.wake!(LYON)).toEqual({ ok: false, code: "not_found" })
    // Une page éveillée ne se « réveille » pas.
    await demo.as("p-mireille")
    expect(await demo.management.wake!("page-saveurs")).toEqual({ ok: false, code: "not_found" })
  })

  it("passé trente jours, la réactivation est refusée et rien n'est effacé", async () => {
    const demo = setup()
    await demo.as("p-steeve")
    expect(await demo.management.putToSleep!(LYON)).toMatchObject({ ok: true })
    demo.advance(PAGE_SLEEP_MS - 1)
    expect(data(renderHook(() => demo.management.useMySleepingPages!()).result.current)).toMatchObject([{ id: LYON, state: "asleep", canWake: true }])
    demo.advance(1)
    // L'échéance se constate à la lecture, sans passage planifié.
    await demo.as("p-steeve")
    expect(data(renderHook(() => demo.management.useMySleepingPages!()).result.current)).toMatchObject([{ id: LYON, state: "expired", canWake: false }])
    expect(await demo.management.wake!(LYON)).toEqual({ ok: false, code: "page_sleep_expired" })
    // Toujours masquée, toujours là : la sortie est une décision humaine.
    await demo.as("p-prisca")
    expect(data(renderHook(() => demo.source.pages!.usePage(LYON_HANDLE)).result.current)).toBeNull()
  })
})

describe("AS-11a — démonstration : une revendication sur une page endormie", () => {
  it("reste lisible au bureau et chez son auteur ; elle se refuse, elle ne s'accorde pas", async () => {
    const demo = setup()
    const desk = demoPageClaimsDesk(demo.store)
    // Nadia administre la Valise solidaire (« Communauté ») : sa demande est une demande de vérification.
    await demo.as("p-nadia")
    const evidence = [new File([new Uint8Array(2048)], "statuts.pdf", { type: "application/pdf" })]
    const sent = await demo.management.requestClaim({ pageId: "page-valise", evidence })
    expect(sent).toMatchObject({ ok: true })
    const claimId = sent.ok ? sent.value.claimId : ""
    expect(await demo.management.putToSleep!("page-valise")).toMatchObject({ ok: true })
    expect(data(renderHook(() => demo.management.useMyClaims()).result.current).map((claim) => [claim.id, claim.page.id, claim.status])).toEqual([[claimId, "page-valise", "pending"]])
    expect(desk.pending("p-rodrigue").map((claim) => claim.claimId)).toEqual([claimId])
    expect(desk.decide({ deciderId: "p-rodrigue", claimId, decision: "approved", reason: "Pièces conformes (recette)." })).toEqual({ ok: false, code: "moderation_desk_conflict" })
    expect(desk.decide({ deciderId: "p-rodrigue", claimId, decision: "rejected", reason: "Page en sommeil (recette)." })).toEqual({ ok: true, value: { status: "rejected" } })
  })
})

describe("AS-11a — démonstration : la page sans responsable", () => {
  it("se calcule comme le moteur : aucun administrateur vivant, hors institution", async () => {
    const demo = setup()
    await demo.as("p-prisca")
    const sheet = (handle: string) => data(renderHook(() => demo.source.pages!.usePage(handle)).result.current)
    // L'association de Bordeaux n'a aucun administrateur : sans responsable, et revendicable.
    expect(sheet("etudiants-bordeaux-demo")).toMatchObject({ orphan: true, page: { claimable: true } })
    // Lyon a son administrateur ; le poste consulaire est une institution, reprise par la console.
    expect(sheet(LYON_HANDLE)).toMatchObject({ orphan: false })
    expect(sheet("poste-demo-france")).toMatchObject({ orphan: false })
  })
})

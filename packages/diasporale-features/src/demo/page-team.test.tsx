// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import type { PageAdminCapability, PageManagement } from "../data/page-admin-port"
import { demoPageAdminContext } from "./page-admin"
import { commentsPageView, isPageClosedByBlocks, postDetailView } from "./selectors"
import { createDemoDataSource } from "./source"
import { createDemoSeed, type DemoComment, type DemoPost, type DemoState } from "./state"
import { DEMO_STORAGE_KEY, DemoStore } from "./store"

/**
 * AS-10 — l'équipe de page à trois rôles, en démonstration, avec la matrice du moteur :
 * le modérateur ne publie ni ne parle au nom de la page, l'éditeur ne gère pas, le
 * dernier administrateur reste protégé, toute l'équipe vivante retire un commentaire
 * sous une publication de la page, et les modérateurs ne comptent pas pour RP-03.
 */
const NOW = Date.UTC(2026, 10, 19, 12)
const LYON = "page-asso-lyon"
/** Publication de la page lyonnaise du jeu fictif (communiqué public). */
const PAGE_POST = "post-3"
const NOTE = "post-as10-note"
const ON_PAGE = "as10-commentaire-page"
const ON_PAGE_2 = "as10-commentaire-page-2"

function fixture(): DemoState {
  const seed = createDemoSeed(NOW)
  const note: DemoPost = {
    id: NOTE, author: { kind: "page", id: LYON }, body: "Note fictive aux abonnés du collectif", audience: "page", visibility: "network",
    scope: { reach: "diaspora" }, moderation: "published", createdAt: NOW - 60_000, editedAt: null, reactions: {}, baseReactions: 0,
  }
  const comment = (id: string, body: string, createdAt: number): DemoComment => ({ id, postId: PAGE_POST, authorId: "p-rodrigue", body, createdAt, parentId: null, removedAt: null })
  return {
    ...seed,
    posts: [...seed.posts, note],
    comments: [...seed.comments, comment(ON_PAGE, "Commentaire fictif déplacé", NOW - 30_000), comment(ON_PAGE_2, "Second commentaire fictif", NOW - 20_000)],
  }
}

function setup() {
  const stored = new Map([[DEMO_STORAGE_KEY, JSON.stringify(fixture())]])
  const storage = {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => { stored.set(key, value) },
    removeItem: (key: string) => { stored.delete(key) },
  }
  const store = new DemoStore(storage, () => NOW, 0)
  const source = createDemoDataSource(store)
  const capability = source.pageAdmin as PageAdminCapability
  const management = capability.management as PageManagement
  const as = async (personId: string) => act(async () => { await store.switchTo(personId) })
  return { store, source, capability, management, as, teams: demoPageAdminContext(store) }
}

/** Steeve (administrateur) invite Prisca comme modératrice ; elle accepte. */
async function withModerator(demo: ReturnType<typeof setup>) {
  await demo.as("p-steeve")
  await act(async () => { expect(await demo.management.grantRole(LYON, "prisca.abanga", "moderator")).toMatchObject({ ok: true, value: { role: "moderator", invited: true } }) })
  await demo.as("p-prisca")
  await act(async () => { expect(await demo.management.respondToInvitation(LYON, true)).toEqual({ ok: true, value: { role: "moderator" } }) })
}

const removable = (state: DemoState, viewerId: string, postId: string = PAGE_POST) =>
  Object.fromEntries((commentsPageView(state, postId, viewerId, NOW)?.items ?? []).map((item) => [item.id, item.canRemove === true]))

afterEach(cleanup)

describe("AS-10 — démonstration : le modérateur de page", () => {
  it("fait partie de l'équipe sans parler au nom de la page : absent de « mes pages », présent dans l'équipe", async () => {
    const demo = setup()
    await withModerator(demo)
    expect(renderHook(() => demo.capability.useMyPages()).result.current).toEqual({ status: "ready", data: [] })
    expect(renderHook(() => demo.capability.useMyTeamPages!()).result.current).toEqual({
      status: "ready",
      data: [{ id: LYON, handle: "collectif-ivindo-lyon", name: expect.any(String), ownerKind: "association", teamRole: "moderator", badge: "verified", country: "FR" }],
    })
    expect(renderHook(() => demo.management.useManagedPage("collectif-ivindo-lyon")).result.current).toMatchObject({ status: "ready", data: { myRole: null, myTeamRole: "moderator" } })
    // Il voit l'équipe, dans l'ordre du moteur : administrateurs, éditeurs, modérateurs.
    const team = renderHook(() => demo.management.useSignatories(LYON)).result.current
    expect(team.status === "ready" ? team.data.map((row) => [row.personId, row.role, row.accepted]) : team).toEqual([
      ["p-steeve", "admin", true],
      ["p-mireille", "signatory", false],
      ["p-prisca", "moderator", true],
    ])
  })

  it("ne gère rien : ni l'équipe, ni l'identité, ni la publication au nom de la page", async () => {
    const demo = setup()
    await withModerator(demo)
    expect(await demo.management.grantRole(LYON, "rodrigue.komo", "signatory")).toEqual({ ok: false, code: "page_role_required" })
    expect(await demo.management.revokeRole(LYON, "p-steeve")).toEqual({ ok: false, code: "page_role_required" })
    expect(await demo.management.updateIdentity(LYON, { name: "Autre nom", shortName: null, description: null, country: "FR" })).toEqual({ ok: false, code: "page_role_required" })
    expect(demo.store.publishPage({ pageId: LYON, body: "Communiqué fictif", reach: "diaspora", audience: "public", idempotencyKey: "as10-1" })).toEqual({ ok: false, code: "page_role_required" })
    expect(demo.teams.isSignatory(LYON, "p-prisca")).toBe(false)
    expect(demo.teams.isTeamMember(LYON, "p-prisca")).toBe(true)
  })

  it("lit la note aux abonnés de sa page, comme toute l'équipe vivante", async () => {
    const demo = setup()
    await demo.as("p-prisca")
    expect(postDetailView(demo.store.getState(), NOTE, "p-prisca", NOW)).toBeNull()
    await withModerator(demo)
    expect(postDetailView(demo.store.getState(), NOTE, "p-prisca", NOW)).toMatchObject({ id: NOTE })
  })

  it("retire un commentaire sous une publication de sa page ; parti de l'équipe, il ne le peut plus", async () => {
    const demo = setup()
    await demo.as("p-prisca")
    expect(removable(demo.store.getState(), "p-prisca")).toEqual({ [ON_PAGE]: false, [ON_PAGE_2]: false })
    expect(await demo.source.actions.removeComment(ON_PAGE)).toEqual({ ok: false, code: "not_found" })
    await withModerator(demo)
    expect(removable(demo.store.getState(), "p-prisca")).toEqual({ [ON_PAGE]: true, [ON_PAGE_2]: true })
    // Sous une publication PERSONNELLE d'autrui, rien ne change : seul son propre commentaire.
    expect(removable(demo.store.getState(), "p-prisca", "post-2")).toEqual({ "c-1": true, "c-3": false })
    await act(async () => { expect(await demo.source.actions.removeComment(ON_PAGE)).toEqual({ ok: true, value: null }) })
    expect(Object.keys(removable(demo.store.getState(), "p-prisca"))).toEqual([ON_PAGE_2])
    // Le droit est ACTUEL : sorti de l'équipe, le geste se ferme et le serveur de démonstration le refuse.
    await act(async () => { expect(await demo.management.revokeRole(LYON, "p-prisca")).toEqual({ ok: true, value: { revoked: true } }) })
    expect(removable(demo.store.getState(), "p-prisca")).toEqual({ [ON_PAGE_2]: false })
    expect(await demo.source.actions.removeComment(ON_PAGE_2)).toEqual({ ok: false, code: "not_found" })
  })

  it("RP-03 : un modérateur ne compte pas dans la fermeture par blocages", async () => {
    const demo = setup()
    await withModerator(demo)
    expect(demo.teams.signatoriesOf(LYON)).toEqual(["p-steeve"])
    const state: DemoState = { ...demo.store.getState(), blocks: [{ id: "as10-blocage", byId: "p-rodrigue", targetId: "p-steeve", createdAt: NOW }] }
    // Le seul administrateur bloqué ferme la page, même avec une modératrice hors blocage.
    expect(isPageClosedByBlocks(state, demo.teams.signatoriesOf(LYON), "p-rodrigue")).toBe(true)
  })
})

describe("AS-10 — démonstration : éditeur, administrateur et dernier administrateur", () => {
  it("l'éditeur publie sans gérer, et retire aussi un commentaire sous une publication de la page", async () => {
    const demo = setup()
    await demo.as("p-mireille")
    await act(async () => { expect(await demo.management.respondToInvitation(LYON, true)).toEqual({ ok: true, value: { role: "signatory" } }) })
    expect(await demo.management.grantRole(LYON, "prisca.abanga", "moderator")).toEqual({ ok: false, code: "page_role_required" })
    expect(renderHook(() => demo.management.useManagedPage("collectif-ivindo-lyon")).result.current).toMatchObject({ data: { myRole: "signatory", myTeamRole: "signatory" } })
    expect(removable(demo.store.getState(), "p-mireille")).toEqual({ [ON_PAGE]: true, [ON_PAGE_2]: true })
  })

  it("un membre déjà accepté est promu aussitôt ; rétrogradé en modérateur, un administrateur perd la gestion ; le dernier reste", async () => {
    const demo = setup()
    await demo.as("p-mireille")
    await act(async () => { await demo.management.respondToInvitation(LYON, true) })
    await demo.as("p-steeve")
    // « Transmettre la page » : Mireille a déjà accepté, elle devient administratrice sans invitation.
    await act(async () => { expect(await demo.management.grantRole(LYON, "mireille.ivindo", "admin")).toEqual({ ok: true, value: { personId: "p-mireille", role: "admin", invited: false } }) })
    await demo.as("p-mireille")
    await act(async () => { expect(await demo.management.grantRole(LYON, "steeve.ngounie", "moderator")).toMatchObject({ ok: true, value: { role: "moderator", invited: false } }) })
    // Mireille est la dernière administratrice : elle ne part pas.
    expect(await demo.management.revokeRole(LYON, "p-mireille")).toEqual({ ok: false, code: "page_last_admin" })
    await demo.as("p-steeve")
    expect(renderHook(() => demo.management.useManagedPage("collectif-ivindo-lyon")).result.current).toMatchObject({ data: { myRole: null, myTeamRole: "moderator" } })
    expect(await demo.management.grantRole(LYON, "mireille.ivindo", "signatory")).toEqual({ ok: false, code: "page_role_required" })
    // Chacun se retire, quel que soit son rôle.
    await act(async () => { expect(await demo.management.revokeRole(LYON, "p-steeve")).toEqual({ ok: true, value: { revoked: true } }) })
    expect(renderHook(() => demo.capability.useMyTeamPages!()).result.current).toEqual({ status: "ready", data: [] })
  })
})

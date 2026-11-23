import { describe, expect, test } from "bun:test"

import { DIASPORA_GA_DEMO_ACTORS, DIASPORA_GA_DEMO_ACTOR_SPECS, diasporaGaDemoActorsOffered, type DiasporaGaDemoActor } from "./demo-accounts"
import {
  DIASPORA_GA_DEMO_CONTENT_MARKER,
  DIASPORA_GA_DEMO_POST_AUTHORS,
  DIASPORA_GA_DEMO_POSTS,
  diasporaGaDemoCanPublish,
  diasporaGaDemoCommentIdempotencyKey,
  diasporaGaDemoPostIdempotencyKey,
  diasporaGaDemoPostsInvolving,
  diasporaGaDemoPostsOf,
  type DiasporaGaDemoPost,
} from "./demo-content"
import { ENGINE_COMMENT_MAX_LENGTH, ENGINE_POST_MAX_LENGTH, ENGINE_REACTION_KINDS } from "./engine"
import { parseContentScope } from "./reach"

const MARKER = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** Ce que ferment les modules du lancement (boutique, emploi, services, accompagnement, évènements, entraide, kit d'arrivée). */
const CLOSED_FEATURES = [
  /boutique/i, /commande/i, /achat/i, /achet/i, /vente/i, /vendre/i, /prix/i, /tarif/i, /paiement/i, /payer/i, /€/,
  /emploi/i, /recrut/i, /candidat/i, /\boffre/i, /\bposte à pourvoir/i,
  /service/i, /prestation/i, /devis/i, /réserv/i, /rendez-vous/i,
  /mentor/i, /inscri/i, /évènement/i, /événement/i, /billet/i, /mission/i, /bénévol/i, /\bkit\b/i,
]

/** Rien de consulaire : la démonstration n'affirme aucun service ni aucune démarche. */
const CONSULAR = [/consula/i, /passeport/i, /\bvisa\b/i, /état civil/i, /\bnip\b/i, /démarche/i, /titre de séjour/i, /acte de naissance/i]

/** Aucune coordonnée ni aucun chiffre : un chiffre inventé n'a pas sa place dans une vitrine. */
const CONTACT_OR_FIGURE = [/\d/, /@/, /https?:/i, /www\./i]

/** Les textes d'une publication : son corps et celui de son commentaire. */
function textsOf(entry: DiasporaGaDemoPost): string[] {
  return entry.comment === null ? [entry.body] : [entry.body, entry.comment.body]
}

/** Les acteurs qui interviennent sous une publication (réactions et commentaire). */
function participantsOf(entry: DiasporaGaDemoPost): DiasporaGaDemoActor[] {
  return [...entry.reactions.map((reaction) => reaction.actor), ...(entry.comment === null ? [] : [entry.comment.actor])]
}

describe("publications d'exemple du réseau de démonstration (CH-817)", () => {
  test("clés stables et uniques `<acteur>:<repère>`, et leurs clés d'idempotence", () => {
    const keys = DIASPORA_GA_DEMO_POSTS.map((entry) => entry.key)
    expect(new Set(keys).size).toBe(keys.length)
    for (const entry of DIASPORA_GA_DEMO_POSTS) {
      expect(entry.key.startsWith(`${entry.actor}:`), entry.key).toBe(true)
      expect(entry.key.slice(entry.actor.length + 1), entry.key).toMatch(MARKER)
    }
    const sample = DIASPORA_GA_DEMO_POSTS[0]!
    expect(diasporaGaDemoPostIdempotencyKey(sample)).toBe(`diaspora-ga-demo:post:${sample.key}`)
    expect(diasporaGaDemoCommentIdempotencyKey(sample)).toBe(`diaspora-ga-demo:comment:${sample.key}`)
    expect(diasporaGaDemoPostIdempotencyKey({ key: "verifie:dimanche" })).toBe("diaspora-ga-demo:post:verifie:dimanche")
  })

  test("chaque texte est marqué « Démo — », tient dans les longueurs du moteur ; texte seul, sans média", () => {
    expect(DIASPORA_GA_DEMO_CONTENT_MARKER).toBe("Démo — ")
    for (const entry of DIASPORA_GA_DEMO_POSTS) {
      expect(Object.keys(entry).sort(), entry.key).toEqual(["actor", "author", "body", "comment", "key", "reactions", "scope", "visibility"])
      expect(DIASPORA_GA_DEMO_POST_AUTHORS as readonly string[]).toContain(entry.author)
      for (const text of textsOf(entry)) {
        expect(text.startsWith(DIASPORA_GA_DEMO_CONTENT_MARKER), entry.key).toBe(true)
        expect(text.trim(), entry.key).toBe(text)
        expect(text.length, entry.key).toBeGreaterThan(DIASPORA_GA_DEMO_CONTENT_MARKER.length + 20)
      }
      expect(entry.body.length, entry.key).toBeLessThanOrEqual(ENGINE_POST_MAX_LENGTH)
      if (entry.comment !== null) expect(entry.comment.body.length, entry.key).toBeLessThanOrEqual(ENGINE_COMMENT_MAX_LENGTH)
    }
  })

  test("rien que ce qui est ouvert au lancement : aucun module fermé, rien de consulaire, aucun chiffre ni coordonnée", () => {
    for (const entry of DIASPORA_GA_DEMO_POSTS) {
      for (const text of textsOf(entry)) {
        for (const pattern of [...CLOSED_FEATURES, ...CONSULAR, ...CONTACT_OR_FIGURE]) expect(text, `${entry.key} : ${pattern}`).not.toMatch(pattern)
      }
    }
    // Test du test : les motifs voient ce qu'ils refusent.
    expect("Démo — Réservez votre place").toMatch(CLOSED_FEATURES.find((pattern) => pattern.test("réserv"))!)
    expect("Démo — Rendez-vous au consulat").toMatch(CONSULAR[0]!)
    expect("Démo — Appelez le 06").toMatch(CONTACT_OR_FIGURE[0]!)
  })

  test("auteurs : seuls ceux qui peuvent publier, deux ou trois publications personnelles chacun", () => {
    expect(DIASPORA_GA_DEMO_ACTORS.filter((actor) => !diasporaGaDemoCanPublish(actor))).toEqual(["nouveau", "leger", "suspendu", "suspendu-racine", "exterieur"])
    for (const actor of DIASPORA_GA_DEMO_ACTORS) {
      const personal = diasporaGaDemoPostsOf(actor).filter((entry) => entry.author === "person")
      if (!diasporaGaDemoCanPublish(actor)) {
        expect(diasporaGaDemoPostsOf(actor), actor).toEqual([])
        continue
      }
      expect(DIASPORA_GA_DEMO_ACTOR_SPECS[actor].profile, actor).not.toBeNull()
      expect(personal.length, actor).toBeGreaterThanOrEqual(2)
      expect(personal.length, actor).toBeLessThanOrEqual(3)
    }
  })

  test("pages : deux publications au nom de la page pour chaque acteur de page, aucune ailleurs", () => {
    for (const actor of DIASPORA_GA_DEMO_ACTORS) {
      const onPage = diasporaGaDemoPostsOf(actor).filter((entry) => entry.author === "page")
      expect(onPage.length, actor).toBe(DIASPORA_GA_DEMO_ACTOR_SPECS[actor].page === null ? 0 : 2)
    }
  })

  test("portée : le pays de l'acteur, accepté par la règle des portées ; visibilité réseau, jamais la racine", () => {
    for (const entry of DIASPORA_GA_DEMO_POSTS) {
      expect(entry.visibility, entry.key).toBe("network")
      expect(entry.scope.country, entry.key).toBe(DIASPORA_GA_DEMO_ACTOR_SPECS[entry.actor].country)
      expect(parseContentScope({ reach: entry.scope.reach, country: entry.scope.country ?? null }), entry.key).toEqual({ ok: true, value: entry.scope })
    }
    // Les deux portées servent : le hub du pays, et toute la diaspora.
    expect(new Set(DIASPORA_GA_DEMO_POSTS.map((entry) => entry.scope.reach))).toEqual(new Set(["local", "diaspora"]))
  })

  test("réactions et commentaires : entre acteurs qui publient, jamais l'auteur, une fois par personne, jamais entre un bloqué et son bloqueur", () => {
    for (const entry of DIASPORA_GA_DEMO_POSTS) {
      const reactors = entry.reactions.map((reaction) => reaction.actor)
      expect(new Set(reactors).size, entry.key).toBe(reactors.length)
      for (const reaction of entry.reactions) expect(ENGINE_REACTION_KINDS as readonly string[], entry.key).toContain(reaction.kind)
      for (const participant of participantsOf(entry)) {
        expect(participant, entry.key).not.toBe(entry.actor)
        expect(diasporaGaDemoCanPublish(participant), `${entry.key} : ${participant}`).toBe(true)
        const pair = [entry.actor, participant]
        for (const actor of pair) {
          const blocker = DIASPORA_GA_DEMO_ACTOR_SPECS[actor].blockedBy
          if (blocker !== null) expect(pair, entry.key).not.toContain(blocker)
        }
      }
    }
    // Le bloqué publie, mais ni lui ni son bloqueur n'interviennent chez l'autre.
    const blocked = DIASPORA_GA_DEMO_ACTORS.filter((actor) => DIASPORA_GA_DEMO_ACTOR_SPECS[actor].blockedBy !== null)
    expect(blocked).toEqual(["bloque"])
    expect(diasporaGaDemoPostsOf("bloque").length).toBeGreaterThan(0)
  })

  test("au lancement (socle, pages, France), chaque publication de la vitrine a déjà une réaction de la vitrine", () => {
    const launch = diasporaGaDemoActorsOffered({ openFeatures: ["pages"], openCountries: ["FR"], local: false })
    const visible = DIASPORA_GA_DEMO_POSTS.filter((entry) => launch.includes(entry.actor))
    expect(visible.length).toBeGreaterThan(0)
    for (const entry of visible) {
      expect(entry.reactions.some((reaction) => launch.includes(reaction.actor)), entry.key).toBe(true)
    }
  })

  test("accesseurs : les publications d'un acteur, et toutes celles où il a un rôle", () => {
    expect(diasporaGaDemoPostsOf("verifie").map((entry) => entry.key)).toEqual(["verifie:parrainer", "verifie:dimanche", "verifie:transports"])
    expect(diasporaGaDemoPostsOf("leger")).toEqual([])
    // Ses publications, puis celles où il réagit ou commente, dans l'ordre de la liste.
    for (const actor of DIASPORA_GA_DEMO_ACTORS) {
      expect(diasporaGaDemoPostsInvolving(actor), actor).toEqual(DIASPORA_GA_DEMO_POSTS.filter((entry) => entry.actor === actor || participantsOf(entry).includes(actor)))
    }
    expect(diasporaGaDemoPostsInvolving("canada").map((entry) => entry.key)).toEqual(["belgique:bruxelles", "canada:hiver", "canada:decalage"])
    // Une réaction seule suffit à impliquer un acteur (l'administrateur, sous la publication du parrain).
    const sponsorPost = DIASPORA_GA_DEMO_POSTS.find((entry) => entry.key === "verifie:parrainer")
    expect(sponsorPost?.comment?.actor).not.toBe("administrateur")
    expect(diasporaGaDemoPostsInvolving("administrateur")).toContain(sponsorPost!)
    expect(diasporaGaDemoPostsInvolving("nouveau")).toEqual([])
  })
})

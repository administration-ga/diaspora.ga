import { describe, expect, test } from "bun:test"

import {
  DIASPORA_GA_DEMO_ACTORS,
  DIASPORA_GA_DEMO_ACTOR_SPECS,
  DIASPORA_GA_DEMO_AUDIENCES,
  DIASPORA_GA_DEMO_COUNTRIES,
  DIASPORA_GA_DEMO_EMAIL_DOMAIN,
  DIASPORA_GA_DEMO_GESTURES,
  DIASPORA_GA_DEMO_GESTURE_FEATURES,
  DIASPORA_GA_DEMO_UNREGISTERED_PAGES_AUDIENCE,
  diasporaGaDemoActorOfEmail,
  diasporaGaDemoActorsOffered,
  diasporaGaDemoDisplayName,
  diasporaGaDemoEmailOf,
  type DiasporaGaDemoActor,
} from "./demo-accounts"
import { deriveMembershipStatus } from "./eligibility"
import { ENGINE_NETWORK_FEATURES, type EngineNetworkFeature } from "./engine"

const NOW = Date.UTC(2026, 9, 19, 12)
const HANDLE = /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/

/**
 * La règle d'écriture des noms de `normalizeCivilName` (`@antsia/social-domain/civilName`),
 * appliquée ici : le domaine ne dépend d'aucun paquet, et charger le module du moteur
 * ferait entrer ses fichiers dans la couverture du domaine. Un nom conforme est un point
 * fixe : NOM en capitales françaises, chaque segment de prénom à initiale capitale, les
 * séparateurs (espace, tiret, apostrophe) intacts.
 */
const GIVEN_NAME_SEPARATORS = /([ \p{Pd}'‘’ʻʼ]+)/u

function canonicalSpaces(raw: string): string {
  return raw.normalize("NFC").trim().replace(/\s+/gu, " ")
}

function normalizedFamilyName(raw: string): string {
  return canonicalSpaces(raw).toLocaleUpperCase("fr").normalize("NFC")
}

function normalizedGivenNames(raw: string): string {
  return canonicalSpaces(raw)
    .toLocaleLowerCase("fr")
    .split(GIVEN_NAME_SEPARATORS)
    .map((part, index) => (index % 2 === 0 ? `${part.charAt(0).toLocaleUpperCase("fr")}${part.slice(1)}` : part))
    .join("")
    .normalize("NFC")
}

/** Les acteurs de la liste dans l'ordre du panneau, pour comparer un catalogue à un ensemble. */
function inPanelOrder(actors: readonly DiasporaGaDemoActor[]): DiasporaGaDemoActor[] {
  return DIASPORA_GA_DEMO_ACTORS.filter((actor) => actors.includes(actor))
}

/** Au lancement : le socle, les pages, la France. */
const LAUNCH: readonly DiasporaGaDemoActor[] = [
  "nouveau", "leger", "declare", "parraine", "verifie", "fondateur",
  "association", "entreprise", "institution", "moderateur", "administrateur",
]
const RECETTE: readonly DiasporaGaDemoActor[] = ["media", "communaute", "suspendu", "suspendu-racine", "bloque", "exterieur"]

describe("comptes de démonstration de DIASPORA.GA", () => {
  test("chaque acteur a sa fiche, sous son propre nom", () => {
    expect(Object.keys(DIASPORA_GA_DEMO_ACTOR_SPECS).sort()).toEqual([...DIASPORA_GA_DEMO_ACTORS].sort())
    for (const actor of DIASPORA_GA_DEMO_ACTORS) expect(DIASPORA_GA_DEMO_ACTOR_SPECS[actor].actor).toBe(actor)
  })

  test("le statut attendu découle des faits par la règle officielle, sans exception", () => {
    for (const actor of DIASPORA_GA_DEMO_ACTORS) {
      const spec = DIASPORA_GA_DEMO_ACTOR_SPECS[actor]
      // Sans entrée dans le réseau, aucun statut : le nouvel arrivant, l'utilisateur extérieur.
      if (spec.profile === null || spec.outsider) {
        expect(spec.expectedStatus, actor).toBeNull()
        continue
      }
      const derived = deriveMembershipStatus(
        {
          idn: spec.grounds.idn,
          sponsored: spec.grounds.sponsored,
          consularAttestation: spec.grounds.consularAttestation,
          foundingAdmission: spec.grounds.foundingAdmission,
          // Une suspension de la racine vaut partout : dans DIASPORA.GA, elle se lit comme une suspension.
          suspension: spec.grounds.suspended || spec.grounds.suspendedAtRoot ? { until: null, readAccess: "read_only" } : null,
          leftAt: null,
        },
        NOW,
      )
      expect(derived, actor).toBe(spec.expectedStatus!)
    }
  })

  test("adresses réservées : aller et retour, casse et espaces ignorés, rien hors du domaine", () => {
    for (const actor of DIASPORA_GA_DEMO_ACTORS) {
      const email = diasporaGaDemoEmailOf(actor)
      expect(email.endsWith(`@${DIASPORA_GA_DEMO_EMAIL_DOMAIN}`)).toBe(true)
      expect(diasporaGaDemoActorOfEmail(` ${email.toUpperCase()} `)).toBe(actor)
    }
    expect(diasporaGaDemoActorOfEmail("verifie@demo.antsia.test")).toBeNull()
    expect(diasporaGaDemoActorOfEmail("inconnu@demo.diaspora-ga.test")).toBeNull()
  })

  test("profils : identifiants valides et uniques, noms « Prénom NOM »", () => {
    const handles = new Set<string>()
    for (const actor of DIASPORA_GA_DEMO_ACTORS) {
      const profile = DIASPORA_GA_DEMO_ACTOR_SPECS[actor].profile
      if (profile === null) {
        expect(diasporaGaDemoDisplayName(actor)).toBeNull()
        continue
      }
      expect(profile.handle, actor).toMatch(HANDLE)
      expect(handles.has(profile.handle), actor).toBe(false)
      handles.add(profile.handle)
      expect(profile.familyName, actor).toBe(profile.familyName.toUpperCase())
      expect(profile.givenNames.charAt(0), actor).toBe(profile.givenNames.charAt(0).toUpperCase())
      expect(diasporaGaDemoDisplayName(actor)).toBe(`${profile.givenNames} ${profile.familyName}`)
    }
  })

  test("pages : adresse valide et unique, confiance officielle aux seules institutions, type et secteur à leur nature", () => {
    const handles = new Set<string>()
    for (const actor of DIASPORA_GA_DEMO_ACTORS) {
      const spec = DIASPORA_GA_DEMO_ACTOR_SPECS[actor]
      const page = spec.page
      if (page === null) continue
      expect(spec.group, actor).toBe("pages")
      expect(page.handle.length).toBeGreaterThanOrEqual(3)
      expect(page.handle.length).toBeLessThanOrEqual(60)
      expect(page.handle, actor).toMatch(HANDLE)
      expect(handles.has(page.handle), actor).toBe(false)
      handles.add(page.handle)
      expect(page.trust === "official", actor).toBe(page.kind === "institution")
      expect(page.associationType !== null, actor).toBe(page.kind === "association")
      expect(page.sector !== null, actor).toBe(page.kind === "company")
      // Une page officielle exige un signataire à l'identité forte (IDN de niveau 2 au moins).
      if (page.kind === "institution") expect(spec.grounds.idn?.loa ?? 0).toBeGreaterThanOrEqual(2)
    }
  })

  test("gestes et rôles cohérents : offres et missions sur une page qui le permet, une équipe pour le modérateur", () => {
    for (const actor of DIASPORA_GA_DEMO_ACTORS) {
      const spec = DIASPORA_GA_DEMO_ACTOR_SPECS[actor]
      if (spec.gestures.includes("mission")) expect(spec.page?.kind).toBe("association")
      // Un évènement d'association ne se crée que sous l'identité d'une page d'association (moteur, `associationEventPage`).
      if (spec.gestures.includes("associationEvent")) expect(spec.page?.kind).toBe("association")
      if (spec.gestures.includes("service") || spec.gestures.includes("job")) expect(spec.page?.kind).toBe("company")
      if (spec.moderationTeam) expect(spec.role).not.toBe("member")
      if (spec.canSponsor) expect(spec.expectedStatus).toBe("verifiee")
      expect(DIASPORA_GA_DEMO_COUNTRIES as readonly string[]).toContain(spec.country)
    }
    // EV-01 : la recette des évènements a ses évènements (l'association) et qui les publie au bureau (une équipe de modération).
    expect(DIASPORA_GA_DEMO_ACTORS.filter((actor) => DIASPORA_GA_DEMO_ACTOR_SPECS[actor].gestures.includes("associationEvent"))).toEqual(["association"])
    expect(DIASPORA_GA_DEMO_ACTORS.filter((actor) => DIASPORA_GA_DEMO_ACTOR_SPECS[actor].moderationTeam)).toEqual(["moderateur"])
    // Le parrain du compte parrainé existe et peut parrainer.
    expect(DIASPORA_GA_DEMO_ACTOR_SPECS.verifie.canSponsor).toBe(true)
    expect(DIASPORA_GA_DEMO_ACTORS.filter((actor) => DIASPORA_GA_DEMO_ACTOR_SPECS[actor].grounds.sponsored)).toEqual(["parraine"])
  })

  test("EA-01 : un seul acteur fondateur, vérifié par la seule décision du réseau, dispensé d'ancienneté sans antidate", () => {
    expect(DIASPORA_GA_DEMO_ACTORS.filter((actor) => DIASPORA_GA_DEMO_ACTOR_SPECS[actor].grounds.foundingAdmission !== null)).toEqual(["fondateur"])
    const founder = DIASPORA_GA_DEMO_ACTOR_SPECS.fondateur
    expect(founder.grounds).toEqual({ idn: null, sponsored: false, consularAttestation: false, foundingAdmission: { seniorityWaiver: true }, suspended: false, suspendedAtRoot: false })
    expect([founder.group, founder.expectedStatus, founder.canSponsor, founder.role]).toEqual(["members", "verifiee", false, "member"])
  })

  test("accès restreints : un bloqueur qui agit dans le réseau, une suspension de la racine, un extérieur sans rien dans DIASPORA.GA", () => {
    for (const actor of DIASPORA_GA_DEMO_ACTORS) {
      const spec = DIASPORA_GA_DEMO_ACTOR_SPECS[actor]
      const restricted = spec.outsider || spec.blockedBy !== null || spec.grounds.suspended || spec.grounds.suspendedAtRoot
      expect(spec.group === "access", actor).toBe(restricted)
      if (spec.blockedBy !== null) {
        // Un blocage lie deux personnes qui ont un profil ; le bloqueur agit dans le réseau, sans restriction lui-même.
        const blocker = DIASPORA_GA_DEMO_ACTOR_SPECS[spec.blockedBy]
        expect(spec.blockedBy, actor).not.toBe(actor)
        expect(spec.profile, actor).not.toBeNull()
        expect(blocker.profile, actor).not.toBeNull()
        expect(blocker.outsider || blocker.blockedBy !== null || blocker.grounds.suspended || blocker.grounds.suspendedAtRoot, actor).toBe(false)
      }
      // La suspension de la racine frappe un membre entré dans DIASPORA.GA.
      if (spec.grounds.suspendedAtRoot) expect(spec.outsider, actor).toBe(false)
      if (spec.outsider) {
        // Rien dans DIASPORA.GA : ni fait, ni rôle, ni équipe, ni page, ni geste, ni blocage.
        expect(spec.profile, actor).not.toBeNull()
        expect(spec.grounds, actor).toEqual({ idn: null, sponsored: false, consularAttestation: false, foundingAdmission: null, suspended: false, suspendedAtRoot: false })
        expect([spec.role, spec.moderationTeam, spec.page, spec.gestures, spec.canSponsor, spec.blockedBy], actor).toEqual(["member", false, null, [], false, null])
      }
    }
    // Un acteur par accès restreint, le bloqué l'étant par le membre vérifié.
    expect(DIASPORA_GA_DEMO_ACTORS.filter((actor) => DIASPORA_GA_DEMO_ACTOR_SPECS[actor].grounds.suspended)).toEqual(["suspendu"])
    expect(DIASPORA_GA_DEMO_ACTORS.filter((actor) => DIASPORA_GA_DEMO_ACTOR_SPECS[actor].grounds.suspendedAtRoot)).toEqual(["suspendu-racine"])
    expect(DIASPORA_GA_DEMO_ACTORS.filter((actor) => DIASPORA_GA_DEMO_ACTOR_SPECS[actor].blockedBy !== null)).toEqual(["bloque"])
    expect(DIASPORA_GA_DEMO_ACTORS.filter((actor) => DIASPORA_GA_DEMO_ACTOR_SPECS[actor].outsider)).toEqual(["exterieur"])
    expect(DIASPORA_GA_DEMO_ACTOR_SPECS.bloque.blockedBy).toBe("verifie")
  })

  test("noms : chaque profil est un point fixe de la règle du normaliseur partagé (« Prénom NOM »)", () => {
    for (const actor of DIASPORA_GA_DEMO_ACTORS) {
      const profile = DIASPORA_GA_DEMO_ACTOR_SPECS[actor].profile
      if (profile === null) continue
      expect(normalizedFamilyName(profile.familyName), actor).toBe(profile.familyName)
      expect(normalizedGivenNames(profile.givenNames), actor).toBe(profile.givenNames)
    }
    // Test du test : la règle corrige la casse, garde accents et tirets.
    expect(normalizedFamilyName(" ndong  mba ")).toBe("NDONG MBA")
    expect(normalizedGivenNames("jean-rémy éloïse")).toBe("Jean-Rémy Éloïse")
  })
})

describe("catalogue par règle (CH-817) : un acteur n'est proposé que si ses modules et son pays sont ouverts", () => {
  test("la liste déclarée reste entière : 21 acteurs, chacun avec ses modules et son public", () => {
    expect(DIASPORA_GA_DEMO_ACTORS).toHaveLength(21)
    for (const actor of DIASPORA_GA_DEMO_ACTORS) {
      const spec = DIASPORA_GA_DEMO_ACTOR_SPECS[actor]
      expect(DIASPORA_GA_DEMO_AUDIENCES as readonly string[], actor).toContain(spec.audience)
      for (const feature of spec.requires) expect(ENGINE_NETWORK_FEATURES as readonly string[], actor).toContain(feature)
    }
  })

  test("rien d'ouvert : aucun acteur, même en développement local", () => {
    expect(diasporaGaDemoActorsOffered({ openFeatures: [], openCountries: [], local: false })).toEqual([])
    expect(diasporaGaDemoActorsOffered({ openFeatures: [], openCountries: [], local: true })).toEqual([])
    // Des modules sans pays ouvert ne proposent rien non plus.
    expect(diasporaGaDemoActorsOffered({ openFeatures: [...ENGINE_NETWORK_FEATURES], openCountries: [], local: false })).toEqual([])
  })

  test("le socle seul, France ouverte : les membres et les rôles du socle, aucune page", () => {
    expect(diasporaGaDemoActorsOffered({ openFeatures: [], openCountries: ["FR"], local: false })).toEqual([
      "nouveau", "leger", "declare", "parraine", "verifie", "fondateur", "moderateur", "administrateur",
    ])
  })

  test("au lancement (socle, pages, France) : exactement les onze acteurs de la vitrine", () => {
    expect(diasporaGaDemoActorsOffered({ openFeatures: ["pages"], openCountries: ["FR"], local: false })).toEqual([...LAUNCH])
  })

  test("le mentorat ouvert fait reparaître la mentore, seule ; l'emploi, le talent", () => {
    expect(diasporaGaDemoActorsOffered({ openFeatures: ["pages", "mentoring"], openCountries: ["FR"], local: false })).toEqual(inPanelOrder([...LAUNCH, "mentor"]))
    expect(diasporaGaDemoActorsOffered({ openFeatures: ["pages", "jobs"], openCountries: ["FR"], local: false })).toEqual(inPanelOrder([...LAUNCH, "talent"]))
    // Le mentorat ne dépend pas des pages : ouvert seul, il ne montre aucune page.
    const mentoringOnly = diasporaGaDemoActorsOffered({ openFeatures: ["mentoring"], openCountries: ["FR"], local: false })
    expect(mentoringOnly).toContain("mentor")
    expect(mentoringOnly.filter((actor) => DIASPORA_GA_DEMO_ACTOR_SPECS[actor].page !== null)).toEqual([])
    // Les modules des gestes d'une page ne font paraître aucun acteur de plus.
    expect(diasporaGaDemoActorsOffered({ openFeatures: ["pages", "services", "mutualAid", "groupsAndEvents"], openCountries: ["FR"], local: false })).toEqual([...LAUNCH])
  })

  test("un pays fermé cache ses acteurs ; ouvert, il les montre", () => {
    expect(diasporaGaDemoActorsOffered({ openFeatures: ["pages"], openCountries: ["FR", "BE"], local: false })).toEqual(inPanelOrder([...LAUNCH, "belgique"]))
    expect(diasporaGaDemoActorsOffered({ openFeatures: ["pages"], openCountries: ["BE"], local: false })).toEqual(["belgique"])
    expect(diasporaGaDemoActorsOffered({ openFeatures: ["pages"], openCountries: ["CA"], local: true })).toEqual(["canada"])
  })

  test("en développement local, la recette s'ajoute, sans passer outre les modules ni les pays", () => {
    expect(diasporaGaDemoActorsOffered({ openFeatures: ["pages"], openCountries: ["FR"], local: true })).toEqual(inPanelOrder([...LAUNCH, ...RECETTE]))
    // Sans les pages, le média et le collectif restent cachés, même en local ; les accès restreints, non.
    expect(diasporaGaDemoActorsOffered({ openFeatures: [], openCountries: ["FR"], local: true })).toEqual([
      "nouveau", "leger", "declare", "parraine", "verifie", "fondateur", "moderateur", "administrateur",
      "suspendu", "suspendu-racine", "bloque", "exterieur",
    ])
    // Tout ouvert, en local : les 21 ; hors local : jamais la recette.
    const everything = { openFeatures: [...ENGINE_NETWORK_FEATURES], openCountries: [...DIASPORA_GA_DEMO_COUNTRIES] }
    expect(diasporaGaDemoActorsOffered({ ...everything, local: true })).toEqual([...DIASPORA_GA_DEMO_ACTORS])
    expect(diasporaGaDemoActorsOffered({ ...everything, local: false })).toEqual(DIASPORA_GA_DEMO_ACTORS.filter((actor) => !RECETTE.includes(actor)))
  })

  test("modules exigés : les pages pour un acteur de page ; hors page, le module de chaque geste, raison d'être de l'acteur", () => {
    for (const actor of DIASPORA_GA_DEMO_ACTORS) {
      const spec = DIASPORA_GA_DEMO_ACTOR_SPECS[actor]
      const expected: EngineNetworkFeature[] = spec.page !== null ? ["pages"] : spec.gestures.map((gesture) => DIASPORA_GA_DEMO_GESTURE_FEATURES[gesture])
      expect([...spec.requires], actor).toEqual(expected)
    }
  })

  test("chaque geste attend son module : mentorat, emploi, services, entraide, groupes et évènements", () => {
    expect(Object.keys(DIASPORA_GA_DEMO_GESTURE_FEATURES).sort()).toEqual([...DIASPORA_GA_DEMO_GESTURES].sort())
    expect(DIASPORA_GA_DEMO_GESTURE_FEATURES).toEqual({
      mentor: "mentoring",
      talent: "jobs",
      service: "services",
      job: "jobs",
      mission: "mutualAid",
      associationEvent: "groupsAndEvents",
    })
  })

  test("recette : les accès restreints, et le média et le collectif par une seule constante réversible", () => {
    expect(DIASPORA_GA_DEMO_UNREGISTERED_PAGES_AUDIENCE).toBe("recette")
    for (const actor of DIASPORA_GA_DEMO_ACTORS) {
      const spec = DIASPORA_GA_DEMO_ACTOR_SPECS[actor]
      const expected = spec.group === "access" ? "recette" : actor === "media" || actor === "communaute" ? DIASPORA_GA_DEMO_UNREGISTERED_PAGES_AUDIENCE : "public"
      expect(spec.audience, actor).toBe(expected)
    }
  })
})

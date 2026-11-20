import { describe, expect, test } from "bun:test"

import {
  DIASPORA_GA_DEMO_ACTORS,
  DIASPORA_GA_DEMO_ACTOR_SPECS,
  DIASPORA_GA_DEMO_COUNTRIES,
  DIASPORA_GA_DEMO_EMAIL_DOMAIN,
  diasporaGaDemoActorOfEmail,
  diasporaGaDemoDisplayName,
  diasporaGaDemoEmailOf,
} from "./demo-accounts"
import { deriveMembershipStatus } from "./eligibility"

const NOW = Date.UTC(2026, 9, 19, 12)
const HANDLE = /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/

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
})

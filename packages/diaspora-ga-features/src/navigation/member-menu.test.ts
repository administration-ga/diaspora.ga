// @vitest-environment node
import { NETWORK_FEATURE_PARENTS, NETWORK_FEATURES, type NetworkFeature } from "@antsia/social-domain/networkFeatures"
import { MEMBERSHIP_STATUSES } from "@diaspora-ga/domain"
import { describe, expect, it } from "vitest"

import { DIASPORA_GA_LOCALES } from "../i18n/resources"
import { MEMBERS_APP_CODE_SWITCH_STATES, MEMBERS_APP_CODE_SWITCHES } from "./code-switches"
import { MEMBER_CREATE_ICONS, MEMBER_GATEWAY_ICONS, MEMBER_MENU_ICONS } from "./icons"
import {
  audienceReached,
  canSeeRegistration,
  codeSwitchAllows,
  featureMenuAdditions,
  MEMBER_COMMUNITY_FEATURES,
  MEMBER_CREATE_FORMATS,
  MEMBER_CREATE_RULES,
  MEMBER_GATEWAY_ENTRIES,
  MEMBER_GATEWAY_GROUP_LABEL_KEY,
  MEMBER_GATEWAY_RULES,
  MEMBER_MENU_AUDIENCES,
  MEMBER_MENU_ENTRIES,
  MEMBER_MENU_ENTRY_IDS,
  MEMBER_MENU_PLACEMENTS,
  MEMBER_MENU_WIDEST_SITUATION,
  memberMenu,
  menuDifference,
  requiredFeatures,
  type MemberCodeSwitchStates,
  type MemberMenu,
  type MemberMenuSituation,
} from "./member-menu"

/**
 * CH-815 A5 — le menu des membres en règle pure : exhaustif sur les neuf clés du moteur, les
 * vingt-quatre entrées, les quatre formats de « Créer » (la conférence derrière l'interrupteur de
 * code du direct, CH-817) et la passerelle « consulat.ga » (CH-863 : le module `consulateGateway`
 * l'ouvre, fermé par défaut). La coque de diaspora.ga et l'aperçu d'admin.diaspora.ga lisent cette
 * fonction ; diaspora.ga prouve ailleurs que sa coque la rend.
 */

/** Le direct refermé par le code : une position posée par le test (celle du dépôt est ouverte depuis le 26/11/2026). */
const LIVE_CLOSED: MemberCodeSwitchStates = { ...MEMBERS_APP_CODE_SWITCH_STATES, live: "closed" }

/** Un membre ordinaire du moteur : il peut publier, iCom ouvert, rien d'autre. */
const MEMBER: MemberMenuSituation = {
  icom: true,
  engineNetwork: true,
  canPublish: true,
  status: "declaree",
  holdsPageRole: false,
  holdsAssociation: false,
  moderator: false,
}

const ids = (entries: readonly { readonly id: string }[]) => entries.map((entry) => entry.id)
const menu = (openFeatures: readonly NetworkFeature[], situation: MemberMenuSituation = MEMBER_MENU_WIDEST_SITUATION): MemberMenu => memberMenu({ ...situation, openFeatures })

/** Toutes les parties de l'ensemble des neuf clés (512), pour les propriétés vraies partout. */
const ALL_FEATURE_SETS: NetworkFeature[][] = Array.from({ length: 2 ** NETWORK_FEATURES.length }, (_, mask) => NETWORK_FEATURES.filter((_, index) => (mask >> index) & 1))

describe("menu des membres — le socle, modules tous fermés", () => {
  it("la barre : Fil, Membres, Messages ; le compte : profil, réglages, relations, enregistrements, parrainer, mes données", () => {
    const closed = menu([], MEMBER)
    expect(ids(closed.rail)).toEqual(["feed", "explore", "messages"])
    expect(closed.phoneBar).toEqual(closed.rail)
    expect(ids(closed.personal)).toEqual(["relations", "bookmarks", "sponsor"])
    expect(ids(closed.account)).toEqual(["profile", "settings", "relations", "bookmarks", "sponsor", "myData"])
    expect(ids(closed.information)).toEqual(["legalNotice", "privacy", "terms", "communityRules", "contact", "charte"])
    // Le live n'est pas un module : le direct ouvert par le code (CH-817), il reste au socle, en tête.
    expect(ids(closed.create)).toEqual(["live", "story"])
  })

  it("chaque entrée porte la clé de son adresse et de son libellé, telles que la table les déclare", () => {
    const open = memberMenu({ ...MEMBER_MENU_WIDEST_SITUATION, openFeatures: NETWORK_FEATURES })
    for (const entry of [...open.rail, ...open.account, ...open.information]) {
      expect(entry).toEqual({ id: entry.id, routeKey: MEMBER_MENU_ENTRIES[entry.id].routeKey, labelKey: MEMBER_MENU_ENTRIES[entry.id].labelKey })
    }
    expect(open.create).toEqual(
      MEMBER_CREATE_FORMATS.map((id) => ({ id, routeKey: MEMBER_CREATE_RULES[id].routeKey, pageKind: MEMBER_CREATE_RULES[id].pageKind, labelKey: MEMBER_CREATE_RULES[id].labelKey, hintKey: MEMBER_CREATE_RULES[id].hintKey })),
    )
  })
})

describe("menu des membres — la conférence, derrière l'interrupteur de code du direct (CH-817)", () => {
  it("ouvert par le code (la position du dépôt depuis le 26/11/2026) : offerte quels que soient les modules, jamais comme ajout d'un module", () => {
    expect(MEMBERS_APP_CODE_SWITCH_STATES.live).toBe("open")
    for (const features of ALL_FEATURE_SETS) expect(ids(menu(features).create), features.join(",")).toContain("live")
    // L'aperçu d'admin.diaspora.ga lit les ajouts de chaque module : la conférence n'en est pas un.
    for (const feature of NETWORK_FEATURES) expect(featureMenuAdditions(feature).map((change) => change.id)).not.toContain("live")
  })

  it("refermé par le code : jamais offerte, quels que soient les modules et la situation", () => {
    for (const features of ALL_FEATURE_SETS) expect(ids(memberMenu({ ...MEMBER_MENU_WIDEST_SITUATION, openFeatures: features, codeSwitches: LIVE_CLOSED }).create), features.join(",")).not.toContain("live")
  })

  it("ouvert : offert en tête (comme la conférence du réseau de l'administration), au même public que l'actu (publier ET iCom), sans adresse ni module", () => {
    const open = (situation: MemberMenuSituation, features: readonly NetworkFeature[] = ["pages"]) => ids(memberMenu({ ...situation, openFeatures: features }).create)
    expect(open(MEMBER)).toEqual(["live", "story", "association", "company"])
    expect(open(MEMBER, [])).toEqual(["live", "story"])
    expect(open({ ...MEMBER, canPublish: false })).toEqual(["association", "company"])
    expect(open({ ...MEMBER, icom: false })).toEqual(["association", "company"])
    expect(MEMBER_CREATE_RULES.live).toMatchObject({ routeKey: null, pageKind: null, feature: null, audience: MEMBER_CREATE_RULES.story.audience, codeSwitch: "live" })
  })

  it("seule la conférence dépend d'un interrupteur ; la position « open » seule l'ouvre", () => {
    expect(MEMBER_CREATE_FORMATS.filter((id) => MEMBER_CREATE_RULES[id].codeSwitch !== null)).toEqual(["live"])
    expect(codeSwitchAllows(MEMBER_CREATE_RULES.live)).toBe(true)
    expect(codeSwitchAllows(MEMBER_CREATE_RULES.live, LIVE_CLOSED)).toBe(false)
    expect(codeSwitchAllows(MEMBER_CREATE_RULES.story)).toBe(true)
  })
})

describe("menu des membres — chaque module, seul (ses modules exigés ouverts)", () => {
  // Situation la plus large : tout public touché, donc tout ce qu'un module peut ajouter.
  const EXPECTED: Readonly<Record<NetworkFeature, { bar: string[]; account: string[]; gateways: string[]; create: string[] }>> = {
    pages: { bar: [], account: ["myActivity", "myAssociations"], gateways: [], create: ["association", "company"] },
    groupsAndEvents: { bar: ["communities"], account: [], gateways: [], create: [] },
    services: { bar: ["services"], account: ["myRequests"], gateways: [], create: [] },
    jobs: { bar: ["communities"], account: ["myApplications"], gateways: [], create: [] },
    mutualAid: { bar: ["communities"], account: [], gateways: [], create: [] },
    mentoring: { bar: ["communities"], account: ["myMentoring"], gateways: [], create: [] },
    arrivalKit: { bar: ["communities"], account: [], gateways: [], create: [] },
    // La mesure du pilote ne montre rien aux membres (fiche CH-815, lot A6) : elle se lit dans l'administration.
    pilotMetrics: { bar: [], account: [], gateways: [], create: [] },
    // CH-863 : le module d'affichage n'ajoute que la passerelle « consulat.ga » (« Démarches administratives »).
    consulateGateway: { bar: [], account: [], gateways: ["consulate"], create: [] },
  }

  it("les endroits d'un changement, dans l'ordre du menu : la barre, le compte, ses passerelles, « Créer »", () => {
    expect(MEMBER_MENU_PLACEMENTS).toEqual(["bar", "account", "gateways", "create"])
  })

  it.each(NETWORK_FEATURES)("%s : ses ajouts exacts, à leur place", (feature) => {
    const additions = featureMenuAdditions(feature)
    const at = (placement: string) => additions.filter((change) => change.placement === placement).map((change) => change.id)
    expect({ bar: at("bar"), account: at("account"), gateways: at("gateways"), create: at("create") }).toEqual(EXPECTED[feature])
    // Chaque ajout dit son public, celui de la table ; une passerelle s'offre à tout membre que la coque accueille.
    for (const change of additions) {
      if (change.placement === "gateways") {
        expect(change.audience).toBe("everyone")
        expect(change.labelKey).toBe(MEMBER_GATEWAY_RULES[change.id as keyof typeof MEMBER_GATEWAY_RULES].labelKey)
        continue
      }
      const rule = change.placement === "create" ? MEMBER_CREATE_RULES[change.id as keyof typeof MEMBER_CREATE_RULES] : MEMBER_MENU_ENTRIES[change.id as keyof typeof MEMBER_MENU_ENTRIES]
      expect(change.audience).toBe(rule.audience)
      expect(change.labelKey).toBe(rule.labelKey)
    }
  })

  it("aucun module n'ajoute rien au groupe « Informations » ; chacun ajoute au moins une entrée, sauf la mesure du pilote", () => {
    for (const feature of NETWORK_FEATURES.filter((key) => key !== "pilotMetrics")) {
      expect(featureMenuAdditions(feature).length, feature).toBeGreaterThan(0)
    }
    expect(featureMenuAdditions("pilotMetrics")).toEqual([])
    for (const features of ALL_FEATURE_SETS) expect(menu(features).information).toEqual(menu([]).information)
  })

  it("« Communautés » vient de n'importe lequel de ses modules, et d'eux seuls", () => {
    for (const features of ALL_FEATURE_SETS) {
      const offered = ids(menu(features).rail).includes("communities")
      expect(offered, features.join(",")).toBe(features.some((feature) => MEMBER_COMMUNITY_FEATURES.includes(feature)))
    }
    // Un deuxième module de Communautés n'ajoute plus rien à la barre.
    expect(menuDifference(menu(["pages", "jobs"]), menu(["pages", "jobs", "mutualAid"])).filter((change) => change.placement === "bar")).toEqual([])
  })
})

describe("menu des membres — la situation du membre", () => {
  it("iCom fermé (démonstration, membre qui n'écrit pas encore) : ni Messages ni actu", () => {
    const off = menu(NETWORK_FEATURES, { ...MEMBER, icom: false })
    expect(ids(off.rail)).not.toContain("messages")
    expect(ids(off.create)).toEqual(["association", "company"])
  })

  it("une actu exige de pouvoir publier ET iCom", () => {
    expect(ids(menu([], { ...MEMBER, canPublish: false }).create)).toEqual([])
    expect(ids(menu([], { ...MEMBER, icom: false }).create)).toEqual([])
  })

  it("sans réseau du moteur, « Mes relations » disparaît ; enregistrements et parrainage restent", () => {
    expect(ids(menu([], { ...MEMBER, engineNetwork: false }).personal)).toEqual(["bookmarks", "sponsor"])
  })

  it("« Mes pages » et « Mes associations » attendent un contenu ET le module des pages", () => {
    const holder = { ...MEMBER, holdsPageRole: true, holdsAssociation: true }
    expect(ids(menu(["pages"], MEMBER).personal)).not.toContain("myActivity")
    expect(ids(menu(["pages"], holder).personal)).toEqual(["myActivity", "myAssociations", "relations", "bookmarks", "sponsor"])
    expect(ids(menu([], holder).personal)).toEqual(["relations", "bookmarks", "sponsor"])
  })

  it("les responsables : Modération selon le serveur ; plus aucune entrée « Pilote », même la mesure ouverte (lot A6)", () => {
    const responsible = { ...MEMBER, moderator: true }
    expect(ids(menu([], responsible).personal).slice(-1)).toEqual(["moderation"])
    expect(ids(menu(["pilotMetrics"], responsible).personal).slice(-1)).toEqual(["moderation"])
    expect(ids(menu(["pilotMetrics"], responsible).account)).not.toContain("pilot")
    expect(ids(menu(["pilotMetrics"], MEMBER).personal)).not.toContain("moderation")
  })

  it("l'inscription d'une page : en attente, déclarée, vérifiée ; jamais suspendue ni partie", () => {
    for (const status of MEMBERSHIP_STATUSES) {
      const formats = ids(menu(["pages"], { ...MEMBER, status, canPublish: false }).create)
      expect(formats.includes("association"), status).toBe(canSeeRegistration(status))
    }
    expect(MEMBERSHIP_STATUSES.filter(canSeeRegistration)).toEqual(["en_attente", "declaree", "verifiee"])
  })

  it("chaque public est touché par la situation la plus large, et seulement par ce qu'il dit", () => {
    for (const audience of MEMBER_MENU_AUDIENCES) expect(audienceReached(audience, MEMBER_MENU_WIDEST_SITUATION), audience).toBe(true)
    const nobody: MemberMenuSituation = { icom: false, engineNetwork: false, canPublish: false, status: "suspendue", holdsPageRole: false, holdsAssociation: false, moderator: false }
    expect(MEMBER_MENU_AUDIENCES.filter((audience) => audienceReached(audience, nobody))).toEqual(["everyone"])
  })
})

describe("menu des membres — propriétés sur toutes les parties des neuf clés", () => {
  it("une entrée d'un module fermé n'est jamais offerte ; une entrée du socle à public large l'est toujours", () => {
    for (const features of ALL_FEATURE_SETS) {
      const shown = menu(features)
      const present = new Set([...ids(shown.rail), ...ids(shown.account), ...ids(shown.information)])
      for (const id of MEMBER_MENU_ENTRY_IDS) {
        const rule = MEMBER_MENU_ENTRIES[id]
        const offered = (rule.feature === null || features.includes(rule.feature)) && (rule.offeredWith === undefined || rule.offeredWith.some((feature) => features.includes(feature)))
        expect(present.has(id), `${id} avec ${features.join(",")}`).toBe(offered)
      }
      for (const id of MEMBER_CREATE_FORMATS) {
        const rule = MEMBER_CREATE_RULES[id]
        expect(ids(shown.create).includes(id)).toBe(codeSwitchAllows(rule) && (rule.feature === null || features.includes(rule.feature)))
      }
      // CH-863 : une passerelle ne paraît qu'avec SON module ouvert.
      for (const id of MEMBER_GATEWAY_ENTRIES) expect(ids(shown.gateways).includes(id), `${id} avec ${features.join(",")}`).toBe(features.includes(MEMBER_GATEWAY_RULES[id].feature))
    }
  })

  it("ouvrir un module n'enlève jamais rien au menu ; la barre tient en cinq entrées ; le rail et le téléphone se répondent", () => {
    for (const features of ALL_FEATURE_SETS) {
      const before = menu(features)
      expect(before.rail.length).toBeLessThanOrEqual(5)
      expect(before.phoneBar).toEqual(before.rail)
      expect(before.account.slice(2, 2 + before.personal.length)).toEqual(before.personal)
      for (const feature of NETWORK_FEATURES.filter((key) => !features.includes(key))) {
        expect(menuDifference(menu([...features, feature]), before), `${feature} après ${features.join(",")}`).toEqual([])
      }
    }
  })
})

describe("table des entrées — complète et cohérente", () => {
  it("chaque entrée et chaque format a une icône, et deux icônes ne se confondent pas entre Membres et Communautés", () => {
    expect(Object.keys(MEMBER_MENU_ICONS).sort()).toEqual([...MEMBER_MENU_ENTRY_IDS].sort())
    expect(Object.keys(MEMBER_CREATE_ICONS).sort()).toEqual([...MEMBER_CREATE_FORMATS].sort())
    expect(MEMBER_MENU_ICONS.explore).not.toBe(MEMBER_MENU_ICONS.communities)
  })

  it("chaque libellé existe en français et en anglais dans l'espace diaspora-ga", () => {
    const lookup = (tree: unknown, key: string) => key.split(".").reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], tree)
    const keys = [...Object.values(MEMBER_MENU_ENTRIES).map((rule) => rule.labelKey), ...Object.values(MEMBER_CREATE_RULES).flatMap((rule) => [rule.labelKey, rule.hintKey])]
    for (const key of keys) {
      expect(typeof lookup(DIASPORA_GA_LOCALES.fr, key), `fr ${key}`).toBe("string")
      expect(typeof lookup(DIASPORA_GA_LOCALES.en, key), `en ${key}`).toBe("string")
    }
  })

  it("les modules de Communautés et les modules exigés suivent les clés du moteur", () => {
    expect(MEMBER_COMMUNITY_FEATURES).toEqual(NETWORK_FEATURES.filter((feature) => MEMBER_COMMUNITY_FEATURES.includes(feature)))
    for (const feature of NETWORK_FEATURES) {
      const parent = NETWORK_FEATURE_PARENTS[feature]
      expect(requiredFeatures(feature)).toEqual(parent === null ? [] : [parent, ...requiredFeatures(parent)])
    }
  })

  it("appels, direct et iCom Pro : trois interrupteurs de code ; le direct ouvert le 26/11/2026, les deux autres fermés ; la passerelle consulat.ga n'en est pas un (CH-863 : un module du réseau)", () => {
    expect(MEMBERS_APP_CODE_SWITCHES).toEqual(["calls", "live", "icomPro"])
    expect(MEMBERS_APP_CODE_SWITCH_STATES).toEqual({ calls: "closed", live: "open", icomPro: "closed" })
  })
})

describe("menu des membres — la passerelle « consulat.ga » (CH-863), une sortie vers une autre application, réglée par le module `consulateGateway`", () => {
  const GATEWAY = "consulateGateway" satisfies NetworkFeature
  const ENTRY = { id: "consulate", labelKey: "consulateGateway.entry.label", hintKey: "consulateGateway.entry.hint" }
  const NOBODY: MemberMenuSituation = { icom: false, engineNetwork: false, canPublish: false, status: "en_attente", holdsPageRole: false, holdsAssociation: false, moderator: false }
  const without = (features: readonly NetworkFeature[]) => features.filter((feature) => feature !== GATEWAY)

  it("une liste fermée à une entrée, hors des entrées internes : ni identifiant d'entrée, ni clé de route ; son module, plus aucun interrupteur de code", () => {
    expect(MEMBER_GATEWAY_ENTRIES).toEqual(["consulate"])
    expect(MEMBER_MENU_ENTRY_IDS).not.toContain("consulate")
    expect(Object.keys(MEMBER_MENU_ENTRIES)).not.toContain("consulate")
    expect(MEMBER_GATEWAY_RULES.consulate).toEqual({ labelKey: "consulateGateway.entry.label", hintKey: "consulateGateway.entry.hint", feature: GATEWAY })
    expect(MEMBERS_APP_CODE_SWITCHES as readonly string[]).not.toContain(GATEWAY)
    // Un module sans parent : il s'ouvre seul, et aucun autre ne vit sur lui.
    expect(NETWORK_FEATURE_PARENTS[GATEWAY]).toBeNull()
    expect(requiredFeatures(GATEWAY)).toEqual([])
  })

  it("module fermé (sans décision : l'état de départ du réseau) : absente, quels que soient les autres modules et la situation", () => {
    for (const features of ALL_FEATURE_SETS) {
      for (const situation of [MEMBER, MEMBER_MENU_WIDEST_SITUATION, NOBODY]) expect(memberMenu({ ...situation, openFeatures: without(features) }).gateways, features.join(",")).toEqual([])
    }
  })

  it("module ouvert : offerte à tout membre que la coque accueille, quels que soient les autres modules et la situation", () => {
    for (const features of ALL_FEATURE_SETS) {
      for (const situation of [MEMBER, MEMBER_MENU_WIDEST_SITUATION, NOBODY]) expect(memberMenu({ ...situation, openFeatures: [...without(features), GATEWAY] }).gateways, features.join(",")).toEqual([ENTRY])
    }
  })

  it("aucun interrupteur de code ne l'ouvre ni ne la ferme : seul le module décide", () => {
    const allOpen: MemberCodeSwitchStates = { calls: "open", live: "open", icomPro: "open" }
    const allClosed: MemberCodeSwitchStates = { calls: "closed", live: "closed", icomPro: "closed" }
    expect(memberMenu({ ...MEMBER_MENU_WIDEST_SITUATION, openFeatures: without(NETWORK_FEATURES), codeSwitches: allOpen }).gateways).toEqual([])
    expect(memberMenu({ ...MEMBER_MENU_WIDEST_SITUATION, openFeatures: [GATEWAY], codeSwitches: allClosed }).gateways).toEqual([ENTRY])
  })

  it("la barre (rail et téléphone), le menu du compte, « Informations » et « Créer » ne changent pas, module ouvert ou fermé", () => {
    for (const features of ALL_FEATURE_SETS) {
      const open = memberMenu({ ...MEMBER, openFeatures: [...without(features), GATEWAY] })
      const closed = memberMenu({ ...MEMBER, openFeatures: without(features) })
      const { gateways: openGateways, ...openRest } = open
      const { gateways: closedGateways, ...closedRest } = closed
      expect(openGateways.length - closedGateways.length).toBe(1)
      expect(openRest).toEqual(closedRest)
      expect(open.phoneBar).toEqual(open.rail)
    }
  })

  it("c'est l'ajout de son module, et de lui seul : admin.diaspora.ga le dit sur sa carte, à l'ouverture comme à la fermeture", () => {
    const change = { placement: "gateways", id: "consulate", labelKey: "consulateGateway.entry.label", audience: "everyone" }
    expect(featureMenuAdditions(GATEWAY)).toEqual([change])
    // Même pour le membre le moins doté : la passerelle ne dépend d'aucun public.
    expect(featureMenuAdditions(GATEWAY, NOBODY)).toEqual([change])
    for (const feature of without(NETWORK_FEATURES)) expect(featureMenuAdditions(feature).map((entry) => entry.id), feature).not.toContain("consulate")
    // Quel que soit le reste du réseau : elle est la seule différence entre le menu fermé et le menu ouvert
    // (ce qui paraît à l'ouverture, ce qui disparaît à la fermeture), et le module n'enlève rien.
    for (const features of ALL_FEATURE_SETS) {
      const closed = menu(without(features))
      const open = menu([...without(features), GATEWAY])
      expect(menuDifference(closed, open)).toEqual([change])
      expect(menuDifference(open, closed)).toEqual([])
    }
  })

  it("son icône, son titre de groupe et ses libellés existent, en français et en anglais", () => {
    expect(Object.keys(MEMBER_GATEWAY_ICONS)).toEqual([...MEMBER_GATEWAY_ENTRIES])
    const lookup = (tree: unknown, key: string) => key.split(".").reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], tree)
    for (const key of [MEMBER_GATEWAY_GROUP_LABEL_KEY, MEMBER_GATEWAY_RULES.consulate.labelKey, MEMBER_GATEWAY_RULES.consulate.hintKey]) {
      expect(typeof lookup(DIASPORA_GA_LOCALES.fr, key), `fr ${key}`).toBe("string")
      expect(typeof lookup(DIASPORA_GA_LOCALES.en, key), `en ${key}`).toBe("string")
    }
  })

  it("le module a son nom et sa description d'administration, en français et en anglais, qui nomment l'entrée et disent que rien n'est transmis", () => {
    const lookup = (tree: unknown, key: string) => key.split(".").reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], tree)
    expect(lookup(DIASPORA_GA_LOCALES.fr, `networkFeatures.names.${GATEWAY}`)).toBe("Démarches consulaires (consulat.ga)")
    expect(lookup(DIASPORA_GA_LOCALES.en, `networkFeatures.names.${GATEWAY}`)).toBe("Consular procedures (consulat.ga)")
    const fr = String(lookup(DIASPORA_GA_LOCALES.fr, `networkFeatures.descriptions.${GATEWAY}`))
    const en = String(lookup(DIASPORA_GA_LOCALES.en, `networkFeatures.descriptions.${GATEWAY}`))
    for (const text of [fr, en]) expect(text).toContain("consulat.ga")
    expect(fr).toContain("Démarches administratives")
    expect(fr).toMatch(/même onglet/)
    expect(fr).toMatch(/ne (lui )?transmet rien|rien n.est transmis/)
    expect(en).toContain("Administrative procedures")
    expect(en).toMatch(/same tab/)
    expect(en).toMatch(/nothing is (sent|passed)|sends (it )?nothing/)
  })
})

// @vitest-environment node
import { engineResources } from "@antsia/social-features/i18n"
import { describe, expect, it } from "vitest"

import { composeEngineOverrides, DIASPORA_GA_ENGINE_RESOURCES, ENGINE_OVERRIDES } from "./engine-overrides"
import { createAppI18n } from "./index"

/**
 * Le « live » de DIASPORA.GA (décision du propriétaire du 26/11/2026) : les surfaces du moteur
 * (création d'un live, page du live, carte flottante, lecteur des actus, refus du serveur) lisent
 * leurs textes dans l'instance i18next de l'application, qui reçoit les espaces du moteur
 * recomposés. Ces cas prouvent que la surcharge est APPLIQUÉE, qu'elle ne touche que des clés du
 * moteur, et qu'aucune « conférence » ne reste visible dans ce que le live affiche.
 */
type Tree = { readonly [key: string]: string | Tree }

function flatten(tree: Tree, prefix = ""): Map<string, string> {
  const out = new Map<string, string>()
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (typeof value === "string") out.set(path, value)
    else for (const [nested, text] of flatten(value, path)) out.set(nested, text)
  }
  return out
}

const variables = (text: string) => [...text.matchAll(/\{\{\s*(\w+)\s*(?:,[^}]*)?\}\}/g)].map((match) => match[1]).sort()

const FR = flatten(ENGINE_OVERRIDES.fr as Tree)
const EN = flatten(ENGINE_OVERRIDES.en as Tree)

/** Ce que le live affiche : tout le direct et les actus, puis les phrases du direct des autres espaces. */
function liveTexts(locale: "fr" | "en"): Map<string, string> {
  const composed = DIASPORA_GA_ENGINE_RESOURCES[locale] as Record<string, Tree>
  const all = new Map<string, string>()
  for (const namespace of ["direct", "stories"]) for (const [key, text] of flatten(composed[namespace]!, namespace)) all.set(key, text)
  for (const [key, text] of flatten(composed.rules!, "rules")) if (key.startsWith("rules.LIVE_")) all.set(key, text)
  for (const prefix of ["errors.liveRoleRequired", "reseau.shared.notification.live", "reseau.shared.resolution.live", "reseau.creationController.entries.conference", "reseau.reseauAgentNav.tabs.conferences", "iappel.conferenceHint", "messagerie.groupCallInviteePicker.convoke"]) {
    const namespace = prefix.split(".")[0]!
    for (const [key, text] of flatten(composed[namespace]!, namespace)) if (key.startsWith(prefix)) all.set(key, text)
  }
  return all
}

describe("textes du moteur — le « live » de DIASPORA", () => {
  it("l'instance de l'application sert le live aux surfaces du moteur, en français et en anglais", () => {
    const fr = createAppI18n({ locale: "fr" })
    const direct = fr.getFixedT("fr", "direct")
    expect(direct("create.title")).toBe("Lancer un live")
    expect(direct("create.submit")).toBe("Préparer le live")
    expect(direct("end")).toBe("Terminer le live")
    expect(direct("cancel")).toBe("Annuler le live")
    expect(direct("start")).toBe("Passer en direct")
    expect(direct("status.live")).toBe("En direct")
    // Une clé que DIASPORA.GA ne surcharge pas reste celle du moteur.
    expect(direct("close")).toBe(engineResources.fr.direct.close)
    expect(fr.getFixedT("fr", "rules")("LIVE_ENDED")).toBe("Ce live est terminé.")
    // Le nom de l'hôte passe par le format d'élision de l'application.
    expect(fr.getFixedT("fr", "stories")("storiesViewer.label.direct", { host: "Awa", title: "Soirée" })).toBe("Live d’Awa : Soirée")
    expect(fr.getFixedT("fr", "stories")("storiesViewer.label.direct", { host: "Jean", title: "Soirée" })).toBe("Live de Jean : Soirée")

    const en = createAppI18n({ locale: "en" }).getFixedT("en", "direct")
    expect(en("create.title")).toBe("Go live")
    expect(en("end")).toBe("End live")
    expect(en("close")).toBe(engineResources.en.direct.close)
  })

  it("l'espace de l'application et ceux du moteur non surchargés restent intacts", () => {
    const i18n = createAppI18n({ locale: "fr" })
    expect(i18n.getFixedT("fr", "diaspora-ga")("live.title")).toBe("Live")
    expect(i18n.getFixedT("fr", "social")).toBeTypeOf("function")
    expect(DIASPORA_GA_ENGINE_RESOURCES.fr).not.toHaveProperty("social")
  })

  it("aucune « conférence » ne reste dans ce que le live affiche", () => {
    const fr = [...liveTexts("fr")].filter(([, text]) => /conf[ée]rence/i.test(text))
    const en = [...liveTexts("en")].filter(([, text]) => /conference/i.test(text))
    expect(fr.map(([key]) => key)).toEqual([])
    expect(en.map(([key]) => key)).toEqual([])
    expect(liveTexts("fr").size).toBeGreaterThan(200)
  })

  it("les deux langues surchargent les mêmes clés, avec les mêmes variables", () => {
    expect([...FR.keys()].sort()).toEqual([...EN.keys()].sort())
    const mismatches = [...FR].filter(([key, text]) => variables(text).join() !== variables(EN.get(key) ?? "").join())
    expect(mismatches.map(([key]) => key)).toEqual([])
  })

  it("français : une espace insécable avant « : ; ? ! », dans les guillemets et devant le tiret", () => {
    expect([...FR].filter(([, text]) => / [:;?!»]|« | — /.test(text)).map(([key]) => key)).toEqual([])
  })

  it("la composition est stricte : clé ou espace inconnu du moteur, phrase à la place d'un groupe", () => {
    const engine = { direct: { create: { title: "Créer" }, close: "Fermer" } }
    expect(composeEngineOverrides(engine, { direct: { create: { title: "Lancer" } } })).toEqual({ direct: { create: { title: "Lancer" }, close: "Fermer" } })
    expect(() => composeEngineOverrides(engine, { direct: { inconnue: "x" } })).toThrow(/direct\.inconnue/)
    expect(() => composeEngineOverrides(engine, { absent: { close: "x" } })).toThrow(/absent/)
    expect(() => composeEngineOverrides(engine, { direct: { create: "x" } })).toThrow(/direct\.create/)
    // Le moteur n'est jamais modifié par la composition.
    expect(engine.direct.create.title).toBe("Créer")
  })
})

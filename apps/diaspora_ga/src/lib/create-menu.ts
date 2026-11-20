/**
 * Le menu « Créer » de la coque, comme celui du réseau de l'administration
 * (`creation-controller`) : chaque format dit en une ligne ce qu'il crée, et n'apparaît
 * que s'il est ouvert à ce membre. « Publier » garde son bouton à part, à la même place
 * sur chaque écran ; le menu porte les autres gestes de création.
 * PROPRIÉTAIRE : chantier « coque ». Règle pure, clés de texte en toutes lettres.
 */
import type { MembershipStatus } from "@diaspora-ga/domain"

import { canSeeRegistration } from "./page-registration"
import { routes } from "./routes"

export type CreateFormatId = "story" | "association" | "company"

export interface CreateFormat {
  readonly id: CreateFormatId
  readonly href: string
  readonly labelKey: string
  readonly hintKey: string
}

export interface CreateMenuInput {
  /** Le membre peut publier (adhésion `declaree` ou `verifiee`, ni suspendue ni quittée). */
  readonly canPublish: boolean
  /** Les actus sont servies : le moteur est branché et iCom ouvert pour ce membre. */
  readonly stories: boolean
  readonly status: MembershipStatus
}

/**
 * Les formats offerts, dans l'ordre : une actu, puis l'inscription d'une association et
 * d'une entreprise (AS-05). Les groupes thématiques n'y sont pas : leur création attend la
 * règle du pilote (décision 3 du plan 07), et les directs restent fermés.
 */
export function createFormats(input: CreateMenuInput): readonly CreateFormat[] {
  const formats: CreateFormat[] = []
  if (input.canPublish && input.stories) {
    formats.push({ id: "story", href: routes.newStory(), labelKey: "nav.create.story", hintKey: "nav.create.storyHint" })
  }
  if (canSeeRegistration(input.status)) {
    formats.push(
      { id: "association", href: routes.newPage("association"), labelKey: "nav.create.association", hintKey: "nav.create.associationHint" },
      { id: "company", href: routes.newPage("company"), labelKey: "nav.create.company", hintKey: "nav.create.companyHint" },
    )
  }
  return formats
}

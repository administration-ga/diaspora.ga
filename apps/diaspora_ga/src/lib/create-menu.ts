/**
 * Le menu « Créer » de la coque, comme celui du réseau de l'administration
 * (`creation-controller`) : chaque format dit en une ligne ce qu'il crée, et n'apparaît
 * que s'il est ouvert à ce membre. « Publier » garde son bouton à part, à la même place
 * sur chaque écran ; le menu porte les autres gestes de création.
 *
 * La règle vit dans le menu des membres partagé (`@diaspora-ga/features/navigation`,
 * fiche CH-815 § 5) : une actu, une conférence quand le direct est ouvert par le code (CH-817),
 * puis l'inscription d'une association et d'une entreprise quand les pages sont ouvertes
 * (ADR-0041 du moteur). Ici, les adresses seulement : la conférence n'en a pas, elle ouvre en
 * place la création du direct du moteur.
 * PROPRIÉTAIRE : chantier « coque ».
 */
import type { MembershipStatus } from "@diaspora-ga/domain"
import { memberMenu, type MemberCodeSwitchStates, type MemberCreateEntry, type MemberCreateFormatId } from "@diaspora-ga/features/navigation"

import { memberCreateHref } from "./member-menu"

export type CreateFormatId = MemberCreateFormatId

export interface CreateFormat {
  readonly id: CreateFormatId
  /** L'adresse du format ; `null` pour la conférence, qui ouvre en place la création du direct du moteur. */
  readonly href: string | null
  readonly labelKey: string
  readonly hintKey: string
}

export interface CreateMenuInput {
  /** Le membre peut publier (adhésion `declaree` ou `verifiee`, ni suspendue ni quittée). */
  readonly canPublish: boolean
  /** Les actus sont servies : le moteur est branché et iCom ouvert pour ce membre. */
  readonly stories: boolean
  readonly status: MembershipStatus
  /** ADR-0041 du moteur : les associations et entreprises sont ouvertes sur le réseau. */
  readonly pages: boolean
  /** Les interrupteurs de code (absents : ceux du dépôt) ; seuls les tests en posent d'autres. */
  readonly codeSwitches?: MemberCodeSwitchStates
}

/** Un format du menu partagé, avec son adresse. */
export function createFormatOf(entry: MemberCreateEntry): CreateFormat {
  return { id: entry.id, href: memberCreateHref(entry), labelKey: entry.labelKey, hintKey: entry.hintKey }
}

/** Les formats offerts, dans l'ordre, d'après les seuls faits qui les décident. */
export function createFormats(input: CreateMenuInput): readonly CreateFormat[] {
  return memberMenu({
    icom: input.stories,
    canPublish: input.canPublish,
    status: input.status,
    openFeatures: input.pages ? ["pages"] : [],
    // Sans effet sur « Créer » : la règle partagée ne les lit que pour la barre et le menu du compte.
    engineNetwork: false,
    holdsPageRole: false,
    holdsAssociation: false,
    moderator: false,
    ...(input.codeSwitches === undefined ? {} : { codeSwitches: input.codeSwitches }),
  }).create.map(createFormatOf)
}

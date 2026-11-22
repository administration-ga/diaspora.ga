/**
 * Les onglets de la gestion d'une page (`/pages/<handle>/gerer?onglet=…`) qu'une page OFFRE —
 * module PUR, la seule règle de l'application (CH-816, lot P0).
 *
 * Elle sert les onglets de la gestion et tout lien qui mène à l'un d'eux (« Mes pages », les
 * premiers gestes d'une page inscrite) : un lien vers un onglet qui n'est pas offert ne se rend
 * pas. Un module fermé (ADR-0041 du moteur) n'offre ni onglet ni lien ; une page qui ne porte pas
 * une activité (une institution ne propose pas de services) non plus. Le rôle de la personne
 * (modérateur, AS-10) reste jugé par l'écran.
 */
import { isJobEmployerOwnerKind, isServiceProviderOwnerKind, type PageOwnerKind } from "@diaspora-ga/domain"

export const PAGE_MANAGE_TABS = ["publications", "services", "demandes", "avis", "emplois", "identite", "equipe", "revendications", "decisions"] as const
export type PageManageTab = (typeof PAGE_MANAGE_TABS)[number]

/** Ce que le réseau et le fournisseur servent ; une valeur absente : non servie. */
export interface PageManageServed {
  /** Le module des services est ouvert sur le réseau : services, demandes reçues et avis. */
  readonly servicesOpen?: boolean
  /** Le fournisseur sert les avis d'une page. */
  readonly reviews?: boolean
  /** Le fournisseur sert les emplois (module de l'emploi ouvert). */
  readonly jobs?: boolean
  /** Le fournisseur sert les décisions de modération d'une page (P16 · G9). */
  readonly decisions?: boolean
}

/** Cet onglet est-il offert par une page de cette nature, compte tenu de ce qui est servi ? */
export function pageManageTabOffered(tab: PageManageTab, ownerKind: PageOwnerKind, served: PageManageServed): boolean {
  switch (tab) {
    case "services":
    case "demandes":
      return served.servicesOpen === true && isServiceProviderOwnerKind(ownerKind)
    case "avis":
      return served.servicesOpen === true && served.reviews === true && isServiceProviderOwnerKind(ownerKind)
    case "emplois":
      // DG-025 : le recrutement de CETTE page, quand elle peut recruter.
      return served.jobs === true && isJobEmployerOwnerKind(ownerKind)
    case "decisions":
      return served.decisions === true
    default:
      return true
  }
}

/** Les onglets offerts, dans l'ordre de la gestion. */
export function offeredManageTabs(ownerKind: PageOwnerKind, served: PageManageServed): readonly PageManageTab[] {
  return PAGE_MANAGE_TABS.filter((tab) => pageManageTabOffered(tab, ownerKind, served))
}

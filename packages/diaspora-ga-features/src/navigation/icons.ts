/**
 * Les icônes du menu des membres (lucide-react) : la coque de diaspora.ga et l'aperçu
 * d'admin.diaspora.ga lisent la même table, l'aperçu montre donc les mêmes signes.
 * Des personnes pour « Membres », la Terre pour « Communautés » : les deux ne se confondent jamais.
 */
import {
  BookmarkIcon,
  BookTextIcon,
  BriefcaseBusinessIcon,
  Building2Icon,
  CameraIcon,
  ClipboardListIcon,
  ContactRoundIcon,
  DatabaseIcon,
  EarthIcon,
  FileTextIcon,
  GraduationCapIcon,
  HandshakeIcon,
  HeartHandshakeIcon,
  HouseIcon,
  InfoIcon,
  LockKeyholeIcon,
  MessageCircleIcon,
  PaletteIcon,
  RadioIcon,
  ScaleIcon,
  ScrollTextIcon,
  Settings2Icon,
  ShieldCheckIcon,
  StoreIcon,
  UserRoundCheckIcon,
  UserRoundIcon,
  UsersRoundIcon,
  type LucideIcon,
} from "lucide-react"

import type { MemberCreateFormatId, MemberMenuEntryId } from "./member-menu"

export const MEMBER_MENU_ICONS: Readonly<Record<MemberMenuEntryId, LucideIcon>> = {
  feed: HouseIcon,
  explore: UsersRoundIcon,
  services: StoreIcon,
  communities: EarthIcon,
  messages: MessageCircleIcon,
  profile: UserRoundIcon,
  settings: Settings2Icon,
  myRequests: ClipboardListIcon,
  myActivity: BriefcaseBusinessIcon,
  myAssociations: HeartHandshakeIcon,
  myApplications: FileTextIcon,
  myMentoring: GraduationCapIcon,
  relations: UserRoundCheckIcon,
  bookmarks: BookmarkIcon,
  sponsor: HandshakeIcon,
  moderation: ShieldCheckIcon,
  myData: DatabaseIcon,
  legalNotice: ScaleIcon,
  privacy: LockKeyholeIcon,
  terms: ScrollTextIcon,
  communityRules: BookTextIcon,
  contact: ContactRoundIcon,
  charte: PaletteIcon,
}

/**
 * Le groupe « Informations » du menu du compte (les textes du site, le contact, la charte) tient
 * en UNE entrée : un sous-menu au bureau, un volet replié dans la feuille du téléphone.
 */
export const MEMBER_INFORMATION_ICON: LucideIcon = InfoIcon

export const MEMBER_CREATE_ICONS: Readonly<Record<MemberCreateFormatId, LucideIcon>> = {
  story: CameraIcon,
  // Le live : l'antenne qui émet (lucide `Radio`), la même au menu « Créer », dans la carte
  // « Quoi de neuf ? » du fil et dans le composeur ; la caméra vidéo y serait confondue avec « Vidéo ».
  live: RadioIcon,
  association: UsersRoundIcon,
  company: Building2Icon,
}

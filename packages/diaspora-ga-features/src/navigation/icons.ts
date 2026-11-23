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
  LockKeyholeIcon,
  MessageCircleIcon,
  PaletteIcon,
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

export const MEMBER_CREATE_ICONS: Readonly<Record<MemberCreateFormatId, LucideIcon>> = {
  story: CameraIcon,
  association: UsersRoundIcon,
  company: Building2Icon,
}

/**
 * `@diaspora-ga/features/navigation` — le menu des membres, en règle pure (fiche CH-815, § 5) :
 * la coque de diaspora.ga et l'aperçu d'admin.diaspora.ga lisent la même fonction ; l'adresse du
 * bureau de modération, que les deux applications citent (lot A7).
 */
export {
  audienceReached,
  canSeeRegistration,
  codeSwitchAllows,
  featureMenuAdditions,
  MEMBER_ACCOUNT_ENTRIES,
  MEMBER_BAR_ENTRIES,
  MEMBER_COMMUNITY_FEATURES,
  MEMBER_CREATE_FORMATS,
  MEMBER_CREATE_RULES,
  MEMBER_DATA_ENTRY,
  MEMBER_INFORMATION_ENTRIES,
  MEMBER_MENU_AUDIENCES,
  MEMBER_MENU_ENTRIES,
  MEMBER_MENU_ENTRY_IDS,
  MEMBER_MENU_PLACEMENTS,
  MEMBER_MENU_WIDEST_SITUATION,
  MEMBER_PERSONAL_ENTRIES,
  MEMBER_RESPONSIBLE_ENTRIES,
  memberMenu,
  menuDifference,
  REGISTERING_STATUSES,
  requiredFeatures,
  type MemberBarEntryId,
  type MemberCodeSwitchStates,
  type MemberCreateEntry,
  type MemberCreateFormatId,
  type MemberCreateFormatRule,
  type MemberMenu,
  type MemberMenuAudience,
  type MemberMenuChange,
  type MemberMenuEntry,
  type MemberMenuEntryId,
  type MemberMenuEntryRule,
  type MemberMenuInput,
  type MemberMenuPlacement,
  type MemberMenuRouteKey,
  type MemberMenuSituation,
} from "./member-menu"
export { MEMBER_CREATE_ICONS, MEMBER_MENU_ICONS } from "./icons"
export { MEMBERS_APP_CODE_SWITCH_STATES, MEMBERS_APP_CODE_SWITCHES, type CodeSwitchState, type MembersAppCodeSwitch } from "./code-switches"
export { MODERATION_DESK_TABS, moderationDeskPath, type ModerationDeskTab } from "./moderation-desk"

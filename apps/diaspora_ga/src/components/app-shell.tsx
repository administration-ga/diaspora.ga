"use client"

import { MessagerieDock } from "@antsia/social-features/messagerie"
import { MESSAGES_UNREAD_CAP } from "@antsia/social-features/shell/reseau-menu-destinations"
import { useIsReseauMobile } from "@antsia/ui/overlay"
import { parseResidenceCountry, type AssociationMembershipStatus, type CountryCode, type MembershipStatus } from "@diaspora-ga/domain"
import {
  Avatar,
  Button,
  CountryTag,
  NotificationBell,
  Skeleton,
  PostComposerSheet,
  PostShareProvider,
  Sheet,
  SheetContent,
  SheetTrigger,
  TrustBadges,
  cn,
  countryName,
} from "@diaspora-ga/features"
import {
  useAssociations,
  useDataSource,
  useFeatureGate,
  useModerationDesk,
  useOpenCountries,
  usePageAdmin,
  usePilotMetrics,
  type AssociationListPage,
  type AssociationsCapability,
  type FeatureGate,
  type Loadable,
  type MembershipView,
  type ModerationDeskCapability,
  type PageAdminCapability,
  type PilotMetricsCapability,
  type PostView,
} from "@diaspora-ga/features/data"
import { useDiasporaGaT } from "@diaspora-ga/features/i18n/client"
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  BookmarkIcon,
  BookTextIcon,
  BriefcaseBusinessIcon,
  Building2Icon,
  CameraIcon,
  ChartColumnIcon,
  ChevronsUpDownIcon,
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
  LogOutIcon,
  MessageCircleIcon,
  PaletteIcon,
  PenSquareIcon,
  PlusIcon,
  ScaleIcon,
  ScrollTextIcon,
  Settings2Icon,
  ShieldCheckIcon,
  StoreIcon,
  UserRoundCheckIcon,
  UserRoundIcon,
  UsersRoundIcon,
  XIcon,
  type LucideIcon,
} from "lucide-react"
import NextLink from "next/link"
import { usePathname } from "next/navigation"
import { DropdownMenu, Popover } from "radix-ui"
import { createContext, Suspense, useContext, useEffect, useId, useState, type ReactNode } from "react"
import { toast } from "sonner"

import { createFormats, type CreateFormat, type CreateFormatId } from "@/lib/create-menu"
import { navDestinationOf, type NavDestination } from "@/lib/nav-destinations"
import { communitiesOffered, featureOfPath, hrefServed } from "@/lib/network-features"
import { routes } from "@/lib/routes"

import { IcomIsland, useEngineNetwork, useIcomNetwork } from "./icom"
import { MessagesUnreadReader } from "./messages-unread"
import { NetworkStatusNotice } from "./network-status"
import { useSignOutEverywhere } from "./sign-out-settings"
import { AppDemoChip } from "./site-chrome"
import { Wordmark } from "./wordmark"

interface ComposerControl {
  readonly open: () => void
  readonly canPublish: boolean
}

const ComposerContext = createContext<ComposerControl>({ open: () => {}, canPublish: false })

/** Ouvre le composeur de la coque depuis un écran (« Quoi de neuf ? »). */
export function useComposer(): ComposerControl {
  return useContext(ComposerContext)
}

// ═══════════════════════════════════════════════════════════════
// Arborescence (DG-005, menu léger CH-816) — une barre de cinq entrées au plus, le menu du compte
// ═══════════════════════════════════════════════════════════════

/**
 * Les entrées : celles de la table des destinations (`lib/nav-destinations`), sous lesquelles
 * chaque page de membre se range, puis l'ancre « Mes données » et les textes du site.
 */
type EntryId = NavDestination | "myData" | "legalNotice" | "privacy" | "terms" | "communityRules" | "contact" | "charte"

/** Une entrée de navigation : une adresse de la table des routes, son icône, sa clé de libellé, son état courant. */
interface NavEntry {
  readonly id: EntryId
  readonly href: string
  readonly icon: LucideIcon
  readonly labelKey: string
  /** Le chemin courant relève de cette entrée : `aria-current="page"`. */
  readonly active: boolean
  /** Les non-lus portés par l'entrée (Messages seulement, UX-06) : pastille plafonnée, nombre dans le nom accessible. */
  readonly unread?: number
}

type ShellT = ReturnType<typeof useDiasporaGaT>["t"]

/**
 * Le nom accessible d'une entrée qui porte des non-lus : « Messages, 3 non lus », « … 99 non lus ou
 * plus » au plafond. La pastille n'est pas le seul signal : le nombre s'entend avec l'entrée. Sans
 * non-lus, le libellé visible reste le nom.
 */
function unreadName(t: ShellT, entry: NavEntry): string | undefined {
  const unread = entry.unread ?? 0
  if (unread <= 0) return undefined
  return unread >= MESSAGES_UNREAD_CAP ? t("nav.messagesUnreadCapped", { count: MESSAGES_UNREAD_CAP }) : t("nav.messagesUnread", { count: unread })
}

/** La pastille : le chiffre plafonné (« 99+ », même plafond que la carte iCom), muet pour les lecteurs d'écran. */
function UnreadBadge(props: { count: number; className?: string }) {
  return (
    <span
      aria-hidden
      data-unread-badge=""
      className={cn("min-w-5 rounded-full bg-primary px-1 text-center text-[11px] font-semibold leading-5 tabular-nums text-primary-foreground", props.className)}
    >
      {props.count >= MESSAGES_UNREAD_CAP ? `${MESSAGES_UNREAD_CAP}+` : props.count}
    </span>
  )
}

/** Le chemin d'une adresse de la table, sans requête ni ancre. */
function pathOf(href: string): string {
  const end = href.search(/[?#]/)
  return end === -1 ? href : href.slice(0, end)
}

/** La rubrique d'une adresse : son premier segment (« /pays/fr » → « /pays »). */
function sectionOf(href: string): string {
  const path = pathOf(href)
  const next = path.indexOf("/", 1)
  return next === -1 ? path : path.slice(0, next)
}

/** Le chemin relève-t-il de la rubrique d'une de ces adresses ? `/services` couvre `/services/…`, jamais `/servicesx`. */
function withinAny(pathname: string, hrefs: readonly string[]): boolean {
  return hrefs.some((href) => {
    const section = sectionOf(href)
    return pathname === section || pathname.startsWith(`${section}/`)
  })
}

/**
 * ADR-0041 du moteur : une entrée qui mène à un module fermé sur le réseau n'est pas offerte
 * (sa fonctionnalité se lit dans la table des adresses, comme pour la garde des pages).
 */
function served(gate: FeatureGate): (entry: NavEntry) => boolean {
  return (entry) => hrefServed(gate, entry.href)
}

/**
 * La barre, cinq entrées au plus, dans cet ordre : Fil, Membres, Services, Communautés, Messages
 * (menu léger, CH-816 lot P1). Fil et Membres toujours (Membres est la destination `explore`,
 * servie à `/explorer`) ; Services quand son module est ouvert (filtre `served`) ; Communautés
 * quand un module rangé sous elle est ouvert (`communitiesOffered`), son pays restant joignable
 * par « Mon pays » ; Messages avec iCom (même règle qu'avant). Une entrée absente ne laisse pas
 * de trou. Ce qui relève de chacune ne s'écrit pas ici : la table des destinations le dit pour
 * toute adresse de la table des routes (UX-05, décision 5). Messages porte ses non-lus (UX-06),
 * lus seulement quand iCom est ouvert.
 */
function primaryEntries(current: NavDestination | null, offer: { readonly communities: boolean; readonly messages: boolean }, messagesUnread: number): NavEntry[] {
  const entries: NavEntry[] = [
    { id: "feed", href: routes.feed(), icon: HouseIcon, labelKey: "nav.feed", active: current === "feed" },
    // Des personnes pour « Membres », la Terre pour « Communautés » : les deux icônes ne se confondent jamais.
    { id: "explore", href: routes.explore(), icon: UsersRoundIcon, labelKey: "nav.members", active: current === "explore" },
    { id: "services", href: routes.services(), icon: StoreIcon, labelKey: "nav.services", active: current === "services" },
  ]
  if (offer.communities) {
    entries.push({ id: "communities", href: routes.communities(), icon: EarthIcon, labelKey: "nav.communities", active: current === "communities" })
  }
  if (offer.messages) {
    entries.push({ id: "messages", href: routes.messages(), icon: MessageCircleIcon, labelKey: "nav.messages", active: current === "messages", unread: messagesUnread })
  }
  return entries
}

/**
 * Les entrées personnelles, dans le menu du compte seulement (le rail du bureau ne les porte plus,
 * CH-816) : une entrée n'y paraît qu'avec un contenu. « Mes pages » et « Mes associations »
 * attendent la lecture qui le prouve ; les entrées d'un module (demandes, candidatures, mentorats)
 * suivent son ouverture (filtre `served`) ; relations (réseau du moteur), enregistrements et
 * parrainage restent toujours.
 */
function personalEntries(current: NavDestination | null, holds: { readonly relations: boolean; readonly pages: boolean; readonly associations: boolean }): NavEntry[] {
  const relations: NavEntry[] = holds.relations
    ? [{ id: "relations", href: routes.relations(), icon: UserRoundCheckIcon, labelKey: "nav.relations", active: current === "relations" }]
    : []
  const pages: NavEntry[] = holds.pages
    ? [{ id: "myActivity", href: routes.myActivity(), icon: BriefcaseBusinessIcon, labelKey: "nav.myActivity", active: current === "myActivity" }]
    : []
  const associations: NavEntry[] = holds.associations
    ? [{ id: "myAssociations", href: routes.myAssociations(), icon: HeartHandshakeIcon, labelKey: "nav.myAssociations", active: current === "myAssociations" }]
    : []
  return [
    { id: "myRequests", href: routes.myServiceRequests(), icon: ClipboardListIcon, labelKey: "nav.myRequests", active: current === "myRequests" },
    ...pages,
    ...associations,
    // Vague H du plan global : candidatures (DG-025) et mentorat (DG-024).
    { id: "myApplications", href: routes.myApplications(), icon: FileTextIcon, labelKey: "nav.myApplications", active: current === "myApplications" },
    { id: "myMentoring", href: routes.myMentoring(), icon: GraduationCapIcon, labelKey: "nav.myMentoring", active: current === "myMentoring" },
    ...relations,
    { id: "bookmarks", href: routes.bookmarks(), icon: BookmarkIcon, labelKey: "bookmarks.title", active: current === "bookmarks" },
    { id: "sponsor", href: routes.sponsor(), icon: HandshakeIcon, labelKey: "nav.sponsor", active: current === "sponsor" },
  ]
}

/**
 * Sans capacité servie, aucune entrée réservée : ces lectures constantes (sans hook) remplacent la
 * capacité absente et gardent l'ordre des hooks, la source de données ne changeant pas d'un rendu à l'autre.
 */
const NO_MODERATION_DESK: Pick<ModerationDeskCapability, "useDesk"> = { useDesk: () => ({ status: "ready", data: null }) }
const NO_PILOT_METRICS: Pick<PilotMetricsCapability, "useAccess"> = { useAccess: () => ({ status: "ready", data: { allowed: false } }) }

/**
 * Même règle pour les entrées personnelles qui attendent un contenu : sans capacité (module des
 * pages fermé, fournisseur qui ne la sert pas), une lecture constante qui ne prouve rien.
 */
const NOTHING_HELD: Loadable<readonly never[]> = { status: "ready", data: [] }
const NO_ASSOCIATION_ITEMS: Loadable<AssociationListPage<never>> = { status: "ready", data: { items: [], continueCursor: null, isDone: true } }
const NO_PAGE_ADMIN: Pick<PageAdminCapability, "useMyPages" | "useMyTeamPages" | "management"> = { useMyPages: () => NOTHING_HELD }
const NO_ASSOCIATIONS: Pick<AssociationsCapability, "useMyAssociations"> = { useMyAssociations: () => NO_ASSOCIATION_ITEMS }
/** La première fenêtre de « Mes associations », la plus récemment changée : une constante, lue telle quelle à chaque rendu. */
const FIRST_ASSOCIATIONS_WINDOW = { cursor: null } as const

/** Une lecture prête qui montre au moins un élément ; en cours, refusée ou vide : rien n'est affirmé. */
function holdsAny(read: Loadable<readonly unknown[]>): boolean {
  return read.status === "ready" && read.data.length > 0
}

/**
 * « Mes pages » : au moins une page où je tiens un rôle vivant — l'équipe entière, modérateur
 * compris, quand le fournisseur la sert (sinon les pages où je parle), et mes pages en sommeil,
 * qui restent les miennes et ne se lisent plus que là. Tant qu'aucune lecture ne l'a prouvé,
 * l'entrée ne paraît pas (aucun clignement). La source ne change pas pendant la vie de l'arbre
 * (un changement des modules ouverts le remonte) : les appels facultatifs sont stables.
 */
function useHoldsPageRole(): boolean {
  const pageAdmin = usePageAdmin() ?? NO_PAGE_ADMIN
  const team: Loadable<readonly unknown[]> = pageAdmin.useMyTeamPages ? pageAdmin.useMyTeamPages() : pageAdmin.useMyPages()
  const sleeping: Loadable<readonly unknown[]> = pageAdmin.management?.useMySleepingPages?.() ?? NOTHING_HELD
  return holdsAny(team) || holdsAny(sleeping)
}

/** Une adhésion vivante, ou une demande qui attend sa réponse ; un refus, un départ ou une exclusion seuls n'ouvrent rien. */
const ASSOCIATION_HELD: ReadonlySet<AssociationMembershipStatus> = new Set<AssociationMembershipStatus>(["requested", "accepted"])

/** « Mes associations » : au moins une adhésion ou une demande en cours dans la première fenêtre de la liste. */
function useHoldsAssociation(): boolean {
  const mine = (useAssociations() ?? NO_ASSOCIATIONS).useMyAssociations(FIRST_ASSOCIATIONS_WINDOW)
  return mine.status === "ready" && mine.data.items.some((item) => ASSOCIATION_HELD.has(item.status))
}

/**
 * Les entrées réservées aux responsables que le serveur reconnaît (modération par pays, mesure du
 * pilote) : absentes pour tout autre membre, et le serveur rejuge chaque lecture derrière elles.
 */
function responsibleEntries(current: NavDestination | null, access: { readonly moderation: boolean; readonly pilot: boolean }): NavEntry[] {
  const entries: NavEntry[] = []
  if (access.moderation) {
    entries.push({ id: "moderation", href: routes.moderationDesk(), icon: ShieldCheckIcon, labelKey: "nav.moderation", active: current === "moderation" })
  }
  if (access.pilot) {
    entries.push({ id: "pilot", href: routes.pilotDashboard(), icon: ChartColumnIcon, labelKey: "pilotMetrics.nav", active: current === "pilot" })
  }
  return entries
}

/** Le menu du compte, ouvert depuis l'avatar : profil, réglages, les entrées personnelles et réservées, mes données. */
function accountEntries(membership: MembershipView, current: NavDestination | null, personal: readonly NavEntry[]): NavEntry[] {
  return [
    { id: "profile", href: routes.profile(membership.handle), icon: UserRoundIcon, labelKey: "nav.profile", active: current === "profile" },
    { id: "settings", href: routes.settings(), icon: Settings2Icon, labelKey: "nav.settings", active: current === "settings" },
    ...personal,
    // Une ancre des réglages : le chemin seul ne la distingue pas, elle n'est donc jamais « courante ».
    { id: "myData", href: routes.settingsData(), icon: DatabaseIcon, labelKey: "nav.myData", active: false },
  ]
}

/**
 * Le groupe « Informations » du menu du compte (UX-03) : les textes du site, à deux gestes
 * depuis tout écran une fois connecté — ils n'étaient qu'au pied des pages publiques.
 * Mêmes libellés que ce pied de page, dont les trois textes de LX-05 (conditions d'utilisation,
 * règles de la communauté, contact). L'aide s'y ajoutera avec UX-04.
 */
function informationEntries(pathname: string): NavEntry[] {
  return [
    { id: "legalNotice", href: routes.legalNotice(), icon: ScaleIcon, labelKey: "footer.legalNotice", active: withinAny(pathname, [routes.legalNotice()]) },
    { id: "privacy", href: routes.privacy(), icon: LockKeyholeIcon, labelKey: "footer.privacy", active: withinAny(pathname, [routes.privacy()]) },
    { id: "terms", href: routes.terms(), icon: ScrollTextIcon, labelKey: "footer.terms", active: withinAny(pathname, [routes.terms()]) },
    { id: "communityRules", href: routes.communityRules(), icon: BookTextIcon, labelKey: "footer.community", active: withinAny(pathname, [routes.communityRules()]) },
    { id: "contact", href: routes.contact(), icon: ContactRoundIcon, labelKey: "footer.contact", active: withinAny(pathname, [routes.contact()]) },
    { id: "charte", href: routes.charte(), icon: PaletteIcon, labelKey: "footer.charte", active: withinAny(pathname, [routes.charte()]) },
  ]
}

/**
 * Le pays CONSULTÉ, quand il n'est pas celui de résidence : le hub d'un autre pays
 * (`/pays/<iso>`). Consulter une zone ne réécrit jamais la résidence (plan G1, point 5).
 */
function exploredZone(pathname: string, home: CountryCode): CountryCode | null {
  const base = `${sectionOf(routes.hub(home))}/`
  if (!pathname.startsWith(base)) return null
  const parsed = parseResidenceCountry(pathname.slice(base.length).split("/", 1)[0])
  return parsed.ok && parsed.value !== home ? parsed.value : null
}

interface PublishRefusal {
  /** La raison courte, annoncée avec le bouton (`aria-describedby`). */
  readonly hintKey: string
  readonly titleKey: string
  readonly bodyKey: string
  /** Les chemins qui rouvrent la publication — les adresses de la carte de statut. */
  readonly paths: readonly { readonly href: string; readonly labelKey: string }[]
}

function publishRefusal(status: MembershipStatus): PublishRefusal {
  if (status === "suspendue") {
    return {
      hintKey: "nav.publish.suspendedHint",
      titleKey: "status.suspendedTitle",
      bodyKey: "nav.publish.suspendedBody",
      paths: [{ href: routes.settingsData(), labelKey: "nav.myData" }],
    }
  }
  return {
    hintKey: "composer.notAllowed",
    titleKey: "composer.notAllowed",
    bodyKey: "status.pendingBody",
    paths: [
      { href: routes.sponsorHelp(), labelKey: "status.sponsorHelp" },
      { href: routes.attestation(), labelKey: "status.verifyConsular" },
    ],
  }
}

// ═══════════════════════════════════════════════════════════════
// La coque
// ═══════════════════════════════════════════════════════════════

/**
 * Coque des pages membres — squelette de l'espace agent (charte §8), arborescence DG-005,
 * menu léger (CH-816, lot P1) :
 *   · bureau (≥ 960 px) : rail gauche (pays, la barre de trois à cinq entrées, Publier,
 *     Créer, carte de l'avatar qui ouvre le menu du compte), colonne du fil
 *     (≤ 792 px), rail droit de 312 px dès 1 280 px ;
 *   · téléphone : en-tête collant (mot-symbole, Publier, cloche, avatar → feuille du
 *     compte), barre basse flottante aux mêmes entrées, composeur en feuille.
 * Les entrées personnelles (Mes relations, Enregistrements, Parrainer ; Mes pages et Mes
 * associations quand j'en ai ; celles d'un module ouvert) et celles des responsables
 * (Modération, Pilote) vivent dans le menu du compte seulement, plus dans le rail.
 *
 * Publier vit dans l'en-tête au téléphone, pas en bouton flottant : au-dessus de la
 * barre basse se tient la pile des cartes flottantes (démonstration, statut d'adhésion,
 * avis — pleine largeur), qui le masquerait ou qu'il masquerait ; et le futur fil
 * vertical (G6) ne doit rien porter sur le sujet d'une vidéo. L'en-tête collant le
 * garde au même endroit sur chaque écran.
 *
 * Aucune perte d'accès : chaque lien d'avant reste à un geste (barre, Publier, cloche,
 * « Mon pays » pour le hub de son pays) ou à deux (la recherche des membres par Membres ;
 * Profil, Réglages, Relations, Parrainer par le menu du compte). Le menu du compte porte
 * aussi les textes du site (« Informations ») et « Se déconnecter partout » (UX-03).
 * Jamais d'AppShell de l'administration, jamais de chrome du Poste.
 */
export function AppShell(props: { membership: MembershipView; rail?: ReactNode; children: ReactNode }) {
  const pathname = usePathname() ?? ""
  const [composerOpen, setComposerOpen] = useState(false)
  // Partage cité : la publication citée reste posée pendant la fermeture de la feuille (pas de bascule de titre).
  const [shareTarget, setShareTarget] = useState<PostView | null>(null)
  const [shareOpen, setShareOpen] = useState(false)
  // Chaque partage remonte son composeur : formulaire, aperçu et clé d'idempotence repartent de zéro.
  const [shareSession, setShareSession] = useState(0)
  const openCountries = useOpenCountries()
  // iCom (PD7) : en mode moteur, pour un membre qui peut écrire ; le dock se monte au bureau seulement
  // (seuil du moteur, 960 px ; inconnu au rendu serveur, donc rien avant le premier passage client).
  const icom = useIcomNetwork()
  const network = useEngineNetwork()
  const desktop = useIsReseauMobile() === false
  // Les non-lus de Messages, remontés par le lecteur monté sous l'îlot iCom (UX-06) ; rien quand iCom est fermé.
  const [messagesUnread, setMessagesUnread] = useState(0)
  const { membership } = props
  const canPublish = membership.canPublish
  // Inconnus tant qu'ils ne sont pas lus : le composeur n'affirme alors aucun pays fermé (HB-01).
  const open = openCountries.status === "ready" ? openCountries.data.map((item) => item.country) : null
  // Une seule entrée relève du chemin courant, rail et barre basse confondus (UX-05).
  const current = navDestinationOf(pathname, membership.handle)
  // ADR-0041 du moteur : les modules ouverts sur le réseau ; la barre et le menu du compte n'offrent que ceux-là.
  const features = useFeatureGate()
  const offered = served(features)
  const primary = primaryEntries(current, { communities: communitiesOffered(features), messages: icom !== null }, icom === null ? 0 : messagesUnread).filter(offered)
  // Sur le hub de son pays sans « Communautés » dans la barre, « Mon pays » est l'entrée courante (une entrée l'est toujours).
  const homeCountryCurrent = current === "communities" && !primary.some((entry) => entry.id === "communities")
  const desk = (useModerationDesk() ?? NO_MODERATION_DESK).useDesk(membership.personId)
  const pilot = (usePilotMetrics() ?? NO_PILOT_METRICS).useAccess()
  const holdsPageRole = useHoldsPageRole()
  const holdsAssociation = useHoldsAssociation()
  const personal = [
    ...personalEntries(current, { relations: network !== null, pages: holdsPageRole, associations: holdsAssociation }),
    ...responsibleEntries(current, {
      moderation: desk.status === "ready" && desk.data !== null,
      pilot: pilot.status === "ready" && pilot.data.allowed,
    }),
  ].filter(offered)
  const account = accountEntries(membership, current, personal)
  const information = informationEntries(pathname)
  // Le menu « Créer » (modèle du réseau de l'administration) : les actus suivent iCom, l'inscription la règle partagée.
  const create = createFormats({ canPublish, stories: icom !== null, status: membership.status, pages: features.isOpen("pages") })
  // La garde des adresses : un module fermé dit « introuvable », comme une page qui n'existe pas.
  const feature = featureOfPath(pathname)
  const content = feature === null || (features.ready && features.isOpen(feature)) ? props.children : features.ready ? <FeatureNotFound /> : <FeatureLoading />
  const openComposer = () => setComposerOpen(true)

  const startShare = (post: PostView) => {
    setShareTarget(post)
    setShareSession((session) => session + 1)
    setShareOpen(true)
  }

  return (
    <PostShareProvider value={canPublish ? startShare : null}>
      <div className="min-h-dvh">
        <div className="mx-auto flex w-full max-w-[1400px]">
          <DesktopRail membership={membership} primary={primary} homeCountryCurrent={homeCountryCurrent} account={account} information={information} create={create} onPublish={openComposer} />

          <div className="min-w-0 flex-1">
            <MobileHeader membership={membership} homeCountryCurrent={homeCountryCurrent} account={account} information={information} create={create} onPublish={openComposer} />
            <main
              id="contenu"
              className="mx-auto grid w-full gap-6 px-4 pb-[calc(var(--esp-reseau-tabbar-inset)+env(safe-area-inset-bottom)+1rem)] pt-4 min-[960px]:pb-10 min-[960px]:pt-6 xl:grid-cols-[minmax(0,792px)_312px] xl:justify-center"
            >
              <ComposerContext.Provider value={{ open: openComposer, canPublish }}>
                <div className="flex min-w-0 max-w-[792px] flex-col gap-4">
                  {/* L'état du réseau (MO-05) : dit en tête du contenu, sans rien masquer. */}
                  <NetworkStatusNotice />
                  <ZoneNotice pathname={pathname} membership={membership} />
                  {content}
                </div>
              </ComposerContext.Provider>
              {/* Le rail droit (dès 1 280 px). Sa première place revient à la carte iCom ; montée dès 960 px,
                  elle reste disponible entre 960 et 1 280 px, rail retiré : une adresse de messagerie l'ouvre
                  détachée, en carte flottante (même doctrine que la page réseau du moteur). */}
              {props.rail || (icom && desktop) ? (
                <aside className="hidden flex-col gap-4 xl:flex">
                  {icom && desktop ? (
                    <IcomIsland network={icom}>
                      <Suspense fallback={null}>
                        <MessagerieDock />
                      </Suspense>
                    </IcomIsland>
                  ) : null}
                  {props.rail}
                </aside>
              ) : null}
            </main>
          </div>
        </div>

        <MobileTabBar entries={primary} />
        {/* Le lecteur des non-lus de Messages : sous l'îlot iCom, et seulement iCom ouvert
            (aucune lecture en démonstration ni pour un membre qui ne peut pas écrire). */}
        {icom ? (
          <IcomIsland network={icom}>
            <MessagesUnreadReader onTotal={setMessagesUnread} />
          </IcomIsland>
        ) : null}

        {canPublish ? (
          <PostComposerSheet
            open={composerOpen}
            onOpenChange={setComposerOpen}
            memberCountry={membership.facet.countryOfResidence}
            openCountries={open}
            draftKey={`diaspora-ga:brouillon:${membership.personId}`}
          />
        ) : null}
        {canPublish ? (
          <PostComposerSheet
            key={shareSession}
            open={shareOpen}
            onOpenChange={setShareOpen}
            memberCountry={membership.facet.countryOfResidence}
            openCountries={open}
            share={shareTarget}
          />
        ) : null}
      </div>
    </PostShareProvider>
  )
}

/**
 * L'adresse d'un module fermé sur le réseau (ADR-0041 du moteur) : la même réponse qu'une page
 * qui n'existe pas — le refus reste indistinct —, dans la coque, avec le chemin du retour au fil.
 */
function FeatureNotFound() {
  const { t } = useDiasporaGaT()
  return (
    <section className="flex flex-col items-start gap-3 py-6">
      <h1 className="font-display text-3xl font-bold">{t("notFound.title")}</h1>
      <p className="text-muted-foreground">{t("notFound.body")}</p>
      <NextLink href={routes.feed()} className="inline-flex min-h-11 items-center font-semibold text-primary underline underline-offset-4 focus-visible:shadow-focus">
        {t("appError.backToFeed")}
      </NextLink>
    </section>
  )
}

/** Tant que les modules ouverts ne sont pas lus, l'adresse d'un module attend, sans rien affirmer. */
function FeatureLoading() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true">
      <Skeleton className="h-28 w-full rounded-xl" />
      <Skeleton className="h-40 w-full rounded-xl" />
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// Bureau : le rail gauche
// ═══════════════════════════════════════════════════════════════

/**
 * Le rail du bureau : le pays, la barre, Publier, Créer, puis la carte de l'avatar. Plus de
 * groupe « Mon espace » (CH-816) : les entrées personnelles sont dans le menu du compte, qui
 * les montrait déjà ; le rail ne double plus ce menu.
 */
function DesktopRail(props: {
  membership: MembershipView
  primary: readonly NavEntry[]
  homeCountryCurrent: boolean
  account: readonly NavEntry[]
  information: readonly NavEntry[]
  create: readonly CreateFormat[]
  onPublish: () => void
}) {
  const { t } = useDiasporaGaT()
  return (
    <aside className="sticky top-0 hidden h-dvh w-[240px] shrink-0 flex-col gap-4 overflow-y-auto overscroll-contain border-r border-border px-4 py-5 min-[960px]:flex">
      <div className="flex flex-wrap items-center gap-2 px-2">
        <NextLink href={routes.feed()} aria-label={t("nav.feed")} className="rounded-md focus-visible:shadow-focus">
          <Wordmark />
        </NextLink>
        <AppDemoChip />
        <NotificationBell className="ml-auto" />
      </div>
      <HomeCountryLink membership={props.membership} caption="visible" current={props.homeCountryCurrent} className="mx-2 flex-col items-start gap-1" />
      <nav aria-label={t("nav.label")} className="flex flex-col gap-1">
        {props.primary.map((entry) => (
          <RailLink key={entry.id} entry={entry} />
        ))}
      </nav>
      <PublishAction variant="rail" membership={props.membership} onPublish={props.onPublish} />
      {props.create.length > 0 ? <CreateMenu formats={props.create} /> : null}
      <AccountMenu membership={props.membership} entries={props.account} information={props.information} />
    </aside>
  )
}

function RailLink(props: { entry: NavEntry }) {
  const { t } = useDiasporaGaT()
  const Icon = props.entry.icon
  const unread = props.entry.unread ?? 0
  return (
    <NextLink
      href={props.entry.href}
      aria-current={props.entry.active ? "page" : undefined}
      aria-label={unreadName(t, props.entry)}
      className={cn(
        "flex min-h-11 min-w-0 items-center gap-3 rounded-[var(--esp-r-chrome)] px-3 text-[15px] font-medium transition-colors focus-visible:shadow-focus",
        props.entry.active ? "bg-[var(--esp-accent-soft)] text-[var(--esp-accent-deep)]" : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      <Icon className="size-5 shrink-0" aria-hidden />
      <span className="min-w-0 truncate">{t(props.entry.labelKey)}</span>
      {unread > 0 ? <UnreadBadge count={unread} className="ml-auto shrink-0" /> : null}
    </NextLink>
  )
}

/**
 * Le pays de résidence, contexte permanent (charte §5) : il mène au hub de son pays
 * (`/communautes`, socle). Quand « Communautés » n'est pas dans la barre (aucun module rangé
 * sous elle n'est ouvert), c'est lui l'entrée courante sur ces adresses : `aria-current`, et la
 * légende passe à la couleur et à la graisse de l'entrée courante.
 */
function HomeCountryLink(props: { membership: MembershipView; caption: "visible" | "hidden"; current: boolean; className?: string }) {
  const { t } = useDiasporaGaT()
  return (
    <NextLink
      href={routes.communities()}
      aria-current={props.current ? "page" : undefined}
      className={cn("flex min-w-0 rounded-md focus-visible:shadow-focus", props.className)}
    >
      <span
        className={
          props.caption === "visible" ? cn("text-xs", props.current ? "font-bold text-[var(--esp-accent-deep)]" : "font-semibold text-muted-foreground") : "sr-only"
        }
      >
        {t("nav.hub")}
      </span>
      <CountryTag country={props.membership.facet.countryOfResidence} city={props.membership.facet.city} className="min-w-0 shrink" />
    </NextLink>
  )
}

/** L'avis d'un échec de sortie : un seul à la fois, quel que soit le menu qui l'a tenté. */
const SIGN_OUT_FAILED_TOAST = "diaspora-ga:sortie-echouee"

/**
 * Se déconnecter partout depuis le menu du compte (UX-03), par la porte unique des
 * réglages et de l'accueil (`useSignOutEverywhere`) : un seul geste à la fois, la
 * navigation de la source conservée. Le menu reste ouvert pendant la sortie, qui s'y
 * lit (« Déconnexion… ») ; un échec, toujours générique, passe par un avis.
 */
function useAccountSignOut() {
  const { t } = useDiasporaGaT()
  const exit = useSignOutEverywhere()
  const failure = t("errors.unknown")
  useEffect(() => {
    if (exit.failed) toast.error(failure, { id: SIGN_OUT_FAILED_TOAST })
  }, [exit.failed, failure])
  return { busy: exit.busy, run: () => void exit.signOutEverywhere(), label: t(exit.busy ? "settings.signingOut" : "settings.signOutEverywhere") }
}

function MenuLink(props: { entry: NavEntry }) {
  const { t } = useDiasporaGaT()
  const { entry } = props
  const Icon = entry.icon
  return (
    <DropdownMenu.Item asChild>
      <NextLink
        href={entry.href}
        aria-current={entry.active ? "page" : undefined}
        className={cn(
          "flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-3 text-sm outline-none focus-visible:shadow-focus data-[highlighted]:bg-muted",
          // La page courante se lit aussi sans la couleur : graisse et `aria-current`.
          entry.active ? "font-semibold text-[var(--esp-accent-deep)]" : "font-medium",
        )}
      >
        <Icon className="size-4 shrink-0" aria-hidden />
        {t(entry.labelKey)}
      </NextLink>
    </DropdownMenu.Item>
  )
}

/** Le menu du compte au bureau : la carte de l'avatar l'ouvre (flèches, Échap, focus rendu par Radix). */
function AccountMenu(props: { membership: MembershipView; entries: readonly NavEntry[]; information: readonly NavEntry[] }) {
  const { t } = useDiasporaGaT()
  const informationId = useId()
  const exit = useAccountSignOut()
  const { membership } = props
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        aria-label={t("nav.account.open", { name: membership.displayName })}
        className="mt-auto flex w-full min-w-0 shrink-0 items-center gap-3 rounded-xl bg-card p-3 text-left text-card-foreground shadow-card transition-colors hover:bg-muted focus-visible:shadow-focus data-[state=open]:bg-muted"
      >
        <Avatar id={membership.personId} name={membership.displayName} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{membership.displayName}</span>
          <TrustBadges badges={membership.badges} className="mt-1" />
        </span>
        <ChevronsUpDownIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          side="top"
          align="start"
          sideOffset={8}
          collisionPadding={12}
          aria-busy={exit.busy}
          className="z-60 max-h-[var(--radix-dropdown-menu-content-available-height)] w-[min(16rem,calc(100vw-2rem))] overflow-y-auto overscroll-contain rounded-xl bg-popover p-1.5 text-popover-foreground shadow-float"
        >
          <DropdownMenu.Label className="px-3 py-2">
            <span className="block truncate text-sm font-semibold">{membership.displayName}</span>
            <span className="block truncate text-[13px] text-muted-foreground">@{membership.handle}</span>
          </DropdownMenu.Label>
          <DropdownMenu.Separator className="my-1 h-px bg-border" />
          {props.entries.map((entry) => (
            <MenuLink key={entry.id} entry={entry} />
          ))}
          <DropdownMenu.Separator className="my-1 h-px bg-border" />
          <DropdownMenu.Group aria-labelledby={informationId}>
            <DropdownMenu.Label id={informationId} className="px-3 pb-1 pt-2 text-xs font-semibold text-muted-foreground">
              {t("nav.account.info")}
            </DropdownMenu.Label>
            {props.information.map((entry) => (
              <MenuLink key={entry.id} entry={entry} />
            ))}
          </DropdownMenu.Group>
          <DropdownMenu.Separator className="my-1 h-px bg-border" />
          {/* L'action neutre de sortie : le menu reste ouvert pendant qu'elle se fait. */}
          <DropdownMenu.Item
            disabled={exit.busy}
            onSelect={(event) => {
              event.preventDefault()
              exit.run()
            }}
            className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-3 text-sm font-medium outline-none focus-visible:shadow-focus data-[disabled]:cursor-wait data-[disabled]:opacity-70 data-[highlighted]:bg-muted"
          >
            <LogOutIcon className="size-4 shrink-0" aria-hidden />
            {exit.label}
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

// ═══════════════════════════════════════════════════════════════
// Téléphone : l'en-tête, la feuille du compte, la barre basse
// ═══════════════════════════════════════════════════════════════

function MobileHeader(props: {
  membership: MembershipView
  homeCountryCurrent: boolean
  account: readonly NavEntry[]
  information: readonly NavEntry[]
  create: readonly CreateFormat[]
  onPublish: () => void
}) {
  const { t } = useDiasporaGaT()
  const demo = useDataSource().kind === "demo"
  return (
    <header className="sticky top-0 z-40 flex h-14 items-center justify-between gap-2 border-b border-border bg-background/95 px-3 backdrop-blur min-[360px]:px-4 min-[960px]:hidden">
      {/* Largeurs mesurées sur les polices de la charte : mot-symbole 140 px, repère « Démo » 72 px
          (34 px sans libellé), Publier, cloche et compte 136 px. Le mot-symbole et les trois actions
          tiennent dès 320 px ; avec le repère de démonstration, celui-ci ne garde que son icône sous
          420 px (son nom reste lu) et le mot-symbole son œillet sous 380 px (le lien reste nommé).
          L'étiquette pays n'entre qu'à partir de 440 px, le format téléphone de la charte ; plus
          étroit, la feuille du compte porte le pays (et « Communautés » quand elle est dans la barre). */}
      <div className="flex shrink-0 items-center gap-2 max-[420px]:[&_[data-slot=demo-chip]>span]:sr-only">
        <NextLink href={routes.feed()} aria-label={t("nav.feed")} className="rounded-md focus-visible:shadow-focus">
          <Wordmark className={demo ? "max-[380px]:[&>span:last-child]:sr-only" : undefined} />
        </NextLink>
        <AppDemoChip />
      </div>
      <div className="flex min-w-0 items-center justify-end gap-1">
        <HomeCountryLink membership={props.membership} caption="hidden" current={props.homeCountryCurrent} className="hidden min-[440px]:flex" />
        <PublishAction variant="header" membership={props.membership} onPublish={props.onPublish} />
        <NotificationBell />
        <AccountSheet membership={props.membership} entries={props.account} information={props.information} create={props.create} />
      </div>
    </header>
  )
}

function SheetLink(props: { entry: NavEntry; onFollow: () => void }) {
  const { t } = useDiasporaGaT()
  const { entry } = props
  const Icon = entry.icon
  return (
    <li>
      <NextLink
        href={entry.href}
        aria-current={entry.active ? "page" : undefined}
        onClick={props.onFollow}
        className={cn(
          "flex min-h-12 min-w-0 items-center gap-3 rounded-lg px-3 text-[15px] font-medium transition-colors focus-visible:shadow-focus",
          entry.active ? "bg-[var(--esp-accent-soft)] text-[var(--esp-accent-deep)]" : "hover:bg-muted",
        )}
      >
        <Icon className="size-5 shrink-0" aria-hidden />
        <span className="min-w-0 truncate">{t(entry.labelKey)}</span>
      </NextLink>
    </li>
  )
}

const CREATE_ICONS: Readonly<Record<CreateFormatId, LucideIcon>> = {
  story: CameraIcon,
  association: UsersRoundIcon,
  company: Building2Icon,
}

/**
 * « Créer » au bureau, sous « Publier » : un menu de formats, chacun dit en une ligne
 * (comme le menu de création du réseau de l'administration). Flèches, Échap et focus rendu par Radix.
 */
function CreateMenu(props: { formats: readonly CreateFormat[] }) {
  const { t } = useDiasporaGaT()
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button variant="outline" className="w-full">
          <PlusIcon aria-hidden />
          {t("nav.create.label")}
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          side="right"
          align="start"
          sideOffset={8}
          collisionPadding={12}
          className="z-60 w-[min(20rem,calc(100vw-2rem))] rounded-xl bg-popover p-1.5 text-popover-foreground shadow-float"
        >
          <DropdownMenu.Label className="px-3 pb-1 pt-2 text-xs font-semibold text-muted-foreground">{t("nav.create.title")}</DropdownMenu.Label>
          {props.formats.map((format) => {
            const Icon = CREATE_ICONS[format.id]
            return (
              <DropdownMenu.Item key={format.id} asChild>
                <NextLink
                  href={format.href}
                  className="flex min-h-14 cursor-pointer items-start gap-3 rounded-lg px-3 py-2 outline-none focus-visible:shadow-focus data-[highlighted]:bg-muted"
                >
                  <Icon aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold">{t(format.labelKey)}</span>
                    <span className="block text-[13px] leading-snug text-muted-foreground">{t(format.hintKey)}</span>
                  </span>
                </NextLink>
              </DropdownMenu.Item>
            )
          })}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

function CreateSheetLink(props: { format: CreateFormat; onFollow: () => void }) {
  const { t } = useDiasporaGaT()
  const Icon = CREATE_ICONS[props.format.id]
  return (
    <li>
      <NextLink
        href={props.format.href}
        onClick={props.onFollow}
        className="flex min-h-12 min-w-0 items-center gap-3 rounded-lg px-3 text-[15px] font-medium transition-colors hover:bg-muted focus-visible:shadow-focus"
      >
        <Icon className="size-5 shrink-0" aria-hidden />
        <span className="min-w-0 truncate">{t(props.format.labelKey)}</span>
      </NextLink>
    </li>
  )
}

/** Le menu du compte au téléphone : une feuille (piège de focus, Échap, focus rendu à l'avatar). */
function AccountSheet(props: { membership: MembershipView; entries: readonly NavEntry[]; information: readonly NavEntry[]; create: readonly CreateFormat[] }) {
  const { t } = useDiasporaGaT()
  const [open, setOpen] = useState(false)
  const informationId = useId()
  const createId = useId()
  const exit = useAccountSignOut()
  const { membership } = props
  const close = () => setOpen(false)
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        aria-label={t("nav.account.open", { name: membership.displayName })}
        className="inline-flex size-11 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-muted focus-visible:shadow-focus"
      >
        <Avatar id={membership.personId} name={membership.displayName} size="sm" />
      </SheetTrigger>
      <SheetContent title={t("nav.account.title")} description={t("nav.account.description")} hideDescription closeLabel={t("nav.account.close")}>
        <div className="flex min-w-0 items-center gap-3">
          <Avatar id={membership.personId} name={membership.displayName} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">{membership.displayName}</p>
            <p className="truncate text-[13px] text-muted-foreground">@{membership.handle}</p>
          </div>
        </div>
        <div className="mt-2 flex min-w-0 flex-wrap items-center gap-1.5">
          <TrustBadges badges={membership.badges} />
          <CountryTag country={membership.facet.countryOfResidence} city={membership.facet.city} />
        </div>
        <nav aria-label={t("nav.account.title")} className="mt-4">
          <ul className="flex flex-col gap-0.5">
            {props.entries.map((entry) => (
              <SheetLink key={entry.id} entry={entry} onFollow={close} />
            ))}
          </ul>
        </nav>
        {/* Au téléphone, l'en-tête n'a plus de place : les formats de « Créer » vivent dans la feuille du compte. */}
        {props.create.length > 0 ? (
          <nav aria-labelledby={createId} className="mt-3 border-t border-border pt-3">
            <p id={createId} className="px-3 pb-1 text-xs font-semibold text-muted-foreground">
              {t("nav.create.title")}
            </p>
            <ul className="flex flex-col gap-0.5">
              {props.create.map((format) => (
                <CreateSheetLink key={format.id} format={format} onFollow={close} />
              ))}
            </ul>
          </nav>
        ) : null}
        <nav aria-labelledby={informationId} className="mt-3 border-t border-border pt-3">
          <p id={informationId} className="px-3 pb-1 text-xs font-semibold text-muted-foreground">
            {t("nav.account.info")}
          </p>
          <ul className="flex flex-col gap-0.5">
            {props.information.map((entry) => (
              <SheetLink key={entry.id} entry={entry} onFollow={close} />
            ))}
          </ul>
        </nav>
        {/* La sortie, en bouton neutre ; la feuille reste ouverte pendant qu'elle se fait. */}
        <div aria-busy={exit.busy} className="mt-3 border-t border-border pt-4">
          <Button type="button" variant="outline" disabled={exit.busy} onClick={exit.run} className="w-full">
            <LogOutIcon aria-hidden className="size-4" />
            {exit.label}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}

/**
 * La barre basse flottante : les entrées de la barre, de trois à cinq selon les modules
 * ouverts et iCom (même liste que le rail). Aucun nombre de colonnes écrit : chaque onglet
 * prend la largeur de son libellé et partage le reste (« Communautés » ne tient pas dans un
 * cinquième de 320 px), et garde 44 px au moins ; un libellé trop long pour un très grand
 * texte se tronque, son nom accessible reste entier. Posée au-dessus de la zone sûre.
 */
function MobileTabBar(props: { entries: readonly NavEntry[] }) {
  const { t } = useDiasporaGaT()
  return (
    <nav
      aria-label={t("nav.label")}
      className="fixed inset-x-2 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-40 rounded-4xl bg-[var(--esp-mobilebar-bg)] shadow-[var(--esp-mobilebar-shadow)] backdrop-blur min-[360px]:inset-x-3 min-[960px]:hidden"
    >
      <ul className="flex h-16 items-stretch px-1">
        {props.entries.map((entry) => {
          const Icon = entry.icon
          const unread = entry.unread ?? 0
          return (
            <li key={entry.id} className="flex min-w-11 flex-auto">
              <NextLink
                href={entry.href}
                aria-current={entry.active ? "page" : undefined}
                aria-label={unreadName(t, entry)}
                className={cn(
                  "flex w-full min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl px-0.5 text-[11px] transition-colors focus-visible:shadow-focus",
                  entry.active ? "font-semibold text-[var(--esp-accent-deep)]" : "font-medium text-muted-foreground hover:text-foreground",
                )}
              >
                {/* La pastille s'accroche au coin de l'icône et s'étend vers la droite : « 99+ » ne la décentre pas. */}
                <span className="relative flex shrink-0">
                  <Icon className="size-5 shrink-0" aria-hidden />
                  {unread > 0 ? <UnreadBadge count={unread} className="absolute -top-1.5 left-3" /> : null}
                </span>
                <span className="max-w-full truncate">{t(entry.labelKey)}</span>
              </NextLink>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

// ═══════════════════════════════════════════════════════════════
// Publier : une action stable, expliquée quand elle est fermée
// ═══════════════════════════════════════════════════════════════

const HEADER_PUBLISH_CLASS =
  "grid size-11 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground transition-colors hover:bg-[var(--primary-fill-hover)] focus-visible:shadow-focus"

/**
 * Publier, dans le rail (bouton plein) ou l'en-tête (rond de 44 px). Fermée, l'action
 * reste focalisable (`aria-disabled`, jamais `disabled`) : sa raison est annoncée avec
 * elle, écrite sous le bouton au bureau, et un geste ouvre l'explication avec les
 * chemins qui la rouvrent (parrainage, vérification ; recours pendant une suspension).
 */
function PublishAction(props: { variant: "rail" | "header"; membership: MembershipView; onPublish: () => void }) {
  const { t } = useDiasporaGaT()
  const ids = useId()
  const [explaining, setExplaining] = useState(false)
  const rail = props.variant === "rail"
  if (props.membership.canPublish) {
    return rail ? (
      <Button onClick={props.onPublish} className="w-full">
        <PenSquareIcon aria-hidden />
        {t("composer.open")}
      </Button>
    ) : (
      <button type="button" onClick={props.onPublish} aria-label={t("composer.open")} className={HEADER_PUBLISH_CLASS}>
        <PlusIcon aria-hidden className="size-5" />
      </button>
    )
  }

  const refusal = publishRefusal(props.membership.status)
  const hintId = `${ids}-raison`
  const titleId = `${ids}-titre`
  return (
    <Popover.Root open={explaining} onOpenChange={setExplaining}>
      {rail ? (
        <div className="flex flex-col gap-1.5">
          <Popover.Trigger asChild>
            <Button aria-disabled="true" aria-describedby={hintId} className="w-full opacity-55">
              <PenSquareIcon aria-hidden />
              {t("composer.open")}
            </Button>
          </Popover.Trigger>
          <p id={hintId} className="px-1 text-[13px] leading-snug text-muted-foreground">
            {t(refusal.hintKey)}
          </p>
        </div>
      ) : (
        <>
          <Popover.Trigger asChild>
            <button
              type="button"
              aria-label={t("composer.open")}
              aria-disabled="true"
              aria-describedby={hintId}
              className={cn(HEADER_PUBLISH_CLASS, "opacity-55")}
            >
              <PlusIcon aria-hidden className="size-5" />
            </button>
          </Popover.Trigger>
          <span id={hintId} className="sr-only">
            {t(refusal.hintKey)}
          </span>
        </>
      )}
      <Popover.Portal>
        <Popover.Content
          aria-labelledby={titleId}
          side={rail ? "right" : "bottom"}
          align={rail ? "center" : "end"}
          sideOffset={8}
          collisionPadding={12}
          className="z-60 w-[min(20rem,calc(100vw-1.5rem))] rounded-xl bg-popover p-4 text-popover-foreground shadow-float"
        >
          <div className="flex items-start gap-2">
            <p id={titleId} className="min-w-0 flex-1 font-semibold leading-snug">
              {t(refusal.titleKey)}
            </p>
            <Popover.Close
              aria-label={t("nav.publish.close")}
              className="-mr-2 -mt-2 grid size-11 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:shadow-focus"
            >
              <XIcon aria-hidden className="size-4" />
            </Popover.Close>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{t(refusal.bodyKey)}</p>
          <ul className="mt-2 flex flex-col">
            {refusal.paths.map((path) => (
              <li key={path.href}>
                <NextLink
                  href={path.href}
                  onClick={() => setExplaining(false)}
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-md text-sm font-semibold text-primary underline-offset-2 hover:underline focus-visible:shadow-focus"
                >
                  {t(path.labelKey)}
                  <ArrowRightIcon aria-hidden className="size-4" />
                </NextLink>
              </li>
            ))}
          </ul>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

// ═══════════════════════════════════════════════════════════════
// Le contexte pays : une zone consultée reste visible
// ═══════════════════════════════════════════════════════════════

/** Sur le hub d'un autre pays : la zone consultée, la résidence inchangée, le retour à son pays. */
function ZoneNotice(props: { pathname: string; membership: MembershipView }) {
  const { t, locale } = useDiasporaGaT()
  const home = props.membership.facet.countryOfResidence
  const zone = exploredZone(props.pathname, home)
  if (zone === null) return null
  return (
    <div role="note" className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-muted px-3 py-2">
      <CountryTag country={zone} />
      <p className="min-w-0 flex-1 text-sm">
        <span className="font-semibold">{t("nav.zone.title", { country: countryName(zone, locale) })}</span>{" "}
        <span className="text-muted-foreground">{t("nav.zone.body", { home: countryName(home, locale) })}</span>
      </p>
      <NextLink
        href={routes.communities()}
        className="inline-flex min-h-11 items-center gap-1.5 rounded-md px-2 text-sm font-semibold text-primary underline-offset-4 hover:underline focus-visible:shadow-focus"
      >
        <ArrowLeftIcon aria-hidden className="size-4" />
        {t("nav.zone.back")}
      </NextLink>
    </div>
  )
}

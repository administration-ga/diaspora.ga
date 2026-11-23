"use client"

import { AppearanceProvider } from "@antsia/social-features/shell/appearance"
import { RoutingProvider, type FeatureRoutes, type LinkComponent } from "@diaspora-ga/features"
import { GatedDataSourceProvider } from "@diaspora-ga/features/data"
import { DemoStore, createDemoDataSource } from "@diaspora-ga/features/demo"
import { I18nProvider, useDiasporaGaT } from "@diaspora-ga/features/i18n/client"
import type { Locale } from "@diaspora-ga/features/i18n"
import NextLink from "next/link"
import { usePathname } from "next/navigation"
import { useState, type ReactNode } from "react"

import { EngineDataProviders } from "@/data/engine-providers"
import { APPEARANCE } from "@/lib/appearance"
import { callJournalRoute } from "@/lib/calls"
import { publicEnv } from "@/lib/env"
import { routes } from "@/lib/routes"
import { isStaticPublicPath } from "@/lib/static-public-routes"

import { AccountLocale } from "./account-locale"
import { AccountTheme } from "./account-theme"
import { DemoAccountBootstrap } from "./demo-account-bootstrap"
import { MembershipStatusRefresh } from "./membership-refresh"
import { ServiceWorkerRegistration } from "./service-worker-registration"
import { DemoFloatingCard } from "./site-chrome"
import { ToastRegion } from "./toast-region"

/** La table de routes, telle que les surfaces de `@diaspora-ga/features` la consomment. */
const featureRoutes: FeatureRoutes = {
  profile: routes.profile,
  post: routes.post,
  page: routes.page,
  associationEvent: routes.associationEvent,
  // Liens profonds des avis de mise en relation (cloche) : chaque route relit les droits à l'ouverture.
  serviceRequest: routes.serviceRequest,
  activityRequest: routes.activityRequest,
  associationMembers: routes.associationMembers,
  myAssociations: routes.myAssociations,
  // Avis de décision de modération : « Mes données », ou l'onglet des décisions de la page (droits relus).
  myDecisions: routes.settingsData,
  myReports: routes.settingsReports,
  pageDecisions: routes.pageDecisions,
  // Avis de la vie communautaire (vague H) : chaque route relit les droits à l'ouverture.
  mutualAidItem: routes.mutualAidItem,
  myMentoring: routes.myMentoring,
  jobsActivity: () => routes.myActivity("emplois"),
  pageJobs: (handle) => routes.pageManage(handle, "emplois"),
  myApplications: routes.myApplications,
  arrivalKitResource: routes.arrivalKitResource,
  contextualConversation: routes.contextualConversation,
  // Les règles de la communauté (MD-05) : la feuille de signalement y renvoie.
  communityRules: routes.communityRules,
  // NP-04 : la page des notifications, l'album d'un avis d'album publié, l'agenda d'une invitation.
  notifications: routes.notifications,
  album: routes.album,
  agenda: routes.agenda,
  // IM-04 : la conversation de groupe d'iCom ; IC-09 : la conversation à deux d'un message reçu.
  groupConversation: routes.groupConversation,
  personalConversation: routes.personalConversation,
  // IM-04 : le journal d'appels, seulement quand les appels sont ouverts (aucune route d'appel, IM-01).
  ...callJournalRoute(),
  hub: routes.hub,
  feed: (tag, context) => routes.feed(context?.scope, tag, context?.country),
  sponsor: routes.sponsor,
  settings: routes.settings,
  attestation: routes.attestation,
  enter: routes.enter,
}

const AppLink: LinkComponent = ({ href, children, ...rest }) => (
  <NextLink href={href} {...rest}>
    {children}
  </NextLink>
)

/**
 * Le fournisseur de DÉMONSTRATION : données fictives, dans ce navigateur seulement. Comme le
 * moteur (ADR-0041), il ne monte que les modules ouverts par l'administration du réseau fictif.
 */
function DemoDataProvider(props: { children: ReactNode }) {
  const [source] = useState(() => createDemoDataSource(new DemoStore(typeof window === "undefined" ? null : window.localStorage)))
  return <GatedDataSourceProvider source={source}>{props.children}</GatedDataSourceProvider>
}

/**
 * La source de données de l'application — c'est ici, et seulement ici, que le
 * choix se fait (`NEXT_PUBLIC_DIASPORA_GA_DATA_SOURCE`) : la démonstration, ou le
 * moteur ANTSIA (PD2 : session, Convex du moteur, tranche `diaspora`).
 */
function DataProviders(props: { children: ReactNode }) {
  if (publicEnv.dataSource === "engine") return <EngineDataProviders>{props.children}</EngineDataProviders>
  return <DemoDataProvider>{props.children}</DemoDataProvider>
}

/**
 * Une seule pile pour tout ce qui flotte (charte v2 §7) : cartes flottantes et
 * confirmations, en bas à droite ; au téléphone, pleine largeur au-dessus de la
 * barre basse. Déployée : une carte flottante n'est jamais cachée derrière une
 * autre. Sa zone s'annonce « Avis » : « Notifications », c'est la cloche.
 *
 * Couches (charte §4) : barres 40 < feuilles 50 < pile des avis 55 < menus 60.
 * Un avis passager reste lisible au-dessus d'une feuille, et un menu ouvert
 * passe devant une carte flottante (sonner se pose sinon à 999999999).
 * La pile vit dans sa propre région, exemptée de l'inertage des modales
 * (`toast-region.tsx`) : un avis émis pendant une visionneuse reste annoncé.
 */
function FloatingStack() {
  const { t } = useDiasporaGaT()
  return (
    <ToastRegion
      className="!z-55"
      containerAriaLabel={t("notice.region")}
      position="bottom-right"
      offset={{ bottom: 88, right: 24 }}
      mobileOffset={{ bottom: 88, left: 12, right: 12 }}
      expand
      visibleToasts={4}
      gap={10}
      toastOptions={{
        classNames: {
          toast: "!rounded-xl !border-0 !bg-popover !text-popover-foreground !shadow-float !font-sans",
          description: "!text-muted-foreground",
        },
      }}
    />
  )
}

/**
 * Une arrivée DIRECTE sur un texte du site (`isStaticPublicPath`), sur le moteur : ces pages ne
 * lisent aucune donnée, elles n'attendent donc pas la session. Sans cela, la garde de session du
 * moteur rend « Ouverture de votre session… » au serveur, et le texte n'existe qu'après le script.
 * Verrou à sens unique : dès qu'on quitte les textes, la pile complète se monte (session, iCom,
 * compte) et reste montée ; un membre qui ouvre un texte depuis l'application garde donc sa
 * session et ses appels. La démonstration n'attend aucune session : rien n'y change.
 */
function useStaticPublicEntry(): boolean {
  const pathname = usePathname()
  const [entry, setEntry] = useState(() => publicEnv.dataSource === "engine" && isStaticPublicPath(pathname))
  // État dérivé conditionnel : React rejoue aussitôt ce rendu avec la pile complète.
  if (entry && !isStaticPublicPath(pathname)) setEntry(false)
  return entry
}

/**
 * L'apparence est celle du moteur (`AppearanceProvider`) : mode Système, Clair ou
 * Sombre et thème au choix du membre (Sable par défaut, ou Gaboma), mémorisés sur
 * l'appareil sous le préfixe du réseau, posés sur `<html>` avant l'affichage par le
 * script d'amorçage de la mise en page, puis tenus ici. En session, le thème est aussi
 * celui du compte (`AccountTheme`, sous la source de données qui le lit et l'écrit), et
 * la langue aussi (`AccountLocale`). Une arrivée directe sur un texte du site se rend sans
 * source de données (`useStaticPublicEntry`).
 */
export function Providers(props: { locale: Locale; children: ReactNode }) {
  const staticEntry = useStaticPublicEntry()
  return (
    <AppearanceProvider storagePrefix={APPEARANCE.storagePrefix} themes={APPEARANCE.themes}>
      <I18nProvider locale={props.locale}>
        {staticEntry ? (
          <RoutingProvider routes={featureRoutes} Link={AppLink}>
            {props.children}
            <FloatingStack />
            <ServiceWorkerRegistration />
          </RoutingProvider>
        ) : (
          <FullProviders>{props.children}</FullProviders>
        )}
      </I18nProvider>
    </AppearanceProvider>
  )
}

/** La pile complète : source de données (moteur ou démonstration), compte, routes et ce qui flotte. */
function FullProviders(props: { children: ReactNode }) {
  return (
    <DataProviders>
      <AccountTheme>
        <AccountLocale>
          <RoutingProvider routes={featureRoutes} Link={AppLink}>
            {props.children}
            <FloatingStack />
            <DemoFloatingCard />
            {/* Développement local : prépare le compte de démonstration choisi à la porte. */}
            <DemoAccountBootstrap />
            {/* Le script de fond unique du site (MO-05) : page hors-ligne en réserve, rien d'autre. */}
            <ServiceWorkerRegistration />
            {/* EA-03 : le statut relu quand l'identité a changé, seulement si le moteur signale un écart. */}
            <MembershipStatusRefresh />
          </RoutingProvider>
        </AccountLocale>
      </AccountTheme>
    </DataProviders>
  )
}

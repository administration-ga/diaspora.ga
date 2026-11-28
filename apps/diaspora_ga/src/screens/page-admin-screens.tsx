"use client"

import { GuestVisibilitySetting } from "@/components/guest-visibility-setting"

/**
 * Les écrans de gestion des pages (DG-008). PROPRIÉTAIRE : chantier « gestion
 * des pages ».
 *
 *   · `/nouvelle-page?type=association|company` — inscrire une organisation (membre vérifié) ;
 *   · `/pages/<handle>/revendiquer` — revendiquer une page, ou en demander la
 *     vérification, pièces privées à l'appui ;
 *   · `/pages/<handle>/gerer?onglet=publications|services|demandes|avis|identite|equipe|revendications|decisions` — gérer une
 *     page pour un signataire VIVANT (lecture réactive : un rôle retiré ferme
 *     l'écran aussitôt, le serveur refuse tout geste) ; `decisions` : les
 *     décisions de modération qui ont retiré un contenu de la page, et son recours.
 *     AS-10 : un MODÉRATEUR de la page n'y voit que ce qu'il peut faire — l'équipe
 *     (la lire, s'en retirer) et la modération des commentaires ; ni publication ni gestion.
 *     AS-11a : l'onglet identité porte « Mettre la page en sommeil » pour un administrateur ;
 *     la gestion d'une page endormie dit « en sommeil » à son équipe, et la laisse réactiver.
 *     CH-816 (P0) : un onglet que la page n'offre pas (module fermé, page qui ne le porte pas)
 *     n'est pas listé ; demandé par l'adresse, il rend l'identité.
 *
 * Chaque écran dit chargement, erreur, vide, succès, et « indisponible » quand
 * le fournisseur ne sert pas la capacité.
 */
import { Button, Card, EmptyState, FolderTabsNav, Skeleton, TrustBadge, type FolderNavItem } from "@diaspora-ga/features"
import type { ManagedPageDetailView, MemberPageKind, MembershipView, PageClaimView, PageManagement } from "@diaspora-ga/features/data"
import { myTeamRoleOf } from "@diaspora-ga/features/data"
import { useDiasporaGaT } from "@diaspora-ga/features/i18n/client"
import { ArrowLeftIcon, BadgeCheckIcon, FlagIcon, MessageSquareXIcon, ShieldOffIcon } from "lucide-react"
import NextLink from "next/link"
import type { ReactNode } from "react"

import { AppShell } from "@/components/app-shell"
import { Gate } from "@/components/gate"
import { JobRecruiterPanel } from "@/components/job-recruiter-panel"
import { ClaimStatusChip, ErrorNotice, PageAdminUnavailable, usePageManageServed, usePageManagement } from "@/components/page-admin-parts"
import { PageClaimPanel } from "@/components/page-claim-form"
import { PageCreateForm, VerifiedMembershipRequired } from "@/components/page-create-form"
import { PageDecisionsPanel } from "@/components/page-decisions-panel"
import { PageIdentityForm } from "@/components/page-identity-form"
import { PageTeamPanel } from "@/components/page-team-panel"
import { PagePublicationsPanel } from "@/components/page-publications-panel"
import { PageServiceManagement } from "@/components/page-service-management"
import { PageServiceReviews } from "@/components/page-reviews-section"
import { canOfferPageSleep, ManagedPageUnavailable, PageSleepSection } from "@/components/page-sleep-section"
import { offeredManageTabs, type PageManageTab } from "@/lib/page-manage-tabs"
import { routes } from "@/lib/routes"

// La route `/pages/<handle>/gerer` lit le type ici ; la règle des onglets vit dans `@/lib/page-manage-tabs`.
export type { PageManageTab }

const TAB_LABELS: Readonly<Record<PageManageTab, string>> = {
  identite: "pageAdmin.manage.tab.identity",
  equipe: "pageAdmin.manage.tab.team",
  revendications: "pageAdmin.manage.tab.claims",
  publications: "pagePostManagement.tab",
  services: "pageServiceManagement.tabServices",
  demandes: "pageServiceManagement.tabRequests",
  avis: "pageReviews.tab",
  emplois: "pageAdmin.manage.tab.jobs",
  decisions: "pageDecisions.tab",
}

function MemberScreen(props: { readonly children: (membership: MembershipView) => ReactNode }) {
  return (
    <Gate require="member">
      {(session) => (session.membership ? <AppShell membership={session.membership}>{props.children(session.membership)}</AppShell> : null)}
    </Gate>
  )
}

// ═══════════════════════════════════════════════════════════════
// Créer une page
// ═══════════════════════════════════════════════════════════════

/** `/nouvelle-page` — inscrire une association ou une entreprise (AS-05), en trois étapes. */
export function NewPageScreen(props: { readonly kind: MemberPageKind | null }) {
  return <MemberScreen>{(membership) => <NewPage membership={membership} kind={props.kind} />}</MemberScreen>
}

function NewPage(props: { readonly membership: MembershipView; readonly kind: MemberPageKind | null }) {
  const { t } = useDiasporaGaT()
  const management = usePageManagement()
  return (
    <>
      <div>
        <h1 className="font-display text-3xl font-bold">{t("pageAdmin.create.title")}</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">{t("pageAdmin.create.lead")}</p>
      </div>
      {!management ? (
        <PageAdminUnavailable />
      ) : props.membership.status !== "verifiee" ? (
        <VerifiedMembershipRequired membership={props.membership} />
      ) : (
        <Card className="p-5">
          <PageCreateForm management={management} membership={props.membership} kind={props.kind} />
        </Card>
      )}
    </>
  )
}

// ═══════════════════════════════════════════════════════════════
// Lire la page gérée (commun à la revendication et à la gestion)
// ═══════════════════════════════════════════════════════════════

function ManagedPage(props: { readonly handle: string; readonly children: (management: PageManagement, page: ManagedPageDetailView) => ReactNode }) {
  const management = usePageManagement()
  if (!management) return <PageAdminUnavailable />
  return <ManagedPageRead management={management} handle={props.handle}>{props.children}</ManagedPageRead>
}

function ManagedPageRead(props: {
  readonly management: PageManagement
  readonly handle: string
  readonly children: (management: PageManagement, page: ManagedPageDetailView) => ReactNode
}) {
  const { t } = useDiasporaGaT()
  const page = props.management.useManagedPage(props.handle)
  if (page.status === "loading") {
    return (
      <div role="status" className="flex flex-col gap-4">
        <span className="sr-only">{t("common.pleaseWait")}</span>
        <Skeleton className="h-28 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    )
  }
  if (page.status === "error") return <ErrorNotice code={page.code} className="rounded-xl bg-muted p-4 text-[15px]" />
  // AS-11a : une page en sommeil ne se lit plus ; à son équipe, l'écran le dit au lieu d'un « introuvable ».
  if (page.data === null) return <ManagedPageUnavailable management={props.management} handle={props.handle} />
  return <>{props.children(props.management, page.data)}</>
}

function PageHeading(props: { readonly page: ManagedPageDetailView; readonly title: string; readonly lead: string }) {
  const { t } = useDiasporaGaT()
  return (
    <div className="flex flex-col gap-3">
      <Button asChild variant="ghost" size="sm" className="self-start">
        <NextLink href={routes.page(props.page.handle)}>
          <ArrowLeftIcon aria-hidden />
          {t("pageAdmin.manage.viewPage")}
        </NextLink>
      </Button>
      <div>
        <h1 className="font-display text-3xl font-bold leading-tight">{props.title}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <TrustBadge badge={props.page.badge} size="md" />
          <span className="text-sm text-muted-foreground">{t(`pageAdmin.kind.${props.page.ownerKind}`)}</span>
        </div>
        <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">{props.lead}</p>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// Revendiquer
// ═══════════════════════════════════════════════════════════════

/** `/pages/<handle>/revendiquer` — revendiquer une page, ou en demander la vérification. */
export function PageClaimScreen(props: { readonly handle: string }) {
  return (
    <MemberScreen>
      {() => (
        <ManagedPage handle={props.handle}>
          {(management, page) => {
            const verification = page.myRole === "admin"
            return (
              <ClaimView
                management={management}
                page={page}
                title={verification ? "pageAdmin.claim.verifyTitle" : "pageAdmin.claim.title"}
                lead={verification ? "pageAdmin.claim.verifyLead" : "pageAdmin.claim.lead"}
              />
            )
          }}
        </ManagedPage>
      )}
    </MemberScreen>
  )
}

function ClaimView(props: { readonly management: PageManagement; readonly page: ManagedPageDetailView; readonly title: string; readonly lead: string }) {
  const { t } = useDiasporaGaT()
  return (
    <>
      <PageHeading page={props.page} title={t(props.title, { name: props.page.name })} lead={t(props.lead)} />
      <PageClaimPanel management={props.management} page={props.page} />
    </>
  )
}

// ═══════════════════════════════════════════════════════════════
// Gérer
// ═══════════════════════════════════════════════════════════════

/** `/pages/<handle>/gerer` — publications, services/demandes/avis, identité, équipe et vérification sous mandat vivant. */
export function PageManageScreen(props: { readonly handle: string; readonly tab: PageManageTab }) {
  return (
    <MemberScreen>
      {(membership) => (
        <ManagedPage handle={props.handle}>
          {(management, page) => <ManageView management={management} page={page} membership={membership} tab={props.tab} />}
        </ManagedPage>
      )}
    </MemberScreen>
  )
}

function ManageView(props: { readonly management: PageManagement; readonly page: ManagedPageDetailView; readonly membership: MembershipView; readonly tab: PageManageTab }) {
  const { t } = useDiasporaGaT()
  // ADR-0041 du moteur : un module fermé ne laisse ni onglet ni écran à la gestion d'une page.
  const served = usePageManageServed()
  const { page } = props
  const teamRole = myTeamRoleOf(page)
  // Aucun rôle VIVANT dans l'équipe (jamais eu, ou retiré à l'instant) : la gestion se ferme, sans rien montrer de l'équipe.
  if (teamRole === null) {
    return (
      <EmptyState
        icon={<ShieldOffIcon />}
        title={t("pageAdmin.manage.notManager.title")}
        description={t("pageAdmin.manage.notManager.body")}
        action={
          <Button asChild variant="outline">
            <NextLink href={routes.page(page.handle)}>{t("pageAdmin.manage.viewPage")}</NextLink>
          </Button>
        }
      />
    )
  }
  // AS-10 : le modérateur ne publie ni ne gère ; il lit l'équipe, s'en retire et modère les commentaires.
  // Sans rôle qui parle au nom de la page (`myRole` nul), jamais d'onglet de publication ni de gestion.
  if (teamRole === "moderator" || page.myRole === null) return <ModeratorView management={props.management} page={page} />
  // CH-816 (P0) : la règle partagée avec les liens rapides de « Mes pages » (`@/lib/page-manage-tabs`).
  const offered = offeredManageTabs(page.ownerKind, served)
  // Un onglet que la page n'offre pas (module fermé, page qui ne propose ni services ni emplois) rend
  // l'identité, l'onglet par défaut de l'adresse : ni onglet ni écran « indisponible » pour un module fermé.
  const tab: PageManageTab = offered.includes(props.tab) ? props.tab : "identite"
  const items: FolderNavItem[] = offered.map((item) => ({ id: item, label: t(TAB_LABELS[item]), href: routes.pageManage(page.handle, item), active: item === tab }))
  return (
    <>
      <PageHeading page={page} title={t("pageAdmin.manage.title", { name: page.name })} lead={t(page.myRole === "admin" ? "pageAdmin.manage.roleAdmin" : "pageAdmin.manage.roleSignatory")} />
      <FolderTabsNav
        label={t("pageAdmin.manage.tabs")}
        items={items}
        renderLink={(item, className, children) => (
          <NextLink key={item.id} href={item.href} className={className} aria-current={item.active ? "page" : undefined} replace scroll={false}>
            {children}
          </NextLink>
        )}
      />
      {/* Seul un onglet offert se monte : avis et emplois n'y sont que pour la page qui les porte. */}
      {tab === "publications" ? <PagePublicationsPanel pageId={page.id} handle={page.handle} membership={props.membership} />
        : tab === "services" || tab === "demandes" ? <PageServiceManagement page={page} membership={props.membership} tab={tab} />
        : tab === "avis" ? <PageServiceReviews pageId={page.id} personId={props.membership.personId} mode="manage" />
        : tab === "decisions" ? <PageDecisionsPanel pageId={page.id} />
        : tab === "emplois" ? <JobRecruiterPanel key={page.id} pageId={page.id} pageHandle={page.handle} />
        : <><Card className="p-5">
        {tab === "identite" ? (
          page.myRole === "admin" ? (
            <div className="flex flex-col gap-4">
              <div>
                <h2 className="font-display text-xl font-bold">{t("pageAdmin.identity.title")}</h2>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{t("pageAdmin.identity.lead")}</p>
              </div>
              <GuestVisibilitySetting pageId={page.id} />
              <PageIdentityForm key={page.id} management={props.management} page={page} />
            </div>
          ) : (
            <IdentitySummary page={page} />
          )
        ) : tab === "equipe" ? (
          <PageTeamPanel management={props.management} page={page} />
        ) : (
          <VerificationPanel management={props.management} page={page} />
        )}
      </Card>
      {/* AS-11a : une zone à part, son seul bouton plein, sous l'identité. */}
      {tab === "identite" && canOfferPageSleep(props.management, page) ? (
        <Card className="p-5">
          <PageSleepSection management={props.management} page={page} />
        </Card>
      ) : null}
      </>}
    </>
  )
}

/** AS-10 — ce que voit un modérateur : la modération des commentaires et l'équipe, rien d'autre. */
function ModeratorView(props: { readonly management: PageManagement; readonly page: ManagedPageDetailView }) {
  const { t } = useDiasporaGaT()
  const { page } = props
  return (
    <>
      <PageHeading page={page} title={t("pageAdmin.manage.moderatorTitle", { name: page.name })} lead={t("pageAdmin.manage.roleModerator")} />
      <Card className="p-5">
        <section aria-labelledby="moderer-les-commentaires" className="flex flex-col items-start gap-3">
          <h2 id="moderer-les-commentaires" className="flex items-center gap-2 font-display text-xl font-bold">
            <MessageSquareXIcon aria-hidden className="size-5 shrink-0" />
            {t("pageAdmin.manage.moderation.title")}
          </h2>
          <p className="text-[15px] leading-relaxed text-muted-foreground">{t("pageAdmin.manage.moderation.body")}</p>
          <Button asChild variant="outline">
            <NextLink href={routes.page(page.handle)}>{t("pageAdmin.manage.moderation.open")}</NextLink>
          </Button>
        </section>
      </Card>
      <Card className="p-5">
        <PageTeamPanel management={props.management} page={page} />
      </Card>
    </>
  )
}

function IdentitySummary(props: { readonly page: ManagedPageDetailView }) {
  const { t } = useDiasporaGaT()
  return (
    <div className="flex flex-col gap-3">
      <h2 className="font-display text-xl font-bold">{t("pageAdmin.identity.title")}</h2>
      <p className="text-sm text-muted-foreground">{t("pageAdmin.identity.address", { handle: props.page.handle })}</p>
      <p className="font-semibold">{props.page.name}</p>
      {props.page.description ? <p className="whitespace-pre-line text-[15px] leading-relaxed">{props.page.description}</p> : null}
      <p className="rounded-xl bg-muted p-4 text-sm text-muted-foreground">{t("pageAdmin.identity.adminOnly")}</p>
    </div>
  )
}

/** La confiance de la page, dite sans ambiguïté, et mes demandes de vérification pour elle. */
function VerificationPanel(props: { readonly management: PageManagement; readonly page: ManagedPageDetailView }) {
  const { t } = useDiasporaGaT()
  const claims = props.management.useMyClaims()
  const mine: readonly PageClaimView[] = claims.status === "ready" ? claims.data.filter((claim) => claim.page.id === props.page.id) : []
  const pending = mine.some((claim) => claim.status === "pending")
  return (
    <div className="flex flex-col gap-4">
      <h2 className="font-display text-xl font-bold">{t("pageAdmin.verification.title")}</h2>
      <div className="flex items-start gap-3 rounded-xl bg-muted p-4">
        <TrustBadge badge={props.page.badge} size="md" />
        <p className="text-[15px] leading-relaxed">{t(`pageAdmin.verification.state.${props.page.badge}`)}</p>
      </div>
      {props.page.badge === "community" ? (
        props.page.myRole === "admin" ? (
          pending ? null : (
            <Button asChild className="self-start">
              <NextLink href={routes.pageClaim(props.page.handle)}>
                <BadgeCheckIcon aria-hidden />
                {t("pageAdmin.verification.request")}
              </NextLink>
            </Button>
          )
        ) : (
          <p className="text-sm text-muted-foreground">{t("pageAdmin.verification.adminOnly")}</p>
        )
      ) : null}
      <section aria-labelledby="demandes-de-verification" className="flex flex-col gap-2">
        <h3 id="demandes-de-verification" className="font-semibold">{t("pageAdmin.verification.myRequests")}</h3>
        {claims.status === "loading" ? (
          <Skeleton className="h-16 w-full rounded-xl" />
        ) : claims.status === "error" ? (
          <ErrorNotice code={claims.code} />
        ) : mine.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("pageAdmin.verification.none")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {mine.map((claim) => (
              <li key={claim.id} className="flex flex-wrap items-center gap-2 rounded-xl bg-muted p-3 text-sm">
                <ClaimStatusChip status={claim.status} />
                {claim.status === "pending" ? (
                  <NextLink href={routes.pageClaim(props.page.handle)} className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline">
                    <FlagIcon aria-hidden className="size-4" />
                    {t("pageAdmin.entry.follow")}
                  </NextLink>
                ) : claim.decisionReason ? (
                  <span>{t("pageAdmin.claim.decisionReason", { reason: claim.decisionReason })}</span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

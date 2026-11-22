"use client"

import { hasCapability, parseFeedScope, parseResidenceCountry, type CounterPresentation, type CountryCode, type FeedScope } from "@diaspora-ga/domain"
import { Avatar, Button, Card, EmptyState, EventCard, FeedDiscovery, FolderTabsNav, MemberSuggestions, StatCounter, TrustBadge, countryName } from "@diaspora-ga/features"
import { useCountryHub, useFeatureGate, useOptionalDataSource, type MembershipView, type PagesCapability } from "@diaspora-ga/features/data"
import { useDiasporaGaT } from "@diaspora-ga/features/i18n/client"
import { ArrowRightIcon, Building2Icon, GalleryVerticalEndIcon, HandshakeIcon, ListIcon, NewspaperIcon, UsersRoundIcon } from "lucide-react"
import NextLink from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useCallback, useEffect, useRef, useState, type RefObject } from "react"

import { AppShell, useComposer } from "@/components/app-shell"
import { Gate } from "@/components/gate"
import { FeedPages } from "@/components/feed-pages"
import { FeedStories } from "@/components/feed-stories"
import { countryEventsReader, RailCountryEvents } from "@/components/hub-events"
import { StatusBanner } from "@/components/status-banner"
import { countryPagesPreview } from "@/lib/country-pages"
import { FEED_DISCOVERY_OFFERED, OFFERED_FEED_SCOPES, offeredFeedScope, showsFeedDiscovery } from "@/lib/feed-presentation"
import { normalizeFeedTag, routes } from "@/lib/routes"

/**
 * `/fil` — le fil (EXF-DG-13), « Mon pays » par défaut. CH-816 (P2) : l'écran n'offre que les
 * portées et le mode que déclare `lib/feed-presentation` — au lancement, le pays et toute la
 * diaspora, en liste ; une adresse qui demande une portée ou un mode retiré montre le défaut.
 */
export function FeedScreen() {
  return (
    <Gate require="member">
      {(session) =>
        session.membership ? (
          <AppShell membership={session.membership} rail={<FeedRail membership={session.membership} />}>
            <Feed membership={session.membership} />
          </AppShell>
        ) : null
      }
    </Gate>
  )
}

/** Les paramètres que la table des routes attache au mode Découverte (DG-017). */
function discoveryParams(): URLSearchParams {
  const href = routes.feedDiscovery()
  const at = href.indexOf("?")
  return new URLSearchParams(at < 0 ? "" : href.slice(at + 1))
}

/** Le mode Liste reste celui par défaut : la découverte ne s'ouvre que sur son adresse. */
function isDiscoveryView(searchParams: { get(name: string): string | null }): boolean {
  const entries = [...discoveryParams()]
  return entries.length > 0 && entries.every(([key, value]) => searchParams.get(key) === value)
}

/** L'adresse du fil en découverte : celle de la liste (portée, filtre, pays) plus le mode, sans rien écrire en dur. */
function discoveryHref(scope: FeedScope, tag: string | undefined, country: CountryCode | undefined): string {
  const list = routes.feed(scope, tag, country)
  const at = list.indexOf("?")
  const query = new URLSearchParams(at < 0 ? "" : list.slice(at + 1))
  for (const [key, value] of discoveryParams()) query.set(key, value)
  return `${at < 0 ? list : list.slice(0, at)}?${query.toString()}`
}

function Feed(props: { membership: MembershipView }) {
  const { t, locale } = useDiasporaGaT()
  const searchParams = useSearchParams()
  const router = useRouter()
  // CH-816 (P2) : une portée retirée de l'écran (« Récents », « Pour vous ») montre la portée par défaut, son onglet actif.
  const scope = offeredFeedScope(parseFeedScope(searchParams.get("scope")), OFFERED_FEED_SCOPES)
  const tag = normalizeFeedTag(searchParams.get("tag"))
  const parsedCountry = parseResidenceCountry(searchParams.get("country"))
  const hubCountry = parsedCountry.ok ? parsedCountry.value : undefined
  // La découverte non offerte, son adresse rend la liste ; son code reste branché derrière la déclaration.
  const discovery = showsFeedDiscovery(isDiscoveryView(searchParams), FEED_DISCOVERY_OFFERED)
  const composer = useComposer()
  // ADR-0041 du moteur : l'inscription d'une organisation n'est proposée que pages ouvertes.
  const pagesOpen = useFeatureGate().isOpen("pages")
  const country = hubCountry ?? props.membership.facet.countryOfResidence
  const now = Date.now()
  // Changer de portée ou retirer le filtre garde le mode d'affichage choisi.
  const viewHref = (nextScope: FeedScope, nextTag: string | undefined) =>
    discovery ? discoveryHref(nextScope, nextTag, hubCountry) : routes.feed(nextScope, nextTag, hubCountry)
  const listHref = routes.feed(scope, tag, hubCountry)
  // L'élément actif de la découverte, et celui sur lequel la liste doit se recaler en revenant.
  const lastActive = useRef<string | null>(null)
  const listLink = useRef<HTMLAnchorElement>(null)
  const [returnTo, setReturnTo] = useState<string | null>(null)
  const clearReturn = useCallback(() => setReturnTo(null), [setReturnTo])
  const rememberActive = useCallback((postId: string | null) => { lastActive.current = postId }, [])

  const viewToggle = (
    <FolderTabsNav
      label={t("discovery.view.label")}
      className="w-auto"
      items={[
        { id: "list", label: t("discovery.view.list"), href: listHref, active: !discovery, icon: <ListIcon className="size-4" aria-hidden /> },
        { id: "discovery", label: t("discovery.view.discovery"), href: discoveryHref(scope, tag, hubCountry), active: discovery, icon: <GalleryVerticalEndIcon className="size-4" aria-hidden /> },
      ]}
      renderLink={(item, className, children) => (
        <NextLink
          key={item.id}
          ref={item.id === "list" ? listLink : undefined}
          href={item.href}
          className={className}
          aria-current={item.active ? "page" : undefined}
          scroll={false}
          onClick={item.id === "list" && discovery ? () => setReturnTo(lastActive.current) : undefined}
        >
          {children}
        </NextLink>
      )}
    />
  )

  const emptyFallback = (
    <EmptyState
      icon={<NewspaperIcon />}
      title={tag === undefined ? t(`feed.empty.${scope}.title`, { country: countryName(country, locale) }) : t("feed.tagEmptyTitle", { tag })}
      description={tag === undefined ? t(`feed.empty.${scope}.body`) : t("feed.tagEmptyBody")}
      action={
        tag === undefined && composer.canPublish ? (
          <button type="button" onClick={composer.open} className="font-semibold text-primary underline-offset-4 hover:underline focus-visible:shadow-focus">
            {t("feed.empty.action")}
          </button>
        ) : undefined
      }
    />
  )

  return (
    <>
      <StatusBanner membership={props.membership} />
      <h1 className="sr-only">{t("feed.title")}</h1>
      <FolderTabsNav
        label={t("feed.scopesLabel")}
        items={OFFERED_FEED_SCOPES.map((id: FeedScope) => ({
          id,
          label: id === "mon_pays" ? countryName(country, locale) : t(`feed.scope.${id}`),
          href: viewHref(id, tag),
          active: id === scope,
        }))}
        renderLink={(item, className, children) => (
          <NextLink key={item.id} href={item.href} className={className} aria-current={item.active ? "page" : undefined} scroll={false}>
            {children}
          </NextLink>
        )}
      />
      {discovery ? null : <p className="-mt-1 text-[13px] text-muted-foreground">{t(`feed.scopeHint.${scope}`, { country: countryName(country, locale) })}</p>}

      {tag !== undefined ? (
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-lg bg-muted px-3 py-2">
          <p className="min-w-0 break-all text-sm font-medium">{t("feed.tagFilter", { tag })}</p>
          <NextLink href={viewHref(scope, undefined)} className="inline-flex min-h-11 items-center rounded-md px-2 text-sm font-semibold text-primary underline-offset-4 hover:underline focus-visible:shadow-focus" scroll={false}>
            {t("feed.clearTag")}
          </NextLink>
        </div>
      ) : null}

      {discovery ? (
        <FeedDiscovery
          membership={props.membership}
          scope={scope}
          {...(hubCountry === undefined ? {} : { hubCountry })}
          {...(tag === undefined ? {} : { tag })}
          now={now}
          emptyFallback={emptyFallback}
          toolbarStart={viewToggle}
          onActiveChange={rememberActive}
          onExit={(postId) => {
            setReturnTo(postId)
            router.push(listHref, { scroll: false })
          }}
          // La fenêtre de lecture tient entre l'en-tête, les portées et la barre basse ; le filtre de mot-dièse prend sa ligne.
          viewportClassName={tag === undefined
            ? "h-[calc(100dvh-19rem)] min-h-[20rem] min-[960px]:h-[calc(100dvh-13rem)]"
            : "h-[calc(100dvh-23rem)] min-h-[20rem] min-[960px]:h-[calc(100dvh-17rem)]"}
        />
      ) : (
        <>
          {/* CH-816 (P2) : la bascule ne paraît que la découverte offerte (`FEED_DISCOVERY_OFFERED`). */}
          {FEED_DISCOVERY_OFFERED ? <div className="flex">{viewToggle}</div> : null}

          <FeedStories now={now} />

          {/* La carte d'identité du fil, comme celle du réseau de l'administration : elle porte les gestes
              de création — publier, et inscrire son organisation (AS-05) — à la même place sur chaque visite. */}
          {composer.canPublish ? (
            <Card className="flex flex-col gap-3 p-3">
              <div className="flex items-center gap-3">
                <Avatar id={props.membership.personId} name={props.membership.displayName} />
                <button
                  type="button"
                  onClick={composer.open}
                  className="flex min-h-11 flex-1 items-center rounded-[var(--esp-r-chrome)] bg-muted px-4 text-left text-[15px] text-muted-foreground transition-colors hover:bg-[var(--ink-150)] focus-visible:shadow-focus"
                >
                  {props.membership.facet.city ? t("feed.prompt", { city: props.membership.facet.city }) : t("feed.promptNoCity")}
                </button>
              </div>
              {/* Qui publie est en règle (`declaree` ou `verifiee`) : l'inscription lui est proposée ici ; un membre en
                  attente la trouve dans l'annuaire des pages, qui lui dit comment devenir vérifié. Pages fermées
                  sur le réseau (ADR-0041 du moteur) : aucune inscription proposée. */}
              {pagesOpen ? (
              <div role="group" aria-label={t("feed.registerLabel")} className="flex flex-wrap gap-2 border-t border-border pt-3">
                  <Button asChild size="sm" variant="ghost">
                    <NextLink href={routes.newPage("association")}>
                      <UsersRoundIcon aria-hidden />
                      {t("pageAdmin.myPages.createAssociation")}
                    </NextLink>
                  </Button>
                  <Button asChild size="sm" variant="ghost">
                    <NextLink href={routes.newPage("company")}>
                      <Building2Icon aria-hidden />
                      {t("pageAdmin.myPages.createCompany")}
                    </NextLink>
                  </Button>
              </div>
              ) : null}
            </Card>
          ) : null}

          <FeedPages
            membership={props.membership}
            scope={scope}
            {...(tag === undefined ? {} : { tag })}
            {...(hubCountry === undefined ? {} : { hubCountry })}
            now={now}
            emptyFallback={emptyFallback}
          />
          <ListReturn postId={returnTo} fallback={listLink} onDone={clearReturn} />
        </>
      )}
    </>
  )
}

/** Au-delà, la publication active n'est pas dans les pages que la liste a montées : on cesse de la chercher. */
const LIST_RETURN_BUDGET_MS = 2_000
const LIST_RETURN_STEP_MS = 50

/**
 * Retour de la découverte : la liste se cale sur la publication qui était
 * active dès qu'une de ses pages la rend, et y porte le focus (lien de
 * l'auteur, sinon premier lien de la carte) ; à défaut, le focus revient sur la
 * bascule « Liste ». La carte est repérée par l'identifiant d'auteur que pose
 * `PostCard` (`post-<id>-auteur`), qui nomme déjà son article.
 */
function ListReturn(props: { postId: string | null; fallback: RefObject<HTMLAnchorElement | null>; onDone: () => void }) {
  const { postId, fallback, onDone } = props
  useEffect(() => {
    if (postId === null) return
    const deadline = Date.now() + LIST_RETURN_BUDGET_MS
    let timer: ReturnType<typeof setTimeout> | null = null
    const seek = () => {
      const author = document.getElementById(`post-${postId}-auteur`)
      const article = author?.closest("article") ?? null
      if (author !== null && article !== null) {
        if (typeof article.scrollIntoView === "function") article.scrollIntoView({ block: "center" })
        const target = author instanceof HTMLAnchorElement ? author : article.querySelector<HTMLElement>("a[href]")
        target?.focus({ preventScroll: true })
        onDone()
        return
      }
      if (Date.now() >= deadline) {
        fallback.current?.focus()
        onDone()
        return
      }
      timer = setTimeout(seek, LIST_RETURN_STEP_MS)
    }
    seek()
    return () => {
      if (timer !== null) clearTimeout(timer)
    }
  }, [postId, fallback, onDone])
  return null
}

/** Un compteur du rail ne s'affiche que mesuré et positif : jamais « 0 », jamais un seuil (CH-816, P2). */
function railCounterShown(counter: CounterPresentation): boolean {
  return counter.kind === "value" && counter.value > 0
}

/**
 * Rail droit (≥ 1 280 px), dans l'ordre de la fiche de lancement (CH-816, P2) : des membres à
 * rencontrer, la carte de mon pays, les pages du pays (AS-05 : les officielles d'abord, les
 * institutions à suivre), les prochains évènements (module des groupes et évènements ouvert,
 * HB-02), puis le rappel du parrainage. Un compteur à zéro ne s'affiche pas ; le nombre des
 * évènements ne s'affiche que mesuré par le passage nocturne (EV-02) ; un fournisseur qui ne lit
 * pas les évènements d'un pays ne dit pas « aucun évènement » : il dit où ils se trouvent.
 */
export function FeedRail(props: { membership: MembershipView }) {
  const { t, locale } = useDiasporaGaT()
  const country = props.membership.facet.countryOfResidence
  const hub = useCountryHub(country)
  const countryEvents = countryEventsReader(useOptionalDataSource()?.associationEvents)
  const now = Date.now()
  // ADR-0041 du moteur : le rail ne dit rien des modules fermés sur le réseau (associations, évènements).
  const features = useFeatureGate()
  const pagesOpen = features.isOpen("pages")
  const eventsOpen = features.isOpen("groupsAndEvents")
  const eventsMeasured = eventsOpen && hub.status === "ready" && hub.data.eventsSource !== "unmeasured"
  const counters = hub.status === "ready" && !hub.data.counters.dormant ? hub.data.counters : null
  const associationsShown = pagesOpen && counters !== null && railCounterShown(counters.associations)
  const eventsShown = eventsMeasured && counters !== null && railCounterShown(counters.upcomingEvents)
  return (
    <>
      <MemberSuggestions headingId="rail-suggestions" />
      <Card className="p-4">
        <p className="font-mono text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">{t("rail.myHub")}</p>
        <p className="mt-1 font-display text-xl font-bold">{countryName(country, locale)}</p>
        {counters !== null && (associationsShown || eventsShown) ? (
          <div className={associationsShown && eventsShown ? "mt-3 grid grid-cols-2 gap-3" : "mt-3"}>
            {associationsShown ? <StatCounter value={counters.associations} label={t("hub.counters.associations")} /> : null}
            {eventsShown ? <StatCounter value={counters.upcomingEvents} label={t("hub.counters.events")} /> : null}
          </div>
        ) : null}
        <NextLink
          href={routes.hub(country)}
          className="mt-4 inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-primary hover:underline focus-visible:shadow-focus"
        >
          {t("rail.openHub")}
          <ArrowRightIcon className="size-4" aria-hidden />
        </NextLink>
      </Card>
      <RailCountryPages country={country} />
      {eventsOpen ? (
      <section aria-labelledby="rail-evenements" className="flex flex-col gap-3">
        <h2 id="rail-evenements" className="font-display text-lg font-bold">
          {t("rail.upcoming")}
        </h2>
        {/* Rien n'est affirmé avant la lecture du hub : ni liste, ni « aucun évènement ». */}
        {hub.status !== "ready" ? null : hub.data.eventsSource === "demo" ? (
          // La démonstration joint au hub ses évènements fictifs (autre modèle, que EV-05 réunira).
          hub.data.events.length > 0 ? (
            hub.data.events.slice(0, 3).map((event) => <EventCard key={event.id} event={event} now={now} hubCountry={country} />)
          ) : (
            <p className="text-[13px] text-muted-foreground">{t("rail.noEvents")}</p>
          )
        ) : countryEvents ? (
          <RailCountryEvents read={countryEvents} country={country} />
        ) : (
          <>
            <p className="text-[13px] text-muted-foreground">{t("rail.eventsUnlisted")}</p>
            <NextLink
              href={routes.agenda()}
              className="inline-flex min-h-10 items-center gap-1 self-start text-sm font-semibold text-primary hover:underline focus-visible:shadow-focus"
            >
              {t("eventCalendar.agendaTitle")}
              <ArrowRightIcon className="size-4" aria-hidden />
            </NextLink>
          </>
        )}
      </section>
      ) : null}
      <RailSponsorReminder membership={props.membership} />
    </>
  )
}

/**
 * Le rappel du parrainage, en fin de rail (CH-816, P2) : le parrainage est la porte d'entrée
 * des proches, et « Parrainer » quitte la barre pour le menu du compte. Une phrase et un lien,
 * sans chiffre ni promesse ; seulement à qui peut parrainer (membre vérifié), l'ancienneté se
 * jugeant sur la page du parrainage.
 */
function RailSponsorReminder(props: { membership: MembershipView }) {
  const { t } = useDiasporaGaT()
  if (!hasCapability(props.membership.status, "sponsor")) return null
  return (
    <section aria-labelledby="rail-parrainage" className="flex flex-col gap-2 rounded-xl bg-muted p-4">
      <h2 id="rail-parrainage" className="flex items-center gap-2 font-display text-base font-bold">
        <HandshakeIcon className="size-4 shrink-0" aria-hidden />
        {t("rail.sponsor.title")}
      </h2>
      <p className="text-[13px] leading-relaxed text-muted-foreground">{t("rail.sponsor.body")}</p>
      <NextLink
        href={routes.sponsor()}
        className="inline-flex min-h-10 items-center gap-1 self-start text-sm font-semibold text-primary hover:underline focus-visible:shadow-focus"
      >
        {t("rail.sponsor.link")}
        <ArrowRightIcon className="size-4" aria-hidden />
      </NextLink>
    </section>
  )
}

/**
 * Les pages du pays de résidence dans le rail, comme le rail des pages du réseau de
 * l'administration : les officielles d'abord, puis associations et entreprises. Sans
 * annuaire servi, rien ; avant la lecture, rien n'est affirmé (ni liste, ni « aucune »).
 * CH-816 (P2) : une lecture prête sans aucune page ni suite ne rend rien — un bloc du rail
 * qui dit « rien » est du bruit.
 */
function RailCountryPages(props: { country: CountryCode }) {
  const pages = useOptionalDataSource()?.pages ?? null
  if (pages === null) return null
  return <RailCountryPagesRead capability={pages} country={props.country} />
}

function RailCountryPagesRead(props: { capability: PagesCapability; country: CountryCode }) {
  const { t, locale } = useDiasporaGaT()
  const result = props.capability.useHubPages(props.country)
  if (result.status === "loading") return null
  // Une lecture refusée ne dit ni liste ni « aucune page » : le chemin vers l'annuaire reste.
  const preview = result.status === "ready" ? countryPagesPreview(result.data) : null
  const more = result.status === "ready" && (result.data.more.officialPages || result.data.more.associations || result.data.more.companies)
  if (preview !== null && preview.length === 0 && !more) return null
  return (
    <section aria-labelledby="rail-pages" className="flex flex-col gap-3">
      <h2 id="rail-pages" className="font-display text-lg font-bold">
        {t("rail.pages.title", { country: countryName(props.country, locale) })}
      </h2>
      {preview === null ? null : preview.length === 0 ? (
        // Une fenêtre bornée peut ne rien garder d'un pays qui a des pages : la suite est dans l'annuaire.
        <p className="text-[13px] text-muted-foreground">{t("hub.pagesElsewhere")}</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {preview.map((page) => (
            <li key={page.id}>
              <NextLink href={routes.page(page.handle)} className="flex min-h-12 items-center gap-3 rounded-xl p-2 transition-colors hover:bg-muted focus-visible:shadow-focus">
                <Avatar id={page.id} name={page.name} shape="square" size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{page.name}</span>
                  <span className="block truncate text-[13px] text-muted-foreground">{t(`page.kind.${page.ownerKind}`)}</span>
                </span>
                {page.badge !== "community" ? <TrustBadge badge={page.badge} /> : null}
              </NextLink>
            </li>
          ))}
        </ul>
      )}
      <NextLink
        href={routes.pages({ country: props.country })}
        className="inline-flex min-h-10 items-center gap-1 self-start text-sm font-semibold text-primary hover:underline focus-visible:shadow-focus"
      >
        {t("rail.pages.directory")}
        <ArrowRightIcon className="size-4" aria-hidden />
      </NextLink>
    </section>
  )
}

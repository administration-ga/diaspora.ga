"use client"

/**
 * Les pièces de l'inscription d'une organisation (AS-05) : la frise des étapes, les
 * pages au nom proche et les premiers gestes d'une page inscrite. PROPRIÉTAIRE :
 * chantier « gestion des pages ». Les règles vivent dans `@/lib/page-registration`.
 */
import { Avatar, Button, cn, CountryTag, TrustBadge } from "@diaspora-ga/features"
import { useOptionalDataSource, type MemberPageKind, type PagesCapability } from "@diaspora-ga/features/data"
import { useDiasporaGaT } from "@diaspora-ga/features/i18n/client"
import { isCountryCode, type CountryCode } from "@diaspora-ga/domain"
import {
  ArrowRightIcon,
  BadgeCheckIcon,
  BriefcaseBusinessIcon,
  CalendarClockIcon,
  CheckIcon,
  FlagIcon,
  HeartHandshakeIcon,
  ImageIcon,
  MegaphoneIcon,
  UsersRoundIcon,
  type LucideIcon,
} from "lucide-react"
import NextLink from "next/link"
import { useEffect, useId, useRef, useState } from "react"

import {
  nearbyNameQuery,
  nearbyPageClaimable,
  NEARBY_PAGES_MAX,
  NEARBY_SEARCH_DELAY_MS,
  REGISTRATION_STEP_LABELS,
  REGISTRATION_STEPS,
  registrationNextSteps,
  registrationStepIndex,
  type RegistrationCapabilities,
  type RegistrationNextStepId,
  type RegistrationStep,
} from "@/lib/page-registration"
import { routes } from "@/lib/routes"

// ═══════════════════════════════════════════════════════════════
// La frise des étapes
// ═══════════════════════════════════════════════════════════════

/** Trois étapes numérotées ; l'étape courante est dite (`aria-current="step"`), les passées cochées. */
export function RegistrationStepper(props: { readonly step: RegistrationStep }) {
  const { t } = useDiasporaGaT()
  const current = registrationStepIndex(props.step)
  return (
    <div className="flex flex-col gap-2">
      <ol aria-label={t("pageAdmin.register.steps")} className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {REGISTRATION_STEPS.map((step, index) => {
          const done = index < current
          const active = index === current
          return (
            <li key={step} aria-current={active ? "step" : undefined} className="flex items-center gap-2">
              <span
                aria-hidden
                className={cn(
                  "grid size-7 shrink-0 place-items-center rounded-full text-[13px] font-semibold",
                  active ? "bg-primary text-primary-foreground" : done ? "bg-[var(--esp-accent-soft)] text-[var(--esp-accent-deep)]" : "bg-muted text-muted-foreground",
                )}
              >
                {done ? <CheckIcon className="size-4" /> : index + 1}
              </span>
              <span className={cn("text-sm", active ? "font-semibold text-foreground" : "text-muted-foreground")}>{t(REGISTRATION_STEP_LABELS[step])}</span>
            </li>
          )
        })}
      </ol>
      <p className="sr-only" aria-live="polite">
        {t("pageAdmin.register.stepOf", { current: current + 1, total: REGISTRATION_STEPS.length, step: t(REGISTRATION_STEP_LABELS[props.step]) })}
      </p>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// Les pages au nom proche
// ═══════════════════════════════════════════════════════════════

/** La valeur, une fois la saisie posée : la recherche ne part pas à chaque touche. */
function useSettledValue(value: string, delay: number): string {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return settled
}

/**
 * Avant d'inscrire, les pages du même pays au nom proche : si l'une est la sienne, on la
 * revendique plutôt que d'en inscrire une seconde. Une lecture en échec, ou un fournisseur
 * sans annuaire, ne bloque jamais l'inscription : rien ne s'affiche.
 */
export function NearbyPages(props: { readonly name: string; readonly country: string; readonly dismissible?: boolean }) {
  const pages = useOptionalDataSource()?.pages ?? null
  const query = nearbyNameQuery(useSettledValue(props.name, NEARBY_SEARCH_DELAY_MS))
  const [dismissed, setDismissed] = useState<string | null>(null)
  if (pages === null || query === null || dismissed === query) return null
  return (
    <NearbyPagesRead
      capability={pages}
      query={query}
      country={isCountryCode(props.country) ? props.country : null}
      {...(props.dismissible ? { onDismiss: () => setDismissed(query) } : {})}
    />
  )
}

function NearbyPagesRead(props: { readonly capability: PagesCapability; readonly query: string; readonly country: CountryCode | null; readonly onDismiss?: () => void }) {
  const { t } = useDiasporaGaT()
  const titleId = useId()
  const result = props.capability.useDirectory({ query: props.query, cursor: null, ...(props.country ? { country: props.country } : {}) })
  if (result.status !== "ready") return null
  const items = result.data.items.slice(0, NEARBY_PAGES_MAX)
  if (items.length === 0) return null
  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-3 rounded-xl bg-muted p-4">
      <div>
        <h3 id={titleId} className="font-semibold">{t("pageAdmin.register.nearby.title")}</h3>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{t("pageAdmin.register.nearby.lead")}</p>
      </div>
      <ul className="flex flex-col gap-2">
        {items.map((page) => (
          <li key={page.id} className="flex flex-wrap items-center gap-3 rounded-lg bg-card p-3">
            <Avatar id={page.id} name={page.name} shape="square" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{page.name}</p>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                {page.badge !== "community" ? <TrustBadge badge={page.badge} /> : null}
                {page.country ? <CountryTag country={page.country} city={page.city ?? undefined} /> : null}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {nearbyPageClaimable(page) ? (
                <Button asChild size="sm">
                  <NextLink href={routes.pageClaim(page.handle)} aria-label={t("pageAdmin.register.nearby.claimLabel", { name: page.name })}>
                    <FlagIcon aria-hidden />
                    {t("pageAdmin.register.nearby.claim")}
                  </NextLink>
                </Button>
              ) : null}
              <Button asChild size="sm" variant="outline">
                <NextLink href={routes.page(page.handle)} aria-label={t("pageAdmin.register.nearby.seeLabel", { name: page.name })}>
                  {t("pageAdmin.register.nearby.see")}
                </NextLink>
              </Button>
            </div>
          </li>
        ))}
      </ul>
      {props.onDismiss ? (
        <Button type="button" variant="ghost" size="sm" className="self-start" onClick={props.onDismiss}>
          {t("pageAdmin.register.nearby.continue")}
        </Button>
      ) : null}
    </section>
  )
}

// ═══════════════════════════════════════════════════════════════
// Une fois inscrite
// ═══════════════════════════════════════════════════════════════

const NEXT_STEP_ICONS: Readonly<Record<RegistrationNextStepId, LucideIcon>> = {
  identity: ImageIcon,
  verification: BadgeCheckIcon,
  team: UsersRoundIcon,
  members: HeartHandshakeIcon,
  jobs: BriefcaseBusinessIcon,
  services: CalendarClockIcon,
  publication: MegaphoneIcon,
}

/** La page est inscrite : on le dit, puis les premiers gestes qui la font vivre, chacun à un geste. */
export function RegistrationDone(props: { readonly page: { readonly handle: string; readonly name: string; readonly ownerKind: MemberPageKind }; readonly capabilities: RegistrationCapabilities }) {
  const { t } = useDiasporaGaT()
  const heading = useRef<HTMLHeadingElement>(null)
  const listId = useId()
  // Le contenu change sous le bouton d'envoi : le focus suit la nouvelle étape, annoncée par son titre.
  useEffect(() => heading.current?.focus(), [])
  const steps = registrationNextSteps(props.page, props.capabilities)
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start gap-3">
        <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-full bg-[var(--esp-accent-soft)] text-[var(--esp-accent-deep)]">
          <CheckIcon className="size-5" />
        </span>
        <div className="min-w-0">
          <h2 ref={heading} tabIndex={-1} className="font-display text-xl font-bold outline-none">
            {t("pageAdmin.register.done.title", { name: props.page.name })}
          </h2>
          <p className="mt-1 text-[15px] leading-relaxed text-muted-foreground">{t("pageAdmin.register.done.lead")}</p>
        </div>
      </div>
      <nav aria-labelledby={listId}>
        <h3 id={listId} className="sr-only">{t("pageAdmin.register.done.stepsLabel")}</h3>
        <ol className="flex flex-col gap-2">
          {steps.map((step) => {
            const Icon = NEXT_STEP_ICONS[step.id]
            return (
              <li key={step.id}>
                <NextLink
                  href={step.href}
                  className="flex min-h-14 items-center gap-3 rounded-xl bg-muted p-3 transition-colors hover:bg-[var(--esp-accent-soft)] focus-visible:shadow-focus"
                >
                  <Icon aria-hidden className="size-5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{t(step.titleKey)}</span>
                    <span className="block text-[13px] leading-snug text-muted-foreground">{t(step.hintKey)}</span>
                  </span>
                  <ArrowRightIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                </NextLink>
              </li>
            )
          })}
        </ol>
      </nav>
      <Button asChild className="self-start">
        <NextLink href={routes.page(props.page.handle)}>{t("pageAdmin.register.done.seePage")}</NextLink>
      </Button>
    </div>
  )
}

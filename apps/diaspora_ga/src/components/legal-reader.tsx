"use client"

import { isCommunityRule, LEGAL_TEXTS, type CommunityRule, type LegalTextEdition, type LegalTextKind } from "@diaspora-ga/domain"
import { cn, FloatingNotice, ViewPane } from "@diaspora-ga/features"
import { reportReasonsOfRule } from "@diaspora-ga/features/data"
import { useDiasporaGaT } from "@diaspora-ga/features/i18n/client"
import { ArrowLeftIcon, ArrowRightIcon, FilePenLineIcon, ScaleIcon } from "lucide-react"
import NextLink from "next/link"
import { useEffect, useRef, useSyncExternalStore, type MouseEvent } from "react"

import { parseLegalBody } from "@/lib/legal-body"
import { LEGAL_SECTION_LINKS, legalSectionAnchor, legalSummaryAnchor } from "@/lib/legal-texts"
import { isPlainClick } from "@/lib/plain-click"

export interface LegalReaderProps {
  readonly kind: LegalTextKind
  /** La rubrique choisie ; `null` (ou inconnue) : aucune — le sommaire au téléphone, la première rubrique au bureau. */
  readonly active: string | null
  /** L'adresse d'une rubrique, ou du sommaire (`null`) : une ancre dans la page, l'adresse complète dans la page flottante. */
  readonly sectionHref: (section: string | null) => string
  /**
   * Absent : les liens du sommaire et du pagineur sont des ancres natives (l'adresse change, le
   * retour du navigateur remonte d'une rubrique). Présent (page flottante) : il reçoit le clic
   * simple, et l'adresse reste celle de la page ; un clic modifié suit toujours le lien.
   */
  readonly onSelect?: (section: string | null) => void
  /** Le niveau des intitulés de rubrique : 2 sous le titre d'une page, 3 sous celui d'une feuille. */
  readonly headingLevel: 2 | 3
}

function subscribeToNothing(): () => void {
  return () => {}
}

/** Faux au rendu du serveur et pendant l'hydratation, vrai ensuite : rien n'est masqué sans script. */
function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribeToNothing,
    () => true,
    () => false,
  )
}

/**
 * Le lecteur des textes du site (« une page = une vue », décision du 24/11/2026, § 5) : sommaire,
 * UNE rubrique, Précédent et Suivant. Monté dans la page publique de chaque texte et dans la page
 * flottante « Informations » de la coque. Il ne lit aucune source de données (une arrivée directe
 * sur un texte n'en a pas) : le domaine, les textes, l'adresse.
 *
 * Le serveur rend TOUT le texte : chaque rubrique est dans le HTML, aucune n'est masquée, les
 * ancres répondent sans script. Après l'hydratation seulement, une rubrique est montrée et les
 * autres portent `data-inactive` (masquées à l'écran, imprimées). Le cadre est en CSS seul, par
 * requête de conteneur : au large, sommaire et rubrique côte à côte, deux volets qui défilent
 * seuls ; à l'étroit, un niveau à la fois (le sommaire, puis la rubrique). Avant l'hydratation, à
 * l'étroit, le sommaire puis le texte entier.
 *
 * Le focus suit la vue : une rubrique choisie depuis le lecteur (sommaire, pagineur), ou par le
 * retour du navigateur quand le focus était dans le lecteur, le reçoit sur son intitulé ; le
 * retour au sommaire le rend à l'entrée de la rubrique quittée. Un geste hors du lecteur (le
 * « Retour » d'une feuille) garde son focus.
 */
export function LegalReader(props: LegalReaderProps) {
  const { t } = useDiasporaGaT()
  const hydrated = useHydrated()
  const edition = LEGAL_TEXTS[props.kind]
  const sections = edition.sections
  const active = props.active !== null && sections.includes(props.active) ? props.active : null
  // Le registre du domaine donne au moins une rubrique à chaque texte (test du domaine).
  const shown = active ?? sections[0] ?? ""
  const view = active === null ? "summary" : "section"
  const position = sections.indexOf(shown)
  const previous = position > 0 ? sections[position - 1] : undefined
  const next = position >= 0 && position < sections.length - 1 ? sections[position + 1] : undefined
  const base = `legal.${props.kind}`
  const Heading = props.headingLevel === 2 ? "h2" : "h3"

  const rootRef = useRef<HTMLDivElement>(null)
  const textRef = useRef<HTMLDivElement>(null)
  const settled = useRef(false)
  const lastShown = useRef(shown)
  useEffect(() => {
    if (!hydrated) return
    const root = rootRef.current
    const leaving = lastShown.current
    lastShown.current = shown
    // Une autre rubrique, ou l'autre vue : le volet du texte repart du haut.
    if (textRef.current) textRef.current.scrollTop = 0
    if (!settled.current) {
      settled.current = true
      // Arrivée sur l'ancre d'une rubrique : le navigateur l'avait trouvée dans le texte entier ;
      // les autres masquées, elle est ramenée en tête (document relâché sous 600 px de haut).
      const section = active === null ? null : root?.querySelector<HTMLElement>(`[data-section="${active}"]`)
      if (section && typeof section.scrollIntoView === "function") section.scrollIntoView({ block: "start" })
      return
    }
    const focused = document.activeElement
    if (root === null || !(focused === null || focused === document.body || root.contains(focused))) return
    const target =
      view === "section"
        ? root.querySelector<HTMLElement>(`[data-section="${shown}"] [data-section-heading]`)
        : root.querySelector<HTMLElement>(`[data-summary-link="${leaving}"]`)
    target?.focus()
  }, [hydrated, view, shown, active])

  const follow = (section: string | null) => (event: MouseEvent<HTMLAnchorElement>) => {
    if (props.onSelect === undefined || !isPlainClick(event)) return
    event.preventDefault()
    props.onSelect(section)
  }

  return (
    <div ref={rootRef} data-legal-reader="" data-view={view} className="@container/reader flex min-w-0 flex-col gap-4 tall:min-h-0 tall:flex-1">
      <EditionMarker edition={edition} />
      <div className="flex min-w-0 flex-col gap-4 tall:min-h-0 tall:flex-1 @2xl/reader:grid @2xl/reader:grid-cols-[minmax(13rem,17rem)_minmax(0,1fr)] @2xl/reader:grid-rows-[minmax(0,1fr)] @2xl/reader:gap-6 print:block">
        <ViewPane
          landmark="navigation"
          label={t("legal.summary")}
          id={legalSummaryAnchor()}
          className={cn(
            "flex shrink-0 flex-col gap-1 bg-muted px-2 py-3 print:hidden",
            // Après l'hydratation, à l'étroit : un niveau à la fois. Avant : le sommaire, borné, puis le texte.
            hydrated ? (view === "section" ? "@max-2xl/reader:hidden" : "tall:flex-1") : "@max-2xl/reader:tall:max-h-[40%]",
          )}
        >
          <p className="px-2 font-mono text-[13px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{t("legal.summary")}</p>
          <ol className="flex flex-col gap-0.5">
            {sections.map((section, index) => (
              <li key={section}>
                <a
                  href={props.sectionHref(section)}
                  data-summary-link={section}
                  aria-current={hydrated && section === shown ? "true" : undefined}
                  onClick={follow(section)}
                  className="group flex min-h-11 items-center gap-2 rounded-lg px-2 py-1.5 text-sm leading-snug transition-colors hover:bg-neutral-hover focus-visible:shadow-focus aria-[current=true]:bg-[var(--esp-accent-soft)] aria-[current=true]:font-semibold aria-[current=true]:text-[var(--esp-accent-deep)]"
                >
                  <span className="shrink-0 font-mono text-[13px] text-muted-foreground group-aria-[current=true]:text-inherit">
                    {t("legal.sectionNumber", { number: index + 1 })}
                  </span>
                  <span className="min-w-0">{t(`${base}.${section}.title`)}</span>
                </a>
              </li>
            ))}
          </ol>
        </ViewPane>

        <ViewPane
          ref={textRef}
          label={t(`${base}.title`)}
          className={cn("flex flex-col gap-6 px-1 pb-2 tall:flex-1", hydrated && view === "summary" && "@max-2xl/reader:hidden")}
        >
          {sections.map((section, index) => {
            const link = LEGAL_SECTION_LINKS[props.kind][section]
            const rule = props.kind === "community" && isCommunityRule(section) ? section : null
            return (
              <section
                key={section}
                id={legalSectionAnchor(props.kind, section)}
                data-section={section}
                // Jamais l'attribut `hidden` : la rubrique reste dans le document, la recherche et l'impression.
                data-inactive={hydrated && section !== shown ? "" : undefined}
                className="flex scroll-mt-4 flex-col gap-3 data-[inactive]:hidden print:data-[inactive]:flex"
              >
                <Heading data-section-heading="" tabIndex={-1} className="font-display text-xl font-bold outline-none focus-visible:shadow-none">
                  <span className="font-mono text-base font-semibold text-muted-foreground">{t("legal.sectionNumber", { number: index + 1 })}</span>{" "}
                  {t(`${base}.${section}.title`)}
                </Heading>
                <SectionBody body={t(`${base}.${section}.body`)} />
                {edition.awaiting[section] ? <p className="rounded-lg bg-muted px-3 py-2 text-[13px] leading-snug">{t(`${base}.${section}.pending`)}</p> : null}
                {rule === null ? null : <RuleReasons rule={rule} />}
                {link ? (
                  <NextLink
                    href={link.href()}
                    className="inline-flex min-h-11 items-center self-start rounded-sm text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:shadow-focus"
                  >
                    {t(link.label)}
                  </NextLink>
                ) : null}
              </section>
            )
          })}
          {hydrated ? (
            <nav aria-label={t("legal.pager")} className="grid grid-cols-2 gap-3 border-t border-border pt-4 print:hidden">
              {previous === undefined ? null : (
                <PagerLink
                  direction="previous"
                  href={props.sectionHref(previous)}
                  label={t("legal.previous")}
                  title={`${t("legal.sectionNumber", { number: position })} ${t(`${base}.${previous}.title`)}`}
                  onClick={follow(previous)}
                />
              )}
              {next === undefined ? null : (
                <PagerLink
                  direction="next"
                  href={props.sectionHref(next)}
                  label={t("legal.next")}
                  title={`${t("legal.sectionNumber", { number: position + 2 })} ${t(`${base}.${next}.title`)}`}
                  onClick={follow(next)}
                />
              )}
            </nav>
          ) : null}
        </ViewPane>
      </div>
    </div>
  )
}

/** Précédent ou Suivant : la direction, puis la rubrique voisine, numérotée. Un lien natif (`rel`). */
function PagerLink(props: {
  readonly direction: "previous" | "next"
  readonly href: string
  readonly label: string
  readonly title: string
  readonly onClick: (event: MouseEvent<HTMLAnchorElement>) => void
}) {
  const next = props.direction === "next"
  return (
    <a
      href={props.href}
      rel={next ? "next" : "prev"}
      onClick={props.onClick}
      className={cn(
        "flex min-h-14 min-w-0 flex-col justify-center gap-0.5 rounded-xl bg-muted px-3 py-2 transition-colors hover:bg-neutral-hover focus-visible:shadow-focus",
        next && "col-start-2 items-end text-right",
      )}
    >
      <span className="inline-flex items-center gap-1 text-[13px] font-medium text-muted-foreground">
        {next ? null : <ArrowLeftIcon aria-hidden className="size-4 shrink-0" />}
        {props.label}
        {next ? <ArrowRightIcon aria-hidden className="size-4 shrink-0" /> : null}
      </span>
      <span className="line-clamp-2 text-sm font-semibold">{props.title}</span>
    </a>
  )
}

/** Le corps d'une rubrique : ses paragraphes et ses listes, dans l'ordre du texte (`parseLegalBody`). */
function SectionBody(props: { readonly body: string }) {
  return (
    <>
      {parseLegalBody(props.body).map((block, index) =>
        block.kind === "list" ? (
          <ul key={index} className="flex list-disc flex-col gap-1.5 pl-5 text-[15px] leading-relaxed marker:text-muted-foreground">
            {block.items.map((item, position) => (
              <li key={position}>{item}</li>
            ))}
          </ul>
        ) : (
          <p key={index} className="text-[15px] leading-relaxed">
            {block.text}
          </p>
        ),
      )}
    </>
  )
}

/** L'état d'un texte qui n'est pas définitif, dit par un marqueur qui ne se ferme pas. */
function EditionMarker(props: { readonly edition: LegalTextEdition }) {
  const { t } = useDiasporaGaT()
  if (props.edition.status === "missing") return <FloatingNotice role="note" tone="pending" icon={<ScaleIcon />} heading={t("legal.todoLawyer")} />
  if (props.edition.status === "provisional") {
    return (
      <FloatingNotice role="note" tone="pending" icon={<FilePenLineIcon />} heading={t("legal.provisional.heading")}>
        {t("legal.provisional.body")}
      </FloatingNotice>
    )
  }
  return null
}

/** Les motifs de signalement qui renvoient à une règle (MD-05) : chaque motif est nommé sous une règle, et une seule. */
function RuleReasons(props: { readonly rule: CommunityRule }) {
  const { t } = useDiasporaGaT()
  const reasons = reportReasonsOfRule(props.rule)
  if (reasons.length === 0) return null
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-[13px] font-medium text-muted-foreground">{t("communityRules.reasonsLabel")}</p>
      <ul className="flex flex-wrap gap-1.5" aria-label={t("communityRules.reasonsLabel")}>
        {reasons.map((reason) => (
          <li key={reason} className="rounded-full bg-muted px-2.5 py-0.5 text-[13px] font-medium">
            {t(`report.reason.${reason}`)}
          </li>
        ))}
      </ul>
    </div>
  )
}

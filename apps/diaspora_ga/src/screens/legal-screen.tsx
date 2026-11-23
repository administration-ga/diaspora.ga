"use client"

import { isCommunityRule, LEGAL_TEXTS, type CommunityRule, type LegalTextEdition, type LegalTextKind } from "@diaspora-ga/domain"
import { FloatingNotice } from "@diaspora-ga/features"
import { reportReasonsOfRule } from "@diaspora-ga/features/data"
import { useDiasporaGaT } from "@diaspora-ga/features/i18n/client"
import { FilePenLineIcon, ScaleIcon } from "lucide-react"
import NextLink from "next/link"

import { PublicShell } from "@/components/site-chrome"
import { parseLegalBody } from "@/lib/legal-body"
import { formatLegalTextDate, LEGAL_SECTION_LINKS, legalSectionAnchor } from "@/lib/legal-texts"

/** Au-delà de ce nombre de rubriques, le texte s'ouvre sur un sommaire. */
const SUMMARY_FROM = 5

/**
 * Textes du site (mentions légales, confidentialité, conditions d'utilisation,
 * règles de la communauté, contact). Chaque texte lit sa version, sa date, son état et
 * ses rubriques dans le domaine (`LEGAL_TEXTS`, LX-05) ; le fond est au propriétaire et à
 * son conseil. Un texte long s'ouvre sur un sommaire ; chaque rubrique est numérotée, porte
 * son ancre et rend son corps en paragraphes et en listes (`parseLegalBody`).
 * Un marqueur VISIBLE dit l'état d'un texte qui n'est pas définitif, et ne se ferme pas
 * (aucune croix) :
 *   · à fournir : « TODO JURISTE », BLOQUANT pour la mise en ligne (PD6) ;
 *   · provisoire : « Texte provisoire, en attente de relecture » ; un passage qui attend
 *     encore une règle de droit dit « À fournir » et nomme la question posée (`awaiting`).
 * Les règles de la communauté portent en plus les motifs de signalement qui renvoient à
 * chaque règle. Une rubrique peut offrir un renvoi vers ce qui existe dans le site
 * (`LEGAL_SECTION_LINKS`). Aucune affirmation d'audit, de conformité ou de chiffre
 * (doctrine de communication publique).
 */
export function LegalScreen(props: { kind: LegalTextKind }) {
  const { t, locale } = useDiasporaGaT()
  const edition = LEGAL_TEXTS[props.kind]
  const base = `legal.${props.kind}`
  return (
    <PublicShell>
      <article className="mx-auto flex w-full max-w-[760px] flex-col gap-6 px-4 pb-10 pt-6 md:pt-10">
        <header className="flex flex-col gap-2">
          <h1 className="font-display text-4xl font-bold">{t(`${base}.title`)}</h1>
          <p className="font-mono text-xs text-muted-foreground">
            {t("legal.edition", { version: edition.version, date: formatLegalTextDate(edition.date, locale) })}
          </p>
        </header>
        <EditionMarker edition={edition} />
        {edition.sections.length >= SUMMARY_FROM ? <Summary kind={props.kind} sections={edition.sections} /> : null}
        {edition.sections.map((section, index) => {
          const link = LEGAL_SECTION_LINKS[props.kind][section]
          const rule = props.kind === "community" && isCommunityRule(section) ? section : null
          return (
            <section key={section} id={legalSectionAnchor(props.kind, section)} className="flex scroll-mt-6 flex-col gap-3">
              <h2 className="font-display text-xl font-bold">
                <span className="font-mono text-base font-semibold text-muted-foreground">{t("legal.sectionNumber", { number: index + 1 })}</span>{" "}
                {t(`${base}.${section}.title`)}
              </h2>
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
      </article>
    </PublicShell>
  )
}

/** Le sommaire d'un texte long : chaque rubrique, numérotée, mène à son ancre dans la page. */
function Summary(props: { readonly kind: LegalTextKind; readonly sections: readonly string[] }) {
  const { t } = useDiasporaGaT()
  return (
    <nav aria-label={t("legal.summary")} className="rounded-xl bg-muted px-4 py-3">
      <p className="font-mono text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">{t("legal.summary")}</p>
      <ol className="mt-1 grid gap-x-6 sm:grid-cols-2">
        {props.sections.map((section, index) => (
          <li key={section}>
            <a
              href={`#${legalSectionAnchor(props.kind, section)}`}
              className="inline-flex min-h-11 items-center gap-2 rounded-sm text-sm underline-offset-4 hover:underline focus-visible:shadow-focus"
            >
              <span className="font-mono text-xs text-muted-foreground">{t("legal.sectionNumber", { number: index + 1 })}</span>
              {t(`legal.${props.kind}.${section}.title`)}
            </a>
          </li>
        ))}
      </ol>
    </nav>
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
          <li key={reason} className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium">
            {t(`report.reason.${reason}`)}
          </li>
        ))}
      </ul>
    </div>
  )
}

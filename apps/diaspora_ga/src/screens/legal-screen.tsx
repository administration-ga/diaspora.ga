"use client"

import { LEGAL_TEXT_KINDS, LEGAL_TEXTS, type LegalTextKind } from "@diaspora-ga/domain"
import { cn, FolderTabsNav, ViewFrame } from "@diaspora-ga/features"
import { useDiasporaGaT } from "@diaspora-ga/features/i18n/client"
import { ListIcon } from "lucide-react"
import NextLink from "next/link"
import { useMemo } from "react"

import { LegalReader } from "@/components/legal-reader"
import { PublicShell } from "@/components/site-chrome"
import { formatLegalTextDate, LEGAL_TEXT_LABELS, LEGAL_TEXT_ROUTES, legalSectionAnchor, legalSectionFragment } from "@/lib/legal-texts"
import { anchors } from "@/lib/routes"
import { useHashView } from "@/lib/use-hash-view"

/**
 * Textes du site (mentions légales, confidentialité, conditions d'utilisation,
 * règles de la communauté, contact). Chaque texte lit sa version, sa date, son état et
 * ses rubriques dans le domaine (`LEGAL_TEXTS`, LX-05) ; le fond est au propriétaire et à
 * son conseil. Chaque rubrique est numérotée, porte son ancre et rend son corps en
 * paragraphes et en listes (`parseLegalBody`).
 * Un marqueur VISIBLE dit l'état d'un texte qui n'est pas définitif, et ne se ferme pas
 * (aucune croix) :
 *   · à fournir : « TODO JURISTE », BLOQUANT pour la mise en ligne (PD6) ;
 *   · provisoire : « Texte provisoire, en attente de relecture » ; un passage qui attend
 *     encore une règle de droit dit « À fournir » et nomme la question posée (`awaiting`).
 * Les règles de la communauté portent en plus les motifs de signalement qui renvoient à
 * chaque règle. Une rubrique peut offrir un renvoi vers ce qui existe dans le site
 * (`LEGAL_SECTION_LINKS`). Aucune affirmation d'audit, de conformité ou de chiffre
 * (doctrine de communication publique).
 *
 * « Une page = une vue » (décision du 24/11/2026, § 5) : la page tient l'écran. En tête, les
 * cinq textes en onglets (ils remplacent le grand pied de page), le titre, la version et la
 * date ; dessous, le lecteur (`LegalReader`) : sommaire et rubrique côte à côte au bureau, un
 * niveau à la fois au téléphone. L'ancre de l'adresse choisit la rubrique (`useHashView`) :
 * `/regles-communaute#<règle>` montre cette règle seule, et les liens des signalements ne
 * changent pas. Adresses, ancres, version, date et marqueurs : inchangés ; le serveur rend
 * toujours le texte entier.
 */
/**
 * Au téléphone, la piste des onglets défile en largeur : l'onglet du texte ouvert y est ramené
 * (« Contact », le dernier, serait sinon hors de vue). Sans animation ; jamais de défilement
 * vertical (`block: "nearest"`).
 */
function revealTab(tab: HTMLAnchorElement | null): void {
  if (tab !== null && typeof tab.scrollIntoView === "function") tab.scrollIntoView({ block: "nearest", inline: "center" })
}

export function LegalScreen(props: { kind: LegalTextKind }) {
  const { t, locale } = useDiasporaGaT()
  const edition = LEGAL_TEXTS[props.kind]
  const sectionAnchors = useMemo(() => edition.sections.map((section) => legalSectionAnchor(props.kind, section)), [edition, props.kind])
  const anchor = useHashView(sectionAnchors)
  const active = anchor === null ? null : (edition.sections[sectionAnchors.indexOf(anchor)] ?? null)
  return (
    <PublicShell layout="view">
      <ViewFrame
        className="@container/legal mx-auto w-full max-w-[1120px] gap-4 px-4 pb-4 pt-1 md:pt-3"
        header={
          <header className="flex flex-col gap-3">
            <FolderTabsNav
              label={t("legal.texts")}
              // Cibles de 44 px (la piste partagée en pose 40) : ici, on les touche du doigt.
              items={LEGAL_TEXT_KINDS.map((kind) => ({ id: kind, label: t(LEGAL_TEXT_LABELS[kind]), href: LEGAL_TEXT_ROUTES[kind](), active: kind === props.kind }))}
              renderLink={(item, className, children) => (
                <NextLink key={item.id} ref={item.active ? revealTab : undefined} href={item.href} className={cn(className, "min-h-11")} aria-current={item.active ? "page" : undefined}>
                  {children}
                </NextLink>
              )}
            />
            <div className="flex flex-col gap-1">
              <h1 className="font-display text-3xl font-bold md:text-4xl">{t(`legal.${props.kind}.title`)}</h1>
              <div className="flex flex-wrap items-center justify-between gap-x-3">
                <p className="py-1 font-mono text-[13px] text-muted-foreground">
                  {t("legal.edition", { version: edition.version, date: formatLegalTextDate(edition.date, locale) })}
                </p>
                {/* Une rubrique ouverte, à l'étroit (le sommaire n'y est plus visible) : le chemin du retour, par son ancre. */}
                {active === null ? null : (
                  <a
                    href={anchors.legalSummary}
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:shadow-focus @2xl/legal:hidden"
                  >
                    <ListIcon aria-hidden className="size-4 shrink-0" />
                    {t("legal.summary")}
                  </a>
                )}
              </div>
            </div>
          </header>
        }
      >
        <LegalReader kind={props.kind} active={active} sectionHref={(section) => legalSectionFragment(props.kind, section)} headingLevel={2} />
      </ViewFrame>
    </PublicShell>
  )
}

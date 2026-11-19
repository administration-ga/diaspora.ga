"use client"

import { Button } from "@diasporale/features"
import { useDataSource, useJobs, useSession, type JobOfferCardView, type JobsCapability, type JobsPage, type Loadable } from "@diasporale/features/data"
import { useDiasporaleT } from "@diasporale/features/i18n/client"
import NextLink from "next/link"
import { useCallback } from "react"

import { PAGE_JOBS_ANCHOR, routes } from "@/lib/routes"

import { JobOfferCard } from "./job-parts"
import { ServicePager } from "./service-pager"

/**
 * Une page illisible se tait comme une page sans offre. La fenêtre vide est UNE seule
 * référence : le paginateur rapporte chaque réponse neuve, un objet recréé à chaque
 * rendu le ferait boucler.
 */
const UNREADABLE_PAGE: Loadable<JobsPage<JobOfferCardView>> = Object.freeze({ status: "ready", data: Object.freeze({ items: Object.freeze([]), isDone: true, continueCursor: "" }) })

/**
 * La rubrique « Emplois » de la fiche d'une page (EM-04), comme celle des services :
 * les offres OUVERTES de la page, servies par la modération, dans la projection de la
 * recherche. PROPRIÉTAIRE : chantier « emploi » ; la fiche (chantier « pages ») la monte.
 *
 * Discrète : rien pendant le chargement, rien pour une page sans offre ouverte ou
 * illisible — aucune rubrique vide. Une offre en relecture, suspendue, close ou échue
 * n'y paraît jamais ; l'équipe garde la gestion de toutes ses offres.
 */
export function PageJobsSection(props: { readonly pageId: string; readonly pageHandle: string; readonly canManage: boolean }) {
  const source = useDataSource()
  const jobs = useJobs()
  const session = useSession()
  if (jobs === null) return null
  if (session.status !== "ready" || session.data.status !== "signed_in" || !session.data.membership) return null
  const key = JSON.stringify([source.kind, session.data.membership.personId, props.pageId])
  return <PageJobsList key={key} jobs={jobs} {...props} />
}

function PageJobsList(props: { readonly jobs: JobsCapability; readonly pageId: string; readonly pageHandle: string; readonly canManage: boolean }) {
  const { jobs, pageId } = props
  const read = useCallback(
    (cursor: string | null) => {
      const loaded = jobs.usePageOpenOffers({ pageId, cursor })
      return loaded.status === "ready" && loaded.data === null ? UNREADABLE_PAGE : (loaded as Loadable<JobsPage<JobOfferCardView>>)
    },
    [jobs, pageId],
  )
  return (
    <ServicePager<JobOfferCardView> quiet read={read} keyOf={(offer) => offer.id} empty={null}>
      {(offers) => <PageJobsFrame pageHandle={props.pageHandle} canManage={props.canManage} offers={offers} />}
    </ServicePager>
  )
}

function PageJobsFrame(props: { readonly pageHandle: string; readonly canManage: boolean; readonly offers: readonly JobOfferCardView[] }) {
  const { t } = useDiasporaleT()
  return (
    <section id={PAGE_JOBS_ANCHOR} tabIndex={-1} aria-labelledby={`${PAGE_JOBS_ANCHOR}-titre`} className="flex min-w-0 scroll-mt-24 flex-col gap-3">
      <h2 id={`${PAGE_JOBS_ANCHOR}-titre`} className="break-words text-lg font-semibold">{t("jobs.pageSection.title")}</h2>
      {props.canManage ? (
        <Button asChild variant="outline" className="h-auto min-h-11 max-w-full self-start whitespace-normal text-center">
          <NextLink href={routes.pageManage(props.pageHandle, "emplois")}>{t("jobs.offer.manage")}</NextLink>
        </Button>
      ) : null}
      <ul className="grid min-w-0 gap-3 sm:grid-cols-2">
        {props.offers.map((offer) => (
          <li key={offer.id} className="min-w-0"><JobOfferCard offer={offer} showEmployer={false} /></li>
        ))}
      </ul>
    </section>
  )
}

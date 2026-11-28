"use client"

import { Button } from "@diaspora-ga/features"
import { useFeatureGate, usePostSearchCapability, type MembershipView } from "@diaspora-ga/features/data"
import { useDiasporaGaT } from "@diaspora-ga/features/i18n/client"
import NextLink from "next/link"
import { useState } from "react"

import { AppShell } from "@/components/app-shell"
import { Gate } from "@/components/gate"
import { PostSearchSection } from "@/components/post-search"
import { hrefServed } from "@/lib/network-features"
import { routes } from "@/lib/routes"
import { MemberDirectory } from "./members-screen"

export function ExploreScreen() {
  return (
    <Gate require="member">
      {(session) => session.membership ? (
        <AppShell membership={session.membership}>
          <Explore key={session.membership.personId} membership={session.membership} />
        </AppShell>
      ) : null}
    </Gate>
  )
}

function Explore({ membership }: { membership: MembershipView }) {
  const { t } = useDiasporaGaT()
  const gate = useFeatureGate()
  const postSearch = usePostSearchCapability()
  const [postsOpen, setPostsOpen] = useState(false)
  const country = membership.facet.countryOfResidence
  const destinations = [
    { href: routes.services(), label: t("nav.services") },
    { href: routes.mutualAid(country), label: t("nav.community.mutualAid") },
    { href: routes.arrivalKit(country), label: t("nav.community.arrivalKit") },
    { href: routes.mentoring(country), label: t("nav.community.mentoring") },
    { href: routes.jobs(country), label: t("nav.community.jobs") },
  ].filter(({ href }) => hrefServed(gate, href))

  return (
    <MemberDirectory membership={membership} compact>
      <nav aria-label={t("explore.title")} className="flex flex-wrap items-center gap-2">
        {gate.isOpen("pages") ? <Button asChild variant="secondary" size="sm"><NextLink href={routes.pages()}>{t("pageBrowsing.allKinds")}</NextLink></Button> : null}
        {postSearch ? <Button variant="secondary" size="sm" aria-expanded={postsOpen} onClick={() => setPostsOpen(!postsOpen)}>{t("profile.posts")}</Button> : null}
      </nav>
      {postsOpen && postSearch ? <PostSearchSection capability={postSearch} membership={membership}>{null}</PostSearchSection> : null}
      {destinations.length > 0 ? (
        <details className="rounded-xl bg-muted px-4 py-3">
          <summary className="cursor-pointer font-semibold">{t("members.more")}</summary>
          <div className="mt-2 flex flex-wrap gap-2">{destinations.map(({ href, label }) => (
            <Button key={href} asChild variant="ghost" size="sm"><NextLink href={href}>{label}</NextLink></Button>
          ))}</div>
        </details>
      ) : null}
    </MemberDirectory>
  )
}

"use client"

import { Button } from "@diaspora-ga/features"
import { ShieldCheck } from "lucide-react"
import NextLink from "next/link"
import { useTranslation } from "react-i18next"

import { APP_NAMESPACE } from "@/i18n/resources"
import { anchors } from "@/lib/routes"

import { SignOutEverywhereButton } from "./sign-out-button"

/**
 * Les états de l'admission, avant toute coque :
 *  · `loading` — session ou droits en cours de lecture ;
 *  · `recording` — inscription de l'accès au journal ;
 *  · `signedOut` — aucune session : la garde mène à l'entrée ;
 *  · `refused` — refus INDISTINCT : non membre, membre, modérateur, administrateur sans
 *    preuve de session, réseau absent… un seul écran, une seule phrase ;
 *  · `failed` — le serveur n'a pas répondu (réessai possible), sans rien accorder ;
 *  · `backendMissing` — moteur non configuré pour cette application.
 */
export type AdmissionKind = "loading" | "recording" | "signedOut" | "refused" | "failed" | "backendMissing"

const MESSAGE_KEYS: Readonly<Record<AdmissionKind, string>> = {
  loading: "session.loading",
  recording: "session.recording",
  signedOut: "session.signedOut",
  refused: "access.refusedLead",
  failed: "session.failed",
  backendMissing: "session.backendMissing",
}

const ALERTS: ReadonlySet<AdmissionKind> = new Set(["refused", "failed", "backendMissing"])

export function AdmissionScreen(props: { kind: AdmissionKind; connected?: boolean; retry?: () => void; signInHref?: string }) {
  const { t } = useTranslation(APP_NAMESPACE)
  const refused = props.kind === "refused"
  return (
    <main id={anchors.contentId} className="mx-auto flex min-h-dvh w-full max-w-xl flex-col justify-center gap-6 px-4 py-10">
      <header className="space-y-3">
        <p className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
          <ShieldCheck aria-hidden="true" className="size-4 shrink-0" />
          {t("brand.eyebrow")}
        </p>
        <h1 className="font-display text-3xl font-bold">{refused ? t("access.refusedTitle") : t("brand.title")}</h1>
      </header>
      <section className="flex flex-col gap-4 rounded-xl bg-card p-5 text-card-foreground">
        <p role={ALERTS.has(props.kind) ? "alert" : "status"}>{t(MESSAGE_KEYS[props.kind])}</p>
        {props.retry ? (
          <Button type="button" className="self-start" onClick={props.retry}>
            {t("session.retry")}
          </Button>
        ) : null}
        {props.signInHref ? (
          <NextLink
            href={props.signInHref}
            className="inline-flex min-h-11 items-center self-start rounded-md text-primary underline underline-offset-4 focus-visible:shadow-focus"
          >
            {t("session.signIn")}
          </NextLink>
        ) : null}
        {props.connected ? <SignOutEverywhereButton className="self-start" /> : null}
      </section>
    </main>
  )
}

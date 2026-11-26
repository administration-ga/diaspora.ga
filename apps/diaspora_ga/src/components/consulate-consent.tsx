"use client"

import { isResidenceCountry, type CountryCode } from "@diaspora-ga/domain"
import { Button, CountrySwitch } from "@diaspora-ga/features"
import {
  useActions, useDataSource, useHandleSuggestions, useOpenCountries, useSession,
  type ActionErrorCode, type AccountView, type DiasporaGaDataSource,
} from "@diaspora-ga/features/data"
import { useDiasporaGaT } from "@diaspora-ga/features/i18n/client"
import { useEffect, useRef, useState } from "react"
import { rememberArrival } from "@/lib/arrival"
import { authClient } from "@/lib/auth-client"
import { clearConsent, readConsent, type ConsentProfile } from "@/lib/consulate-consent"
import { liveMember } from "@/lib/return-path"
import { routes } from "@/lib/routes"
import { ConsulateTransition } from "./consulate-transition"

/** La première connexion a adopté la session du moteur. Seul le clic ci-dessous publie le profil social. */
export function ConsulateConsent({ idnOnly }: { idnOnly: boolean }) {
  const { t } = useDiasporaGaT()
  const session = useSession()
  const auth = authClient.useSession()
  const source = useDataSource()
  const [grant, setGrant] = useState<ConsentProfile | null>(null)
  const [readFor, setReadFor] = useState<string | null>(null)
  const userId = auth.data?.user.id
  const member = session.status === "ready" && session.data.status === "signed_in" && liveMember(session.data.membership) !== null
  useEffect(() => {
    if (member) {
      clearConsent()
      rememberArrival("consulat")
      location.replace(routes.feed())
      return
    }
    if (userId && !idnOnly) {
      setGrant(readConsent(userId, window.sessionStorage))
      setReadFor(userId)
    }
  }, [member, idnOnly, userId])

  if (member || session.status === "loading" || auth.isPending || (!idnOnly && userId && readFor !== userId)) return <ConsulateTransition />
  if (session.status !== "ready" || session.data.status !== "signed_in" || !userId ||
      (idnOnly ? !session.data.account.idn : !grant || grant.userId !== userId) ||
      !source.entryPrefill || !source.profilePublication) {
    return <main className="mx-auto grid min-h-dvh max-w-md content-center gap-4 px-6">
      <p role="alert">{t("consulateGateway.passage.failed")}</p>
      <a className="underline" href={routes.enterFromConsulate()}>{t("consulateGateway.passage.retry")}</a>
    </main>
  }
  return <ConsentForm key={userId} grant={idnOnly ? null : grant} account={session.data.account}
    prefillSource={source.entryPrefill} publication={source.profilePublication} />
}

function ConsentForm({ grant, account, prefillSource, publication }: {
  grant: ConsentProfile | null; account: AccountView
  prefillSource: NonNullable<DiasporaGaDataSource["entryPrefill"]>
  publication: NonNullable<DiasporaGaDataSource["profilePublication"]>
}) {
  const { t } = useDiasporaGaT()
  const actions = useActions()
  const prefill = prefillSource.useEntryPrefill()
  const profile = publication.useMyProfile()
  const countries = useOpenCountries()
  const [chosenCountry, chooseCountry] = useState<CountryCode | null>(null)
  const [error, setError] = useState<ActionErrorCode | null>(null)
  const [busy, setBusy] = useState(false)
  const submitting = useRef(false)
  const existing = profile.status === "ready" ? profile.data : null
  const kept = !!(existing?.displayName && existing.handle)
  const identity = prefill.status === "ready" ? prefill.data : null
  const displayName = (kept ? existing.displayName : identity?.displayName ||
    [grant?.givenNames ?? account.nameHints.firstName, grant?.familyName ?? account.nameHints.lastName].filter(Boolean).join(" ")).trim().slice(0, 60)
  const handles = useHandleSuggestions(kept ? "" : displayName)
  const handle = kept ? existing.handle : handles[0] ?? identity?.handles.find(h => h.available)?.handle
  const fromIdn = identity?.residence?.country ?? ""
  const fromConsulate = grant?.countryOfResidence ?? ""
  const knownCountry = isResidenceCountry(fromConsulate) ? fromConsulate : isResidenceCountry(fromIdn) ? fromIdn : null
  const country = chosenCountry ?? knownCountry
  const canJoin = !!(displayName && handle && country) && profile.status === "ready"

  async function accept() {
    if (submitting.current || !canJoin || !country || !handle) return
    submitting.current = true
    setBusy(true)
    setError(null)
    try {
      const result = await actions.join({
        facet: { countryOfResidence: country },
        ...(kept ? {} : { displayName, handle }),
        consents: { social_profile: true, directory: false, notifications: false }, directoryVisibility: "hidden",
      })
      if (result.ok) {
        clearConsent()
        rememberArrival("consulat")
        location.replace(routes.feed())
        return
      }
      setError(result.code)
    } catch {
      setError("network_unavailable")
    }
    submitting.current = false
    setBusy(false)
  }
  if (prefill.status === "loading" || profile.status === "loading") return <ConsulateTransition />
  return <main className="mx-auto grid min-h-dvh w-full max-w-md content-center gap-4 px-6">
    <h1 className="text-2xl font-semibold">{t("consulateGateway.passage.acceptTitle")}</h1>
    <p>{t("consulateGateway.passage.acceptLead")}</p>
    {displayName && <p className="font-semibold">{displayName}{handle && <span className="ml-2 font-normal text-muted-foreground">@{handle}</span>}</p>}
    <CountrySwitch value={country} onChange={chooseCountry}
      openCountries={countries.status === "ready" ? countries.data.map(row => row.country) : []}
      title={t("welcome.countrySheetTitle")} description={t("welcome.countrySheetDescription")} />
    <p className="text-sm"><a className="underline" target="_blank" rel="noreferrer" href={routes.terms()}>{t("consulateGateway.passage.terms")}</a>
      {" · "}<a className="underline" target="_blank" rel="noreferrer" href={routes.privacy()}>{t("consulateGateway.passage.privacy")}</a></p>
    {error && <p role="alert">{t(`errors.${error}`)}</p>}
    <Button size="lg" onClick={() => void accept()} disabled={!canJoin || busy}>{t("consulateGateway.passage.accept")}</Button>
    {(!displayName || !handle || profile.status === "error" || (kept && !existing.published)) &&
      <a className="underline" href={routes.welcome()}>{t("consulateGateway.passage.checkProfile")}</a>}
  </main>
}

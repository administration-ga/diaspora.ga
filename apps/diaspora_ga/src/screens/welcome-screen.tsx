"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { isResidenceCountry, type CountryCode } from "@diaspora-ga/domain"
import {
  Button,
  CountrySwitch,
  CountryTag,
  Field,
  Input,
  RadioCard,
  RadioGroup,
  cn,
  handleRefusal,
  normalizeHandle,
} from "@diaspora-ga/features"
import {
  useActions,
  useDataSource,
  useHandleSuggestions,
  useOpenCountries,
  type ActionErrorCode,
  type DiasporaGaActions,
  type DiasporaGaDataSource,
  type EntryPrefillCapability,
  type EntryPrefillView,
  type MembershipView,
} from "@diaspora-ga/features/data"
import { useDiasporaGaT } from "@diaspora-ga/features/i18n/client"
import { CheckIcon, LogOutIcon, PencilIcon, ShieldCheckIcon } from "lucide-react"
import NextLink from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { Controller, useForm, useWatch, type FieldErrors, type Resolver } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"

import { Gate, GateSkeleton } from "@/components/gate"
import { useSignOutEverywhere } from "@/components/sign-out-settings"
import { PublicShell } from "@/components/site-chrome"
import { peekReturnPath, welcomeExit } from "@/lib/return-path"
import { routes } from "@/lib/routes"
import {
  DISPLAY_NAME_MAX,
  DISPLAY_NAME_MIN,
  existingIdentityOf,
  NO_IDENTITY,
  welcomeJoinInput,
  welcomeModel,
  type ExistingIdentity,
  type KeptIdentity,
  type ReturningFacet,
} from "@/lib/welcome-model"

const OTHER_HANDLE = "__autre__"

const residenceShape = {
  country: z.string().refine((value) => isResidenceCountry(value), "country_required"),
  city: z.string().trim().max(80, "city_too_long"),
  handleOther: z.string(),
}
/** Un compte neuf : un nom affiché et un identifiant, montrés ou saisis avant le clic. */
const schema = z.object({
  ...residenceShape,
  displayName: z.string().trim().min(DISPLAY_NAME_MIN, "display_name_invalid").max(DISPLAY_NAME_MAX, "display_name_invalid"),
  handleChoice: z.string().min(1, "handle_required"),
})
/** Un profil commun déjà là (EA-04) : ni nom ni identifiant à saisir, rien à réécrire. */
const keptIdentitySchema = z.object({ ...residenceShape, displayName: z.string(), handleChoice: z.string() })
// Le pays est une chaîne en saisie et un `CountryCode` en sortie (garde de type du domaine).
type FormInput = z.input<typeof schema>
type Values = z.output<typeof schema>

/** Les refus du clic qui tiennent à l'identité : ils rouvrent ses champs, l'erreur à sa place. */
const HANDLE_ERRORS: ReadonlySet<ActionErrorCode> = new Set(["handle_taken", "handle_length", "handle_charset", "handle_required"])
const DISPLAY_NAME_ERRORS: ReadonlySet<ActionErrorCode> = new Set(["display_name_invalid"])

type ProfilePublication = NonNullable<DiasporaGaDataSource["profilePublication"]>

/** L'identifiant saisi, jugé pendant la saisie (EA-08) : rien à dire, en cours, libre, pris, ou refusé par le moteur. */
type HandleAvailability =
  | { readonly state: "idle" }
  | { readonly state: "checking"; readonly handle: string }
  | { readonly state: "available"; readonly handle: string }
  | { readonly state: "taken"; readonly handle: string }
  | { readonly state: "refused"; readonly handle: string; readonly code: ActionErrorCode }

const HANDLE_IDLE: HandleAvailability = { state: "idle" }
/** Le temps de finir un mot avant d'interroger le fournisseur : une question par pause, pas par touche. */
const HANDLE_CHECK_DELAY_MS = 400

/**
 * La disponibilité d'un identifiant pendant sa saisie. Un identifiant hors charte n'est pas
 * soumis (la règle le dit déjà sous le champ) ; une réponse arrivée après une nouvelle frappe est
 * ignorée. Le bouton refait la vérification : c'est elle qui fait foi.
 */
function useHandleAvailability(handle: string, actions: Pick<DiasporaGaActions, "checkHandle">): HandleAvailability {
  const [availability, setAvailability] = useState<HandleAvailability>(HANDLE_IDLE)
  useEffect(() => {
    if (handle.length === 0 || handleRefusal(handle) !== null) {
      setAvailability(HANDLE_IDLE)
      return
    }
    let current = true
    setAvailability({ state: "checking", handle })
    const timer = window.setTimeout(() => {
      actions.checkHandle(handle).then(
        (result) => {
          if (!current) return
          if (!result.ok) setAvailability({ state: "refused", handle, code: result.code })
          else setAvailability({ state: result.value.available ? "available" : "taken", handle })
        },
        () => {
          if (current) setAvailability(HANDLE_IDLE)
        },
      )
    }, HANDLE_CHECK_DELAY_MS)
    return () => {
      current = false
      window.clearTimeout(timer)
    }
  }, [handle, actions])
  return availability
}

/** Ce que l'accueil reçoit de sa page : l'adhésion partie s'il y en a une, et la prise de main de la garde. */
interface OnboardingContext {
  readonly membership: MembershipView | null
  /** Pendant l'entrée qu'il écrit, l'accueil garde la main : il mène lui-même à la page demandée. */
  readonly onFinishing: (finishing: boolean) => void
}

/**
 * `/bienvenue` — l'entrée en UN écran (EXF-DG-02, amendé par la décision du 25/11/2026) :
 * identité (nom affiché et @identifiant), résidence (pays, ville), une phrase qui dit ce que les
 * membres verront, un bouton « Créer mon profil et entrer ». Ce qu'IDN fournit s'affiche en ligne
 * de rappel avec « Modifier » ; ce qui manque reste un champ du même écran. Rien n'est écrit avant
 * le clic ; le clic est le consentement au profil social. L'annuaire et les notifications se
 * proposent APRÈS l'entrée (invite de première visite de la coque) ; l'année d'arrivée reste aux
 * réglages.
 */
export function WelcomeScreen() {
  const [finishing, setFinishing] = useState(false)
  return (
    <PublicShell hideEnter>
      <Gate require="account" holdMember={finishing}>
        {(session) => <WelcomeOnboarding membership={session.membership} onFinishing={setFinishing} />}
      </Gate>
    </PublicShell>
  )
}

/** Le profil commun se lit avant l'accueil ; un fournisseur sans cette capacité n'a que des comptes neufs. */
function WelcomeOnboarding(props: OnboardingContext) {
  const source = useDataSource()
  return source.profilePublication
    ? <OnboardingWithProfile publication={source.profilePublication} {...props} />
    : <OnboardingWithPrefill identity={NO_IDENTITY} {...props} />
}

function OnboardingWithProfile(props: OnboardingContext & { publication: ProfilePublication }) {
  const profile = props.publication.useMyProfile()
  if (profile.status === "loading") return <GateSkeleton />
  // Profil illisible : l'accueil d'un compte neuf ; le fournisseur relit le profil et ne réécrit rien.
  const identity = profile.status === "ready" ? existingIdentityOf(profile.data) : NO_IDENTITY
  return <OnboardingWithPrefill identity={identity} {...props} />
}

type PrefillContext = OnboardingContext & { identity: ExistingIdentity; publication?: ProfilePublication }

/**
 * Le pré-remplissage d'après IDN (lot A4), capacité facultative : sans elle (un moteur qui n'a pas
 * encore la fonction, un fournisseur qui ne la sert pas), l'accueil est celui de la saisie.
 */
function OnboardingWithPrefill(props: PrefillContext) {
  const capability = useDataSource().entryPrefill
  return capability ? <PrefillReader capability={capability} {...props} /> : <Onboarding prefill={null} {...props} />
}

function PrefillReader(props: PrefillContext & { capability: EntryPrefillCapability }) {
  const { capability, ...rest } = props
  const prefill = capability.useEntryPrefill()
  if (prefill.status === "loading") return <GateSkeleton />
  // Une lecture refusée ou en panne n'empêche pas d'entrer : la saisie ordinaire, sans erreur.
  return <Onboarding prefill={prefill.status === "ready" ? prefill.data : null} {...rest} />
}

function Onboarding(props: PrefillContext & { prefill: EntryPrefillView | null }) {
  const { identity } = props
  const { t } = useDiasporaGaT()
  const actions = useActions()
  const router = useRouter()
  const ids = useId()
  const openCountries = useOpenCountries()
  const open = openCountries.status === "ready" ? openCountries.data.map((item) => item.country) : null
  // Retour après un départ : l'adhésion partie garde sa facette, pays et ville sont repris.
  const departed = props.membership?.status === "partie" ? props.membership : null
  const returning = useMemo<ReturningFacet | null>(
    () => (departed ? { countryOfResidence: departed.facet.countryOfResidence, ...(departed.facet.city !== undefined ? { city: departed.facet.city } : {}), ...(departed.facet.arrivedAt !== undefined ? { arrivedAt: departed.facet.arrivedAt } : {}) } : null),
    [departed],
  )
  const model = welcomeModel({ prefill: props.prefill, openCountries: open, identity, returning })
  // « Modifier » rouvre une ligne de rappel en champs ; un refus d'identité au clic aussi.
  const [identityEditing, setIdentityEditing] = useState(false)
  const [residenceEditing, setResidenceEditing] = useState(false)
  const identityFields = model.identity.mode === "fields" || (model.identity.mode === "summary" && identityEditing)
  const residenceFields = model.residence.mode === "fields" || residenceEditing
  const [identityError, setIdentityError] = useState<ActionErrorCode | null>(null)
  const [republishing, setRepublishing] = useState(false)
  // Le focus suit le geste : le champ rouvert, ou l'erreur qui dit pourquoi.
  const [focusId, setFocusId] = useState<string | null>(null)
  useEffect(() => {
    if (focusId === null) return
    document.getElementById(focusId)?.focus()
    setFocusId(null)
  }, [focusId])

  // Le nom et l'identifiant ne se valident que pour un compte neuf (le profil peut naître en cours de route).
  const asksIdentity = identity.kind === "none"
  const asksIdentityRef = useRef(asksIdentity)
  useLayoutEffect(() => {
    asksIdentityRef.current = asksIdentity
  }, [asksIdentity])
  const resolver = useMemo<Resolver<FormInput, unknown, Values>>(() => {
    const chooseIdentity = zodResolver(schema)
    const keepIdentity = zodResolver(keptIdentitySchema)
    return (values, context, options) => (asksIdentityRef.current ? chooseIdentity : keepIdentity)(values, context, options)
  }, [])
  const form = useForm<FormInput, unknown, Values>({
    resolver,
    mode: "onTouched",
    // Ce qu'IDN propose (nom, premier identifiant libre) et la résidence connue : montrés, jamais écrits avant le clic.
    defaultValues: { ...model.defaults, handleOther: "" },
  })
  const [displayName, handleChoice, country, handleOther] = useWatch({
    control: form.control,
    name: ["displayName", "handleChoice", "country", "handleOther"],
  })
  const suggestions = useHandleSuggestions(displayName)
  // Les propositions viennent d'IDN seulement quand il en donne (consigne du propriétaire, 25/11/2026) :
  // libres, dans l'ordre de l'échelle. Sans IDN (entrée par code), celles tirées du nom affiché.
  const handleOptions = model.handleCandidates.length > 0 ? model.handleCandidates : suggestions
  // L'identifiant « autre » se juge pendant la saisie ; les propositions sont déjà libres.
  const handleAvailability = useHandleAvailability(asksIdentity && identityFields && handleChoice === OTHER_HANDLE ? normalizeHandle(handleOther) : "", actions)

  const chosenHandle = (values: Pick<FormInput, "handleChoice" | "handleOther">) => normalizeHandle(values.handleChoice === OTHER_HANDLE ? values.handleOther : values.handleChoice)

  /** Rouvre les champs de l'identité, l'erreur posée là où elle se corrige, et y mène le focus. */
  const reopenIdentity = (code: ActionErrorCode) => {
    setIdentityEditing(true)
    if (DISPLAY_NAME_ERRORS.has(code)) {
      form.setError("displayName", { message: code })
      setFocusId(`${ids}-nom`)
      return
    }
    const other = form.getValues().handleChoice === OTHER_HANDLE
    form.setError(other ? "handleOther" : "handleChoice", { message: code })
    setFocusId(other ? `${ids}-handle` : `${ids}-handle-erreur`)
  }

  const republish = async () => {
    if (identity.kind !== "withdrawn" || !props.publication || republishing) return
    setRepublishing(true)
    setIdentityError(null)
    try {
      // Le geste explicite de la personne : le profil revient tel qu'il était, accroche comprise.
      const result = await props.publication.republish(identity.personId)
      if (result.ok) toast.success(t("settings.profilePublication.saved.republish"))
      else setIdentityError(result.code)
    } catch {
      setIdentityError("unknown")
    } finally {
      setRepublishing(false)
    }
  }

  /** Un champ refusé alors qu'il était caché derrière sa ligne de rappel : sa section se rouvre. */
  const onInvalid = (errors: FieldErrors<FormInput>) => {
    if (errors.displayName || errors.handleChoice || errors.handleOther) setIdentityEditing(true)
    if (errors.country || errors.city) setResidenceEditing(true)
  }

  const submit = form.handleSubmit(async (values) => {
    // Un profil retiré se republie d'abord, par le geste de la personne (EA-04).
    if (identity.kind === "withdrawn") {
      setIdentityError("profile_republish_required")
      setFocusId(`${ids}-identite-erreur`)
      return
    }
    let handle = ""
    if (asksIdentity) {
      handle = chosenHandle(values)
      const refusal = handleRefusal(handle)
      if (refusal) {
        reopenIdentity(refusal)
        return
      }
      // Une lecture, pas une écriture : un identifiant pris entre-temps rouvre les champs.
      let check: Awaited<ReturnType<typeof actions.checkHandle>>
      try {
        check = await actions.checkHandle(handle)
      } catch {
        check = { ok: false, code: "unknown" }
      }
      if (!check.ok || !check.value.available) {
        if (check.ok || HANDLE_ERRORS.has(check.code)) reopenIdentity(check.ok ? "handle_taken" : check.code)
        else toast.error(t(`errors.${check.code}`))
        return
      }
    }
    // L'accueil garde la main jusqu'à sa sortie : la garde ne renvoie pas ailleurs le membre qui naît.
    props.onFinishing(true)
    let result: Awaited<ReturnType<typeof actions.join>>
    try {
      result = await actions.join(welcomeJoinInput(model, { displayName: values.displayName, handle, country: values.country, city: values.city }))
    } catch {
      result = { ok: false, code: "unknown" }
    }
    if (!result.ok) {
      props.onFinishing(false)
      if (asksIdentity && (HANDLE_ERRORS.has(result.code) || DISPLAY_NAME_ERRORS.has(result.code))) reopenIdentity(result.code)
      else toast.error(t(`errors.${result.code}`))
      return
    }
    toast.success(t("welcome.joined"))
    // Nouveau membre : l'accueil d'abord, puis la page demandée s'il peut la lire (UX-02, MO-03).
    router.push(welcomeExit(result.value, peekReturnPath()))
  }, onInvalid)

  const errorOf = (name: keyof FormInput) => {
    const message = form.formState.errors[name]?.message
    return message ? t(`errors.${message}`) : undefined
  }

  const shownIdentityError = identity.kind === "withdrawn" ? identityError : null
  const title = identity.kind === "published" ? t("welcomeProfile.keptTitle") : identity.kind === "withdrawn" ? t("welcomeProfile.withdrawnTitle") : t("welcomeEntry.title")
  const lead = identity.kind === "published" ? t("welcomeProfile.keptLead") : identity.kind === "withdrawn" ? t("welcomeProfile.withdrawnLead") : t("welcomeEntry.lead")
  const chosenCountry = isResidenceCountry(country) ? country : null
  // Un pays fermé n'empêche pas d'entrer : l'avis dit ce qui est possible (HB-01).
  const countryClosed = residenceFields
    ? chosenCountry !== null && open !== null && !open.includes(chosenCountry)
    : model.residence.mode === "summary" && model.residence.open === false

  return (
    <div className="mx-auto w-full max-w-[640px] px-4 pb-10 pt-6 md:pt-10">
      <h1 className="font-display text-4xl font-bold leading-tight">{title}</h1>
      <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">{lead}</p>

      <form noValidate onSubmit={(event) => void submit(event)} className="mt-8 flex flex-col gap-8">
        <section aria-labelledby={`${ids}-identite`} className="flex flex-col gap-3">
          <h2 id={`${ids}-identite`} className="text-base font-semibold">{t("welcomeEntry.identityHeading")}</h2>

          {model.identity.mode === "kept" ? (
            <KeptIdentityCard
              identity={model.identity.identity}
              republishing={republishing}
              onRepublish={() => void republish()}
              error={shownIdentityError}
              errorId={`${ids}-identite-erreur`}
            />
          ) : null}

          {model.identity.mode === "summary" && !identityEditing ? (
            <SummaryLine
              primary={<span className="text-[15px] font-semibold">{model.identity.displayName}</span>}
              secondary={<span className="font-mono text-sm text-muted-foreground">@{model.identity.handle}</span>}
              caption={t("welcomeEntry.fromIdn")}
              editLabel={t("welcomeEntry.editIdentity")}
              onEdit={() => {
                setIdentityEditing(true)
                setFocusId(`${ids}-nom`)
              }}
            />
          ) : null}

          {asksIdentity && identityFields ? (
            <>
              <Field id={`${ids}-nom`} label={t("welcome.displayNameLabel")} hint={t("welcome.displayNameHint")} error={errorOf("displayName")}>
                {(control) => (
                  <Input
                    id={control.id}
                    aria-describedby={control.describedBy}
                    aria-invalid={control.invalid || undefined}
                    autoComplete="name"
                    {...form.register("displayName")}
                  />
                )}
              </Field>
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-1 text-sm font-medium">{t("welcome.handleLegend")}</legend>
                <p className="text-[13px] text-muted-foreground">{t("welcome.handleHint")}</p>
                <Controller
                  control={form.control}
                  name="handleChoice"
                  render={({ field }) => (
                    <RadioGroup value={field.value} onValueChange={field.onChange} aria-label={t("welcome.handleLegend")}>
                      {handleOptions.map((option) => (
                        <RadioCard key={option} value={option}>
                          <span className="font-mono text-[15px]">@{option}</span>
                        </RadioCard>
                      ))}
                      <RadioCard value={OTHER_HANDLE}>
                        <span className="text-[15px]">{t("welcome.handleOther")}</span>
                      </RadioCard>
                    </RadioGroup>
                  )}
                />
                {errorOf("handleChoice") ? (
                  <p id={`${ids}-handle-erreur`} tabIndex={-1} role="alert" className="text-[13px] font-medium text-destructive outline-none">
                    {errorOf("handleChoice")}
                  </p>
                ) : null}
                {handleChoice === OTHER_HANDLE ? (
                  <Field id={`${ids}-handle`} label={t("welcome.handleOtherLabel")} hint={t("welcome.handleRules")} error={errorOf("handleOther")}>
                    {(control) => (
                      <div className="relative">
                        <span aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-muted-foreground">
                          @
                        </span>
                        <Input
                          id={control.id}
                          aria-describedby={control.describedBy}
                          aria-invalid={control.invalid || undefined}
                          autoCapitalize="none"
                          autoCorrect="off"
                          spellCheck={false}
                          className="pl-7 font-mono"
                          {...form.register("handleOther")}
                        />
                      </div>
                    )}
                  </Field>
                ) : null}
                {handleChoice === OTHER_HANDLE ? <HandleAvailabilityStatus availability={handleAvailability} /> : null}
              </fieldset>
            </>
          ) : null}
        </section>

        <section aria-labelledby={`${ids}-residence`} className="flex flex-col gap-3">
          <h2 id={`${ids}-residence`} className="text-base font-semibold">{t("welcomeEntry.residenceHeading")}</h2>

          {model.residence.mode === "summary" && !residenceEditing ? (
            <SummaryLine
              primary={<CountryTag country={model.residence.country} size="md" />}
              secondary={model.residence.city ? <span className="text-sm text-muted-foreground">{model.residence.city}</span> : undefined}
              caption={model.residence.source === "idn" ? t("welcomeEntry.fromIdn") : undefined}
              editLabel={t("welcomeEntry.editResidence")}
              onEdit={() => {
                setResidenceEditing(true)
                setFocusId(`${ids}-pays`)
              }}
            />
          ) : null}

          {residenceFields ? (
            <>
              <Field id={`${ids}-pays`} label={t("welcome.countryLabel")} hint={t("welcome.countryHint")} error={errorOf("country")}>
                {(control) => (
                  <Controller
                    control={form.control}
                    name="country"
                    render={({ field }) => (
                      <CountrySwitch
                        id={control.id}
                        describedBy={control.describedBy}
                        invalid={control.invalid}
                        value={isResidenceCountry(field.value) ? field.value : null}
                        onChange={(code: CountryCode) => {
                          field.onChange(code)
                          void form.trigger("country")
                        }}
                        openCountries={open ?? []}
                        title={t("welcome.countrySheetTitle")}
                        description={t("welcome.countrySheetDescription")}
                      />
                    )}
                  />
                )}
              </Field>
              <Field id={`${ids}-ville`} label={t("welcome.cityLabel")} hint={t("welcome.cityHint")} error={errorOf("city")}>
                {(control) => (
                  <Input
                    id={control.id}
                    aria-describedby={control.describedBy}
                    aria-invalid={control.invalid || undefined}
                    autoComplete="address-level2"
                    {...form.register("city")}
                  />
                )}
              </Field>
            </>
          ) : null}

          {countryClosed ? <p className="rounded-lg bg-pending px-3 py-2 text-[13px] text-pending-foreground">{t("welcome.countryNotOpen")}</p> : null}
          {departed ? <p className="rounded-lg bg-muted px-3 py-2 text-[13px] text-muted-foreground">{t("welcomeProfile.returningNote")}</p> : null}
        </section>

        <div className="flex flex-col gap-4 border-t border-border pt-5">
          {/* Le geste vaut consentement au profil social : la phrase dit ce que les membres verront, avant le clic. */}
          <p id={`${ids}-accord`} className="text-[13px] leading-snug text-muted-foreground">{t("welcomeEntry.consent")}</p>
          <Button type="submit" size="lg" aria-describedby={`${ids}-accord`} disabled={form.formState.isSubmitting} className="w-full sm:w-auto sm:self-end">
            <CheckIcon aria-hidden />
            {form.formState.isSubmitting ? t("common.pleaseWait") : t(asksIdentity ? "welcomeEntry.submit" : "welcomeEntry.submitKept")}
          </Button>
        </div>
      </form>
      <WelcomeSignOut />
    </div>
  )
}

/** Une ligne de rappel : ce qui est déjà su, et « Modifier » pour le changer avant le clic. */
function SummaryLine(props: { primary: ReactNode; secondary?: ReactNode | undefined; caption?: string | undefined; editLabel: string; onEdit: () => void }) {
  const { t } = useDiasporaGaT()
  return (
    <div className="flex items-center gap-3 rounded-xl bg-card p-4 shadow-card">
      <div className="flex min-w-0 flex-1 flex-col items-start gap-0.5 break-words">
        {props.primary}
        {props.secondary}
        {props.caption ? <p className="mt-1 text-[12px] leading-snug text-muted-foreground">{props.caption}</p> : null}
      </div>
      {/* Le nom accessible commence par le libellé visible (« Modifier… ») : la commande vocale le trouve. */}
      <Button variant="outline" size="sm" aria-label={props.editLabel} onClick={props.onEdit}>
        <PencilIcon aria-hidden />
        {t("welcomeEntry.edit")}
      </Button>
    </div>
  )
}

/** Le profil commun déjà là (EA-04) : montré tel quel ; retiré, il se republie d'un geste avant d'entrer. */
function KeptIdentityCard(props: { identity: KeptIdentity; republishing: boolean; onRepublish: () => void; error: ActionErrorCode | null; errorId: string }) {
  const { t } = useDiasporaGaT()
  const { identity } = props
  return (
    <>
      <section aria-label={t("welcomeProfile.identityLabel")} className="rounded-xl bg-card p-4 shadow-card">
        <p className="break-words text-[15px] font-semibold">{identity.displayName}</p>
        <p className="break-words font-mono text-sm text-muted-foreground">@{identity.handle}</p>
        {identity.headline ? <p className="mt-2 break-words text-sm leading-snug">{identity.headline}</p> : null}
      </section>
      {identity.kind === "withdrawn" ? (
        <div className="flex flex-col items-start gap-3" aria-busy={props.republishing || undefined}>
          <p className="text-[13px] text-muted-foreground">{t("settings.profilePublication.republishLead")}</p>
          <Button variant="outline" disabled={props.republishing} onClick={props.onRepublish}>
            {t(props.republishing ? "settings.profilePublication.working" : "settings.profilePublication.republish")}
          </Button>
        </div>
      ) : null}
      {props.error ? (
        <p id={props.errorId} tabIndex={-1} role="alert" className="text-[13px] font-medium text-destructive outline-none">
          {t(`errors.${props.error}`)}
        </p>
      ) : null}
    </>
  )
}

/**
 * Les sorties d'un compte connecté sans adhésion (jamais entré, ou parti) : exercer
 * ses droits personnels sans adhérer (« Mes données », NP-02 et EA-05 : exporter,
 * demander l'effacement, lire ses décisions), et se déconnecter — ce n'est pas son
 * compte, ou il veut en changer. Les réglages de membre ne lui sont pas ouverts ;
 * sans ces gestes, il restait enfermé dans l'accueil.
 */
function WelcomeSignOut() {
  const { t } = useDiasporaGaT()
  const { busy, failed, signOutEverywhere } = useSignOutEverywhere()
  return (
    <div aria-busy={busy} className="mt-10 flex flex-col items-center gap-2 text-center text-[13px] text-muted-foreground">
      <p className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
        <span>{t("welcome.myDataLead")}</span>
        <NextLink
          href={routes.myData()}
          className="inline-flex min-h-8 items-center gap-1.5 rounded-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:shadow-focus"
        >
          <ShieldCheckIcon aria-hidden className="size-3.5" />
          {t("welcome.myData")}
        </NextLink>
      </p>
      <p className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
        <span>{t("welcome.notYourAccount")}</span>
        <button
          type="button"
          disabled={busy}
          onClick={() => void signOutEverywhere()}
          className="inline-flex min-h-8 items-center gap-1.5 rounded-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:shadow-focus disabled:cursor-wait disabled:opacity-70"
        >
          <LogOutIcon aria-hidden className="size-3.5" />
          {t(busy ? "settings.signingOut" : "settings.signOutEverywhere")}
        </button>
      </p>
      {failed ? <p role="alert" className="text-destructive">{t("errors.unknown")}</p> : null}
    </div>
  )
}

/**
 * Ce que la saisie de l'identifiant apprend, dit poliment aux lecteurs d'écran : la zone reste
 * montée, seul son texte change (une zone vivante qui naît ne s'annonce pas partout).
 */
function HandleAvailabilityStatus(props: { availability: HandleAvailability }) {
  const { t } = useDiasporaGaT()
  const { availability } = props
  return (
    <p
      role="status"
      className={cn(
        "min-h-5 text-[13px]",
        availability.state === "available" ? "font-medium text-success-ink" : availability.state === "checking" ? "text-muted-foreground" : "font-medium text-destructive",
      )}
    >
      {availability.state === "checking"
        ? t("welcomeHandle.checking")
        : availability.state === "available"
          ? t("welcomeHandle.available", { handle: availability.handle })
          : availability.state === "taken"
            ? t("welcomeHandle.taken", { handle: availability.handle })
            : availability.state === "refused"
              ? t(`errors.${availability.code}`)
              : null}
    </p>
  )
}

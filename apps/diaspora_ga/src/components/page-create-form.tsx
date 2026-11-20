"use client"

/**
 * Inscrire une organisation (DG-008, AS-05) : une association ou une entreprise.
 * PROPRIÉTAIRE : chantier « gestion des pages ».
 *
 * Un parcours en trois étapes, sur le modèle de l'assistant de rattachement de
 * l'espace agent : la nature, l'identité, le récapitulatif. Chaque étape valide
 * ses champs avant d'avancer ; avant d'inscrire, les pages du même pays au nom
 * proche se proposent à la revendication (pas de doublon). Une fois inscrite, la
 * page dit ses premiers gestes : logo, badge « Vérifié », équipe, puis ce que sa
 * nature ouvre.
 *
 * Réservé aux membres VÉRIFIÉS (règle du moteur, `createPage` en `verifiee`) :
 * l'écran l'explique avant tout formulaire, et le refus du serveur reste
 * traduit si l'état change entre-temps. Une page inscrite par un membre porte
 * « Communauté » : aucune autorité officielle ne se revendique ici.
 */
import { Button, Card, Field, Input, RadioCard, RadioGroup, Textarea, residenceCountryOptions } from "@diaspora-ga/features"
import {
  PAGE_DESCRIPTION_MAX_LENGTH,
  PAGE_HANDLE_MAX_LENGTH,
  PAGE_NAME_MAX_LENGTH,
  PAGE_SHORT_NAME_MAX_LENGTH,
  pageAssociationTypeRefusal,
  pageCityRefusal,
  pageDescriptionRefusal,
  pageHandleFor,
  pageHandleRefusal,
  pageNameRefusal,
  pageSectorRefusal,
  pageShortNameRefusal,
  REGISTRABLE_PAGE_KINDS,
  useOptionalDataSource,
  type ActionErrorCode,
  type AssociationType,
  type CompanySector,
  type MemberPageKind,
  type MembershipView,
  type PageManagement,
} from "@diaspora-ga/features/data"
import { useDiasporaGaT } from "@diaspora-ga/features/i18n/client"
import { isCountryCode, type CountryCode } from "@diaspora-ga/domain"
import { zodResolver } from "@hookform/resolvers/zod"
import { BadgeCheckIcon, Building2Icon, HandshakeIcon, UsersRoundIcon, type LucideIcon } from "lucide-react"
import NextLink from "next/link"
import { useEffect, useId, useMemo, useRef, useState } from "react"
import { Controller, useForm, useWatch, type FieldErrors } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"

import {
  firstRegistrationStep,
  nextRegistrationStep,
  previousRegistrationStep,
  REGISTRATION_NATURE_OFFERS,
  REGISTRATION_STEP_FIELDS,
  registrationFieldOfRefusal,
  registrationStepOf,
  type RegistrationCapabilities,
  type RegistrationField,
  type RegistrationStep,
} from "@/lib/page-registration"
import { routes } from "@/lib/routes"

import { ErrorNotice } from "./page-admin-parts"
import { PagePresentationFields } from "./page-presentation-fields"
import { NearbyPages, RegistrationDone, RegistrationStepper } from "./page-registration-parts"

const createSchema = (supportsPresentation: boolean) => z
  .object({
    // Les seules natures que DIASPORA.GA inscrit (AS-05) ; l'adaptateur et le serveur le rejugent.
    ownerKind: z.string().refine((value) => (REGISTRABLE_PAGE_KINDS as readonly string[]).includes(value), "page_kind_reserved"),
    name: z.string(),
    shortName: z.string(),
    handle: z.string(),
    description: z.string(),
    country: z.string().refine((value) => value.length > 0, "page_country_required"),
    city: z.string(),
    associationType: z.string(),
    sector: z.string(),
  })
  .superRefine((values, context) => {
    // Les règles du moteur, dites en codes fermés : l'écran refuse ce que le serveur refuserait.
    const name = pageNameRefusal(values.name)
    if (name) context.addIssue({ code: z.ZodIssueCode.custom, path: ["name"], message: name })
    const shortName = values.shortName.trim() ? pageShortNameRefusal(values.shortName) : null
    if (shortName) context.addIssue({ code: z.ZodIssueCode.custom, path: ["shortName"], message: shortName })
    const description = values.description.trim() ? pageDescriptionRefusal(values.description) : null
    if (description) context.addIssue({ code: z.ZodIssueCode.custom, path: ["description"], message: description })
    // Sans adresse saisie, elle dérive du nom : un nom déjà refusé n'a pas à refuser l'adresse en double.
    if (values.handle.trim() || !name) {
      const handle = pageHandleRefusal(values)
      if (handle) context.addIssue({ code: z.ZodIssueCode.custom, path: ["handle"], message: handle })
    }
    if (values.country && !isCountryCode(values.country)) context.addIssue({ code: z.ZodIssueCode.custom, path: ["country"], message: "page_country_invalid" })
    if (supportsPresentation) {
      const city = pageCityRefusal(values.city)
      if (city) context.addIssue({ code: z.ZodIssueCode.custom, path: ["city"], message: city })
      if (values.ownerKind === "association") {
        const associationType = pageAssociationTypeRefusal(values.ownerKind, values.associationType.trim() || null)
        if (associationType) context.addIssue({ code: z.ZodIssueCode.custom, path: ["associationType"], message: associationType })
      }
      if (values.ownerKind === "company") {
        const sector = pageSectorRefusal(values.ownerKind, values.sector.trim() || null)
        if (sector) context.addIssue({ code: z.ZodIssueCode.custom, path: ["sector"], message: sector })
      }
    }
  })

type CreateValues = z.infer<ReturnType<typeof createSchema>>

/** Les champs que seul un fournisseur qui sert la présentation (ville, activité) rend. */
const PRESENTATION_FIELDS: readonly RegistrationField[] = ["city", "associationType", "sector"]

const NATURE_ICONS: Readonly<Partial<Record<MemberPageKind, LucideIcon>>> = {
  association: UsersRoundIcon,
  company: Building2Icon,
}

interface RegisteredPage {
  readonly handle: string
  readonly name: string
  readonly ownerKind: MemberPageKind
}

/** Le parcours d'inscription ; une fois la page inscrite, ses premiers gestes. */
export function PageCreateForm(props: { readonly management: PageManagement; readonly membership: MembershipView; readonly kind: MemberPageKind | null }) {
  const { t, locale } = useDiasporaGaT()
  const id = useId()
  const countries = useMemo(() => residenceCountryOptions(locale), [locale])
  const supportsPresentation = props.management.supportsPresentation === true
  const schema = useMemo(() => createSchema(supportsPresentation), [supportsPresentation])
  // Ce que le fournisseur sert : les premiers gestes ne mènent jamais à un onglet « indisponible ».
  const source = useOptionalDataSource()
  const capabilities: RegistrationCapabilities = { jobs: !!source?.jobs, services: !!source?.services, members: !!source?.associations }
  const [refusal, setRefusal] = useState<ActionErrorCode | null>(null)
  const [step, setStep] = useState<RegistrationStep>(() => firstRegistrationStep(props.kind))
  const [registered, setRegistered] = useState<RegisteredPage | null>(null)
  const running = useRef(false)
  const moved = useRef(false)
  const stepHeading = useRef<HTMLHeadingElement>(null)
  const form = useForm<CreateValues>({
    resolver: zodResolver(schema),
    // Un champ touché se rejuge à la sortie puis à la frappe ; le focus des refus est tenu ici (titre ou champ).
    mode: "onTouched",
    shouldFocusError: false,
    defaultValues: {
      ownerKind: props.kind ?? "association",
      name: "",
      shortName: "",
      handle: "",
      description: "",
      country: props.membership.facet.countryOfResidence,
      city: "",
      associationType: "",
      sector: "",
    },
  })
  const errors = form.formState.errors
  const message = (code: string | undefined) => (code ? t(`errors.${code}`) : undefined)
  const values = useWatch({ control: form.control })
  const name = values.name ?? ""
  const ownerKind = (values.ownerKind ?? "association") as MemberPageKind
  const country = values.country ?? ""
  const preview = pageHandleFor({ name, handle: values.handle ?? "" })
  const busy = form.formState.isSubmitting
  const previous = previousRegistrationStep(step)

  // Une étape change : son titre prend le focus (jamais au premier affichage).
  useEffect(() => {
    if (moved.current) stepHeading.current?.focus()
  }, [step])

  const goTo = (next: RegistrationStep) => {
    moved.current = true
    setRefusal(null)
    setStep(next)
  }

  // Avancer valide les champs de l'étape, et eux seuls.
  const advance = async () => {
    const fields = REGISTRATION_STEP_FIELDS[step]
    if (fields.length > 0 && !(await form.trigger([...fields], { shouldFocus: true }))) return
    const next = nextRegistrationStep(step)
    if (next) goTo(next)
  }

  // La soumission se valide au geste, jamais pendant le rendu.
  const onValid = async (input: CreateValues) => {
    if (running.current) return
    running.current = true
    setRefusal(null)
    try {
      const kind = input.ownerKind as MemberPageKind
      const result = await props.management.createPage({
        ownerKind: kind,
        name: input.name,
        country: input.country as CountryCode,
        ...(input.handle.trim() ? { handle: input.handle.trim() } : {}),
        ...(input.shortName.trim() ? { shortName: input.shortName.trim() } : {}),
        ...(input.description.trim() ? { description: input.description.trim() } : {}),
        ...(supportsPresentation && input.city.trim() ? { city: input.city.trim() } : {}),
        ...(supportsPresentation && kind === "association" && input.associationType.trim() ? { associationType: input.associationType.trim() as AssociationType } : {}),
        ...(supportsPresentation && kind === "company" && input.sector.trim() ? { sector: input.sector.trim() as CompanySector } : {}),
      })
      if (!result.ok) {
        // Un refus qui désigne un champ rendu (adresse prise, nom refusé…) se pose sur lui, à son étape.
        const field = registrationFieldOfRefusal(result.code)
        if (field && (supportsPresentation || !PRESENTATION_FIELDS.includes(field))) {
          goTo(registrationStepOf(field))
          form.setError(field, { message: result.code })
          return
        }
        setRefusal(result.code)
        return
      }
      toast.success(t("pageAdmin.create.created"))
      setRegistered({ handle: result.value.handle, name: input.name.trim(), ownerKind: kind })
    } catch {
      setRefusal("unknown")
    } finally {
      running.current = false
    }
  }

  // Un champ refusé à l'envoi ramène à l'étape qui le porte.
  const onInvalid = (invalid: FieldErrors<CreateValues>) => {
    const first = Object.keys(invalid)[0] as RegistrationField | undefined
    if (first) goTo(registrationStepOf(first))
  }

  if (registered) return <RegistrationDone page={registered} capabilities={capabilities} />

  const stepTitle = step === "nature" ? t("pageAdmin.create.kindLegend") : step === "identity" ? t("pageAdmin.register.identityTitle") : t("pageAdmin.register.reviewTitle")

  return (
    <div className="flex flex-col gap-5">
      <RegistrationStepper step={step} />
      <form
        noValidate
        aria-busy={busy}
        className="flex flex-col gap-5"
        onSubmit={(event) => {
          // Entrée dans un champ avance d'une étape ; seul le récapitulatif inscrit.
          if (step !== "review") {
            event.preventDefault()
            void advance()
            return
          }
          void form.handleSubmit(onValid, onInvalid)(event)
        }}
      >
        <h2 ref={stepHeading} tabIndex={-1} className="font-display text-xl font-bold outline-none">
          {stepTitle}
        </h2>

        {step === "nature" ? (
          <div className="flex flex-col gap-3">
            <Controller
              control={form.control}
              name="ownerKind"
              render={({ field }) => (
                <RadioGroup
                  value={field.value}
                  onValueChange={(value) => {
                    field.onChange(value)
                    form.setValue("associationType", "")
                    form.setValue("sector", "")
                    form.clearErrors(["associationType", "sector"])
                  }}
                  aria-label={t("pageAdmin.create.kindLegend")}
                >
                  {REGISTRABLE_PAGE_KINDS.map((kind) => {
                    const Icon = NATURE_ICONS[kind]
                    const offer = REGISTRATION_NATURE_OFFERS[kind]
                    return (
                      <RadioCard key={kind} value={kind} disabled={busy}>
                        <span className="flex items-start gap-3">
                          {Icon ? <Icon aria-hidden className="mt-0.5 size-5 shrink-0 text-muted-foreground" /> : null}
                          <span className="min-w-0">
                            <span className="block font-medium">{t(`pageAdmin.kind.${kind}`)}</span>
                            <span className="block text-[13px] text-muted-foreground">{t(`pageAdmin.create.kindHint.${kind}`)}</span>
                            {offer ? <span className="mt-1 block text-[13px] text-foreground">{t(offer)}</span> : null}
                          </span>
                        </span>
                      </RadioCard>
                    )
                  })}
                </RadioGroup>
              )}
            />
            {errors.ownerKind?.message ? <ErrorNotice code={errors.ownerKind.message} /> : null}
            <p className="text-sm leading-relaxed text-muted-foreground">{t("pageAdmin.register.natureClosed")}</p>
          </div>
        ) : null}

        {step === "identity" ? (
          <div className="flex flex-col gap-5">
            <p className="-mt-3 text-sm leading-relaxed text-muted-foreground">{t("pageAdmin.register.identityLead")}</p>
            <Field id={`${id}-nom`} label={t("pageAdmin.create.name")} hint={t("pageAdmin.create.nameHint", { max: PAGE_NAME_MAX_LENGTH })} error={message(errors.name?.message)}>
              {(control) => (
                <Input id={control.id} aria-describedby={control.describedBy} aria-invalid={control.invalid || undefined} maxLength={PAGE_NAME_MAX_LENGTH} autoComplete="organization" disabled={busy} {...form.register("name")} />
              )}
            </Field>

            <NearbyPages name={name} country={country} />

            <Field id={`${id}-sigle`} label={t("pageAdmin.create.shortName")} hint={t("pageAdmin.create.shortNameHint", { max: PAGE_SHORT_NAME_MAX_LENGTH })} error={message(errors.shortName?.message)}>
              {(control) => (
                <Input id={control.id} aria-describedby={control.describedBy} aria-invalid={control.invalid || undefined} maxLength={PAGE_SHORT_NAME_MAX_LENGTH} disabled={busy} {...form.register("shortName")} />
              )}
            </Field>

            <Field
              id={`${id}-adresse`}
              label={t("pageAdmin.create.handle")}
              hint={preview ? t("pageAdmin.create.handlePreview", { handle: preview }) : t("pageAdmin.create.handleHint")}
              error={message(errors.handle?.message)}
            >
              {(control) => (
                <Input
                  id={control.id}
                  aria-describedby={control.describedBy}
                  aria-invalid={control.invalid || undefined}
                  maxLength={PAGE_HANDLE_MAX_LENGTH}
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  disabled={busy}
                  {...form.register("handle")}
                />
              )}
            </Field>

            <Field id={`${id}-presentation`} label={t("pageAdmin.create.description")} hint={t("pageAdmin.create.descriptionHint", { max: PAGE_DESCRIPTION_MAX_LENGTH })} error={message(errors.description?.message)}>
              {(control) => (
                <Textarea id={control.id} aria-describedby={control.describedBy} aria-invalid={control.invalid || undefined} maxLength={PAGE_DESCRIPTION_MAX_LENGTH} rows={4} disabled={busy} {...form.register("description")} />
              )}
            </Field>

            <Field id={`${id}-pays`} label={t("pageAdmin.create.country")} hint={t("pageAdmin.create.countryHint")} error={message(errors.country?.message)}>
              {(control) => (
                <select
                  id={control.id}
                  aria-describedby={control.describedBy}
                  aria-invalid={control.invalid || undefined}
                  disabled={busy}
                  className="h-11 w-full rounded-md border border-input bg-card px-3 text-[15px] focus-visible:shadow-focus"
                  {...form.register("country")}
                >
                  <option value="">{t("pageAdmin.create.countryPlaceholder")}</option>
                  {countries.map((option) => (
                    <option key={option.code} value={option.code}>
                      {option.name}
                    </option>
                  ))}
                </select>
              )}
            </Field>

            {supportsPresentation ? (
              <PagePresentationFields
                id={id}
                ownerKind={ownerKind}
                disabled={busy}
                city={form.register("city")}
                associationType={form.register("associationType")}
                sector={form.register("sector")}
                errors={{ city: errors.city?.message, associationType: errors.associationType?.message, sector: errors.sector?.message }}
              />
            ) : null}
          </div>
        ) : null}

        {step === "review" ? (
          <div className="flex flex-col gap-4">
            <p className="-mt-3 text-sm leading-relaxed text-muted-foreground">{t("pageAdmin.register.reviewLead")}</p>
            {/* Une page au nom proche existe : la revendiquer se propose AVANT d'inscrire. */}
            <NearbyPages name={name} country={country} dismissible />
            <RegistrationReview
              values={{
                ownerKind,
                name,
                shortName: values.shortName ?? "",
                handle: preview,
                countryName: countries.find((option) => option.code === country)?.name ?? "",
                // Sans champs de présentation servis, ni ville ni activité : aucune ligne qui mène à un champ absent.
                city: supportsPresentation ? (values.city ?? "") : null,
                category: !supportsPresentation ? null
                  : ownerKind === "association" && values.associationType ? t(`association.type.${values.associationType}`)
                  : ownerKind === "company" && values.sector ? t(`company.sector.${values.sector}`)
                  : "",
                description: values.description ?? "",
              }}
              onEdit={goTo}
            />
            <p className="rounded-xl bg-muted p-4 text-sm leading-relaxed text-muted-foreground">{t("pageAdmin.create.trustNote")}</p>
          </div>
        ) : null}

        {refusal ? <ErrorNotice code={refusal} /> : null}
        {refusal === "page_verified_required" ? <VerifiedMembershipLinks /> : null}

        <div className="flex flex-wrap gap-2">
          <Button
            type="submit"
            disabled={busy}
            onClick={(event) => {
              // « Continuer » devient « Inscrire la page » à la même place : le second clic d'un
              // double-clic n'inscrit pas sans relecture (le clavier, lui, a `detail` à 0).
              if (step === "review" && event.detail > 1) event.preventDefault()
            }}
          >
            {busy ? t("common.pleaseWait") : step === "review" ? t("pageAdmin.create.submit") : t("pageAdmin.register.next")}
          </Button>
          {previous ? (
            <Button type="button" variant="ghost" disabled={busy} onClick={() => goTo(previous)}>
              {t("pageAdmin.register.back")}
            </Button>
          ) : (
            <Button asChild variant="ghost">
              <NextLink href={routes.myActivity("pages")}>{t("common.cancel")}</NextLink>
            </Button>
          )}
        </div>
      </form>
    </div>
  )
}

interface ReviewValues {
  readonly ownerKind: MemberPageKind
  readonly name: string
  readonly shortName: string
  readonly handle: string | null
  readonly countryName: string
  /** `null` : le fournisseur ne sert pas ce champ, la ligne n'est pas montrée. */
  readonly city: string | null
  readonly category: string | null
  readonly description: string
}

/** Le récapitulatif : chaque ligne dit sa valeur, ou « Non renseigné », et ramène à son étape. */
function RegistrationReview(props: { readonly values: ReviewValues; readonly onEdit: (step: RegistrationStep) => void }) {
  const { t } = useDiasporaGaT()
  const { values } = props
  const all: readonly { readonly key: string; readonly label: string; readonly value: string | null; readonly step: RegistrationStep }[] = [
    { key: "kind", label: t("pageAdmin.register.review.kind"), value: t(`pageAdmin.kind.${values.ownerKind}`), step: "nature" },
    { key: "name", label: t("pageAdmin.register.review.name"), value: values.name.trim(), step: "identity" },
    { key: "shortName", label: t("pageAdmin.register.review.shortName"), value: values.shortName.trim(), step: "identity" },
    { key: "handle", label: t("pageAdmin.register.review.handle"), value: values.handle ?? "", step: "identity" },
    { key: "country", label: t("pageAdmin.register.review.country"), value: values.countryName, step: "identity" },
    { key: "city", label: t("pageAdmin.register.review.city"), value: values.city === null ? null : values.city.trim(), step: "identity" },
    { key: "category", label: t("pageAdmin.register.review.category"), value: values.category, step: "identity" },
    { key: "description", label: t("pageAdmin.register.review.description"), value: values.description.trim(), step: "identity" },
  ]
  const rows = all.flatMap((row) => (row.value === null ? [] : [{ ...row, value: row.value }]))
  return (
    <dl className="flex flex-col divide-y divide-border rounded-xl border border-border">
      {rows.map((row) => (
        <div key={row.key} className="flex flex-wrap items-start gap-x-4 gap-y-1 p-3">
          <dt className="w-32 shrink-0 text-sm font-medium text-muted-foreground">{row.label}</dt>
          <dd className={row.value ? "min-w-0 flex-1 whitespace-pre-line break-words text-[15px]" : "min-w-0 flex-1 text-[15px] text-muted-foreground"}>
            {row.value || t("pageAdmin.register.notProvided")}
          </dd>
          <dd className="shrink-0">
            <Button type="button" variant="ghost" size="sm" aria-label={t("pageAdmin.register.editLabel", { field: row.label })} onClick={() => props.onEdit(row.step)}>
              {t("pageAdmin.register.edit")}
            </Button>
          </dd>
        </div>
      ))}
    </dl>
  )
}

/** Ce qui rend une adhésion vérifiée : l'attestation consulaire, ou IDN niveau 2 avec un parrainage. */
export function VerifiedMembershipLinks() {
  const { t } = useDiasporaGaT()
  return (
    <div className="flex flex-wrap gap-2">
      <Button asChild variant="outline">
        <NextLink href={routes.attestation()}>
          <BadgeCheckIcon aria-hidden />
          {t("pageAdmin.create.verifiedOnly.attestation")}
        </NextLink>
      </Button>
      <Button asChild variant="ghost">
        <NextLink href={routes.sponsorHelp()}>
          <HandshakeIcon aria-hidden />
          {t("pageAdmin.create.verifiedOnly.sponsor")}
        </NextLink>
      </Button>
    </div>
  )
}

/** Avant le formulaire : un membre non vérifié lit pourquoi, et comment le devenir. */
export function VerifiedMembershipRequired(props: { readonly membership: MembershipView }) {
  const { t } = useDiasporaGaT()
  return (
    <Card className="flex flex-col gap-3 p-5">
      <h2 className="font-display text-xl font-bold">{t("pageAdmin.create.verifiedOnly.title")}</h2>
      <p className="text-[15px] leading-relaxed">
        {t("pageAdmin.create.verifiedOnly.body", { status: t(`membership.status.${props.membership.status}`) })}
      </p>
      <VerifiedMembershipLinks />
    </Card>
  )
}

"use client"

/**
 * Choisir un membre actif du réseau par son identifiant public (signataire d'une page officielle,
 * membre fondateur) — le patron de la recherche de l'équipe (`team-section.tsx`), une lecture
 * ponctuelle du moteur passée par l'appelant (`pages/networkAdmin.signatoryCandidate`, `diaspora/founders.candidate`) : le
 * moteur ne rend qu'un membre actif au profil publié, sinon rien. Une fois trouvé, le membre est
 * présenté par sa carte et peut être changé avant le geste.
 */
import type { Id } from "@convex/_generated/dataModel"
import { Button, Field, HANDLE_MAX_LENGTH, Input } from "@diaspora-ga/features"
import { zodResolver } from "@hookform/resolvers/zod"
import { SearchIcon, UserRoundPenIcon } from "lucide-react"
import { useId, useState } from "react"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"

import { APP_NAMESPACE } from "@/i18n/resources"
import { engineErrorText } from "@/lib/engine-errors"

import { handleLookupSchema, RefusalLine, useMounted, type HandleLookupValues } from "./decision-parts"
import { CandidateCard } from "./responsibles-panel"

/** Le membre trouvé, tel que les lectures « candidat » du moteur le rendent (profil publié). */
export interface MemberCandidate {
  readonly personId: Id<"persons">
  readonly handle: string
  readonly displayName: string
}

export function MemberPicker(props: {
  /** Le libellé du champ de l'identifiant. */
  readonly label: string
  readonly candidate: MemberCandidate | null
  readonly onChange: (candidate: MemberCandidate | null) => void
  /** La lecture ponctuelle du moteur ; `null` : aucun membre actif ne porte cet identifiant. */
  readonly lookup: (handle: string) => Promise<MemberCandidate | null>
  readonly disabled?: boolean
}) {
  const { t } = useTranslation(APP_NAMESPACE)
  const id = useId()
  const mounted = useMounted()
  const [refusal, setRefusal] = useState<string | null>(null)
  const form = useForm<HandleLookupValues>({ resolver: zodResolver(handleLookupSchema), defaultValues: { handle: "" } })
  const busy = form.formState.isSubmitting
  const invalid = form.formState.errors.handle?.message

  const search = async (values: HandleLookupValues) => {
    setRefusal(null)
    try {
      const found = await props.lookup(values.handle)
      if (!mounted.current) return
      if (found === null) setRefusal(t("lookup.unknown"))
      else props.onChange(found)
    } catch (error) {
      if (mounted.current) setRefusal(engineErrorText(error, t, "lookup.failed"))
    }
  }

  if (props.candidate !== null) {
    return (
      <div className="flex min-w-0 flex-col gap-2">
        <p className="text-sm font-medium">{props.label}</p>
        <CandidateCard candidate={props.candidate} />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="self-start"
          disabled={props.disabled}
          aria-label={t("picker.changeFor", { name: props.candidate.displayName })}
          onClick={() => {
            form.reset()
            props.onChange(null)
          }}
        >
          <UserRoundPenIcon aria-hidden="true" />
          {t("picker.change")}
        </Button>
      </div>
    )
  }

  return (
    <form noValidate onSubmit={(event) => void form.handleSubmit(search)(event)} className="flex min-w-0 flex-col gap-3">
      <Field id={`${id}-identifiant`} label={props.label} hint={t("lookup.hint")} error={invalid ? t(invalid) : undefined}>
        {(field) => (
          <Input
            id={field.id}
            aria-describedby={field.describedBy}
            aria-invalid={field.invalid || undefined}
            autoComplete="off"
            maxLength={HANDLE_MAX_LENGTH + 1}
            disabled={busy || props.disabled}
            {...form.register("handle")}
          />
        )}
      </Field>
      <RefusalLine text={refusal} />
      <Button type="submit" variant="outline" className="self-start" disabled={busy || props.disabled}>
        <SearchIcon aria-hidden="true" />
        {busy ? t("decision.pending") : t("lookup.search")}
      </Button>
    </form>
  )
}

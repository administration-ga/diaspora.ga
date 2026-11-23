"use client"

/**
 * Les deux formulaires de la porte des comptes de démonstration (CH-817, lot A1), montés dans la
 * feuille de la pastille « Compte démo » (`demo-accounts-panel.tsx`) :
 *  1. le numéro WhatsApp (E.164, normalisé par le contrat du moteur) ;
 *  2. le code reçu : 6 chiffres puis une lettre, mis en majuscules et groupé à la saisie
 *     (`482 913 K`), son échéance, le renvoi borné (une minute, trois demandes par quart d'heure,
 *     reflet des seaux du moteur) et le changement de numéro.
 *
 * L'écran ne dit jamais « envoyé » : la porte répond pareil pour un numéro autorisé ou non. Il dit
 * la phrase de la fiche : si ce numéro est autorisé, le code arrive sur WhatsApp ; sans message
 * après une minute, l'envoi n'a pas abouti.
 *
 * CH-817 E5 : un nouveau code ne remplace plus le précédent (trois au plus restent valables) ; le
 * code saisi se vérifie contre le défi le plus récent, puis contre les précédents encore valables
 * de la feuille. Un refus de l'adresse pour trop d'appels (429, demande comme vérification) dit
 * l'attente du moteur.
 */
import { DEMO_GATE_ACTIVE_CHALLENGES_MAX, isDemoGateLocale, normalizeDemoGateCode, normalizeDemoGatePhone } from "@antsia/social-contracts/demoGate"
import { zodResolver } from "@hookform/resolvers/zod"
import { Button, Field, Input } from "@diaspora-ga/features"
import {
  demoGateRequestWaitMs,
  groupDemoGateCodeInput,
  maskDestination,
  type ActionErrorCode,
  type DemoGateCapability,
  type DemoGateChallengeView,
  type DemoGateResult,
  type DemoGateSessionView,
} from "@diaspora-ga/features/data"
import { useDiasporaGaT } from "@diaspora-ga/features/i18n/client"
import { RotateCwIcon } from "lucide-react"
import { useCallback, useEffect, useId, useRef, useState } from "react"
import { Controller, useForm } from "react-hook-form"
import { z } from "zod"

const phoneSchema = z.object({ phone: z.string().refine((value) => normalizeDemoGatePhone(value) !== null, "phone_invalid") })
const codeSchema = z.object({ code: z.string().refine((value) => normalizeDemoGateCode(value) !== null, "demo_gate_code_format") })

/**
 * Le défi en cours, avec le numéro (normalisé) qui sert au renvoi : en mémoire de la feuille
 * seulement. `earlier` : les défis précédents du même numéro, encore valables (un renvoi ne les
 * annule pas), du plus récent au plus ancien.
 */
export interface PendingDemoGateChallenge extends DemoGateChallengeView {
  readonly phone: string
  readonly earlier?: readonly DemoGateChallengeView[]
}

/** Une horloge à la seconde, seulement tant qu'il faut décompter ; `sync` la remet à l'heure aussitôt. */
function useClock(ticking: boolean): readonly [number, () => void] {
  const [now, setNow] = useState(() => Date.now())
  const sync = useCallback(() => setNow(Date.now()), [])
  useEffect(() => {
    if (!ticking) return
    setNow(Date.now())
    const timer = window.setInterval(() => setNow(Date.now()), 1_000)
    return () => window.clearInterval(timer)
  }, [ticking])
  return [now, sync]
}

/** Une durée dite en minutes et secondes (« 4 min 05 s »), ou en secondes sous la minute. */
function useDuration(): (ms: number) => string {
  const { t } = useDiasporaGaT()
  return useCallback(
    (ms: number) => {
      const total = Math.max(0, Math.ceil(ms / 1_000))
      const minutes = Math.floor(total / 60)
      const seconds = total % 60
      return minutes > 0 ? t("demoGate.duration.minutes", { minutes, seconds: String(seconds).padStart(2, "0") }) : t("demoGate.duration.seconds", { seconds })
    },
    [t],
  )
}

/** Le premier temps : le numéro WhatsApp. */
export function DemoGatePhoneStep(props: {
  readonly gate: DemoGateCapability
  /** Les demandes déjà faites dans cette feuille (reflet des seaux du moteur). */
  readonly requests: readonly number[]
  /** Vrai quand l'étape arrive après un geste (changement de numéro, session échue) : le champ prend le focus. */
  readonly focusOnMount: boolean
  readonly onRequested: (challenge: PendingDemoGateChallenge, requestedAt: number) => void
}) {
  const { t, locale } = useDiasporaGaT()
  const ids = useId()
  const duration = useDuration()
  const form = useForm<z.infer<typeof phoneSchema>>({ resolver: zodResolver(phoneSchema), defaultValues: { phone: "" } })
  // L'attente dite par le moteur quand l'adresse a trop demandé (429) : à l'horloge de cet appareil.
  const [retryAt, setRetryAt] = useState<number | null>(null)
  const [clockRunning, setClockRunning] = useState(() => demoGateRequestWaitMs(props.requests, Date.now()) > 0)
  const [now, syncClock] = useClock(clockRunning)
  const wait = demoGateRequestWaitMs(props.requests, now)
  const retryWait = retryAt === null ? 0 : Math.max(0, retryAt - now)
  useEffect(() => setClockRunning(wait > 0 || retryWait > 0), [wait, retryWait])
  const sending = form.formState.isSubmitting
  const error = form.formState.errors.phone?.message

  const focusPhone = form.setFocus
  const { focusOnMount } = props
  useEffect(() => {
    if (focusOnMount) focusPhone("phone")
  }, [focusOnMount, focusPhone])

  const submit = form.handleSubmit(async ({ phone }) => {
    const normalized = normalizeDemoGatePhone(phone)
    // Le délai se juge à l'instant du geste : avant lui, rien ne part.
    if (normalized === null || demoGateRequestWaitMs(props.requests, Date.now()) > 0 || (retryAt !== null && retryAt > Date.now())) return
    const requestedAt = Date.now()
    const result = await props.gate.requestCode(normalized, isDemoGateLocale(locale) ? locale : "fr")
    if (!result.ok) {
      if (result.retryAfterMs !== undefined) {
        setRetryAt(Date.now() + result.retryAfterMs)
        syncClock()
        return
      }
      form.setError("phone", { message: result.code }, { shouldFocus: true })
      return
    }
    props.onRequested({ ...result.value, phone: normalized }, requestedAt)
  })

  const waitId = `${ids}-attente`
  const retryId = `${ids}-trop`
  return (
    <form noValidate onSubmit={submit} aria-busy={sending || undefined} className="flex flex-col gap-4">
      <Field id={`${ids}-numero`} label={t("demoGate.phone.label")} hint={t("demoGate.phone.hint")} error={error ? t(`errors.${error}`) : undefined}>
        {(control) => (
          <Input
            id={control.id}
            aria-describedby={[control.describedBy, wait > 0 ? waitId : null, retryWait > 0 ? retryId : null].filter(Boolean).join(" ") || undefined}
            aria-invalid={control.invalid || undefined}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            spellCheck={false}
            readOnly={sending}
            className="h-12 text-base"
            {...form.register("phone")}
          />
        )}
      </Field>
      {wait > 0 ? (
        <p id={waitId} className="text-[13px] text-muted-foreground">
          {t("demoGate.wait", { duration: duration(wait) })}
        </p>
      ) : null}
      {retryWait > 0 ? (
        <p id={retryId} role="alert" className="text-[13px] font-medium text-destructive">
          {t("demoGate.tooManyAttempts", { duration: duration(retryWait) })}
        </p>
      ) : null}
      <Button type="submit" size="lg" disabled={sending || wait > 0 || retryWait > 0}>
        {sending ? t("common.pleaseWait") : t("demoGate.phone.submit")}
      </Button>
    </form>
  )
}

/** Le second temps : le code reçu sur WhatsApp. */
export function DemoGateCodeStep(props: {
  readonly gate: DemoGateCapability
  readonly challenge: PendingDemoGateChallenge
  readonly requests: readonly number[]
  readonly onResent: (challenge: PendingDemoGateChallenge, requestedAt: number) => void
  readonly onChangeNumber: () => void
  readonly onVerified: () => void
}) {
  const { t, locale } = useDiasporaGaT()
  const ids = useId()
  const duration = useDuration()
  const form = useForm<z.infer<typeof codeSchema>>({ resolver: zodResolver(codeSchema), defaultValues: { code: "" } })
  // Les attentes dites par le moteur (429) : la vérification et la demande ont chacune leur seau.
  const [retryAt, setRetryAt] = useState<number | null>(null)
  const [resendRetryAt, setResendRetryAt] = useState<number | null>(null)
  const [resending, setResending] = useState(false)
  const [resendError, setResendError] = useState<ActionErrorCode | null>(null)
  const [resent, setResent] = useState(false)
  const [now, syncClock] = useClock(true)
  const remaining = props.challenge.expiresAt - now
  const expired = remaining <= 0
  const resendWait = demoGateRequestWaitMs(props.requests, now)
  const retryWait = retryAt === null ? 0 : Math.max(0, retryAt - now)
  const resendRetryWait = resendRetryAt === null ? 0 : Math.max(0, resendRetryAt - now)
  const verifying = form.formState.isSubmitting
  const error = form.formState.errors.code?.message

  // Le code se saisit dès l'arrivée de l'étape : le geste qui l'a ouverte vient d'avoir lieu.
  const focusCode = form.setFocus
  useEffect(() => {
    focusCode("code")
  }, [focusCode, props.challenge.challengeId])

  /**
   * Le code contre le défi le plus récent, puis contre les précédents encore valables de la feuille :
   * un renvoi n'annule pas le code déjà parti (CH-817 E5), le premier arrivé reste bon. Le premier refus
   * qui n'est pas « code faux » (trop d'essais, panne, porte indisponible) arrête la recherche.
   */
  async function verifyActiveChallenges(code: string): Promise<DemoGateResult<DemoGateSessionView>> {
    const at = Date.now()
    let result: DemoGateResult<DemoGateSessionView> = { ok: false, code: "demo_gate_code_invalid" }
    for (const candidate of [props.challenge, ...(props.challenge.earlier ?? [])]) {
      if (candidate.expiresAt <= at) continue
      result = await props.gate.verifyCode(candidate.challengeId, code)
      if (result.ok || result.code !== "demo_gate_code_invalid") return result
    }
    return result
  }

  const verify = form.handleSubmit(async ({ code }) => {
    if (expired || (retryAt !== null && retryAt > Date.now())) return
    const result = await verifyActiveChallenges(code)
    if (result.ok) {
      props.onVerified()
      return
    }
    if (result.retryAfterMs !== undefined) {
      setRetryAt(Date.now() + result.retryAfterMs)
      syncClock()
      return
    }
    form.setError("code", { message: result.code }, { shouldFocus: true })
  })

  const resend = async () => {
    if (resending || demoGateRequestWaitMs(props.requests, Date.now()) > 0 || (resendRetryAt !== null && resendRetryAt > Date.now())) return
    setResending(true)
    setResendError(null)
    setResent(false)
    try {
      const requestedAt = Date.now()
      const result = await props.gate.requestCode(props.challenge.phone, isDemoGateLocale(locale) ? locale : "fr")
      if (!result.ok) {
        if (result.retryAfterMs !== undefined) {
          setResendRetryAt(Date.now() + result.retryAfterMs)
          syncClock()
        } else setResendError(result.code)
        return
      }
      // L'attente de vérification reste : elle tient à l'adresse, pas au code.
      form.reset()
      setResent(true)
      const { challengeId, expiresAt, earlier = [] } = props.challenge
      const stillValid = [{ challengeId, expiresAt }, ...earlier].filter((candidate) => candidate.expiresAt > requestedAt).slice(0, DEMO_GATE_ACTIVE_CHALLENGES_MAX - 1)
      props.onResent({ ...result.value, phone: props.challenge.phone, earlier: stillValid }, requestedAt)
    } finally {
      setResending(false)
    }
  }

  // L'échéance s'annonce une fois, quand elle survient ; le décompte, lui, ne s'annonce pas à chaque seconde.
  const announcedExpiry = useRef(false)
  const [expiryNotice, setExpiryNotice] = useState(false)
  useEffect(() => {
    if (expired && !announcedExpiry.current) {
      announcedExpiry.current = true
      setExpiryNotice(true)
    }
    if (!expired) {
      announcedExpiry.current = false
      setExpiryNotice(false)
    }
  }, [expired])

  const resendHintId = `${ids}-renvoi`
  const resendRetryId = `${ids}-renvoi-trop`
  const deliveryId = `${ids}-acheminement`
  return (
    <form noValidate onSubmit={verify} aria-busy={verifying || undefined} className="flex flex-col gap-4">
      {/* La phrase de la fiche : jamais « envoyé », la porte répond pareil pour un numéro autorisé ou non.
          Elle décrit aussi le champ du code, que le focus atteint aussitôt : le lecteur d'écran la dit. */}
      <p id={deliveryId} role="status" className="text-[15px] leading-relaxed">
        {t("demoGate.code.delivery")}
      </p>
      <p className="break-words text-[13px] text-muted-foreground" translate="no">
        {t("demoGate.code.number", { number: maskDestination("phone", props.challenge.phone) })}
      </p>
      <Field id={`${ids}-code`} label={t("demoGate.code.label")} hint={t("demoGate.code.hint")} error={error ? t(`errors.${error}`) : undefined}>
        {(control) => (
          <Controller
            control={form.control}
            name="code"
            render={({ field }) => (
              <Input
                id={control.id}
                ref={field.ref}
                name={field.name}
                value={field.value}
                onBlur={field.onBlur}
                onChange={(event) => field.onChange(groupDemoGateCodeInput(event.target.value))}
                aria-describedby={[control.describedBy, deliveryId].filter(Boolean).join(" ")}
                aria-invalid={control.invalid || undefined}
                inputMode="text"
                autoComplete="one-time-code"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                readOnly={verifying}
                className="h-12 font-mono text-lg tracking-[0.2em]"
              />
            )}
          />
        )}
      </Field>
      <p className="text-[13px] text-muted-foreground">
        {expired ? t("demoGate.code.expired") : t("demoGate.code.expiresIn", { duration: duration(remaining) })}
      </p>
      {retryWait > 0 ? (
        <p role="alert" className="text-[13px] font-medium text-destructive">
          {t("demoGate.tooManyAttempts", { duration: duration(retryWait) })}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" size="lg" disabled={verifying || expired || retryWait > 0}>
          {verifying ? t("common.pleaseWait") : t("demoGate.code.submit")}
        </Button>
        <Button variant="ghost" size="lg" disabled={verifying || resending} onClick={props.onChangeNumber}>
          {t("demoGate.code.changeNumber")}
        </Button>
      </div>
      <div className="flex flex-col items-start gap-1" aria-busy={resending || undefined}>
        <Button
          variant="ghost"
          disabled={resendWait > 0 || resendRetryWait > 0 || resending || verifying}
          aria-describedby={[resendHintId, resendRetryWait > 0 ? resendRetryId : null].filter(Boolean).join(" ")}
          onClick={() => void resend()}
        >
          <RotateCwIcon aria-hidden />
          {resending ? t("common.pleaseWait") : t("demoGate.code.resend")}
        </Button>
        <p id={resendHintId} className="text-[13px] text-muted-foreground">
          {resendWait > 0 ? t("demoGate.wait", { duration: duration(resendWait) }) : resendRetryWait > 0 ? null : t("demoGate.waitOver")}
        </p>
        {resendRetryWait > 0 ? (
          <p id={resendRetryId} role="alert" className="text-[13px] font-medium text-destructive">
            {t("demoGate.tooManyAttempts", { duration: duration(resendRetryWait) })}
          </p>
        ) : null}
        {resendError ? (
          <p role="alert" className="text-[13px] font-medium text-destructive">
            {t(`errors.${resendError}`)}
          </p>
        ) : null}
        <p role="status" className="sr-only">
          {expiryNotice ? t("demoGate.code.expired") : resent ? t("demoGate.code.resent") : null}
        </p>
      </div>
    </form>
  )
}

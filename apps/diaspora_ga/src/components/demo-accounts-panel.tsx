"use client"

import { DEMO_GATE_SESSION_TTL_SECONDS } from "@antsia/social-contracts/demoGate"
import { DIASPORA_GA_DEMO_ACTOR_SPECS, DIASPORA_GA_DEMO_GROUPS, diasporaGaDemoDisplayName } from "@diaspora-ga/domain"
import { Avatar, Button, CountryTag, Sheet, SheetContent, SheetTrigger } from "@diaspora-ga/features"
import {
  demoGateSheetStep,
  useActions,
  useDataSource,
  useDemoAccounts,
  useDemoGate,
  type DemoAccountEntry,
  type DemoAccountsCapability,
  type DemoGateCapability,
  type DemoGateSessionView,
  type DemoGateState,
} from "@diaspora-ga/features/data"
import { useDiasporaGaT } from "@diaspora-ga/features/i18n/client"
import { FlaskConicalIcon, LoaderCircleIcon } from "lucide-react"
import NextLink from "next/link"
import { forwardRef, useEffect, useId, useRef, useState, type ComponentPropsWithoutRef, type ReactNode } from "react"
import { toast } from "sonner"

import { forgetDemoActor, rememberDemoActor } from "@/lib/demo-account-pending"
import { routes } from "@/lib/routes"

import { DemoGateCodeStep, DemoGatePhoneStep, type PendingDemoGateChallenge } from "./demo-gate-steps"

/**
 * La cible de la pastille : 44 px de haut (charte §10) autour d'une pastille de 28 px, le focus
 * visible sur toute la cible.
 */
const PILL_TARGET = "group inline-flex min-h-11 items-center rounded-full px-1 focus-visible:shadow-focus"

/** La pastille elle-même : les jetons du repère de démonstration (`--dg-demo-bg`, `--dg-demo-fg`), comme `DemoChip`. */
function PillBody() {
  const { t } = useDiasporaGaT()
  return (
    <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-demo px-3 text-[12px] font-semibold text-demo-foreground decoration-1 underline-offset-2 group-hover:underline [&_svg]:size-3.5">
      <FlaskConicalIcon aria-hidden />
      {t("demoGate.pill")}
    </span>
  )
}

const PillButton = forwardRef<HTMLButtonElement, ComponentPropsWithoutRef<"button">>(function PillButton(props, ref) {
  return (
    <button ref={ref} type="button" data-slot="demo-pill" {...props} className={PILL_TARGET}>
      <PillBody />
    </button>
  )
})

/** Tout en bas de la porte, sous le pied de page compact, dans son fond. */
function PillStrip(props: { children: ReactNode }) {
  return <div className="flex justify-center bg-card px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))]">{props.children}</div>
}

/**
 * La pastille « Compte démo », discrète, tout en bas de la porte (CH-817, lot A1) :
 * - démonstration (données fictives de ce navigateur) : elle mène aux comptes fictifs (`/demo`),
 *   sans porte ;
 * - moteur, porte fermée (production comprise) : rien ne s'affiche ;
 * - porte non armée (`open`, développement local par exemple) : elle ouvre la liste des acteurs,
 *   comme l'ancien bouton, et seulement si le catalogue en propose ;
 * - porte incomplète (`unavailable`) : la feuille le dit, sans formulaire ;
 * - porte armée (`gated`) : numéro WhatsApp, code de 6 chiffres et 1 lettre, puis les acteurs ;
 *   sans origine des actions HTTP du moteur (variable absente), la pastille ne s'affiche pas.
 * Chaque acteur entre par le vrai code à usage unique, lu ici, puis l'amorçage
 * (`DemoAccountBootstrap`) rejoue l'accueil et équipe le compte.
 */
export function DemoAccountsPill() {
  const source = useDataSource()
  const demoAccounts = useDemoAccounts()
  const gate = useDemoGate()
  if (source.kind === "demo") {
    return (
      <PillStrip>
        <NextLink href={routes.demo()} data-slot="demo-pill" className={PILL_TARGET}>
          <PillBody />
        </NextLink>
      </PillStrip>
    )
  }
  if (demoAccounts === null || gate === null) return null
  return <EngineDemoPill gate={gate} accounts={demoAccounts} />
}

function EngineDemoPill(props: { gate: DemoGateCapability; accounts: DemoAccountsCapability }) {
  const state = props.gate.useGateState()
  if (state.status !== "ready") return null
  switch (state.data) {
    case "closed":
      return null
    case "open":
      return <OpenGatePill gate={props.gate} accounts={props.accounts} />
    case "unavailable":
      return <DemoGateSheet state="unavailable" gate={props.gate} accounts={props.accounts} />
    case "gated":
      // Sans l'origine des actions HTTP du moteur, le formulaire serait mort : rien ne s'affiche.
      return props.gate.reachable ? <DemoGateSheet state="gated" gate={props.gate} accounts={props.accounts} /> : null
  }
}

/** Porte non armée : la pastille ne s'affiche que si le catalogue propose au moins un acteur. */
function OpenGatePill(props: { gate: DemoGateCapability; accounts: DemoAccountsCapability }) {
  const catalogue = props.accounts.useCatalogue()
  if (catalogue.status !== "ready" || catalogue.data.length === 0) return null
  return <DemoGateSheet state="open" gate={props.gate} accounts={props.accounts} />
}

function DemoGateSheet(props: { state: Exclude<DemoGateState, "closed">; gate: DemoGateCapability; accounts: DemoAccountsCapability }) {
  const { t } = useDiasporaGaT()
  const session = props.gate.useSession()
  // Le défi en cours et les demandes faites restent en mémoire de la pastille : refermer la feuille ne les perd pas.
  const [challenge, setChallenge] = useState<PendingDemoGateChallenge | null>(null)
  const [requests, setRequests] = useState<readonly number[]>([])
  const step = demoGateSheetStep({ state: props.state, session: session !== null, challenge: challenge !== null }) ?? "unavailable"
  // Une étape qui arrive après un geste prend le focus ; à l'ouverture, la feuille garde le sien.
  const previous = useRef(step)
  const [arrived, setArrived] = useState(false)
  useEffect(() => {
    if (previous.current !== step) setArrived(true)
    previous.current = step
  }, [step])

  const requested = (next: PendingDemoGateChallenge, at: number) => {
    setRequests((done) => [...done, at])
    setChallenge(next)
  }

  return (
    <PillStrip>
      <Sheet onOpenChange={() => setArrived(false)}>
        <SheetTrigger asChild>
          <PillButton />
        </SheetTrigger>
        <SheetContent title={t("demoAccounts.title")} description={t(`demoGate.step.${step}.lead`)} closeLabel={t("demoAccounts.close")}>
          {step === "unavailable" ? (
            <p role="status" className="rounded-lg bg-muted p-3 text-sm">
              {t("demoGate.unavailable")}
            </p>
          ) : null}
          {step === "phone" ? <DemoGatePhoneStep gate={props.gate} requests={requests} focusOnMount={arrived} onRequested={requested} /> : null}
          {step === "code" && challenge !== null ? (
            <DemoGateCodeStep
              gate={props.gate}
              challenge={challenge}
              requests={requests}
              onResent={requested}
              onChangeNumber={() => setChallenge(null)}
              onVerified={() => {
                setChallenge(null)
                toast.success(t("demoGate.opened", { minutes: DEMO_GATE_SESSION_TTL_SECONDS / 60 }))
              }}
            />
          ) : null}
          {step === "actors" ? (
            <DemoActorsStep
              capability={props.accounts}
              session={props.state === "gated" ? session : null}
              focusOnMount={arrived}
              onForget={() => {
                props.gate.forget()
                setChallenge(null)
              }}
            />
          ) : null}
        </SheetContent>
      </Sheet>
    </PillStrip>
  )
}

/** Les acteurs proposés, groupés comme le panneau d'origine ; porte armée, l'échéance de l'accès et sa fermeture. */
function DemoActorsStep(props: { capability: DemoAccountsCapability; session: DemoGateSessionView | null; focusOnMount: boolean; onForget: () => void }) {
  const { t, locale } = useDiasporaGaT()
  const catalogue = props.capability.useCatalogue()
  const actions = useActions()
  const ids = useId()
  const [pending, setPending] = useState<DemoAccountEntry["actor"] | null>(null)
  const [failed, setFailed] = useState(false)
  const intro = useRef<HTMLParagraphElement>(null)
  const { focusOnMount } = props
  const ready = catalogue.status === "ready"
  useEffect(() => {
    if (focusOnMount && ready) intro.current?.focus()
  }, [focusOnMount, ready])

  async function enter(entry: DemoAccountEntry) {
    setPending(entry.actor)
    setFailed(false)
    try {
      rememberDemoActor(entry.actor)
      const sent = await actions.requestCode({ kind: "email", value: entry.email })
      if (!sent.ok) throw new Error(sent.code)
      const code = sent.value.demoCode ?? (await props.capability.readLocalCode(entry.email))
      if (code === null) throw new Error("code")
      const verified = await actions.verifyCode(code)
      if (!verified.ok) throw new Error(verified.code)
      // Le moteur recharge la page vers l'accueil : l'amorçage reprend l'acteur mémorisé.
    } catch {
      forgetDemoActor()
      setPending(null)
      setFailed(true)
    }
  }

  if (catalogue.status === "loading") {
    return (
      <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
        <LoaderCircleIcon className="size-4 shrink-0 motion-safe:animate-spin" aria-hidden />
        {t("demoGate.actors.loading")}
      </p>
    )
  }
  if (catalogue.status === "error") {
    return (
      <p role="alert" className="rounded-lg bg-muted p-3 text-sm">
        {t("demoGate.actors.unreadable")}
      </p>
    )
  }

  const until = props.session === null ? null : new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(props.session.expiresAt)
  return (
    <>
      {until !== null ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted px-3 py-2">
          <p ref={intro} tabIndex={-1} role="status" className="rounded-md text-[13px] focus-visible:shadow-focus">
            {t("demoGate.actors.openUntil", { time: until })}
          </p>
          <Button variant="ghost" onClick={props.onForget}>
            {t("demoGate.actors.forget")}
          </Button>
        </div>
      ) : null}
      {catalogue.data.length === 0 ? (
        <p role="status" className="rounded-lg bg-muted p-3 text-sm">
          {t("demoGate.actors.empty")}
        </p>
      ) : null}
      {failed ? (
        <p role="alert" className="mb-4 rounded-lg bg-muted p-3 text-sm text-destructive">
          {t("demoAccounts.failed")}
        </p>
      ) : null}
      {DIASPORA_GA_DEMO_GROUPS.map((group) => {
        const members = catalogue.data.filter((entry) => DIASPORA_GA_DEMO_ACTOR_SPECS[entry.actor].group === group)
        if (members.length === 0) return null
        return (
          <section key={group} aria-labelledby={`${ids}-${group}`} className="mt-5 first:mt-0">
            <h3 id={`${ids}-${group}`} className="mb-2 text-[13px] font-semibold text-muted-foreground">
              {t(`demoAccounts.groups.${group}`)}
            </h3>
            <ul className="flex flex-col gap-2">
              {members.map((entry) => (
                <li key={entry.actor}>
                  <ActorChoice entry={entry} pending={pending === entry.actor} disabled={pending !== null} onEnter={() => void enter(entry)} />
                </li>
              ))}
            </ul>
          </section>
        )
      })}
    </>
  )
}

function ActorChoice(props: { entry: DemoAccountEntry; pending: boolean; disabled: boolean; onEnter: () => void }) {
  const { t } = useDiasporaGaT()
  const { actor } = props.entry
  const spec = DIASPORA_GA_DEMO_ACTOR_SPECS[actor]
  const name = diasporaGaDemoDisplayName(actor) ?? t("demoAccounts.newcomer")
  return (
    <button
      type="button"
      disabled={props.disabled}
      aria-busy={props.pending || undefined}
      onClick={props.onEnter}
      className="flex min-h-14 w-full items-center gap-3 rounded-xl bg-[var(--esp-neutral-chip)] px-3 py-2.5 text-left transition-colors hover:bg-[var(--esp-neutral-hover)] focus-visible:shadow-focus disabled:cursor-wait disabled:opacity-70"
    >
      <Avatar id={`demo-${actor}`} name={name} size="md" shape={spec.group === "pages" ? "square" : "round"} />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-semibold">{t(`demoAccounts.actors.${actor}.title`)}</span>
          <span className="text-[13px] text-muted-foreground">{name}</span>
        </span>
        <span className="mt-0.5 flex items-center gap-1.5 text-[13px] leading-snug text-muted-foreground">
          {props.pending ? <LoaderCircleIcon className="size-3.5 shrink-0 motion-safe:animate-spin" aria-hidden /> : null}
          {props.pending ? t("demoAccounts.signingIn") : t(`demoAccounts.actors.${actor}.description`)}
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1">
        <CountryTag country={spec.country} />
        {spec.expectedStatus !== null || spec.outsider ? (
          <span className="rounded-full bg-card px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
            {spec.expectedStatus !== null ? t(`membership.status.${spec.expectedStatus}`) : t("demoAccounts.outsider")}
          </span>
        ) : null}
      </span>
    </button>
  )
}

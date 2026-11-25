"use client"

import { DIASPORA_GA_NETWORK_SLUG, type DirectoryVisibility, type MembershipStatus } from "@diaspora-ga/domain"
import { Button, FloatingNotice } from "@diaspora-ga/features"
import { useActions, useDeviceNotifications, type DeviceNotificationsCapability, type MembershipView } from "@diaspora-ga/features/data"
import { useDiasporaGaT } from "@diaspora-ga/features/i18n/client"
import { BellIcon, ContactRoundIcon, SlidersHorizontalIcon } from "lucide-react"
import NextLink from "next/link"
import { useId, useLayoutEffect, useRef, useState, type ReactNode } from "react"
import { toast } from "sonner"

import { routes } from "@/lib/routes"

import { useDismissal } from "./floating-cards"

/**
 * L'invite de première visite (accueil en un écran, décision du 25/11/2026, lot A3).
 *
 * L'entrée ne crée que le profil social : l'annuaire reste masqué et les notifications coupées.
 * Cette carte les PROPOSE après l'entrée, quelle que soit la page d'arrivée (montée par la coque),
 * chacun par son geste explicite, enregistré avec l'origine `prompt` :
 *  · l'annuaire : l'accord « Annuaire » du réseau, puis le niveau choisi (mon pays, tout le
 *    réseau) — les deux écritures existantes, bornées par le moteur (débit, adhésion, accord) ;
 *  · les notifications de CET appareil : le geste « Activer » des réglages (autorisation du
 *    navigateur, accord « Notifications », abonnement), proposé seulement quand l'appareil le peut.
 *
 * Elle reste tant qu'un de ces réglages est à son défaut (annuaire masqué, appareil non abonné) et
 * qu'elle n'a pas été fermée sur cet appareil ; la croix s'en souvient (stockage local, sous le
 * préfixe du réseau, par personne). Les mêmes choix vivent aux réglages, où mènent ses liens.
 *
 * « Une page = une vue » : la coque ne la monte que sur une page de flux. Une vue (`layout="view"`)
 * tient l'écran et ne cède pas sa hauteur ; les réglages, vue eux-mêmes, portent déjà ces choix.
 * Aucune transition (`transition-none`) : la carte paraît après l'hydratation (le stockage local
 * ne se lit pas au rendu serveur), elle ne doit pas passer par une image écrasée en mouvement réduit.
 */

/** La clé de la croix, sous le préfixe des magasins du réseau (`antsia:diaspora-ga:`), par personne. */
export function firstChoicesDismissKey(personId: string): string {
  return `antsia:${DIASPORA_GA_NETWORK_SLUG}:premiers-choix:${personId}`
}

/** Une adhésion qui peut faire ces choix : ni suspendue, ni partie. */
const PROMPTED_STATUSES: ReadonlySet<MembershipStatus> = new Set(["en_attente", "declaree", "verifiee"])

type Gesture = "directory" | "device"

/** Un geste en attente ne parle plus si la carte a disparu (changement de personne, navigation). */
function useMounted() {
  const mounted = useRef(false)
  useLayoutEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  return mounted
}

export function FirstChoicesPrompt(props: { membership: MembershipView }) {
  const { membership } = props
  const { dismissed, dismiss } = useDismissal(firstChoicesDismissKey(membership.personId), "local")
  const capability = useDeviceNotifications()
  if (dismissed || !PROMPTED_STATUSES.has(membership.status)) return null
  return capability
    ? <PromptWithDevice key={membership.personId} membership={membership} capability={capability} onDismiss={dismiss} />
    : <FirstChoicesCard key={membership.personId} membership={membership} device={null} onDismiss={dismiss} />
}

/** L'appareil n'est proposé que s'il peut s'abonner et ne l'est pas encore (`off`). */
function PromptWithDevice(props: { membership: MembershipView; capability: DeviceNotificationsCapability; onDismiss: () => void }) {
  const device = props.capability.useDevice(props.membership.personId)
  const offered = device.status === "ready" && device.data.state === "off" ? props.capability : null
  return <FirstChoicesCard membership={props.membership} device={offered} onDismiss={props.onDismiss} />
}

function FirstChoicesCard(props: { membership: MembershipView; device: DeviceNotificationsCapability | null; onDismiss: () => void }) {
  const { t } = useDiasporaGaT()
  const actions = useActions()
  const titleId = useId()
  const mounted = useMounted()
  const running = useRef(false)
  const [busy, setBusy] = useState<Gesture | null>(null)
  const { membership, device } = props
  const directoryOffered = membership.directoryVisibility === "hidden"

  /** Un geste à la fois ; un refus se dit sans détail, et la ligne reste pour réessayer. */
  const run = async (gesture: Gesture, work: () => Promise<string | null>, success: string) => {
    if (running.current) return
    running.current = true
    setBusy(gesture)
    try {
      const code = await work()
      if (!mounted.current) return
      if (code === null) toast.success(success)
      else toast.error(t(`errors.${code}`))
    } catch {
      if (mounted.current) toast.error(t("errors.unknown"))
    } finally {
      running.current = false
      if (mounted.current) setBusy(null)
    }
  }

  // Le geste de l'annuaire : l'accord du réseau d'abord (le moteur refuse un niveau visible sans lui), puis le niveau.
  const chooseDirectory = (level: Exclude<DirectoryVisibility, "hidden">) =>
    void run(
      "directory",
      async () => {
        const consent = await actions.setConsent("directory", true, "prompt")
        if (!consent.ok) return consent.code
        const visibility = await actions.setDirectoryVisibility(level)
        return visibility.ok ? null : visibility.code
      },
      t("firstChoices.directorySaved"),
    )

  const enableDevice = (capability: DeviceNotificationsCapability) =>
    void run(
      "device",
      async () => {
        const result = await capability.enable(membership.personId, { origin: "prompt" })
        return result.ok ? null : result.code
      },
      t("settings.deviceNotifications.enabled"),
    )

  // Plus aucun réglage à son défaut : l'invite a fait son office.
  if (!directoryOffered && device === null) return null

  return (
    <FloatingNotice
      role="region"
      aria-labelledby={titleId}
      tone="info"
      icon={<SlidersHorizontalIcon />}
      heading={<span id={titleId}>{t("firstChoices.title")}</span>}
      dismissLabel={t("firstChoices.dismiss")}
      onDismiss={props.onDismiss}
      aria-busy={busy !== null || undefined}
      className="transition-none"
    >
      <p>{t("firstChoices.lead")}</p>
      <div className="mt-3 flex flex-col gap-3">
        {directoryOffered ? (
          <ChoiceRow icon={<ContactRoundIcon />} title={t("consent.directory.title")} body={t("consent.directory.body")}>
            <div role="group" aria-label={t("consent.directory.levelLabel")} className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" disabled={busy !== null} onClick={() => chooseDirectory("country")}>
                {t("settings.directoryLevel.country")}
              </Button>
              <Button size="sm" variant="secondary" disabled={busy !== null} onClick={() => chooseDirectory("network")}>
                {t("settings.directoryLevel.network")}
              </Button>
            </div>
          </ChoiceRow>
        ) : null}
        {device ? (
          <ChoiceRow icon={<BellIcon />} title={t("settings.deviceNotifications.title")} body={t("settings.deviceNotifications.consent")}>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" disabled={busy !== null} onClick={() => enableDevice(device)}>
                {busy === "device" ? t("common.pleaseWait") : t("settings.deviceNotifications.enable")}
              </Button>
            </div>
          </ChoiceRow>
        ) : null}
      </div>
      <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span>{t("firstChoices.settingsLead")}</span>
        <SettingsLink href={routes.settingsDirectory()}>{t("firstChoices.settingsDirectory")}</SettingsLink>
        <SettingsLink href={routes.settingsConsents()}>{t("firstChoices.settingsConsents")}</SettingsLink>
        <SettingsLink href={routes.settingsDeviceNotifications()}>{t("firstChoices.settingsDevice")}</SettingsLink>
      </p>
    </FloatingNotice>
  )
}

/** Un choix : ce qu'il fait, dit avant le geste, puis le geste. */
function ChoiceRow(props: { icon: ReactNode; title: string; body: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 rounded-lg bg-muted p-3">
      <span aria-hidden className="mt-0.5 shrink-0 text-muted-foreground [&_svg]:size-4">
        {props.icon}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div>
          <p className="text-sm font-semibold text-foreground">{props.title}</p>
          <p className="mt-0.5">{props.body}</p>
        </div>
        {props.children}
      </div>
    </div>
  )
}

function SettingsLink(props: { href: string; children: ReactNode }) {
  return (
    <NextLink
      href={props.href}
      className="inline-flex min-h-8 items-center rounded-sm font-semibold text-primary underline-offset-4 hover:underline focus-visible:shadow-focus"
    >
      {props.children}
    </NextLink>
  )
}

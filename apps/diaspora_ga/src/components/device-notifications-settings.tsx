"use client"

import { Button, Card, Skeleton } from "@diaspora-ga/features"
import {
  useDataSource,
  useDeviceNotifications,
  type DeviceNotificationsCapability,
  type DeviceNotificationState,
  type MembershipView,
} from "@diaspora-ga/features/data"
import { useDiasporaGaT } from "@diaspora-ga/features/i18n/client"
import { useId, useLayoutEffect, useRef, useState } from "react"
import { toast } from "sonner"

/** Ce que l'écran dit de CET appareil, état par état. */
const STATE_TEXTS: Readonly<Record<DeviceNotificationState, string>> = {
  unsupported: "settings.deviceNotifications.state.unsupported",
  unavailable: "settings.deviceNotifications.state.unavailable",
  denied: "settings.deviceNotifications.state.denied",
  off: "settings.deviceNotifications.state.off",
  on: "settings.deviceNotifications.state.on",
}

/** Un geste en attente ne parle plus si la section a disparu (changement de personne, navigation). */
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

/**
 * « Notifications de cet appareil » (DS-14, volet push) : abonner CE navigateur aux avis de
 * DIASPORA.GA, d'un geste explicite, et l'en retirer. Rien n'est demandé au navigateur au
 * montage ; l'accord « notifications » est posé au geste, et se retire dans « Consentements ».
 * L'avis qui part ne dit ni qui, ni quoi (charge neutre du moteur).
 */
export function DeviceNotificationsSettings({ membership }: { membership: MembershipView }) {
  const { t } = useDiasporaGaT()
  const capability = useDeviceNotifications()
  const demo = useDataSource().kind === "demo"
  const titleId = useId()
  if (!capability) return null
  return (
    <section id="notifications-appareil" aria-labelledby={titleId} className="scroll-mt-20">
      <Card className="flex min-w-0 flex-col gap-4 p-5">
        <div>
          <h2 id={titleId} className="font-display text-xl font-bold">{t("settings.deviceNotifications.title")}</h2>
          <p className="mt-1 text-[13px] leading-snug text-muted-foreground">{t("settings.deviceNotifications.lead")}</p>
        </div>
        {demo ? <p className="rounded-lg bg-muted px-3 py-2 text-[13px] leading-snug">{t("settings.deviceNotifications.demoNotice")}</p> : null}
        <DeviceNotificationsBody key={membership.personId} personId={membership.personId} capability={capability} />
      </Card>
    </section>
  )
}

function DeviceNotificationsBody(props: { personId: string; capability: DeviceNotificationsCapability }) {
  const { t } = useDiasporaGaT()
  const device = props.capability.useDevice(props.personId)
  const mounted = useMounted()
  const running = useRef(false)
  const [busy, setBusy] = useState<"enable" | "disable" | null>(null)

  const run = async (gesture: "enable" | "disable") => {
    if (running.current) return
    running.current = true
    setBusy(gesture)
    try {
      const result = gesture === "enable" ? await props.capability.enable(props.personId) : await props.capability.disable(props.personId)
      if (!mounted.current) return
      if (!result.ok) {
        toast.error(t(`errors.${result.code}`))
        return
      }
      toast.success(t(gesture === "enable" ? "settings.deviceNotifications.enabled" : "settings.deviceNotifications.disabled"))
    } finally {
      running.current = false
      if (mounted.current) setBusy(null)
    }
  }

  if (device.status === "loading") {
    return (
      <div aria-busy="true" className="flex flex-col gap-3">
        <Skeleton className="h-5 w-2/3" />
        <Skeleton className="h-11 w-48" />
      </div>
    )
  }
  if (device.status === "error") return <p role="alert" className="text-sm">{t(`errors.${device.code}`)}</p>
  const { state, subscribedHere } = device.data
  return (
    <div className="flex flex-col gap-3" aria-busy={busy !== null}>
      <p role="status" className="text-sm font-medium">{t(STATE_TEXTS[state])}</p>
      {state === "off" ? <p className="text-[13px] leading-snug text-muted-foreground">{t("settings.deviceNotifications.consent")}</p> : null}
      {state === "off" || subscribedHere ? (
        <div className="flex flex-wrap gap-3">
          {state === "off" ? (
            <Button type="button" disabled={busy !== null} onClick={() => void run("enable")}>
              {busy === "enable" ? t("common.pleaseWait") : t("settings.deviceNotifications.enable")}
            </Button>
          ) : null}
          {subscribedHere ? (
            <Button type="button" variant="outline" disabled={busy !== null} onClick={() => void run("disable")}>
              {busy === "disable" ? t("common.pleaseWait") : t("settings.deviceNotifications.disable")}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

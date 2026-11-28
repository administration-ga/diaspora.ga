"use client"

import { api } from "@convex/_generated/api"
import type { Id } from "@convex/_generated/dataModel"
import { useDiasporaGaT } from "@diaspora-ga/features/i18n/client"
import { useMutation } from "convex/react"
import { useState } from "react"
import { toast } from "sonner"

import { useLoaded } from "@/data/engine-kit"
import { useEngineNetwork } from "./icom"

export function GuestVisibilitySetting(props: { pageId?: string; canEnable?: boolean }) {
  const network = useEngineNetwork()
  return network ? <Setting networkId={network.networkId} {...props} /> : null
}

function Setting({ networkId, pageId, canEnable = true }: { networkId: Id<"networks">; pageId?: string; canEnable?: boolean }) {
  const { t } = useDiasporaGaT()
  const args = { networkId, ...(pageId ? { pageId: pageId as Id<"pages"> } : {}) }
  const setting = useLoaded(api.modules.diaspora.guestReading.setting, args)
  const change = useMutation(api.modules.diaspora.guestReading.setVisibility)
  const [busy, setBusy] = useState(false)
  if (setting.state !== "ready") return null
  return <div className="grid gap-1">
    <label className="flex min-h-11 items-center gap-2">
      <input type="checkbox" checked={setting.value} disabled={busy || (!setting.value && !canEnable)} onChange={async event => {
        setBusy(true)
        try { await change({ ...args, enabled: event.target.checked }) }
        catch { toast.error(t("errors.unknown")) }
        finally { setBusy(false) }
      }} />
      {t(pageId ? "guest.pageSharing" : "guest.profileSharing")}
    </label>
    {!canEnable && <p className="text-sm text-muted-foreground">{t("guest.visibilityHint")}</p>}
  </div>
}

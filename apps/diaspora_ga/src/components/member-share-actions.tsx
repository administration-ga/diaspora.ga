"use client"

import { Button, Sheet, SheetContent, SheetTrigger } from "@diaspora-ga/features"
import { useDiasporaGaT } from "@diaspora-ga/features/i18n/client"
import { CopyIcon, MailPlusIcon, MessageCircleIcon, MessageSquareIcon, Share2Icon } from "lucide-react"
import { useRef, useState } from "react"
import { toast } from "sonner"

import { routes } from "@/lib/routes"
import { shareDiasporaLink, type ShareMode } from "@/lib/share-diaspora-link"

export function MemberInviteButton() {
  const { t } = useDiasporaGaT()
  const [open, setOpen] = useState(false)
  const pending = useRef(false)
  const send = async (mode: ShareMode) => {
    if (pending.current) return
    pending.current = true
    try {
      const outcome = await shareDiasporaLink(routes.feed(), mode, t("members.inviteTitle"))
      if (outcome !== "cancelled") setOpen(false)
      if (outcome === "copied") toast.success(t("members.linkCopied"))
    } catch {
      toast.error(t("members.shareFailed"))
    } finally {
      pending.current = false
    }
  }
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="social" size="sm"><MailPlusIcon aria-hidden />{t("members.invite")}</Button>
      </SheetTrigger>
      <SheetContent title={t("members.invite")} description={t("members.inviteTitle")} hideDescription closeLabel={t("common.close")}>
        <div className="grid gap-2">
          <Button variant="secondary" onClick={() => void send("sms")}><MessageSquareIcon aria-hidden />{t("members.sms")}</Button>
          <Button variant="secondary" onClick={() => void send("whatsapp")}><MessageCircleIcon aria-hidden />{t("members.whatsapp")}</Button>
          <Button variant="secondary" onClick={() => void send("share")}><Share2Icon aria-hidden />{t("members.shareLink")}</Button>
          <Button variant="ghost" onClick={() => void send("copy")}><CopyIcon aria-hidden />{t("pageSharing.copyLink")}</Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}

export function ProfileShareAction({ handle, own = false }: { handle: string; own?: boolean }) {
  const { t } = useDiasporaGaT()
  const label = t(own ? "members.shareMine" : "members.shareProfile")
  async function share() {
    try {
      const outcome = await shareDiasporaLink(routes.profile(handle), "share", label)
      if (outcome === "copied") toast.success(t("members.linkCopied"))
    } catch {
      toast.error(t("members.shareFailed"))
    }
  }
  return <Button size="sm" variant="secondary" onClick={() => void share()}><Share2Icon aria-hidden />{label}</Button>
}

export function MemberShareActions({ handle }: { handle: string }) {
  return <div className="flex flex-wrap gap-2"><MemberInviteButton /><ProfileShareAction handle={handle} own /></div>
}

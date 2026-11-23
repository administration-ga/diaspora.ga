"use client"

import { Button, cn } from "@diaspora-ga/features"
import { LogOut } from "lucide-react"
import { useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import { APP_NAMESPACE } from "@/i18n/resources"
import { signOutAndRedirect } from "@/lib/sign-out"

/**
 * « Se déconnecter partout », par la porte unique (`@/lib/sign-out`) : un seul geste à
 * la fois ; la navigation complète vers l'entrée termine la sortie. Un échec local se
 * dit sur place, sans détail. Accessible même quand l'accès est refusé.
 */
export function SignOutEverywhereButton(props: { className?: string; variant?: "outline" | "ghost" }) {
  const { t } = useTranslation(APP_NAMESPACE)
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState(false)
  const lock = useRef(false)
  return (
    <div className={cn("flex flex-col gap-2", props.className)}>
      <Button
        type="button"
        variant={props.variant ?? "outline"}
        disabled={pending}
        aria-busy={pending || undefined}
        className="whitespace-normal"
        onClick={async () => {
          if (lock.current) return
          lock.current = true
          setPending(true)
          setFailed(false)
          try {
            await signOutAndRedirect()
          } catch {
            lock.current = false
            setPending(false)
            setFailed(true)
          }
        }}
      >
        <LogOut aria-hidden="true" />
        {pending ? t("exit.pending") : t("exit.action")}
      </Button>
      {failed ? (
        <p role="alert" className="text-sm text-destructive">
          {t("exit.failed")}
        </p>
      ) : null}
    </div>
  )
}

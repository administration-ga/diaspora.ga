"use client"

import { Button, Field, Input } from "@diaspora-ga/features"
import { useActions } from "@diaspora-ga/features/data"
import { useDiasporaGaT } from "@diaspora-ga/features/i18n/client"
import { useId, useState } from "react"
import { toast } from "sonner"

export function RedeemSponsorCode() {
  const { t } = useDiasporaGaT()
  const actions = useActions()
  const id = useId()
  const [code, setCode] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)

  return (
    <form className="flex flex-col items-start gap-2" onSubmit={async event => {
      event.preventDefault()
      if (busy || !code.trim()) return
      setBusy(true)
      setError(false)
      try {
        const result = await actions.redeemSponsorCode(code)
        if (result.ok) {
          setCode("")
          toast.success(t("sponsorCode.done"))
        } else {
          setError(true)
        }
      } catch {
        setError(true)
      } finally {
        setBusy(false)
      }
    }}>
      <Field id={id} label={t("sponsorCode.received")} error={error ? t("sponsorCode.invalid") : undefined}>
        {control => <Input id={control.id} value={code} onChange={event => { setCode(event.target.value); setError(false) }}
          aria-invalid={control.invalid || undefined} aria-describedby={control.describedBy} autoCapitalize="characters" autoComplete="off"
          spellCheck={false} maxLength={32} className="font-mono" />}
      </Field>
      <Button type="submit" variant="secondary" disabled={busy || !code.trim()}>{t("sponsorCode.redeem")}</Button>
    </form>
  )
}

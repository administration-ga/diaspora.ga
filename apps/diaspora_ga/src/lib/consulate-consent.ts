import { z } from "zod"

const hint = z.string().max(254).email().regex(/@idn\.ga$/i)
export const passResult = z.discriminatedUnion("next", [
  z.object({ ok: z.literal(true), next: z.literal("feed") }),
  z.object({ ok: z.literal(true), next: z.literal("idn"), loginHint: hint.optional() }),
  z.object({
    ok: z.literal(true), next: z.literal("consent"), userId: z.string().min(1),
    givenNames: z.string().max(256).optional(), familyName: z.string().max(256).optional(),
    countryOfResidence: z.string().max(64).optional(),
  }),
])

export type ConsentProfile = Extract<z.infer<typeof passResult>, { next: "consent" }>
const key = "antsia:diaspora-ga:accord-consulaire"
const lifetime = 10 * 60_000

/** Le rechargement adopte le cookie de la nouvelle session avant de présenter son identité. */
export function keepConsent(profile: ConsentProfile, store: Storage, now = Date.now()) {
  store.setItem(key, JSON.stringify({ expires: now + lifetime, profile }))
}

export function readConsent(userId: string, store: Storage, now = Date.now()): ConsentProfile | null {
  try {
    const saved = JSON.parse(store.getItem(key) ?? "null")
    const result = passResult.safeParse(saved?.profile)
    if (result.success && result.data.next === "consent" && result.data.userId === userId &&
        Number.isFinite(saved.expires) && saved.expires > now && saved.expires <= now + lifetime) return result.data
  } catch { /* Un rappel incomplet ou périmé ne sert pas à remplir le consentement. */ }
  clearConsent(store)
  return null
}

export function clearConsent(store?: Storage) {
  try { (store ?? window.sessionStorage).removeItem(key) } catch { /* L’effacement local ne bloque pas une adhésion enregistrée. */ }
}

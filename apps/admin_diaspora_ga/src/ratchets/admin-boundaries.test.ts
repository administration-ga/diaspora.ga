import { describe, expect, it } from "vitest"

import { productSources } from "./sources"

/**
 * Cliquet des frontières d'admin.diaspora.ga (fiche CH-815, D1, D3 et D6) :
 *  · aucune source de démonstration : l'application est branchée sur le moteur seul ;
 *  · aucune inscription aux notifications (cloche, notifications poussées, script de
 *    fond) : un récapitulatif ne part jamais vers une console ;
 *  · aucune porte par code (courriel, SMS) : l'identité numérique seule ;
 *  · une seule porte de sortie de session (`src/lib/sign-out.ts`).
 */
const files = productSources([".ts", ".tsx"])

function hits(pattern: RegExp, except: readonly string[] = []): string[] {
  return files.filter((file) => !except.includes(file.path) && pattern.test(file.text)).map((file) => file.path)
}

describe("frontières d'admin.diaspora.ga", () => {
  it("relit bien l'application", () => {
    expect(files.length).toBeGreaterThan(15)
  })

  it("aucune donnée de démonstration (D1)", () => {
    expect(hits(/@diaspora-ga\/features\/demo|createDemoDataSource|DemoStore|DATA_SOURCE/)).toEqual([])
  })

  it("jamais inscrite aux notifications du moteur (D6)", () => {
    expect(hits(/modules\.notifications|pushSubscriptions|serviceWorker|pushManager|PushManager|NotificationBell|applicationId/)).toEqual([])
  })

  it("aucune connexion par code, par courriel ou par SMS (D3)", () => {
    expect(hits(/emailOtp\s*\(|signIn\.emailOtp|phoneNumber\.|sendVerificationOtp|signIn\.email\b/)).toEqual([])
    expect(hits(/providerId:/)).toEqual(["apps/admin_diaspora_ga/src/components/sign-in-screen.tsx"])
  })

  it("une seule porte de sortie de session", () => {
    expect(hits(/@antsia\/api\/sign-out-everywhere"/, ["apps/admin_diaspora_ga/src/components/sign-in-screen.tsx"])).toEqual(["apps/admin_diaspora_ga/src/lib/sign-out.ts"])
  })
})

// @vitest-environment jsdom
import { beforeEach, expect, it } from "vitest"
import { keepConsent, passResult, readConsent, type ConsentProfile } from "./consulate-consent"

const grant: ConsentProfile = { ok: true, next: "consent", userId: "same", givenNames: "Anne Marie", familyName: "MBA" }
beforeEach(() => sessionStorage.clear())
it("n’affiche les renseignements que pour le compte de la session de retour", () => {
  keepConsent(grant, sessionStorage, 1000)
  expect(readConsent("same", sessionStorage, 1010)).toEqual(grant)
  expect(readConsent("other", sessionStorage, 1010)).toBeNull()
  expect(sessionStorage.length).toBe(0)
})
it("oublie le rappel de consentement après dix minutes", () => {
  keepConsent(grant, sessionStorage, 1000)
  expect(readConsent("same", sessionStorage, 601001)).toBeNull()
})
it("refuse une redirection libre ou un repère IDN d’un autre domaine", () => {
  expect(passResult.safeParse({ ok:true, next:"https://example.org" }).success).toBe(false)
  expect(passResult.safeParse({ ok:true, next:"idn", loginHint:"x@example.org" }).success).toBe(false)
})

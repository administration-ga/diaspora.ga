// @vitest-environment node
import { normalizeDemoGateCode } from "@antsia/social-contracts/demoGate"
import { describe, expect, it } from "vitest"

import {
  DEMO_GATE_ERROR_CODES,
  DEMO_GATE_FORM_ERROR_CODES,
  DEMO_GATE_REQUEST_WINDOW_MS,
  DEMO_GATE_RESEND_WAIT_MS,
  DEMO_GATE_SHEET_STEPS,
  DEMO_GATE_STATES,
  demoGateRequestWaitMs,
  demoGateSheetStep,
  groupDemoGateCodeInput,
} from "./demo-gate-port"
import { ACTION_ERROR_CODES, ERROR_CODES, FORM_ERROR_CODES } from "./errors"

/** Les règles pures de la porte des comptes de démonstration, côté écran (CH-817, lot A1). */
describe("porte des comptes de démonstration — règles de l'écran", () => {
  it("l'étape de la feuille suit l'état de la porte, la session et le défi", () => {
    expect(DEMO_GATE_STATES).toEqual(["closed", "open", "unavailable", "gated"])
    for (const session of [false, true]) {
      for (const challenge of [false, true]) {
        expect(demoGateSheetStep({ state: "closed", session, challenge })).toBeNull()
        expect(demoGateSheetStep({ state: "open", session, challenge })).toBe("actors")
        expect(demoGateSheetStep({ state: "unavailable", session, challenge })).toBe("unavailable")
      }
    }
    expect(demoGateSheetStep({ state: "gated", session: false, challenge: false })).toBe("phone")
    expect(demoGateSheetStep({ state: "gated", session: false, challenge: true })).toBe("code")
    // Une session valide ouvre les acteurs, même si un défi traîne encore.
    expect(demoGateSheetStep({ state: "gated", session: true, challenge: true })).toBe("actors")
    expect(DEMO_GATE_SHEET_STEPS).toEqual(["phone", "code", "actors", "unavailable"])
  })

  it("la saisie du code se met en majuscules, perd ses séparateurs et se groupe par trois", () => {
    expect(groupDemoGateCodeInput("")).toBe("")
    expect(groupDemoGateCodeInput("12")).toBe("12")
    expect(groupDemoGateCodeInput("1234")).toBe("123 4")
    expect(groupDemoGateCodeInput("123456")).toBe("123 456")
    expect(groupDemoGateCodeInput("123456k")).toBe("123 456 K")
    expect(groupDemoGateCodeInput("123-456 k")).toBe("123 456 K")
    expect(groupDemoGateCodeInput(" 123.456 K ")).toBe("123 456 K")
    // Sept caractères significatifs au plus : un collage trop long est coupé, jamais allongé.
    expect(groupDemoGateCodeInput("123456KZZ")).toBe("123 456 K")
    // Le regroupement ne valide rien : c'est le contrat qui le fait, sur la valeur groupée.
    expect(normalizeDemoGateCode(groupDemoGateCodeInput("123456k"))).toBe("123456K")
    expect(normalizeDemoGateCode(groupDemoGateCodeInput("123456i"))).toBeNull()
  })

  it("une demande de code attend une minute après la précédente, et trois au plus par quart d'heure", () => {
    const start = 1_000_000
    expect(demoGateRequestWaitMs([], start)).toBe(0)
    expect(demoGateRequestWaitMs([start], start)).toBe(DEMO_GATE_RESEND_WAIT_MS)
    expect(demoGateRequestWaitMs([start], start + 45_000)).toBe(15_000)
    expect(demoGateRequestWaitMs([start], start + DEMO_GATE_RESEND_WAIT_MS)).toBe(0)
    // Trois demandes espacées d'une minute : la quatrième attend que la première sorte de la fenêtre.
    const three = [start, start + 60_000, start + 120_000]
    expect(demoGateRequestWaitMs(three, start + 180_000)).toBe(DEMO_GATE_REQUEST_WINDOW_MS - 180_000)
    expect(demoGateRequestWaitMs(three, start + DEMO_GATE_REQUEST_WINDOW_MS)).toBe(0)
    // L'ordre des demandes ne compte pas ; une demande sortie de la fenêtre ne compte plus.
    expect(demoGateRequestWaitMs([start + 120_000, start, start + 60_000], start + 180_000)).toBe(DEMO_GATE_REQUEST_WINDOW_MS - 180_000)
    expect(demoGateRequestWaitMs([start - DEMO_GATE_REQUEST_WINDOW_MS], start)).toBe(0)
  })

  it("les refus de la porte sont des codes fermés : d'action, et de formulaire pour la forme du code", () => {
    for (const code of DEMO_GATE_ERROR_CODES) expect((ACTION_ERROR_CODES as readonly string[]).includes(code), code).toBe(true)
    for (const code of DEMO_GATE_FORM_ERROR_CODES) expect((FORM_ERROR_CODES as readonly string[]).includes(code), code).toBe(true)
    for (const code of [...DEMO_GATE_ERROR_CODES, ...DEMO_GATE_FORM_ERROR_CODES, "phone_invalid", "too_many_attempts", "network_unavailable"]) {
      expect(ERROR_CODES.has(code as never), code).toBe(true)
    }
  })
})

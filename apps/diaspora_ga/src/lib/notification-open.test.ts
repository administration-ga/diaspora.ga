// @vitest-environment node
import { describe, expect, it } from "vitest"

import { parseNotificationReference } from "./notification-open"
import { NOTIFICATION_REFERENCE_PARAM, routes } from "./routes"

/** DS-14 (ouverture) : la porte ne lit qu'une référence opaque, jamais une destination. */
describe("porte d'ouverture — la référence d'une notification poussée", () => {
  it("garde une référence de la forme d'un identifiant du moteur", () => {
    expect(parseNotificationReference("delivery_Opaque-42")).toBe("delivery_Opaque-42")
    expect(parseNotificationReference("x".repeat(64))).toBe("x".repeat(64))
  })

  it("écarte une adresse, un blanc, une valeur trop longue, répétée, vide ou absente", () => {
    for (const value of ["https://external.example/", "/messages", "delivery 42", "delivery\n", "x".repeat(65), "", ["a", "b"], undefined, null, 42]) {
      expect(parseNotificationReference(value), String(value)).toBeNull()
    }
  })

  it("l'adresse de la porte ne porte que ce paramètre, lu tel que la table des routes le compose", () => {
    const opening = new URL(routes.openNotification("delivery_demo"), "https://diaspora-ga.example/")
    expect(opening.pathname).toBe(routes.openNotification())
    expect([...opening.searchParams.keys()]).toEqual([NOTIFICATION_REFERENCE_PARAM])
    expect(parseNotificationReference(opening.searchParams.get(NOTIFICATION_REFERENCE_PARAM))).toBe("delivery_demo")
  })
})

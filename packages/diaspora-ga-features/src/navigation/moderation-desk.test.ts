import { describe, expect, it } from "vitest"

import { MODERATION_DESK_TABS, moderationDeskPath } from "./moderation-desk"

/** CH-815 A7 — l'adresse du bureau de modération, écrite une fois pour diaspora.ga et son administration. */
describe("adresse du bureau de modération de diaspora.ga", () => {
  it("le bureau, puis chacun de ses deux onglets", () => {
    expect(moderationDeskPath()).toBe("/moderation")
    expect(moderationDeskPath("file")).toBe("/moderation?onglet=file")
    expect(moderationDeskPath("pages")).toBe("/moderation?onglet=pages")
    expect(MODERATION_DESK_TABS).toEqual(["file", "pages"])
  })
})

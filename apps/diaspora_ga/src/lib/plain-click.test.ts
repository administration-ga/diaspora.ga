import { describe, expect, it } from "vitest"

import { isPlainClick } from "./plain-click"

const click = { button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false }

describe("isPlainClick — le clic qu'une page flottante peut garder", () => {
  it("le bouton principal sans touche : un clic simple", () => {
    expect(isPlainClick(click)).toBe(true)
  })

  it.each([
    ["Cmd", { metaKey: true }],
    ["Ctrl", { ctrlKey: true }],
    ["Maj", { shiftKey: true }],
    ["Alt", { altKey: true }],
    ["le bouton du milieu", { button: 1 }],
  ] as const)("%s : le navigateur garde la main (nouvel onglet, nouvelle fenêtre…)", (_name, change) => {
    expect(isPlainClick({ ...click, ...change })).toBe(false)
  })
})

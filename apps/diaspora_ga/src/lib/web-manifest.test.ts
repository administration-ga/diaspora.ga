// @vitest-environment node
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { getFixedT, type Locale } from "@diaspora-ga/features/i18n"
import { describe, expect, it } from "vitest"

import { readInstallPalette } from "./install-palette-files"
import { routes } from "./routes"
import { webManifest } from "./web-manifest"

/** MO-02 : le manifeste de l'application installable et la géométrie de ses icônes. */

const palette = readInstallPalette(fileURLToPath(new URL("../../", import.meta.url)))

function manifestIn(locale: Locale) {
  const fixed = getFixedT(locale)
  return webManifest({ locale, t: (key, options = {}) => fixed(key, options), palette })
}

describe("manifeste de l'application installable", () => {
  it("s'ouvre comme une application, sur le fil, à la portée du site entier", () => {
    const manifest = manifestIn("fr")
    expect(manifest.display).toBe("standalone")
    expect(manifest.start_url).toBe(routes.feed())
    expect(manifest.scope).toBe(routes.home())
    expect(manifest.id).toBe(routes.home())
    expect(manifest.orientation).toBeUndefined()
  })

  it("porte le nom de la marque et la description dans la langue de la requête", () => {
    const fr = manifestIn("fr")
    const en = manifestIn("en")
    expect(fr.name).toBe(getFixedT("fr")("brand.name"))
    expect(fr.short_name).toBe(getFixedT("fr")("brand.shortName"))
    expect(fr.description).toBe(getFixedT("fr")("meta.description"))
    expect(en.description).toBe(getFixedT("en")("meta.description"))
    expect(en.description).not.toBe(fr.description)
    expect([fr.lang, en.lang]).toEqual(["fr", "en"])
  })

  it("déclare les icônes 192, 512 et masquable, toutes servies par la table des routes", () => {
    const icons = manifestIn("fr").icons ?? []
    expect(icons).toEqual([
      { src: routes.appIcon("192"), sizes: "192x192", type: "image/png", purpose: "any" },
      { src: routes.appIcon("512"), sizes: "512x512", type: "image/png", purpose: "any" },
      { src: routes.appIcon("masquable"), sizes: "512x512", type: "image/png", purpose: "maskable" },
    ])
  })

  it("prend ses couleurs dans la charte, et les omet plutôt que de les deviner", () => {
    const manifest = manifestIn("fr")
    expect(manifest.theme_color).toBe(palette.light.background)
    expect(manifest.background_color).toBe(palette.light.background)
    const fixed = getFixedT("fr")
    const bare = webManifest({ locale: "fr", t: (key, options = {}) => fixed(key, options), palette: null })
    expect(bare.theme_color).toBeUndefined()
    expect(bare.background_color).toBeUndefined()
  })

  it("aucune adresse complète : tout reste sur l'origine du site", () => {
    const manifest = manifestIn("en")
    const addresses = [manifest.start_url, manifest.scope, manifest.id, ...(manifest.icons ?? []).map((icon) => icon.src)]
    for (const address of addresses) expect(address).toMatch(/^\/(?!\/)/)
  })
})

describe("fichiers des icônes", () => {
  it.each([
    ["public/identite/pwa-192.png", 192],
    ["public/identite/pwa-512.png", 512],
    ["public/identite/pwa-maskable.png", 512],
    ["src/app/apple-icon.png", 180],
    ["src/app/icon.png", 32],
  ] as const)("sert un PNG aux dimensions annoncées pour %s", (name, size) => {
    const file = readFileSync(new URL(`../../${name}`, import.meta.url))
    expect(file.toString("ascii", 1, 4)).toBe("PNG")
    expect(file.readUInt32BE(16)).toBe(size)
    expect(file.readUInt32BE(20)).toBe(size)
  })
})

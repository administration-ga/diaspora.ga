export const APP_ICON_FORMATS = ["192", "512", "masquable"] as const
export type AppIconFormat = (typeof APP_ICON_FORMATS)[number]

/** Les formats du manifeste : taille et usage déclarés. */
export const MANIFEST_ICONS: Readonly<Record<AppIconFormat, { readonly size: number; readonly purpose: "any" | "maskable" }>> = {
  "192": { size: 192, purpose: "any" },
  "512": { size: 512, purpose: "any" },
  masquable: { size: 512, purpose: "maskable" },
}

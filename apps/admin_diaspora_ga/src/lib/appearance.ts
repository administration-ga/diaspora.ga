/**
 * L'apparence d'admin.diaspora.ga (D6) : le thème `diaspora-ga` du moteur, seul, et le
 * mode de l'appareil (clair ou sombre selon le système). Une seule configuration pour
 * le fournisseur d'apparence du moteur (`components/providers.tsx`) et son script
 * d'amorçage (`components/appearance-boot-script.tsx`), sous un préfixe propre à
 * l'application (`antsia:` : la sortie de session le purge avec le reste).
 *
 * Module serveur autant que client : aucune dépendance React.
 */
export const APPEARANCE = {
  storagePrefix: "antsia:admin-diaspora-ga:",
  themes: [{ id: "sable", charte: "diaspora-ga" }],
} as const

/** La charte posée sur `<html>` avant toute préférence. */
export const DEFAULT_CHARTE = APPEARANCE.themes[0].charte

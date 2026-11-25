/**
 * Les illustrations FICTIVES de la démonstration (A6, 25/11/2026) : dix scènes à plat,
 * dessinées en SVG au moment de la lecture, aux couleurs du thème AFFICHÉ — aucune
 * couleur n'est écrite ici (cliquet de la charte) : chaque teinte est lue dans un jeton
 * du contrat par une sonde, et l'image se recompose quand le thème change. Aucune photo
 * réelle, aucun fichier, aucune adresse : une donnée de démonstration se reconnaît.
 *
 * Elles servent la publication de démonstration à dix photos (la borne du moteur depuis son
 * lot M3), qui montre la grille intelligente et la visionneuse (au-delà de quatre photos,
 * trois vignettes et une quatrième tuile « +N »).
 */

export const DEMO_ILLUSTRATIONS = ["lagune", "marche", "danse", "tambours", "plat", "coucher", "pirogue", "foret", "quartier", "etoiles"] as const
export type DemoIllustration = (typeof DEMO_ILLUSTRATIONS)[number]

/** Les rôles de couleur d'une scène, et le jeton du contrat qui porte chacun. */
const PALETTE_TOKENS = {
  sky: "--role-message-soft",
  sun: "--role-react-fill",
  sea: "--role-social-fill",
  deep: "--primary-fill",
  land: "--role-success-fill",
  warm: "--role-commerce-fill",
  paper: "--card",
  ink: "--foreground",
} as const
type PaletteRole = keyof typeof PALETTE_TOKENS
type Palette = Readonly<Record<PaletteRole, string>>

/** Sans thème lisible (rendu serveur, tests), la scène se dessine à l'encre courante. */
const NEUTRAL: Palette = Object.fromEntries(Object.keys(PALETTE_TOKENS).map((role) => [role, "currentColor"])) as Record<PaletteRole, string>

/** La couleur RÉSOLUE d'un jeton : une propriété personnalisée se lit telle qu'écrite (`var(…)`), la sonde la résout. */
function readPalette(): Palette {
  if (typeof document === "undefined" || typeof getComputedStyle !== "function" || document.documentElement === null) return NEUTRAL
  const probe = document.createElement("span")
  probe.hidden = true
  document.documentElement.appendChild(probe)
  try {
    const entries = (Object.keys(PALETTE_TOKENS) as PaletteRole[]).map((role) => {
      probe.style.color = `var(${PALETTE_TOKENS[role]})`
      const resolved = getComputedStyle(probe).color.trim()
      return [role, resolved.length > 0 && !resolved.startsWith("var(") ? resolved : "currentColor"] as const
    })
    return Object.fromEntries(entries) as Record<PaletteRole, string>
  } finally {
    probe.remove()
  }
}

/** Le thème affiché (charte et mode) : la clé du cache des scènes. */
function themeKey(): string {
  if (typeof document === "undefined" || document.documentElement === null) return "serveur"
  const root = document.documentElement
  return `${root.getAttribute("data-charte") ?? ""}|${root.classList.contains("dark") ? "sombre" : "clair"}`
}

type Painter = (palette: Palette, width: number, height: number) => string

const PAINTERS: Record<DemoIllustration, Painter> = {
  // La lagune au matin : ciel, soleil, trois vagues.
  lagune: (p, w, h) => `<rect width="${w}" height="${h}" fill="${p.sky}"/>`
    + `<circle cx="${w * 0.72}" cy="${h * 0.34}" r="${h * 0.14}" fill="${p.sun}"/>`
    + `<path d="M0 ${h * 0.58} Q ${w * 0.25} ${h * 0.52} ${w * 0.5} ${h * 0.58} T ${w} ${h * 0.58} V ${h} H 0 Z" fill="${p.sea}"/>`
    + `<path d="M0 ${h * 0.72} Q ${w * 0.25} ${h * 0.66} ${w * 0.5} ${h * 0.72} T ${w} ${h * 0.72} V ${h} H 0 Z" fill="${p.deep}"/>`
    + `<path d="M0 ${h * 0.86} Q ${w * 0.25} ${h * 0.8} ${w * 0.5} ${h * 0.86} T ${w} ${h * 0.86} V ${h} H 0 Z" fill="${p.ink}" fill-opacity="0.35"/>`,
  // Les étals du marché : des auvents rayés sur un sol clair.
  marche: (p, w, h) => {
    const stalls = [0, 1, 2].map((index) => {
      const x = w * (0.06 + index * 0.31)
      const top = h * (0.18 + (index % 2) * 0.08)
      const color = [p.warm, p.sea, p.sun][index]
      return `<path d="M${x} ${top} h ${w * 0.27} l ${-w * 0.03} ${h * 0.1} h ${-w * 0.21} Z" fill="${color}"/>`
        + `<rect x="${x + w * 0.03}" y="${top + h * 0.1}" width="${w * 0.21}" height="${h * 0.42}" fill="${p.paper}"/>`
        + `<rect x="${x + w * 0.03}" y="${top + h * 0.4}" width="${w * 0.21}" height="${h * 0.06}" fill="${color}" fill-opacity="0.6"/>`
    }).join("")
    return `<rect width="${w}" height="${h}" fill="${p.sky}"/><rect y="${h * 0.7}" width="${w}" height="${h * 0.3}" fill="${p.land}" fill-opacity="0.5"/>${stalls}`
  },
  // La ronde : des danseurs en cercle autour d'un feu.
  danse: (p, w, h) => {
    const cx = w / 2
    const cy = h / 2
    const dancers = Array.from({ length: 8 }, (_, index) => {
      const angle = (index / 8) * Math.PI * 2
      const x = cx + Math.cos(angle) * w * 0.3
      const y = cy + Math.sin(angle) * h * 0.3
      return `<circle cx="${x}" cy="${y - h * 0.05}" r="${w * 0.035}" fill="${p.ink}"/><path d="M${x - w * 0.04} ${y + h * 0.07} Q ${x} ${y - h * 0.04} ${x + w * 0.04} ${y + h * 0.07} Z" fill="${index % 2 === 0 ? p.warm : p.sea}"/>`
    }).join("")
    return `<rect width="${w}" height="${h}" fill="${p.deep}"/><circle cx="${cx}" cy="${cy}" r="${w * 0.12}" fill="${p.sun}"/><circle cx="${cx}" cy="${cy}" r="${w * 0.06}" fill="${p.warm}"/>${dancers}`
  },
  // Les tambours : trois fûts sur une estrade.
  tambours: (p, w, h) => {
    const drums = [0, 1, 2].map((index) => {
      const x = w * (0.16 + index * 0.27)
      const height = h * (0.42 - index * 0.06)
      const top = h * 0.82 - height
      return `<rect x="${x}" y="${top}" width="${w * 0.16}" height="${height}" rx="${w * 0.02}" fill="${[p.warm, p.sea, p.land][index]}"/>`
        + `<ellipse cx="${x + w * 0.08}" cy="${top}" rx="${w * 0.08}" ry="${h * 0.04}" fill="${p.paper}"/>`
    }).join("")
    return `<rect width="${w}" height="${h}" fill="${p.sky}"/><rect y="${h * 0.82}" width="${w}" height="${h * 0.18}" fill="${p.ink}" fill-opacity="0.6"/>${drums}`
  },
  // Le plat partagé : une assiette et ses garnitures.
  plat: (p, w, h) => `<rect width="${w}" height="${h}" fill="${p.warm}" fill-opacity="0.35"/>`
    + `<circle cx="${w / 2}" cy="${h / 2}" r="${Math.min(w, h) * 0.38}" fill="${p.paper}"/>`
    + `<circle cx="${w / 2}" cy="${h / 2}" r="${Math.min(w, h) * 0.3}" fill="${p.sun}" fill-opacity="0.55"/>`
    + `<circle cx="${w * 0.42}" cy="${h * 0.44}" r="${Math.min(w, h) * 0.08}" fill="${p.land}"/>`
    + `<circle cx="${w * 0.58}" cy="${h * 0.46}" r="${Math.min(w, h) * 0.07}" fill="${p.warm}"/>`
    + `<circle cx="${w * 0.5}" cy="${h * 0.6}" r="${Math.min(w, h) * 0.09}" fill="${p.deep}" fill-opacity="0.7"/>`,
  // Le coucher de soleil sur l'estuaire : un dégradé, le disque, la mer.
  coucher: (p, w, h) => `<defs><linearGradient id="ciel" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p.deep}"/><stop offset="1" stop-color="${p.sun}"/></linearGradient></defs>`
    + `<rect width="${w}" height="${h}" fill="url(#ciel)"/>`
    + `<circle cx="${w * 0.5}" cy="${h * 0.66}" r="${h * 0.18}" fill="${p.warm}"/>`
    + `<rect y="${h * 0.66}" width="${w}" height="${h * 0.34}" fill="${p.sea}"/>`
    + `<rect x="${w * 0.3}" y="${h * 0.72}" width="${w * 0.4}" height="${h * 0.02}" fill="${p.paper}" fill-opacity="0.6"/>`,
  // La pirogue sur le fleuve : une coque, un pagayeur, des reflets.
  pirogue: (p, w, h) => `<rect width="${w}" height="${h}" fill="${p.sky}"/>`
    + `<rect y="${h * 0.55}" width="${w}" height="${h * 0.45}" fill="${p.sea}"/>`
    + `<path d="M${w * 0.2} ${h * 0.6} Q ${w * 0.5} ${h * 0.72} ${w * 0.8} ${h * 0.6} Z" fill="${p.warm}"/>`
    + `<circle cx="${w * 0.5}" cy="${h * 0.42}" r="${h * 0.05}" fill="${p.ink}"/>`
    + `<rect x="${w * 0.48}" y="${h * 0.46}" width="${w * 0.04}" height="${h * 0.12}" fill="${p.ink}"/>`
    + `<rect x="${w * 0.3}" y="${h * 0.76}" width="${w * 0.4}" height="${h * 0.015}" fill="${p.paper}" fill-opacity="0.5"/>`,
  // La forêt : trois rangs de cimes.
  foret: (p, w, h) => {
    const rows = [0, 1, 2].map((row) => Array.from({ length: 6 }, (_, index) => {
      const x = w * (index / 5) + (row % 2) * w * 0.08
      const base = h * (0.62 + row * 0.14)
      const top = base - h * 0.3
      return `<path d="M${x - w * 0.09} ${base} L ${x} ${top} L ${x + w * 0.09} ${base} Z" fill="${[p.land, p.sea, p.deep][row]}" fill-opacity="${1 - row * 0.15}"/>`
    }).join("")).join("")
    return `<rect width="${w}" height="${h}" fill="${p.sky}"/><circle cx="${w * 0.8}" cy="${h * 0.2}" r="${h * 0.08}" fill="${p.sun}"/>${rows}`
  },
  // Le quartier : des façades et leurs fenêtres.
  quartier: (p, w, h) => {
    const houses = Array.from({ length: 5 }, (_, index) => {
      const x = w * (0.04 + index * 0.19)
      const height = h * (0.35 + ((index * 37) % 5) * 0.06)
      const top = h * 0.88 - height
      const windows = [0, 1].map((column) => `<rect x="${x + w * (0.03 + column * 0.08)}" y="${top + h * 0.06}" width="${w * 0.05}" height="${h * 0.07}" fill="${p.paper}"/>`).join("")
      return `<rect x="${x}" y="${top}" width="${w * 0.17}" height="${height}" fill="${[p.warm, p.sea, p.sun, p.land, p.deep][index]}"/>${windows}`
    }).join("")
    return `<rect width="${w}" height="${h}" fill="${p.sky}"/><rect y="${h * 0.88}" width="${w}" height="${h * 0.12}" fill="${p.ink}" fill-opacity="0.5"/>${houses}`
  },
  // La nuit étoilée sur la plage : un croissant et des points de lumière.
  etoiles: (p, w, h) => {
    const stars = Array.from({ length: 24 }, (_, index) => `<circle cx="${w * (((index * 53) % 97) / 97)}" cy="${h * (((index * 29) % 61) / 100)}" r="${Math.min(w, h) * (0.004 + (index % 3) * 0.003)}" fill="${p.paper}"/>`).join("")
    return `<rect width="${w}" height="${h}" fill="${p.deep}"/>${stars}`
      + `<circle cx="${w * 0.75}" cy="${h * 0.25}" r="${h * 0.09}" fill="${p.sun}"/><circle cx="${w * 0.78}" cy="${h * 0.23}" r="${h * 0.08}" fill="${p.deep}"/>`
      + `<rect y="${h * 0.78}" width="${w}" height="${h * 0.22}" fill="${p.warm}" fill-opacity="0.6"/>`
  },
}

const cache = new Map<string, string>()

/** L'adresse `data:` de la scène, aux couleurs du thème affiché, aux dimensions déclarées du média. */
export function demoIllustrationUrl(illustration: DemoIllustration, width: number, height: number): string {
  const key = `${themeKey()}|${illustration}|${width}x${height}`
  const cached = cache.get(key)
  if (cached !== undefined) return cached
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">${PAINTERS[illustration](readPalette(), width, height)}</svg>`
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  cache.set(key, url)
  return url
}

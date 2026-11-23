/**
 * Environnement PUBLIC d'admin.diaspora.ga (variables `NEXT_PUBLIC_*`, inscrites à
 * la construction : références LITTÉRALES, déclarées au catalogue du moteur). Aucune
 * adresse n'est écrite dans le code : l'application des membres vient de
 * l'environnement ; absente ou illisible, le lien « Ouvrir diaspora.ga » ne
 * s'affiche pas (jamais de lien mort).
 */

/** Une origine `http(s)` lisible, sans identifiants ni chemin ; sinon `null`. */
export function readSiteOrigin(raw: string | undefined): string | null {
  const value = raw?.trim()
  if (!value) return null
  try {
    const url = new URL(value)
    if (url.protocol !== "https:" && url.protocol !== "http:") return null
    if (url.username || url.password) return null
    return url.origin
  } catch {
    return null
  }
}

export const publicEnv = {
  /** Déploiement Convex du moteur (inscrit par la configuration Next commune, ou l'ARG du Dockerfile). */
  convexUrl: process.env.NEXT_PUBLIC_CONVEX_URL?.trim() || null,
  /** L'application des membres (diaspora.ga), ouverte depuis l'en-tête. */
  membersSiteUrl: readSiteOrigin(process.env.NEXT_PUBLIC_MEMBERS_SITE_URL),
} as const

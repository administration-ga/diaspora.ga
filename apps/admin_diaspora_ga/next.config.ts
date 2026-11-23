import { createEngineNextConfig } from "@antsia/api/next-config"

/**
 * Configuration Next.js 16 d'admin.diaspora.ga — celle du moteur ANTSIA
 * (`@antsia/api/next-config`) : racine ECOSYSTEMES, sortie standalone, paquets du
 * moteur en sources, en-têtes de sécurité et CSP dérivée du déploiement Convex
 * (lu dans `ANTSIA/.env.local` en développement, dans les ARG du Dockerfile en
 * production). Seuls les paquets de DIASPORA.GA lus par la coque sont ajoutés ici.
 * Aucune source de démonstration : l'application est branchée sur le moteur seul (D1).
 */
export default createEngineNextConfig({
  appDir: process.cwd(),
  transpilePackages: ["@diaspora-ga/domain", "@diaspora-ga/features"],
})

import { createHealthProbe, type EngineState, type HealthEnv } from "@antsia/api/health"

/** Le nom de l'application dans le rapport : celui du service au catalogue de publication du moteur. */
export const HEALTH_APPLICATION = "admin-diaspora-ga"

/**
 * Sonde d'admin.diaspora.ga (EX-03), une par instance : la route
 * `/api/sante-fonctionnelle` et la page `/sante-fonctionnelle` partagent le même
 * résultat récent. Elle joint le moteur, bornée à 2 s.
 */
export const probeAdminHealth = createHealthProbe(HEALTH_APPLICATION)

/** Configuration lue à chaque requête : références LITTÉRALES, que Next inscrit au build (jamais `process.env` entier). */
export function adminHealthEnv(): HealthEnv {
  return {
    NEXT_PUBLIC_CONVEX_URL: process.env.NEXT_PUBLIC_CONVEX_URL,
    NEXT_PUBLIC_BUILD_SHA: process.env.NEXT_PUBLIC_BUILD_SHA,
  }
}

/** La phrase de chaque état du moteur, en toutes lettres (cliquet des clés). */
export const ENGINE_STATE_KEYS: Readonly<Record<EngineState, string>> = {
  reachable: "health.engine.reachable",
  slow: "health.engine.slow",
  error: "health.engine.error",
  timeout: "health.engine.timeout",
  unreachable: "health.engine.unreachable",
  missing: "health.engine.missing",
}

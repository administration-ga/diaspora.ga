/**
 * Familles de clés DYNAMIQUES des comptes de démonstration (développement local),
 * énumérées depuis le catalogue du domaine : un titre et une description par acteur,
 * un intitulé par groupe du panneau. Le statut attendu passe par `membership.status.*`.
 */
import { DIASPORA_GA_DEMO_ACTORS, DIASPORA_GA_DEMO_GROUPS } from "@diaspora-ga/domain"

export const FAMILIES: readonly string[] = [
  ...DIASPORA_GA_DEMO_GROUPS.map((group) => `demoAccounts.groups.${group}`),
  ...DIASPORA_GA_DEMO_ACTORS.flatMap((actor) => [`demoAccounts.actors.${actor}.title`, `demoAccounts.actors.${actor}.description`]),
]

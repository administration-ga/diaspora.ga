/**
 * Familles de clés DYNAMIQUES du chantier « gestion des pages (DG-008) » (ex. `services.category.${slug}`),
 * énumérées depuis les constantes qui les pilotent. PROPRIÉTAIRE : ce chantier.
 * Une clé citée en toutes lettres n'a rien à faire ici.
 */
import { PAGE_OWNER_KINDS, PAGE_TRUST_LEVELS } from "@diasporale/domain"
import { PAGE_CLAIM_MANDATES, PAGE_CLAIM_STATES, PAGE_TEAM_ROLES, REGISTRABLE_PAGE_KINDS } from "@diasporale/features/data"

export const FAMILIES: readonly string[] = [
  ...PAGE_OWNER_KINDS.map((kind) => `pageAdmin.kind.${kind}`),
  // AS-05 : seules les natures que DIASPORALE inscrit disent leur aide.
  ...REGISTRABLE_PAGE_KINDS.map((kind) => `pageAdmin.create.kindHint.${kind}`),
  // AS-10 : les trois rôles de l'équipe (administrateur, éditeur, modérateur), libellé et rôle en une phrase.
  ...PAGE_TEAM_ROLES.map((role) => `pageAdmin.role.${role}`),
  ...PAGE_TEAM_ROLES.map((role) => `pageAdmin.roleHint.${role}`),
  ...PAGE_CLAIM_STATES.map((status) => `pageAdmin.claimStatus.${status}`),
  ...PAGE_CLAIM_MANDATES.map((mandate) => `pageAdmin.claim.mandate.${mandate}`),
  ...PAGE_TRUST_LEVELS.map((badge) => `pageAdmin.verification.state.${badge}`),
]

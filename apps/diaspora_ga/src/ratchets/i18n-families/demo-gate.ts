/**
 * Familles de clés DYNAMIQUES de la porte des comptes de démonstration (CH-817, lot A1),
 * énumérées depuis le port : la phrase d'appui de la feuille, une par étape (numéro, code,
 * acteurs, indisponible). Les refus passent par `errors.*` (codes fermés du port).
 */
import { DEMO_GATE_SHEET_STEPS } from "@diaspora-ga/features/data"

export const FAMILIES: readonly string[] = DEMO_GATE_SHEET_STEPS.map((step) => `demoGate.step.${step}.lead`)

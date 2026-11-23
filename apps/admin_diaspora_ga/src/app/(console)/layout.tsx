import type { ReactNode } from "react"

import { AdminGate } from "@/components/admin-gate"

/**
 * Gabarit gardé de l'administration : la garde (preuve d'administration du réseau,
 * puis accès journalisé) monte la coque UNE fois, puis la section demandée. Les pages
 * de ce groupe sont de simples points de montage de sections clientes : aucune lecture
 * côté serveur, donc rien n'est lu avant les deux réponses de la garde.
 */
export default function ConsoleLayout({ children }: { children: ReactNode }) {
  return <AdminGate>{children}</AdminGate>
}

"use client"

import { useTranslation } from "react-i18next"

import { APP_NAMESPACE } from "@/i18n/resources"

import { useNetworkAdmin } from "./network-admin-context"

/**
 * Tableau de bord du squelette (lot A4) : l'accueil de l'administrateur et le réseau
 * qu'il administre, rien d'autre. Aucun compteur tant que la section qui le lit au
 * moteur n'existe pas (lot A7) : rien n'est inventé.
 */
export function DashboardSection() {
  const { t } = useTranslation(APP_NAMESPACE)
  const admin = useNetworkAdmin()
  return (
    <section className="flex max-w-3xl flex-col gap-3">
      <h1 className="font-display text-3xl font-bold">
        {admin.displayName ? t("dashboard.greeting", { name: admin.displayName }) : t("dashboard.greetingWithoutName")}
      </h1>
      <p className="text-muted-foreground">{t("dashboard.lead", { network: admin.networkName })}</p>
    </section>
  )
}

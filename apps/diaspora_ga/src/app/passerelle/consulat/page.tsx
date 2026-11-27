import { ConsulateEntry } from "@/components/consulate-entry"
import { ConsulatePassage } from "@/components/consulate-passage"

export const metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" as const }

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams
  if (params.secours === "idn") return <ConsulatePassage legacy />
  // Une reprise de vérification ou un refus reste dans le protocole qui l’a initié.
  if (params.apres === "idn" || params.echec !== undefined) return <ConsulatePassage />
  return <ConsulateEntry />
}

import { ConsulateConsent } from "@/components/consulate-consent"

export const metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" as const }
export default async function Page(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <ConsulateConsent idnOnly={(await props.searchParams).origine === "idn"} />
}

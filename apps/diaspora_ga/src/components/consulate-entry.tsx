import { headers } from "next/headers"
import { Suspense } from "react"
import { supportsConsulatePass } from "@/lib/consulate-pass-capability"
import { publicEnv } from "@/lib/env"
import { ConsulatePassage } from "./consulate-passage"
import { ConsulateTransition } from "./consulate-transition"

async function AvailablePassage() {
  const host = (await headers()).get("host")
  const enabled = publicEnv.dataSource === "engine" && publicEnv.convexUrl && publicEnv.consulateUrl && host
    && await supportsConsulatePass(publicEnv.convexUrl, host)
  return <ConsulatePassage legacy={!enabled} />
}

export function ConsulateEntry() {
  return <Suspense fallback={<ConsulateTransition />}><AvailablePassage /></Suspense>
}

import { api } from "@convex/_generated/api"
import { ConvexHttpClient } from "convex/browser"

/** Un moteur d’avant la V2 ne publie aucune origine. Un temps de réponse excessif laisse la porte IDN disponible. */
export async function supportsConsulatePass(convexUrl: string, host: string): Promise<boolean> {
  try {
    const client = new ConvexHttpClient(convexUrl, {
      fetch: (input, init) => fetch(input, { ...init, cache: "no-store", signal: AbortSignal.timeout(2500) }),
    })
    const config = await client.query(api.modules.platform.authentication.configuration, {})
    return config.consulatePassOrigin === `https://${host.toLowerCase()}`
  } catch {
    return false
  }
}

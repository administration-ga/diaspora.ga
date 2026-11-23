import type { NextRequest } from "next/server"

import { relayAuthRequest, relayOptionsFromEnvironment } from "@/lib/auth-relay"

/**
 * Proxy de même origine vers les seules actions d'authentification du moteur, sans
 * aucun cookie du navigateur dans un sens ni dans l'autre (`src/lib/auth-relay.ts`).
 */
function relay(req: NextRequest) {
  return relayAuthRequest(req, relayOptionsFromEnvironment())
}

export async function GET(req: NextRequest) {
  return relay(req)
}
export async function POST(req: NextRequest) {
  return relay(req)
}
export async function PUT(req: NextRequest) {
  return relay(req)
}
export async function PATCH(req: NextRequest) {
  return relay(req)
}
export async function DELETE(req: NextRequest) {
  return relay(req)
}

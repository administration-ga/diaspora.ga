"use client"

import { createEngineAuthClient } from "@antsia/api/auth-client"

/** Client Better Auth d'admin.diaspora.ga (proxy `/api/auth/*` de cette origine, vers le moteur). */
export const authClient = createEngineAuthClient()

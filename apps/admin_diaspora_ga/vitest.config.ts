import { fileURLToPath } from "node:url"

import { defineConfig } from "vitest/config"

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // Le backend du moteur ANTSIA (même alias que tsconfig) : seul `_generated/api` s'importe à l'exécution.
      "@convex": fileURLToPath(new URL("../../../ANTSIA/convex", import.meta.url)),
    },
  },
  test: {
    name: "admin-diaspora-ga",
    environment: "node",
    globals: true,
    maxWorkers: 2,
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    setupFiles: ["./vitest.setup.ts"],
    // Même borne que diaspora.ga : sur une machine chargée, le premier test d'un fichier jsdom paie le chargement des modules.
    testTimeout: 15_000,
  },
})

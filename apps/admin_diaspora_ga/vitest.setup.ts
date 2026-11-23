// Dupliqué de apps/diaspora_ga/vitest.setup.ts @ 237b585 — adaptations : stockage en mémoire seul (aucun groupe de boutons radio Radix dans la coque, donc pas d'observateur de taille).
import "@testing-library/jest-dom/vitest"

/**
 * Node 25 expose un `localStorage` expérimental sans méthodes, qui masque celui de jsdom :
 * on pose alors un stockage en mémoire conforme (rien ne change sous Node 22).
 */
function memoryStorage(): Storage {
  const entries = new Map<string, string>()
  return {
    get length() {
      return entries.size
    },
    clear: () => entries.clear(),
    getItem: (key) => entries.get(key) ?? null,
    key: (index) => [...entries.keys()][index] ?? null,
    removeItem: (key) => {
      entries.delete(key)
    },
    setItem: (key, value) => {
      entries.set(key, String(value))
    },
  }
}
for (const target of new Set<object>([globalThis, ...(typeof window === "undefined" ? [] : [window])])) {
  const current = (target as { localStorage?: Partial<Storage> }).localStorage
  if (current !== undefined && typeof current.clear !== "function") {
    Object.defineProperty(target, "localStorage", { configurable: true, value: memoryStorage() })
  }
}

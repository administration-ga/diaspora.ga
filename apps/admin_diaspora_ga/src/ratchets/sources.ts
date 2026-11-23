// Dupliqué de apps/diaspora_ga/src/ratchets/sources.ts @ 237b585 — adaptations : sources d'admin.diaspora.ga seules (le paquet de surfaces est relu par les cliquets de diaspora.ga) ; locale de l'espace `admin` lue dans l'application, en un fichier par langue.
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import { fileURLToPath } from "node:url"

/**
 * Les sources que relisent les cliquets d'admin.diaspora.ga : l'application, sans ses
 * tests ni ses cliquets.
 */
export const REPO_ROOT = fileURLToPath(new URL("../../../../", import.meta.url))

export const APP_ROOT = "apps/admin_diaspora_ga/src"

export interface SourceFile {
  /** Chemin relatif au dépôt, pour des messages d'échec lisibles. */
  readonly path: string
  readonly text: string
}

function walk(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const full = join(directory, name)
    return statSync(full).isDirectory() ? walk(full) : [full]
  })
}

export function productSources(extensions: readonly string[]): SourceFile[] {
  return walk(join(REPO_ROOT, APP_ROOT))
    .filter((file) => extensions.some((extension) => file.endsWith(extension)))
    .filter((file) => !/\.test\.tsx?$|\/ratchets\//.test(file))
    .map((file) => ({ path: relative(REPO_ROOT, file), text: readFileSync(file, "utf8") }))
}

export type LocaleTree = { readonly [key: string]: string | LocaleTree }

/** La locale de l'espace `admin`, telle qu'elle est sur le disque. */
export function readLocale(locale: "fr" | "en"): LocaleTree {
  return JSON.parse(readFileSync(join(REPO_ROOT, APP_ROOT, "i18n/locales", locale, "admin.json"), "utf8")) as LocaleTree
}

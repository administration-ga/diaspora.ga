import { extname } from "node:path"

import ts from "typescript"
import { describe, expect, it } from "vitest"

import { productSources } from "./sources"

/**
 * Cliquet « aucun paramètre de continuation » d'admin.diaspora.ga (CH-815 A1b, revue A1,
 * F2) : le retour d'IDN arrive sur `/entrer` nu, où le moteur ajoute le jeton à usage
 * unique de la session. Aucune adresse construite par l'application ne porte de
 * `retour=`, `next=`, `redirect=`… : la section demandée vit dans l'onglet
 * (`src/lib/requested-section.ts`). Le compilateur TypeScript lit la source : une
 * chaîne, un gabarit, un nom de paramètre ou un objet passé à `URLSearchParams`.
 */
const NAMES = ["retour", "next", "redirect", "redirect_to", "redirectTo", "redirect_uri", "redirectUri", "return_to", "returnTo", "returnUrl", "return_url", "continue", "goto", "callbackURL", "callbackUrl", "callback_url"]
const NAME_SET = new Set(NAMES.map((name) => name.toLowerCase()))
const IN_QUERY = new RegExp(`[?&](?:${NAMES.join("|")})=`, "i")

function parse(file: string, text: string): ts.SourceFile {
  return ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, extname(file) === ".tsx" ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
}

function walk(node: ts.Node, visit: (node: ts.Node) => void): void {
  visit(node)
  ts.forEachChild(node, (child) => walk(child, visit))
}

function isModuleSpecifier(node: ts.Node): boolean {
  const parent = node.parent
  return (
    ts.isImportDeclaration(parent) ||
    ts.isExportDeclaration(parent) ||
    ts.isExternalModuleReference(parent) ||
    ts.isLiteralTypeNode(parent) ||
    (ts.isCallExpression(parent) && parent.expression.kind === ts.SyntaxKind.ImportKeyword) ||
    // `vi.mock("next/navigation")`, `import("next")` : un nom de module, pas un paramètre.
    (ts.isCallExpression(parent) && ts.isPropertyAccessExpression(parent.expression) && parent.expression.name.text === "mock")
  )
}

/** Les continuations construites dans une source, en `fichier:ligne — message`. */
function detectContinuationParams(file: string, text: string): string[] {
  const findings: string[] = []
  const source = parse(file, text)
  const report = (node: ts.Node, message: string) =>
    findings.push(`${file}:${source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1} — ${message}`)
  walk(source, (node) => {
    // Une adresse écrite avec un paramètre de continuation (chaîne ou morceau de gabarit), ou le
    // nom seul (constante, `searchParams.set("next", …)`).
    if (ts.isStringLiteralLike(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
      if (ts.isStringLiteralLike(node) && isModuleSpecifier(node)) return
      if (IN_QUERY.test(node.text)) report(node, `adresse avec un paramètre de continuation « ${node.text} »`)
      else if (ts.isStringLiteralLike(node) && NAME_SET.has(node.text.toLowerCase())) report(node, `nom de paramètre de continuation « ${node.text} »`)
      return
    }
    // `new URLSearchParams({ retour: … })`
    if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "URLSearchParams") {
      const [init] = node.arguments ?? []
      if (init && ts.isObjectLiteralExpression(init)) {
        for (const property of init.properties) {
          if (!ts.isPropertyAssignment(property) && !ts.isShorthandPropertyAssignment(property)) continue
          const name = ts.isIdentifier(property.name) || ts.isStringLiteral(property.name) ? property.name.text : null
          if (name !== null && NAME_SET.has(name.toLowerCase())) report(property, `paramètre de continuation « ${name} » passé à URLSearchParams`)
        }
      }
    }
  })
  return findings
}

describe("cliquet — aucune continuation dans une adresse d'admin.diaspora.ga", () => {
  const files = productSources([".ts", ".tsx"])

  it("relit bien l'application, entrée et garde comprises", () => {
    expect(files.some((file) => file.path.endsWith("components/sign-in-screen.tsx"))).toBe(true)
    expect(files.some((file) => file.path.endsWith("components/admin-gate.tsx"))).toBe(true)
    expect(files.some((file) => file.path.endsWith("lib/routes.ts"))).toBe(true)
    expect(files.length).toBeGreaterThan(15)
  })

  it("le cliquet sait reconnaître une adresse, un gabarit, un nom de paramètre et URLSearchParams", () => {
    const source = [
      'const a = "/entrer?retour=%2Fjournal"',
      "const b = `${SIGN_IN}?next=${target}`",
      'export const RETURN_PARAM = "retour"',
      "const c = new URLSearchParams({ redirect: target })",
      'url.searchParams.set("returnTo", target)',
      "const d = `/entrer?a=1&callbackURL=${x}`",
      'import { useRouter } from "next/navigation"',
      'import type { Metadata } from "next"',
      'const e = "?deconnexion=incomplete"',
      "const f = new URLSearchParams({ deconnexion: value })",
      'const g = new URLSearchParams(search).get("error")',
      "authClient.signIn.oauth2({ callbackURL: href })",
    ].join("\n")
    const lines = detectContinuationParams("apps/admin_diaspora_ga/src/a.tsx", source).map((finding) => Number(finding.split(":")[1]?.split(" ")[0]))
    expect(lines).toEqual([1, 2, 3, 4, 5, 6])
  })

  it("aucune adresse construite par l'application ne porte de continuation", () => {
    expect(files.flatMap((file) => detectContinuationParams(file.path, file.text))).toEqual([])
  })
})

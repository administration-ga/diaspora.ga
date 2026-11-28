export function GET() {
  const components = [
    { "/": "/mobile/ouvrir" },
    { "/": "/mobile/retour" },
    { "/": "/fil" },
    { "/": "/@*" },
    { "/": "/pages/*/*", exclude: true },
    { "/": "/pages/*" },
    { "/": "/publication/*" },
    { "/": "/messages", "?": { "invitation-groupe": "?*" } },
  ]
  return Response.json({ applinks: { details: [{ appIDs: ["5Y39TTNCM7.ga.diaspora.mobile"], components }] } })
}

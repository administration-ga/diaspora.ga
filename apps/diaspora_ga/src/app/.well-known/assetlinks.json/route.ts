export const dynamic = "force-dynamic"
export function GET() {
  const fingerprints = (process.env.DIASPORA_ANDROID_CERT_SHA256 ?? "").split(",").map(value => value.trim().toUpperCase())
    .filter(value => /^(?:[A-F0-9]{2}:){31}[A-F0-9]{2}$/.test(value))
  return Response.json(fingerprints.length ? [{
    relation: ["delegate_permission/common.handle_all_urls"],
    target: { namespace: "android_app", package_name: "ga.diaspora.mobile", sha256_cert_fingerprints: fingerprints },
  }] : [])
}

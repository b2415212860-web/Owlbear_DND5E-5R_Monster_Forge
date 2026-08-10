import auditData from "../../../../data/srd51-monsters.audit.json";

export async function GET() {
  return Response.json(auditData, {
    headers: { "Cache-Control": "public, max-age=3600, s-maxage=86400" },
  });
}

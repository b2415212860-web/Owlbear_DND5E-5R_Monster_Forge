import { hasValidAdminKey, unauthorizedResponse } from "../../../admin-auth";

export async function POST(request: Request) {
  if (!hasValidAdminKey(request)) return unauthorizedResponse();
  return Response.json(
    { ok: true },
    { headers: { "Cache-Control": "no-store" } }
  );
}

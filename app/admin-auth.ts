import { env } from "cloudflare:workers";

function constantTimeEqual(left: string, right: string) {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  if (leftBytes.length !== rightBytes.length) return false;
  let difference = 0;
  for (let index = 0; index < leftBytes.length; index += 1) {
    difference |= leftBytes[index] ^ rightBytes[index];
  }
  return difference === 0;
}

export function hasValidAdminKey(request: Request) {
  const configured = (env as unknown as { UPLOAD_ADMIN_KEY?: string }).UPLOAD_ADMIN_KEY;
  const authorization = request.headers.get("authorization") ?? "";
  const supplied = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";
  return Boolean(configured && supplied && constantTimeEqual(configured, supplied));
}

export function unauthorizedResponse() {
  return Response.json(
    { error: "管理员口令无效，请重新输入" },
    { status: 401, headers: { "Cache-Control": "no-store" } }
  );
}

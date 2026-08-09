const API_ROOT = "https://www.dnd5eapi.co";

function isSafeIndex(index: string) {
  return /^[a-z0-9-]+$/.test(index);
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ index: string }> }
) {
  const { index } = await context.params;
  if (!isSafeIndex(index)) {
    return Response.json({ error: "Invalid monster index" }, { status: 400 });
  }

  const response = await fetch(`${API_ROOT}/api/2014/monsters/${index}`, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    return Response.json({ error: "Monster not found" }, { status: response.status });
  }
  return new Response(response.body, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
    },
  });
}

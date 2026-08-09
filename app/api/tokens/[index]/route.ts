import {
  deleteTokenRecord,
  findTokenRecord,
  getTokenBucket,
  saveTokenRecord,
} from "../../../../db/token-storage";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Cross-Origin-Resource-Policy": "cross-origin",
};

function safeIndex(index: string) {
  return /^[a-z0-9-]+$/.test(index);
}

function fallbackToken() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><circle cx="256" cy="256" r="246" fill="#050505"/><circle cx="256" cy="256" r="246" fill="none" stroke="#d97836" stroke-width="12"/></svg>`;
  return new Response(svg, {
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=300",
    },
  });
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ index: string }> }
) {
  const { index } = await context.params;
  if (!safeIndex(index)) return new Response("Invalid index", { status: 400 });
  try {
    const record = await findTokenRecord(index);
    if (!record) return fallbackToken();
    const object = await getTokenBucket().get(record.objectKey);
    if (!object) return fallbackToken();
    return new Response(object.body, {
      headers: {
        ...CORS_HEADERS,
        "Content-Type": record.contentType,
        "Cache-Control": "public, max-age=300",
        ETag: object.httpEtag,
      },
    });
  } catch {
    return fallbackToken();
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ index: string }> }
) {
  const { index } = await context.params;
  if (!safeIndex(index)) {
    return Response.json({ error: "Invalid monster index" }, { status: 400 });
  }
  const bytes = await request.arrayBuffer();
  if (!bytes.byteLength || bytes.byteLength > 5 * 1024 * 1024) {
    return Response.json({ error: "Token image must be between 1 byte and 5 MB" }, { status: 400 });
  }
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType !== "image/png") {
    return Response.json({ error: "Token image must be a processed PNG" }, { status: 415 });
  }
  const objectKey = `monster-tokens/${index}.png`;
  const originalName = decodeURIComponent(
    request.headers.get("x-original-filename") ?? `${index}.png`
  ).slice(0, 160);

  try {
    await getTokenBucket().put(objectKey, bytes, {
      httpMetadata: { contentType: "image/png", cacheControl: "public, max-age=300" },
      customMetadata: { monsterIndex: index, originalName },
    });
    await saveTokenRecord({
      monsterIndex: index,
      objectKey,
      originalName,
      contentType: "image/png",
    });
    return Response.json({ ok: true, index, url: `/api/tokens/${index}` });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Unable to save token" },
      { status: 503 }
    );
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ index: string }> }
) {
  const { index } = await context.params;
  if (!safeIndex(index)) {
    return Response.json({ error: "Invalid monster index" }, { status: 400 });
  }
  try {
    const deleted = await deleteTokenRecord(index);
    return Response.json({ ok: true, deleted });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Unable to reset token" },
      { status: 503 }
    );
  }
}

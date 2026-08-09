import { listTokenRecords } from "../../../db/token-storage";

export async function GET() {
  try {
    const tokens = await listTokenRecords();
    return Response.json({ tokens }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Token storage unavailable", tokens: [] },
      { status: 503 }
    );
  }
}

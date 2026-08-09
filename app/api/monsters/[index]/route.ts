import srd51Data from "../../../../data/srd51-monsters.zh-CN.json";
import srd52Data from "../../../../data/srd52-monsters.zh-CN.json";
import type { MonsterDetail, RulesEdition } from "../../../types";

const catalogs: Record<RulesEdition, Map<string, MonsterDetail>> = {
  "5e": new Map((srd51Data as unknown as MonsterDetail[]).map((monster) => [monster.index, monster])),
  "5r": new Map((srd52Data as unknown as MonsterDetail[]).map((monster) => [monster.index, monster])),
};

function isSafeIndex(index: string) {
  return /^[a-z0-9-]+$/.test(index);
}

export async function GET(
  request: Request,
  context: { params: Promise<{ index: string }> }
) {
  const { index } = await context.params;
  if (!isSafeIndex(index)) {
    return Response.json({ error: "Invalid monster index" }, { status: 400 });
  }

  const requestedEdition = new URL(request.url).searchParams.get("edition");
  const ruleset: RulesEdition = requestedEdition === "5e" ? "5e" : "5r";
  const monster = catalogs[ruleset].get(index);
  if (!monster) return Response.json({ error: "Monster not found" }, { status: 404 });
  return Response.json({ ...monster, ruleset }, { headers: { "Cache-Control": "public, max-age=3600, s-maxage=86400" } });
}

import srd51Data from "../../../data/srd51-monsters.zh-CN.json";
import srd52Data from "../../../data/srd52-monsters.zh-CN.json";
import type { MonsterDetail, MonsterListEntry, RulesEdition } from "../../types";

const catalogs: Record<RulesEdition, { edition: string; source: string; monsters: MonsterDetail[] }> = {
  "5e": { edition: "2014 / 5E", source: "DND5e不全书", monsters: srd51Data as unknown as MonsterDetail[] },
  "5r": { edition: "2024 / 5R", source: "SRD 5.2", monsters: srd52Data as unknown as MonsterDetail[] },
};

export async function GET(request: Request) {
  const requestedEdition = new URL(request.url).searchParams.get("edition");
  const ruleset: RulesEdition = requestedEdition === "5e" ? "5e" : "5r";
  const catalog = catalogs[ruleset];
  const results: MonsterListEntry[] = catalog.monsters.map(({ index, name, name_en, url, catalog_category }) => ({ index, name, name_en, url, catalog_category, ruleset }));
  return Response.json(
    { count: results.length, ruleset, edition: catalog.edition, source: catalog.source, locale: "zh-CN", results },
    { headers: { "Cache-Control": "public, max-age=3600, s-maxage=86400" } },
  );
}

import type { MonsterListEntry } from "../../types";

const API_ROOT = "https://www.dnd5eapi.co";
const FALLBACK: MonsterListEntry[] = [
  { index: "owlbear", name: "Owlbear", url: "/api/2014/monsters/owlbear" },
  { index: "adult-black-dragon", name: "Adult Black Dragon", url: "/api/2014/monsters/adult-black-dragon" },
  { index: "goblin", name: "Goblin", url: "/api/2014/monsters/goblin" },
  { index: "mimic", name: "Mimic", url: "/api/2014/monsters/mimic" },
  { index: "tarrasque", name: "Tarrasque", url: "/api/2014/monsters/tarrasque" },
];

export async function GET() {
  try {
    const response = await fetch(`${API_ROOT}/api/2014/monsters`, {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) throw new Error(`Monster catalog returned ${response.status}`);
    const payload = (await response.json()) as { count: number; results: MonsterListEntry[] };
    return Response.json(payload, {
      headers: { "Cache-Control": "public, max-age=3600, s-maxage=86400" },
    });
  } catch {
    return Response.json(
      { count: FALLBACK.length, results: FALLBACK, degraded: true },
      { headers: { "Cache-Control": "public, max-age=60" } }
    );
  }
}

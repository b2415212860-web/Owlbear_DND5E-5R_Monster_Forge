import monsters from "../../../../data/srd51-monsters.zh-CN.json";

export async function GET() {
  return Response.json(monsters, {
    headers: {
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
      "Content-Disposition": "attachment; filename=bestiary-forge-dnd5e-zh-CN.json",
    },
  });
}

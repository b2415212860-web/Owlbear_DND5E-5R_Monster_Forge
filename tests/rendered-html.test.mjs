import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render(pathname = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request(`http://localhost${pathname}`, { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the favorites bestiary", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /<title>Bestiary Forge · D&amp;D 5E \/ 5R 中文怪物图鉴<\/title>/i);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/i);
  assert.match(response.headers.get("content-security-policy") ?? "", /owlbear\.rodeo/);
  assert.equal(response.headers.get("x-frame-options"), null);
});

test("ships an action-only Owlbear Rodeo manifest without persistence bindings", async () => {
  const [manifestResponse, hosting] = await Promise.all([
    render("/manifest.json"),
    readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8").then(JSON.parse),
  ]);
  assert.equal(manifestResponse.status, 200);
  assert.equal(manifestResponse.headers.get("access-control-allow-origin"), "*");
  const manifest = await manifestResponse.json();
  assert.equal(manifest.manifest_version, 1);
  assert.equal(manifest.version, "5.0.0");
  assert.equal(manifest.action.popover, "/");
  assert.equal("background_url" in manifest, false);
  assert.equal(hosting.d1, null);
  assert.equal(hosting.r2, null);
});

test("ships switchable local Chinese 5E and 5R monster catalogs", async () => {
  const [catalog5rResponse, catalog5eResponse, owlbear5rResponse, owlbear5eResponse, sourcesResponse, auditResponse] = await Promise.all([
    render("/api/monsters?edition=5r"),
    render("/api/monsters?edition=5e"),
    render("/api/monsters/owlbear?edition=5r"),
    render("/api/monsters/owlbear?edition=5e"),
    render("/sources"),
    render("/api/audit/5e"),
  ]);
  const [catalog5r, catalog5e] = await Promise.all([catalog5rResponse.json(), catalog5eResponse.json()]);
  assert.equal(catalog5r.count, 328);
  assert.equal(catalog5r.edition, "2024 / 5R");
  assert.equal(catalog5e.count, 424);
  assert.equal(catalog5e.edition, "2014 / 5E");
  assert.equal(catalog5e.source, "DND5e不全书");
  assert.equal(catalog5e.results.find((item) => item.index === "owlbear")?.name, "枭熊");
  assert.equal(catalog5e.results.find((item) => item.index === "owlbear")?.catalog_category, "怪兽");
  assert.equal(catalog5r.results.find((item) => item.index === "owlbear")?.catalog_category, "怪兽");
  const [owlbear5r, owlbear5e] = await Promise.all([owlbear5rResponse.json(), owlbear5eResponse.json()]);
  assert.equal(owlbear5r.ruleset, "5r");
  assert.equal(owlbear5e.ruleset, "5e");
  assert.equal(owlbear5e.hit_points, 59);
  assert.equal(owlbear5e.challenge_rating, 3);
  assert.equal(owlbear5e.name_en, "Owlbear");
  assert.equal(owlbear5e.source_commit, "190ba73862e65b1b7c293289beb2ef915c1803ff");
  assert.match(owlbear5e.source_url, /github\.com\/DND5eChm\/DND5e_chm\/blob/);
  assert.equal(sourcesResponse.status, 200);
  assert.match(await sourcesResponse.text(), /CC BY 4\.0|Creative Commons Attribution 4\.0/i);
  const audit = await auditResponse.json();
  assert.equal(audit.records_generated, 424);
  assert.equal(audit.warnings.length, 0);
  assert.equal(audit.category_counts.怪兽, 53);
  assert.equal(audit.records.find((item) => item.index === "owlbear")?.name_en, "Owlbear");
});

test("implements device-local favorites and contains no token workflow", async () => {
  const [appSource, packageJson] = await Promise.all([
    readFile(new URL("../app/BestiaryApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8").then(JSON.parse),
  ]);
  assert.match(appSource, /FAVORITES_STORAGE/);
  assert.match(appSource, /localStorage/);
  assert.match(appSource, /browser-tab/);
  assert.match(appSource, /favorite-button/);
  assert.match(appSource, /category-filter/);
  assert.match(appSource, /category-group/);
  assert.doesNotMatch(appSource, /api\/tokens|buildImage|type="file"|TOKEN/);
  assert.equal(packageJson.dependencies?.["@owlbear-rodeo/sdk"], undefined);
});

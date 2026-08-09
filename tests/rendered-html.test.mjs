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
  assert.match(html, /<title>Bestiary Forge · Owlbear Rodeo 5e 怪物收藏图鉴<\/title>/i);
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
  assert.equal(manifest.version, "2.0.0");
  assert.equal(manifest.action.popover, "/");
  assert.equal("background_url" in manifest, false);
  assert.equal(hosting.d1, null);
  assert.equal(hosting.r2, null);
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
  assert.doesNotMatch(appSource, /api\/tokens|buildImage|type="file"|TOKEN/);
  assert.equal(packageJson.dependencies?.["@owlbear-rodeo/sdk"], undefined);
});

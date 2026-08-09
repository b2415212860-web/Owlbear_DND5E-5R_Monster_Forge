import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render(pathname = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request(`http://localhost${pathname}`, { headers: { accept: "text/html" } }),
    {
      ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
      DB: {},
      TOKENS: {},
    },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders Bestiary Forge", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /<title>Bestiary Forge · Owlbear Rodeo 5e 怪物图鉴<\/title>/i);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/i);
});

test("ships a valid Owlbear Rodeo manifest and persistence bindings", async () => {
  const [manifest, hosting] = await Promise.all([
    readFile(new URL("../public/manifest.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8").then(JSON.parse),
  ]);
  assert.equal(manifest.manifest_version, 1);
  assert.equal(manifest.action.popover, "/");
  assert.equal(manifest.background_url, "/background");
  assert.equal(hosting.d1, "DB");
  assert.equal(hosting.r2, "TOKENS");
});

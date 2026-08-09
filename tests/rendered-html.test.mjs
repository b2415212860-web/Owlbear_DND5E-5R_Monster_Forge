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
      UPLOAD_ADMIN_KEY: "test-admin-key",
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
  assert.match(response.headers.get("content-security-policy") ?? "", /owlbear\.rodeo/);
  assert.equal(response.headers.get("x-frame-options"), null);
});

test("ships a valid Owlbear Rodeo manifest and persistence bindings", async () => {
  const [manifestResponse, hosting] = await Promise.all([
    render("/manifest.json"),
    readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8").then(JSON.parse),
  ]);
  assert.equal(manifestResponse.status, 200);
  assert.equal(manifestResponse.headers.get("access-control-allow-origin"), "*");
  const manifest = await manifestResponse.json();
  assert.equal(manifest.manifest_version, 1);
  assert.equal(manifest.action.popover, "/");
  assert.equal(manifest.background_url, "/background");
  assert.equal(hosting.d1, "DB");
  assert.equal(hosting.r2, "TOKENS");
});

test("protects administrator write access", async () => {
  const [authSource, tokenRoute] = await Promise.all([
    readFile(new URL("../app/admin-auth.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/tokens/[index]/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(authSource, /UPLOAD_ADMIN_KEY/);
  assert.match(authSource, /constantTimeEqual/);
  assert.match(authSource, /status:\s*401/);
  assert.match(tokenRoute, /POST[\s\S]*hasValidAdminKey\(request\)/);
  assert.match(tokenRoute, /DELETE[\s\S]*hasValidAdminKey\(request\)/);
});

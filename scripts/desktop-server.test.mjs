import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { createServer, resolveConfig } from "vite";

const configFile = "apps/desktop/vite.config.ts";

test("native window and frontend use the same explicit IPv4 endpoint", async () => {
  const config = await resolveConfig({ configFile }, "serve");
  const native = JSON.parse(
    await readFile("apps/desktop/src-tauri/tauri.conf.json", "utf8"),
  );
  assert.equal(config.server.host, "127.0.0.1");
  assert.equal(config.server.port, 5173);
  assert.equal(
    native.build.devUrl,
    `http://${config.server.host}:${config.server.port}`,
  );
});

test("frontend serves its configured address and rejects an occupied port", async () => {
  const first = await createServer({
    configFile,
    logLevel: "silent",
    server: { port: 0, hmr: false, watch: null },
  });
  let second;
  try {
    await first.listen();
    const address = first.httpServer.address();
    const response = await globalThis.fetch(`http://127.0.0.1:${address.port}`);
    assert.equal(response.status, 200);
    assert.match(await response.text(), /src\/main.tsx/);
    second = await createServer({
      configFile,
      logLevel: "silent",
      server: { port: address.port, hmr: false, watch: null },
    });
    await assert.rejects(second.listen(), /already in use/);
  } finally {
    await second?.close();
    await first.close();
  }
});

import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

import { build } from "esbuild";

let providerConfiguration;
let temporaryDirectory;

test.before(async () => {
  temporaryDirectory = await mkdtemp(
    path.join(tmpdir(), "presenton-provider-configuration-"),
  );
  const entryFile = path.join(temporaryDirectory, "entry.ts");
  const outputFile = path.join(temporaryDirectory, "bundle.mjs");
  await writeFile(
    entryFile,
    `export * from ${JSON.stringify(path.resolve("utils/providerConfiguration.ts"))};`,
  );
  await build({
    entryPoints: [entryFile],
    outfile: outputFile,
    bundle: true,
    platform: "node",
    format: "esm",
    tsconfig: path.resolve("tsconfig.json"),
    logLevel: "silent",
  });
  providerConfiguration = await import(
    `${pathToFileURL(outputFile).href}?cache=${Date.now()}`
  );
});

test.after(async () => {
  if (temporaryDirectory) {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});

test("read-only access selects runtime configuration", () => {
  assert.equal(
    providerConfiguration.providerConfigurationSourceFor(false),
    "runtime",
  );
  assert.equal(
    providerConfiguration.providerConfigurationSourceFor(true),
    "editable",
  );
});

test("runtime mode reads only the redacted runtime configuration", async () => {
  const requests = [];
  const snapshot = await providerConfiguration.fetchProviderConfiguration(
    "runtime",
    async (input, init) => {
      requests.push({ input, init });
      return Response.json({
        configured: true,
        config: {
          LLM: "test-provider",
          LITELLM_API_KEY: "__configured__",
        },
      });
    },
  );

  assert.deepEqual(
    requests.map(({ input }) => input),
    ["/api/runtime-config"],
  );
  assert.equal(requests[0].init.cache, "no-store");
  assert.equal(snapshot.configured, true);
  assert.equal(snapshot.config.LLM, "test-provider");
});

test("editable mode reads the administrator configuration endpoint", async () => {
  const requests = [];
  const snapshot = await providerConfiguration.fetchProviderConfiguration(
    "editable",
    async (input) => {
      requests.push(input);
      return Response.json({ LLM: "test-provider" });
    },
  );

  assert.deepEqual(requests, ["/api/user-config"]);
  assert.equal(snapshot.configured, null);
  assert.equal(snapshot.config.LLM, "test-provider");
});

test("runtime mode preserves an operator configuration warning", async () => {
  const snapshot = await providerConfiguration.fetchProviderConfiguration(
    "runtime",
    async () => Response.json({ configured: false, config: {} }),
  );

  assert.equal(snapshot.configured, false);
  assert.deepEqual(snapshot.config, {});
});

test("configuration request errors retain their source and status", async () => {
  await assert.rejects(
    providerConfiguration.fetchProviderConfiguration(
      "runtime",
      async () => new Response(null, { status: 401 }),
    ),
    (error) => {
      assert.ok(
        error instanceof
          providerConfiguration.ProviderConfigurationRequestError,
      );
      assert.equal(error.source, "runtime");
      assert.equal(error.status, 401);
      return true;
    },
  );
});

test("runtime mode rejects malformed configuration responses", async () => {
  await assert.rejects(
    providerConfiguration.fetchProviderConfiguration(
      "runtime",
      async () => Response.json({ configured: true }),
    ),
    /invalid response/,
  );
});

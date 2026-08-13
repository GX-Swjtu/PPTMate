import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { build } from "esbuild";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

async function importFontSecurity(platformMode) {
  const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "font-security-"));
  const outfile = path.join(tempDirectory, "font-security.mjs");
  await build({
    absWorkingDir: projectRoot,
    bundle: true,
    define: {
      "process.env.NEXT_PUBLIC_PLATFORM_MODE": JSON.stringify(platformMode),
    },
    entryPoints: ["lib/font-security.ts"],
    format: "esm",
    outfile,
    platform: "node",
  });
  const module = await import(pathToFileURL(outfile).href);
  await rm(tempDirectory, { recursive: true, force: true });
  return module;
}

test("platform builds allow only same-origin and data font sources", async () => {
  const fontSecurity = await importFontSecurity("true");
  assert.equal(fontSecurity.REMOTE_FONT_ACCESS_ENABLED, false);
  assert.equal(fontSecurity.isAllowedFontSource("/app_data/fonts/a.ttf"), true);
  assert.equal(fontSecurity.isAllowedFontSource("data:font/woff2;base64,AA"), true);
  assert.equal(fontSecurity.isAllowedFontSource("//cdn.example/a.ttf"), false);
  assert.equal(
    fontSecurity.isAllowedFontSource("https://fonts.googleapis.com/a.css"),
    false,
  );
});

test("standalone upstream builds retain remote font behavior", async () => {
  const fontSecurity = await importFontSecurity("false");
  assert.equal(fontSecurity.REMOTE_FONT_ACCESS_ENABLED, true);
  assert.equal(fontSecurity.isAllowedFontSource("https://example.test/a.ttf"), true);
});

import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test, { after, before } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { build } from "esbuild";

const nextRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
let tempDirectory;
let runtimeConfig;

before(async () => {
  tempDirectory = await mkdtemp(
    path.join(os.tmpdir(), "pptmate-runtime-config-"),
  );
  const outfile = path.join(tempDirectory, "runtime-config.cjs");

  await build({
    absWorkingDir: nextRoot,
    bundle: true,
    entryPoints: ["app/api/runtime-config/route.ts"],
    format: "cjs",
    outfile,
    platform: "node",
    tsconfig: path.join(nextRoot, "tsconfig.json"),
  });

  runtimeConfig = await import(pathToFileURL(outfile).href);
});

after(async () => {
  if (tempDirectory) {
    await rm(tempDirectory, { recursive: true, force: true });
  }
});

test("platform LiteLLM environment is recognized as configured", () => {
  const previous = {
    LLM: process.env.LLM,
    LITELLM_API_KEY: process.env.LITELLM_API_KEY,
    LITELLM_BASE_URL: process.env.LITELLM_BASE_URL,
    LITELLM_MODEL: process.env.LITELLM_MODEL,
    DISABLE_IMAGE_GENERATION: process.env.DISABLE_IMAGE_GENERATION,
    IMAGE_PROVIDER: process.env.IMAGE_PROVIDER,
    OPENAI_COMPAT_IMAGE_BASE_URL: process.env.OPENAI_COMPAT_IMAGE_BASE_URL,
    OPENAI_COMPAT_IMAGE_MODEL: process.env.OPENAI_COMPAT_IMAGE_MODEL,
    OPENAI_COMPAT_IMAGE_API_KEY: process.env.OPENAI_COMPAT_IMAGE_API_KEY,
    WEB_GROUNDING: process.env.WEB_GROUNDING,
    WEB_SEARCH_PROVIDER: process.env.WEB_SEARCH_PROVIDER,
  };

  try {
    process.env.LLM = "litellm";
    process.env.LITELLM_API_KEY = "test-only-key";
    process.env.LITELLM_BASE_URL = "http://ai-gateway:4000/v1";
    process.env.LITELLM_MODEL = "pptmate-chat";
    process.env.DISABLE_IMAGE_GENERATION = "false";
    process.env.IMAGE_PROVIDER = "openai_compatible";
    process.env.OPENAI_COMPAT_IMAGE_BASE_URL = "http://ai-gateway:4000/v1";
    process.env.OPENAI_COMPAT_IMAGE_MODEL = "pptmate-image";
    process.env.OPENAI_COMPAT_IMAGE_API_KEY = "test-only-image-key";
    process.env.WEB_GROUNDING = "true";
    process.env.WEB_SEARCH_PROVIDER = "auto";

    const status = runtimeConfig.runtimeConfigStatusFromEnvironment();

    assert.equal(status.configured, true);
    assert.equal(status.config.LLM, "litellm");
    assert.equal(status.config.LITELLM_BASE_URL, "http://ai-gateway:4000/v1");
    assert.equal(status.config.LITELLM_MODEL, "pptmate-chat");
    assert.equal(status.config.LITELLM_API_KEY, "__configured__");
    assert.notEqual(status.config.LITELLM_API_KEY, process.env.LITELLM_API_KEY);
    assert.equal(status.config.DISABLE_IMAGE_GENERATION, false);
    assert.equal(status.config.IMAGE_PROVIDER, "openai_compatible");
    assert.equal(
      status.config.OPENAI_COMPAT_IMAGE_BASE_URL,
      "http://ai-gateway:4000/v1",
    );
    assert.equal(status.config.OPENAI_COMPAT_IMAGE_MODEL, "pptmate-image");
    assert.equal(status.config.OPENAI_COMPAT_IMAGE_API_KEY, "__configured__");
    assert.notEqual(
      status.config.OPENAI_COMPAT_IMAGE_API_KEY,
      process.env.OPENAI_COMPAT_IMAGE_API_KEY,
    );
    assert.equal(status.config.WEB_GROUNDING, true);
    assert.equal(status.config.WEB_SEARCH_PROVIDER, "auto");
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
});

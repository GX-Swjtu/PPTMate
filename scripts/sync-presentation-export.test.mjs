import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const {
  downloadFile,
  getRuntimePlatformArch,
  validateSharpRuntime,
} = require("./sync-presentation-export.cjs");

const proxyEnvironmentNames = [
  "HTTPS_PROXY",
  "https_proxy",
  "HTTP_PROXY",
  "http_proxy",
];

function restoreEnvironment(snapshot) {
  for (const name of proxyEnvironmentNames) {
    if (snapshot[name] === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = snapshot[name];
    }
  }
}

function writePackage(root, packageName, packageJson) {
  const packageDirectory = path.join(
    root,
    "node_modules",
    ...packageName.split("/"),
  );
  fs.mkdirSync(packageDirectory, { recursive: true });
  fs.writeFileSync(
    path.join(packageDirectory, "package.json"),
    `${JSON.stringify(packageJson)}\n`,
  );
}

function makeSharpRuntime() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "presenton-sharp-runtime-"));
  writePackage(root, "sharp", {
    version: "0.35.3",
    optionalDependencies: {
      "@img/sharp-darwin-arm64": "0.35.3",
      "@img/sharp-libvips-darwin-arm64": "1.3.2",
    },
  });
  return root;
}

test("getRuntimePlatformArch distinguishes glibc and musl Linux", () => {
  const glibcReport = {
    getReport: () => ({ header: { glibcVersionRuntime: "2.39" } }),
  };
  const muslReport = { getReport: () => ({ header: {} }) };

  assert.equal(getRuntimePlatformArch("linux", "x64", glibcReport), "linux-x64");
  assert.equal(
    getRuntimePlatformArch("linux", "arm64", muslReport),
    "linuxmusl-arm64",
  );
  assert.equal(getRuntimePlatformArch("darwin", "arm64"), "darwin-arm64");
});

test("downloadFile prepares the output directory for proxy downloads", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "presenton-export-download-"));
  const outputPath = path.join(root, "nested", "export-core.tgz");
  const environmentSnapshot = Object.fromEntries(
    proxyEnvironmentNames.map((name) => [name, process.env[name]]),
  );
  const calls = [];

  try {
    for (const name of proxyEnvironmentNames) delete process.env[name];
    process.env.HTTPS_PROXY = "http://proxy.invalid";

    await downloadFile(
      "https://example.invalid/export-core.tgz",
      outputPath,
      5,
      (command, args, options) => {
        calls.push({ command, args, options });
        assert.equal(fs.existsSync(path.dirname(outputPath)), true);
      },
    );

    assert.equal(calls.length, 1);
    assert.equal(calls[0].command, "curl");
    assert.equal(calls[0].args.at(-2), outputPath);
    assert.equal(calls[0].args.at(-1), "https://example.invalid/export-core.tgz");
    assert.deepEqual(calls[0].options, { stdio: "inherit" });
  } finally {
    restoreEnvironment(environmentSnapshot);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("validateSharpRuntime rejects a runtime missing the target native package", () => {
  const root = makeSharpRuntime();
  try {
    assert.deepEqual(validateSharpRuntime(root, "darwin-arm64"), {
      ok: false,
      reason: "Missing @img/sharp-darwin-arm64 0.35.3 for darwin-arm64.",
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("validateSharpRuntime rejects native packages from another Sharp release", () => {
  const root = makeSharpRuntime();
  try {
    writePackage(root, "@img/sharp-darwin-arm64", { version: "0.34.5" });
    assert.deepEqual(validateSharpRuntime(root, "darwin-arm64"), {
      ok: false,
      reason: "Expected @img/sharp-darwin-arm64 0.35.3, found 0.34.5.",
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("validateSharpRuntime accepts matching native and libvips packages", () => {
  const root = makeSharpRuntime();
  try {
    writePackage(root, "@img/sharp-darwin-arm64", { version: "0.35.3" });
    writePackage(root, "@img/sharp-libvips-darwin-arm64", { version: "1.3.2" });
    assert.deepEqual(validateSharpRuntime(root, "darwin-arm64"), {
      ok: true,
      sharpVersion: "0.35.3",
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

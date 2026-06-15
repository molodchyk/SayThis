import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  collectPackageFiles,
  createZip,
  packageNameFromManifest
} from "../scripts/package-extension.mjs";

const manifest = JSON.parse(await readFile(new URL("../manifest.json", import.meta.url), "utf8"));

test("collects only extension runtime package files", async () => {
  const files = await collectPackageFiles(fileURLToPath(new URL("..", import.meta.url)));

  assert.ok(files.includes("manifest.json"));
  assert.ok(files.includes("src/background.js"));
  assert.ok(files.includes("src/custom-source-adapter.js"));
  assert.ok(files.includes("src/message-contracts.js"));
  assert.ok(files.includes("src/pronunciation-source-plan.js"));
  assert.ok(files.includes("src/forvo-adapter.js"));
  assert.ok(files.includes("src/nominatim-adapter.js"));
  assert.ok(files.includes("src/popup.html"));
  assert.ok(files.includes("src/offscreen-audio.html"));
  assert.ok(files.includes("data/pronunciation-seed.json"));

  for (const path of manifestReferencedFiles(manifest)) {
    assert.ok(files.includes(path), `${path} should be packaged`);
  }

  assert.equal(files.some((path) => path.startsWith("test/")), false);
  assert.equal(files.some((path) => path.startsWith("server/")), false);
  assert.equal(files.some((path) => path.startsWith("docs/")), false);
  assert.equal(files.some((path) => path.startsWith("scripts/")), false);
  assert.equal(files.some((path) => path.endsWith("README.md")), false);
});

test("excludes private and licensed package data even when present locally", async () => {
  const root = await mkdtemp(join(tmpdir(), "saythis-package-"));
  await writeFixture(root, "manifest.json", "{}");
  await writeFixture(root, "src/background.js", "");
  await writeFixture(root, "data/pronunciation-seed.json", "{\"entries\":[]}");
  await writeFixture(root, "data/private/secret.json", "{\"secret\":true}");
  await writeFixture(root, "data/licensed/source.json", "{\"license\":\"restricted\"}");
  await writeFixture(root, "data/raw/source.json", "{\"raw\":true}");
  await writeFixture(root, "assets/icons/icon16.png", "");
  await writeFixture(root, "assets/audio/public/example.ogg", "");

  const files = await collectPackageFiles(root);

  assert.ok(files.includes("data/pronunciation-seed.json"));
  assert.equal(files.some((path) => path.startsWith("data/private/")), false);
  assert.equal(files.some((path) => path.startsWith("data/licensed/")), false);
  assert.equal(files.some((path) => path.startsWith("data/raw/")), false);
});

test("creates deterministic package name and zip envelope", () => {
  assert.equal(packageNameFromManifest(manifest), "saythis-chrome-v0.1.0.zip");

  const zip = createZip([
    { path: "manifest.json", data: Buffer.from("{}") },
    { path: "src/example.js", data: Buffer.from("console.log('ok');") }
  ]);

  assert.equal(zip.readUInt32LE(0), 0x04034b50);
  assert.equal(zip.includes(Buffer.from("manifest.json")), true);
  assert.equal(zip.includes(Buffer.from("src/example.js")), true);
  assert.equal(zip.readUInt32LE(zip.length - 22), 0x06054b50);
});

function manifestReferencedFiles(value) {
  const files = new Set();
  addIconMap(files, value.icons);
  addIconMap(files, value.action?.default_icon);
  addIfString(files, value.action?.default_popup);
  addIfString(files, value.options_ui?.page);
  addIfString(files, value.background?.service_worker);

  for (const resourceGroup of value.web_accessible_resources || []) {
    for (const resource of resourceGroup.resources || []) {
      if (!resource.includes("*")) {
        files.add(resource);
      }
    }
  }

  return [...files].sort();
}

function addIconMap(files, icons = {}) {
  for (const path of Object.values(icons || {})) {
    addIfString(files, path);
  }
}

function addIfString(files, path) {
  if (typeof path === "string" && path) {
    files.add(path);
  }
}

async function writeFixture(root, relativePath, contents) {
  const target = join(root, ...relativePath.split("/"));
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, contents);
}

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join, posix } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  collectPackageFiles
} from "../scripts/package-extension.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const manifest = JSON.parse(await readText("manifest.json"));
const packageFiles = new Set(await collectPackageFiles(root));

test("popup and options pages provide every JavaScript-bound element id", async () => {
  for (const page of [
    { html: "src/popup.html", script: "src/popup.js" },
    { html: "src/options.html", script: "src/options.js" }
  ]) {
    const htmlIds = new Set(idsInHtml(await readText(page.html)));
    const scriptIds = idsFromGetElementById(await readText(page.script));
    const missing = scriptIds.filter((id) => !htmlIds.has(id));

    assert.deepEqual(missing, [], `${page.script} references ids absent from ${page.html}`);
  }
});

test("manifest and extension pages reference packaged runtime files", async () => {
  const referencedFiles = [
    manifest.action?.default_popup,
    manifest.options_ui?.page,
    manifest.background?.service_worker,
    ...manifestIcons(manifest),
    ...manifestWebResources(manifest),
    ...await extensionPageScripts(manifest.action?.default_popup),
    ...await extensionPageScripts(manifest.options_ui?.page),
    ...await extensionPageScripts("src/offscreen-audio.html")
  ].filter(Boolean);

  const missing = referencedFiles
    .map(normalizePackagePath)
    .filter((path) => !path.includes("*") && !packageFiles.has(path));

  assert.deepEqual([...new Set(missing)].sort(), []);
});

test("static extension module imports resolve inside the runtime package", async () => {
  const entryPoints = [
    manifest.background.service_worker,
    ...await extensionPageScripts(manifest.action.default_popup),
    ...await extensionPageScripts(manifest.options_ui.page),
    ...await extensionPageScripts("src/offscreen-audio.html")
  ].map(normalizePackagePath);
  const visited = new Set();
  const missing = [];

  for (const entry of entryPoints) {
    await walkStaticImports(entry, visited, missing);
  }

  assert.deepEqual(missing.sort(), []);
});

test("overlay exposes playback and feedback actions", async () => {
  const source = await readText("src/content-overlay.js");

  for (const action of ["speak", "online", "slow", "correct", "confirm", "missing", "wrong"]) {
    assert.match(source, new RegExp(`data-action="${action}"`));
  }

  assert.match(source, /type: "SAYTHIS_RESOLVE"/);
  assert.match(source, /useOnline: true/);
  assert.match(source, /kind: "correction"/);

  for (const field of ["sourceForm", "language", "languageName", "simple", "ipa", "origin", "audioUrl", "sourceUrl", "variantNote"]) {
    assert.match(source, new RegExp(`correctionInput\\([^\\n]+["']${field}["']`));
  }

  for (const kind of ["confirm", "missing", "wrong"]) {
    assert.match(source, new RegExp(`sendFeedback\\(result, ["']${kind}["']\\)`));
  }
});

function idsInHtml(html) {
  return matches(html, /\bid="([^"]+)"/g);
}

function idsFromGetElementById(script) {
  return matches(script, /document\.getElementById\((["'])(.*?)\1\)/g, 2);
}

async function extensionPageScripts(pagePath) {
  if (!pagePath) {
    return [];
  }

  const html = await readText(normalizePackagePath(pagePath));
  return matches(html, /<script\b[^>]*\bsrc=(["'])(.*?)\1[^>]*>/gi, 2)
    .map((src) => resolveRelative(pagePath, src));
}

async function walkStaticImports(entry, visited, missing) {
  const path = normalizePackagePath(entry);
  if (visited.has(path)) {
    return;
  }
  visited.add(path);

  if (!packageFiles.has(path)) {
    missing.push(path);
    return;
  }

  const source = await readText(path);
  for (const specifier of staticImportSpecifiers(source)) {
    if (!specifier.startsWith(".")) {
      continue;
    }

    await walkStaticImports(resolveRelative(path, specifier), visited, missing);
  }
}

function staticImportSpecifiers(source) {
  return [
    ...matches(source, /\bimport\s+[^"'()]*?from\s+(["'])(.*?)\1/g, 2),
    ...matches(source, /\bimport\s*(["'])(.*?)\1/g, 2),
    ...matches(source, /\bexport\s+[^"'()]*?from\s+(["'])(.*?)\1/g, 2)
  ];
}

function manifestIcons(value) {
  return [
    ...Object.values(value.icons || {}),
    ...Object.values(value.action?.default_icon || {})
  ];
}

function manifestWebResources(value) {
  return (value.web_accessible_resources || [])
    .flatMap((group) => group.resources || []);
}

function matches(value, pattern, group = 1) {
  return [...String(value || "").matchAll(pattern)]
    .map((match) => match[group])
    .filter(Boolean);
}

function resolveRelative(fromPath, specifier) {
  return posix.normalize(posix.join(dirname(normalizePackagePath(fromPath)), specifier));
}

function normalizePackagePath(value) {
  return String(value || "").replaceAll("\\", "/").replace(/^\/+/, "");
}

function readText(relativePath) {
  return readFile(join(root, normalizePackagePath(relativePath)), "utf8");
}

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
  const background = await readText("src/background.js");
  const styles = await readText("src/content/overlay-style.js");
  const source = await readText("src/content-overlay.js");

  assert.match(background, /src\/content\/overlay-style\.js/);
  assert.match(styles, /__sayThisOverlayStyles/);
  assert.match(source, /__sayThisOverlayStyles/);
  for (const action of ["speak", "online", "slow", "correct", "confirm", "missing", "wrong"]) {
    assert.match(source, new RegExp(`data-action="${action}"`));
  }

  assert.match(source, /type: "SAYTHIS_RESOLVE"/);
  assert.match(source, /useOnline: true/);
  assert.match(source, /kind: "correction"/);
  assert.match(source, /community\.requests/);
  assert.match(source, /community\.flags/);
  assert.match(source, /<dt>Aliases<\/dt>/);
  assert.match(source, /aliasesTextFromResult\(result\) \|\| "None"/);
  assert.match(source, /result\.notes \|\| result\.variantNote/);
  assert.match(source, /\.filter\(Boolean\)\.slice\(0, 2\)/);
  assert.match(source, /class="recordings"/);
  assert.match(source, /data-action="alternate"/);
  assert.match(source, /data-action="recording"/);
  assert.match(source, /speakCandidate\(result\.alternateResults\?\.\[index\], 0\.82\)/);
  assert.match(source, /playAudioItem\(recordings\[index\], result, 0\.82\)/);

  for (const field of ["sourceForm", "aliases", "language", "languageName", "simple", "ipa", "origin", "audioUrl", "sourceUrl", "variantNote"]) {
    assert.match(source, new RegExp(`correctionInput\\([^\\n]+["']${field}["']`));
  }

  for (const kind of ["confirm", "missing", "wrong"]) {
    assert.match(source, new RegExp(`sendFeedback\\(result, ["']${kind}["']\\)`));
  }
});

test("background routes local and online keyboard commands", async () => {
  const source = await readText("src/background.js");

  assert.match(source, /command === "pronounce-selection"/);
  assert.match(source, /command === "pronounce-selection-online"/);
  assert.match(source, /source: "keyboard-online"/);
  assert.match(source, /useOnline: true/);
});

test("online source resolver retries Wiktionary with resolved source forms", async () => {
  const background = await readText("src/background.js");
  const source = await readText("src/background/online-sources.js");

  assert.match(background, /resolveWithOnlineSources/);
  assert.match(source, /additionalPronunciationLookupCandidates/);
  assert.match(source, /resolveWithNominatimCandidates/);
  assert.match(source, /resolveWithWiktionaryCandidates/);
  assert.match(source, /nominatimCandidateResult/);
  assert.match(source, /refinedStructuredResult/);
  assert.match(source, /resolveWithForvoCandidates\(text, refinedStructuredResult/);
  assert.match(source, /includeResolvedLanguageFallback: true/);
  assert.match(source, /language: candidate\.language/);
});

test("online source resolver exposes deterministic helpers", async () => {
  const {
    resolveSafely,
    resolveWithNominatimCandidates,
    uniqueWikidataMatches
  } = await import("../src/background/online-sources.js");
  const originalFetch = globalThis.fetch;
  const requestedUrls = [];

  try {
    globalThis.fetch = async (url) => {
      requestedUrls.push(url);
      return {
        ok: true,
        async json() {
          return [{
            osm_type: "relation",
            osm_id: "1370736",
            name: "Αθήνα",
            display_name: "Αθήνα, Greece",
            category: "boundary",
            type: "administrative",
            importance: 0.9,
            address: { country: "Greece" },
            namedetails: {
              name: "Αθήνα",
              "name:en": "Athens",
              "name:el": "Αθήνα"
            }
          }];
        }
      };
    };

    assert.deepEqual(uniqueWikidataMatches([
      { id: "Q1", label: "First" },
      { id: "Q1", label: "Duplicate" },
      { id: "" },
      { id: "Q2", label: "Second" }
    ]).map((match) => match.id), ["Q1", "Q2"]);
    assert.equal(await resolveSafely(async () => {
      throw new Error("network unavailable");
    }), null);

    const place = await resolveWithNominatimCandidates("Athens", {
      sourceForm: "Αθήνα",
      language: "el"
    }, "https://example.com/search");
    const url = new URL(requestedUrls[0]);

    assert.equal(place.sourceForm, "Αθήνα");
    assert.equal(url.searchParams.get("q"), "Αθήνα");
    assert.equal(url.searchParams.get("accept-language"), "el,en");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("options page exposes shared-entry data controls", async () => {
  const html = await readText("src/options.html");
  const source = await readText("src/options.js");

  assert.match(html, /id="auto-speak-popup"/);
  assert.match(source, /autoSpeakPopup/);
  assert.match(html, /id="pull-enabled"/);
  assert.match(html, /id="pull-approved"/);
  assert.match(html, /id="clear-approved"/);
  assert.match(source, /communityPullEnabled/);
  assert.match(source, /pullEnabled/);
  assert.match(source, /normalizeApprovedEntries/);
  assert.match(source, /approvedCommunityEntries:\s*normalizeApprovedEntries/);
  assert.match(source, /normalizeCommunityEntries/);
  assert.match(source, /normalizeSubmissionQueue/);
  assert.match(source, /Approved shared entries cleared/);
  assert.match(source, /wrong-result flags/);
});

test("background treats variant notes as pronunciation data", async () => {
  const source = await readText("src/background.js");

  assert.match(source, /entry\.variantNote/);
});

test("popup quick feedback labels match their feedback kinds", async () => {
  const html = await readText("src/popup.html");
  const source = await readText("src/popup.js");

  assert.match(html, /id="confirm"[^>]*>Confirm<\/button>/);
  assert.match(source, /confirmButton\.addEventListener\("click", \(\) => saveFeedback\(\{ kind: "confirm" \}\)\)/);
});

test("popup source-audio failure falls back to TTS", async () => {
  const source = await readText("src/popup.js");
  const html = await readText("src/popup.html");

  assert.match(html, /id="audio-list"/);
  assert.match(source, /autoSpeakPopup/);
  assert.match(source, /await speakSelection\(0\.82\)/);
  assert.match(source, /audioItemsForResult/);
  assert.match(source, /speakAlternate\(item\.index, 0\.82\)/);
  assert.match(source, /replaceCurrent: false/);
  assert.match(source, /playAudioItem\(item, currentResult, 0\.82\)/);
  assert.match(source, /Audio failed\. Using TTS fallback\./);
  assert.match(source, /const fallbackToSpeech = async \(\) =>/);
  assert.match(source, /createSpeakMessage\(text, \{/);
  assert.match(source, /fallbackStarted/);
});

test("overlay source-audio failure falls back to TTS", async () => {
  const source = await readText("src/content-overlay.js");

  assert.match(source, /Audio failed\. Using TTS fallback\./);
  assert.match(source, /const fallbackToSpeech = \(\) =>/);
  assert.match(source, /audioPlayer\.addEventListener\("error"/);
  assert.match(source, /type: "SAYTHIS_SPEAK"/);
  assert.match(source, /fallbackStarted/);
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

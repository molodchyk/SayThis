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
  const playbackSurface = await readText("src/background/playback-surface-flow.js");
  const styles = await readText("src/content/overlay-style.js");
  const runtimeAdapters = await readText("src/content/overlay-runtime-adapters.js");
  const resultView = await readText("src/content/overlay-result-view.js");
  const source = await readText("src/content-overlay.js");

  assert.match(background, /createPlaybackSurface/);
  assert.match(playbackSurface, /src\/content\/overlay-style\.js/);
  assert.match(playbackSurface, /src\/content\/overlay-runtime-adapters\.js/);
  assert.match(playbackSurface, /src\/content\/overlay-result-view\.js/);
  assert.match(styles, /__sayThisOverlayStyles/);
  assert.match(runtimeAdapters, /__sayThisOverlayRuntimeAdapters/);
  assert.match(runtimeAdapters, /SAYTHIS_SHOW_RESULT/);
  assert.match(resultView, /__sayThisOverlayResultView/);
  assert.match(source, /__sayThisOverlayStyles/);
  assert.match(source, /__sayThisOverlayRuntimeAdapters/);
  assert.match(source, /__sayThisOverlayResultView/);
  for (const action of ["speak", "online", "slow", "correct", "confirm", "missing", "wrong"]) {
    assert.match(source, new RegExp(`data-action="${action}"`));
  }

  assert.match(source, /type: "SAYTHIS_RESOLVE"/);
  assert.match(source, /useOnline: true/);
  assert.match(source, /correctionFeedbackFromForm\("correction"\)/);
  assert.match(source, /community\.requests/);
  assert.match(source, /community\.flags/);
  assert.match(source, /<dt>Aliases<\/dt>/);
  assert.match(source, /aliasesTextFromResult\(result\) \|\| "None"/);
  assert.match(source, /result\.notes \|\| result\.variantNote/);
  assert.match(source, /variantItems\(result\.variants\)/);
  assert.match(source, /\.filter\(Boolean\)\.slice\(0, 2\)/);
  assert.match(source, /class="recordings"/);
  assert.match(source, /data-action="alternate"/);
  assert.match(source, /data-action="recording"/);
  assert.match(source, /data-lookup-hints/);
  assert.match(source, /languageHints/);
  assert.match(source, /lookupHints\(\)/);
  assert.match(source, /playbackItems\(result\)/);
  assert.match(resultView, /playbackItems/);
  assert.match(resultView, /normalizeLanguageHints/);
  assert.match(source, /speakCandidate\(result\.alternateResults\?\.\[index\], 0\.82\)/);
  assert.match(source, /item\?\.kind === "guide"/);
  assert.match(source, /playAudioItem\(item, result, 0\.82\)/);

  for (const field of ["sourceForm", "aliases", "language", "languageName", "simple", "ipa", "origin", "root", "domainHint", "variants", "audioUrl", "sourceUrl", "variantNote"]) {
    assert.match(source, new RegExp(`correctionInput\\([^\\n]+["']${field}["']`));
  }

  for (const kind of ["confirm", "wrong"]) {
    assert.match(source, new RegExp(`sendFeedback\\(result, ["']${kind}["']\\)`));
  }
  assert.match(source, /sendFeedback\(result, "missing", correctionFeedbackFromForm\("missing"\)\)/);
});

test("background routes local and online keyboard commands", async () => {
  const source = await readText("src/background.js");
  const activeSelection = await readText("src/background/active-selection-flow.js");
  const playbackSurface = await readText("src/background/playback-surface-flow.js");
  const runtimeAdapters = await readText("src/background/runtime-adapters-flow.js");

  assert.match(source, /resolveSelectionFlow\(text, options, \{/);
  assert.match(source, /handleContextMenuClick\(info, tab, \{/);
  assert.match(source, /lastResultKey: STORAGE_KEYS\.lastResult/);
  assert.match(source, /handleActiveSelectionCommandName\(command, runtimeAdapters\.activeSelectionDependencies\(\{/);
  assert.match(source, /createRuntimeAdapters\(createRuntimeAdapterPlatformDependencies\(platform, STORAGE_KEYS\)\)/);
  assert.match(source, /runtimeAdapters\.activeSelectionDependencies\(\{/);
  assert.match(source, /handleRuntimeMessage\(message, sendResponse, runtimeMessageDependencies\(\)\)/);
  assert.match(source, /createPlaybackSurface\(createPlaybackSurfacePlatformDependencies\(platform, STORAGE_KEYS\)\)/);
  assert.match(source, /playbackSurface\.playResolvedResult\(result, tabId\)/);
  assert.match(playbackSurface, /playResolvedResultFlow\(result, tabId, \{/);
  assert.match(playbackSurface, /createOffscreenPlayAudioMessage/);
  assert.match(playbackSurface, /createShowResultMessage/);
  assert.match(runtimeAdapters, /window\.getSelection\(\)\?\.toString\(\)/);
  assert.match(runtimeAdapters, /data\/pronunciation-seed\.json/);
  assert.match(activeSelection, /command === KEYBOARD_COMMANDS\.local/);
  assert.match(activeSelection, /command === KEYBOARD_COMMANDS\.online/);
  assert.match(activeSelection, /source: "keyboard-online"/);
  assert.match(activeSelection, /useOnline: true/);
});

test("online source resolver retries Wiktionary with resolved source forms", async () => {
  const background = await readText("src/background.js");
  const selectionResolver = await readText("src/background/selection-resolver-flow.js");
  const source = await readText("src/background/online-sources.js");

  assert.match(background, /resolveSelectionFlow/);
  assert.match(selectionResolver, /resolveWithOnlineSources/);
  assert.match(source, /additionalPronunciationLookupCandidates/);
  assert.match(source, /resolveWithNominatimCandidates/);
  assert.match(source, /resolveWithDbpediaCandidates/);
  assert.match(source, /resolveWithWiktionaryCandidates/);
  assert.match(source, /languageHints: settings\.lookupLanguageHints/);
  assert.match(source, /selectBestWikidataResult\(query, matches, entityById, \{/);
  assert.match(source, /languageHints: options\.languageHints/);
  assert.match(source, /nominatimCandidateResult/);
  assert.match(source, /refinedStructuredResult/);
  assert.match(source, /resolveWithForvoCandidates\(text, refinedStructuredResult/);
  assert.match(source, /includeResolvedLanguageFallback: true/);
  assert.match(source, /languageHints: settings\.lookupLanguageHints/);
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

test("online source resolver passes language hints to gazetteer lookup", async () => {
  const {
    resolveWithNominatim
  } = await import("../src/background/online-sources.js");
  const originalFetch = globalThis.fetch;
  let requestedUrl = "";

  try {
    globalThis.fetch = async (url) => {
      requestedUrl = url;
      return {
        ok: true,
        async json() {
          return [{
            osm_type: "relation",
            osm_id: "777",
            name: "Exampletown",
            display_name: "Exampletown, Exampleland",
            category: "place",
            type: "village",
            importance: 0.6,
            address: { country: "Exampleland" },
            namedetails: {
              name: "Exampletown",
              "name:pl": "Przykladowo"
            }
          }];
        }
      };
    };

    const result = await resolveWithNominatim("Exampletown", "https://example.com/search", {
      languageHints: ["pl"]
    });
    const url = new URL(requestedUrl);

    assert.equal(url.searchParams.get("accept-language"), "pl,en");
    assert.equal(result.sourceForm, "Przykladowo");
    assert.equal(result.language, "pl");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("online source resolver uses language hints for Forvo candidates", async () => {
  const {
    resolveWithForvoCandidates
  } = await import("../src/background/online-sources.js");
  const originalFetch = globalThis.fetch;
  let requestedUrl = "";

  try {
    globalThis.fetch = async (url) => {
      requestedUrl = url;
      return {
        ok: true,
        async json() {
          return {
            items: [{
              id: 99,
              word: "przyklad",
              code: "pl",
              langname: "Polish",
              pathogg: "https://audio.example/przyklad.ogg",
              rate: 5
            }]
          };
        }
      };
    };

    const result = await resolveWithForvoCandidates("przyklad", null, "api-key", {
      lookupLanguageHints: ["pl"]
    });

    assert.match(requestedUrl, /\/language\/pl$/);
    assert.equal(result.language, "pl");
    assert.equal(result.sourceStatus, "verified-audio");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("online source resolver tries hinted Wiktionary editions", async () => {
  const {
    resolveWithWiktionary
  } = await import("../src/background/online-sources.js");
  const originalFetch = globalThis.fetch;
  const requestedHosts = [];

  try {
    globalThis.fetch = async (url) => {
      const parsedUrl = new URL(url);
      requestedHosts.push(parsedUrl.host);
      const sourceLanguage = parsedUrl.host.split(".")[0];
      const missing = sourceLanguage === "en";

      return {
        ok: true,
        async json() {
          return {
            query: {
              pages: missing
                ? [{ missing: true }]
                : [{
                  title: "przyklad",
                  revisions: [{
                    slots: {
                      main: {
                        content: `==Wymowa==\n* {{IPA|pl|/ˈpʂɨ.kwat/}}\n* {{audio|pl|Pl-przyklad.ogg|audio}}`
                      }
                    }
                  }]
                }]
            }
          };
        }
      };
    };

    const result = await resolveWithWiktionary("przyklad", {
      languageHints: ["pl"]
    });

    assert.deepEqual(requestedHosts, ["en.wiktionary.org", "pl.wiktionary.org"]);
    assert.equal(result.language, "pl");
    assert.equal(result.sourceStatus, "verified-audio");
    assert.equal(result.sources[0].url, "https://pl.wiktionary.org/wiki/przyklad");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("options page exposes shared-entry data controls", async () => {
  const html = await readText("src/options.html");
  const source = await readText("src/options.js");
  const summarySource = await readText("src/options/summary-view.js");

  assert.match(html, /id="auto-speak-popup"/);
  assert.match(source, /autoSpeakPopup/);
  assert.match(html, /id="lookup-language-hints"/);
  assert.match(source, /lookupLanguageHints/);
  assert.match(source, /normalizeLanguageHints/);
  assert.match(html, /id="dbpedia-enabled"/);
  assert.match(html, /id="dbpedia-endpoint"/);
  assert.match(source, /dbpediaEnabled/);
  assert.match(source, /dbpediaEndpoint/);
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
  assert.match(source, /summary-view/);
  assert.match(summarySource, /wrong-result flags/);
});

test("background uses shared community pronunciation-data policy", async () => {
  const background = await readText("src/background.js");
  const feedbackFlow = await readText("src/background/community-feedback-flow.js");
  const source = await readText("src/resolver/community.js");

  assert.match(background, /saveFeedbackFlow\(text, feedback, \{/);
  assert.match(background, /flushCommunitySyncFlow\(\{/);
  assert.match(background, /pullApprovedCommunityEntriesFlow\(\{/);
  assert.match(feedbackFlow, /hasCommunityPronunciationData/);
  assert.match(feedbackFlow, /createCommunitySubmission/);
  assert.match(feedbackFlow, /pullApprovedEntries/);
  assert.match(source, /entry\.variantNote/);
  assert.match(source, /normalizeAliases\(entry\.variants\)\.length/);
});

test("popup quick feedback labels match their feedback kinds", async () => {
  const html = await readText("src/popup.html");
  const source = await readText("src/popup.js");

  assert.match(html, /id="lookup-hints"/);
  assert.match(source, /lookupHintsInput/);
  assert.match(source, /languageHints/);
  assert.match(source, /useOnline: useOnline \|\| languageHints\.length \? true : useOnline/);
  assert.match(html, /id="confirm"[^>]*>Confirm<\/button>/);
  assert.match(source, /confirmButton\.addEventListener\("click", \(\) => saveFeedback\(\{ kind: "confirm" \}\)\)/);
  assert.match(source, /missingButton\.addEventListener\("click", \(\) => saveFeedback\(feedbackFromCorrectionFields\("missing"\)\)\)/);
});

test("background includes per-lookup hints in online settings", async () => {
  const source = await readText("src/background/selection-resolver-flow.js");

  assert.match(source, /normalizeLanguageHints/);
  assert.match(source, /const hasRequestHints = normalizeLanguageHints\(options\.languageHints\)\.length > 0/);
  assert.match(source, /const shouldUseOnline = options\.useOnline \?\? \(/);
  assert.match(source, /shouldUseOnlineForPronunciation\(selectedText, localResult\)/);
  assert.match(source, /onlineSettingsForRequest/);
  assert.match(source, /\.\.\.settings\.lookupLanguageHints/);
  assert.match(source, /\.\.\.requestHints/);
  assert.match(source, /onlineCacheScope\(onlineSettings, credentials\)/);
});

test("popup source-audio failure falls back to TTS", async () => {
  const source = await readText("src/popup.js");
  const audioSource = await readText("src/popup/audio-playback.js");
  const resultSource = await readText("src/popup/result-renderer.js");
  const html = await readText("src/popup.html");

  assert.match(html, /id="audio-list"/);
  assert.match(source, /autoSpeakPopup/);
  assert.match(source, /await speakSelection\(0\.82\)/);
  assert.match(source, /createPopupAudioPlayback/);
  assert.match(resultSource, /playbackItemsForResult/);
  assert.match(resultSource, /speakAlternate\(item\.index, 0\.82\)/);
  assert.match(resultSource, /item\.kind === "guide"/);
  assert.match(source, /replaceCurrent: false/);
  assert.match(resultSource, /playAudioItem\(item, result, 0\.82\)/);
  assert.match(source, /Audio failed\. Using TTS fallback\./);
  assert.match(source, /Speaking guide\./);
  assert.match(source, /response\?\.speech\?\.fallback === "guide"/);
  assert.match(source, /const fallbackToSpeech = async \(\) =>/);
  assert.match(source, /createSpeakMessage\(text, \{/);
  assert.match(audioSource, /audioPlayer\.addEventListener\("error"/);
  assert.match(audioSource, /fallbackStarted/);
});

test("overlay source-audio failure falls back to TTS", async () => {
  const source = await readText("src/content-overlay.js");

  assert.match(source, /Audio failed\. Using TTS fallback\./);
  assert.match(source, /Speaking guide\./);
  assert.match(source, /response\?\.speech\?\.fallback === "guide"/);
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

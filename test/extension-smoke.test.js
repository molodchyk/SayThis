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
    { html: "src/popup/popup.html", script: "src/popup/index.js" },
    { html: "src/options/options.html", script: "src/options/index.js" }
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
    ...manifestContentScripts(manifest),
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
    ...manifestContentScripts(manifest),
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
  const language = await readText("src/content/overlay-language.js");
  const resultView = await readText("src/content/overlay-result-view.js");
  const source = await readText("src/content-overlay.js");

  assert.match(background, /createPlaybackSurface/);
  assert.match(playbackSurface, /src\/content\/overlay-style\.js/);
  assert.match(playbackSurface, /src\/content\/overlay-runtime-adapters\.js/);
  assert.match(playbackSurface, /src\/content\/overlay-language\.js/);
  assert.match(playbackSurface, /src\/content\/overlay-result-view\.js/);
  assert.match(styles, /__sayThisOverlayStyles/);
  assert.match(runtimeAdapters, /__sayThisOverlayRuntimeAdapters/);
  assert.match(runtimeAdapters, /SAYTHIS_SHOW_RESULT/);
  assert.match(language, /__sayThisOverlayLanguage/);
  assert.match(resultView, /__sayThisOverlayResultView/);
  assert.match(resultView, /__sayThisOverlayLanguage/);
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
  assert.match(source, /class="listen-main"/);
  assert.match(source, /data-playback-control="true"/);
  assert.match(source, /data-action="alternate"/);
  assert.match(source, /data-action="recording"/);
  assert.match(source, /data-lookup-hints/);
  assert.match(source, /languageHints/);
  assert.match(source, /lookupHints\(\)/);
  assert.match(source, /playbackItems\(result\)/);
  assert.match(resultView, /playbackItems/);
  assert.match(resultView, /speechResultForPlaybackItem/);
  assert.match(resultView, /normalizeLanguageHints/);
  assert.match(source, /const alternate = result\.alternateResults\?\.\[index\]/);
  assert.match(source, /const alternateAudio = typeof getBestAudio === "function" \? getBestAudio\(alternate\) : null/);
  assert.match(source, /playAudioItem\(alternateAudio, alternate, 0\.82, \{[\s\S]*button,[\s\S]*replaceCurrent: false,[\s\S]*status: "Playing alternate\."/);
  assert.match(source, /speakCandidate\(preferredSpeechResult\(alternate\), 0\.82, \{[\s\S]*button,[\s\S]*replaceCurrent: false[\s\S]*\}\)/);
  assert.match(source, /speechResultForPlaybackItem\(result, item\)/);
  assert.match(source, /item\?\.kind !== "audio"/);
  assert.match(source, /playAudioItem\(item, result, 0\.82, \{[\s\S]*button,[\s\S]*status: playbackStatus\(item, 0\.82\)[\s\S]*\}\)/);

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
  assert.match(source, /handleRuntimeMessage\(message, sendResponse, runtimeMessageDependencies\(sender\)\)/);
  assert.match(source, /getVisibleResult: \(\) => getVisibleResultOnTab\(sender\?\.tab\?\.id\)/);
  assert.match(source, /setStorage: platform\.setStorage/);
  assert.match(source, /lastSelectionKey: STORAGE_KEYS\.lastSelection/);
  assert.match(source, /lastSourceKey: STORAGE_KEYS\.lastSource/);
  assert.match(source, /activateSelectionListenerOnOpenTabs\(selectionActivationDependencies\(\)\)/);
  assert.match(source, /platform\.addStartupListener/);
  assert.match(source, /primePlaybackSurface\("installed"\)/);
  assert.match(source, /primePlaybackSurface\("startup"\)/);
  assert.match(source, /refreshApprovedSharedEntries\("installed"\)/);
  assert.match(source, /refreshApprovedSharedEntries\("startup"\)/);
  assert.match(source, /APPROVED_SHARED_ENTRIES_SELECTION_REFRESH_MS = 15 \* 60 \* 1000/);
  assert.match(source, /APPROVED_SHARED_ENTRIES_SELECTION_REFRESH_DELAY_MS = 1200/);
  assert.match(source, /refreshApprovedSharedEntriesForSelectionPrime\(trace\)/);
  assert.match(source, /approved-pull:defer/);
  assert.match(source, /refreshApprovedSharedEntries\("selection-prime"\)/);
  assert.match(source, /preloadLastResultAudio\("installed"\)/);
  assert.match(source, /preloadLastResultAudio\("startup"\)/);
  assert.match(source, /preloadSharedAudioForPlayback\(sharedResult, options\.trace\)/);
  assert.match(source, /approved-pull:skip/);
  assert.match(source, /approved-pull:result/);
  assert.match(source, /last-audio-preload:result/);
  assert.match(source, /cacheBeforePlayback: true/);
  assert.match(source, /action: `playback-prime-\$\{reason\}`/);
  assert.match(source, /createPlaybackSurface\(\{/);
  assert.match(source, /createPlaybackSurfacePlatformDependencies\(platform, STORAGE_KEYS\)/);
  assert.match(source, /onDebugEvent: recordPlaybackDebugEvent/);
  assert.match(source, /playbackSurface\.playResolvedResult\(result, tabId, trace\)/);
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

    assert.deepEqual(requestedHosts, ["pl.wiktionary.org", "en.wiktionary.org"]);
    assert.equal(result.language, "pl");
    assert.equal(result.sourceStatus, "verified-audio");
    assert.equal(result.sources[0].url, "https://pl.wiktionary.org/wiki/przyklad");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("options page exposes shared-entry data controls", async () => {
  const html = await readText("src/options/options.html");
  const source = await readText("src/options/index.js");
  const summarySource = await readText("src/options/summary-view.js");

  assert.match(html, /id="auto-speak-popup"/);
  assert.match(source, /autoSpeakPopup/);
  assert.match(html, /id="select-to-hear"/);
  assert.match(source, /selectToHear/);
  assert.match(html, /id="lookup-language-hints"/);
  assert.match(source, /lookupLanguageHints/);
  assert.match(source, /normalizeLanguageHints/);
  assert.match(html, /id="dbpedia-enabled"/);
  assert.match(html, /id="dbpedia-endpoint"/);
  assert.match(source, /dbpediaEnabled/);
  assert.match(source, /dbpediaEndpoint/);
  assert.match(html, /id="pull-enabled"/);
  assert.match(html, /id="shared-audio-enabled"/);
  assert.match(html, /id="pull-approved"/);
  assert.match(html, /id="clear-approved"/);
  assert.match(html, /id="toggle-debug"/);
  assert.match(html, /id="debug-panel"/);
  assert.match(html, /id="debug-output"/);
  assert.match(source, /communityPullEnabled/);
  assert.match(source, /communityAudioEnabled/);
  assert.match(source, /createGetDebugStateMessage/);
  assert.match(source, /refreshDebugDiagnostics/);
  assert.match(source, /debugSummaryText/);
  assert.match(source, /pullEnabled/);
  assert.match(source, /sharedAudioEnabled/);
  assert.match(source, /normalizeApprovedEntries/);
  assert.match(source, /approvedCommunityEntries:\s*normalizeApprovedEntries/);
  assert.match(source, /normalizeCommunityEntries/);
  assert.match(source, /normalizeSubmissionQueue/);
  assert.match(source, /Approved shared entries cleared/);
  assert.match(source, /summary-view/);
  assert.match(summarySource, /wrong-result flags/);
});

test("popup auto-speak does not force resolve before speaking", async () => {
  const source = await readText("src/popup/index.js");

  assert.match(source, /async function speakUnresolvedSelection\(text, rate, trace\)/);
  assert.match(source, /createSpeakMessage\(text, \{\s*rate,\s*trace\s*\}\)/);
  assert.match(source, /if \(!currentResult\) \{\s*await speakUnresolvedSelection\(text, rate, trace\);\s*return;\s*\}/);
  assert.match(source, /if \(settings\.autoSpeakPopup\) \{\s*await speakSelection\(0\.82\);\s*\} else \{\s*await resolveSelection\(\);\s*\}/);
  assert.doesNotMatch(source, /if \(!currentResult\) \{\s*await resolveSelection\(\);/);
  assert.doesNotMatch(source, /const result = await resolveSelection\(\);\s*if \(settings\.autoSpeakPopup && result\)/);
});

test("selection listener speaks bounded selected text directly", async () => {
  const manifestSource = await readText("manifest.json");
  const source = await readText("src/selection-listener.js");
  const runtimeSource = await readText("src/background/runtime-message-flow.js");

  assert.match(manifestSource, /src\/selection-listener\.js/);
  assert.match(manifestSource, /"run_at": "document_start"/);
  assert.match(manifestSource, /"all_frames": true/);
  assert.match(manifestSource, /"match_about_blank": true/);
  assert.match(source, /selectionchange/);
  assert.match(source, /selectstart/);
  assert.match(source, /addEventListener\("select"/);
  assert.match(source, /pointerdown/);
  assert.match(source, /keydown/);
  assert.match(source, /SELECTION_CHANGE_DEBOUNCE_MS = 40/);
  assert.match(source, /SELECTION_PREPARE_DEBOUNCE_MS = 30/);
  assert.match(source, /COMMITTED_SELECTION_DEBOUNCE_MS = 0/);
  assert.match(source, /REPEAT_SELECTION_COOLDOWN_MS = 350/);
  assert.match(source, /PREPARED_SELECTION_TTL_MS = 1200/);
  assert.match(source, /PLAYBACK_PRIME_COOLDOWN_MS = 3000/);
  assert.match(source, /pointerup/);
  assert.match(source, /MAX_AUTO_TEXT_LENGTH = 120/);
  assert.match(source, /MAX_AUTO_WORDS = 8/);
  assert.match(source, /MAX_ORDINARY_AUTO_WORDS = 5/);
  assert.match(source, /selectToHear !== false/);
  assert.match(source, /SAYTHIS_SPEAK/);
  assert.match(source, /SAYTHIS_PREPARE_PLAYBACK/);
  assert.match(source, /timedStatusLabel\(status, trace\)/);
  assert.match(source, /timedStatusLabel\("Unavailable", trace\)/);
  assert.match(source, /selectionElapsedMs/);
  assert.doesNotMatch(source, /SAYTHIS_DEBUG_EVENT/);
  assert.match(runtimeSource, /ui:selection-auto-speak/);
  assert.match(runtimeSource, /MESSAGE_TYPES\.preparePlayback/);
  assert.match(runtimeSource, /DEFAULT_SELECT_TO_HEAR_AUDIO_FALLBACK_WAIT_MS = 350/);
  assert.match(source, /lastSentKey/);
  assert.match(source, /lastSentAt/);
  assert.match(source, /lastPreparedTrace/);
  assert.match(source, /preparePotentialSelection/);
  assert.match(source, /scheduledCheckAt/);
  assert.match(source, /scheduledCheckMode/);
  assert.match(source, /prepareTimerId/);
  assert.match(source, /stable: true/);
  assert.match(source, /primePlaybackSurface/);
  assert.match(source, /isLikelyKeyboardSelection/);
  assert.match(source, /hasCommittedCheckPending/);
  assert.match(source, /isSuppressedRepeat/);
  assert.match(source, /isSuppressedPrepare/);
  assert.match(source, /resetSelectionTracking/);
  assert.match(source, /settingsPromise/);
  assert.match(source, /readStoredSettings/);
});

test("options page does not expose retired direct generated-audio controls", async () => {
  const html = await readText("src/options/options.html");
  const source = await readText("src/options/index.js");
  const settings = await readText("src/shared/settings.js");
  const permissions = await readText("src/permission-origins.js");

  for (const text of [html, source, settings, permissions]) {
    assert.doesNotMatch(text, /voiceService/i);
    assert.doesNotMatch(text, /voice-service/i);
    assert.doesNotMatch(text, /URL template/i);
  }
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
  const html = await readText("src/popup/popup.html");
  const source = await readText("src/popup/index.js");

  assert.match(html, /id="lookup-hints"/);
  assert.match(html, /id="open-debug"/);
  assert.match(html, /id="open-options"/);
  assert.match(source, /lookupHintsInput/);
  assert.match(source, /openDebugButton/);
  assert.match(source, /openExtensionOptions\(runtimeAdapters, \{ pageHash: "debug" \}\)/);
  assert.match(source, /openOptionsButton/);
  assert.match(source, /openExtensionOptions\(runtimeAdapters\)/);
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

test("popup source-audio failure uses speech fallback", async () => {
  const source = await readText("src/popup/index.js");
  const audioSource = await readText("src/popup/audio-playback.js");
  const resultSource = await readText("src/popup/result-renderer.js");
  const html = await readText("src/popup/popup.html");

  assert.match(html, /id="audio-list"/);
  assert.match(source, /autoSpeakPopup/);
  assert.match(source, /await speakSelection\(0\.82\)/);
  assert.match(source, /createPopupAudioPlayback/);
  assert.match(source, /from "\.\.\/result\/shared-audio\.js"/);
  assert.match(source, /sharedAudioCandidateForResult\(result, selectionInput\.value\)/);
  assert.match(source, /!options\.skipSharedAudio && isGeneratedAudioItem\(audio\) && isSharedAudioCandidate\(result\)/);
  assert.match(source, /skipSharedAudio: true/);
  assert.match(resultSource, /playbackItemsForResult/);
  assert.match(resultSource, /speakAlternate\(item\.index, 0\.82\)/);
  assert.match(resultSource, /item\.kind !== "audio"/);
  assert.match(source, /replaceCurrent: false/);
  assert.match(source, /ensureSharedAudio\(result, rate, options\)/);
  assert.match(resultSource, /playAudioItem\(item, result, 0\.82\)/);
  assert.match(source, /Audio failed\. Using speech fallback\./);
  assert.match(source, /Speaking guide\./);
  assert.match(source, /response\?\.speech\?\.fallback === "guide"/);
  assert.match(source, /const fallbackToSpeech = async \(\) =>/);
  assert.match(source, /createSpeakMessage\(text, \{/);
  assert.match(audioSource, /audioPlayer\.addEventListener\("error"/);
  assert.match(audioSource, /fallbackStarted/);
});

test("overlay source-audio failure uses speech fallback", async () => {
  const source = await readText("src/content-overlay.js");

  assert.match(source, /Audio failed\. Using speech fallback\./);
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

function manifestContentScripts(value) {
  return (value.content_scripts || [])
    .flatMap((group) => group.js || []);
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

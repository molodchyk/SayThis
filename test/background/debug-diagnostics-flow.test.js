import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDebugDiagnostics,
  summarizeAudioForDebug,
  summarizeResultForDebug,
  summarizeSpeechForDebug
} from "../../src/background/debug-diagnostics-flow.js";

test("builds speech and voice diagnostics from stored result", async () => {
  const result = {
    query: "Exampletown",
    display: "Exampletown",
    sourceForm: "Przykladowo",
    speakText: "Przykladowo",
    language: "pl",
    languageName: "Polish",
    ttsLang: "pl-PL",
    sourceStatus: "structured-source",
    pronunciation: {
      simple: "p-shih-kla-doh-voh"
    }
  };

  const diagnostics = await buildDebugDiagnostics({
    now: () => "2026-06-19T00:00:00.000Z",
    getManifest: () => ({ name: "SayThis", version: "1.0.0", manifest_version: 3 }),
    getStorage: async () => ({
      lastSelection: "Exampletown",
      lastSource: "popup",
      lastResult: result,
      settings: {
        communityAudioEnabled: true,
        communityEndpoint: "https://example.com/community"
      },
      credentials: {
        forvoApiKey: "forvo-token",
        sharedAudioGenerationToken: "ignored-legacy-token"
      },
      approvedCommunityEntries: {
        exampletown: {
          term: "Exampletown",
          sourceForm: "Przykladowo",
          language: "pl",
          ttsLang: "pl-PL",
          audioUrl: "https://example.com/audio.ogg"
        }
      },
      resultCache: {
        entries: {
          exampletown: {
            lookupKey: "exampletown",
            term: "Exampletown",
            result
          }
        }
      },
      syncQueue: [{
        id: "sub_1",
        term: "Exampletown",
        lookupKey: "exampletown",
        kind: "confirm",
        createdAt: "2026-06-19T00:00:00.000Z"
      }]
    }),
    getTtsVoices: async () => [
      { voiceName: "English Default", lang: "en-US" },
      { voiceName: "Polish Remote", lang: "pl-PL", remote: true }
    ],
    getOffscreenDebugState: async (lang) => ({
      supported: true,
      requestedLang: lang,
      voiceCount: 3,
      matchingVoiceCount: 1,
      selectedVoice: {
        name: "Polish Web",
        lang
      }
    }),
    getDebugEvents: () => [{
      at: "2026-06-19T00:00:00.000Z",
      kind: "ui:selection-auto-speak",
      trace: {
        id: "trace-1",
        source: "content-selection",
        action: "select-to-hear",
        startedAt: 1800000000000
      },
      sinceTraceStartMs: 0
    }, {
      at: "2026-06-19T00:00:00.005Z",
      kind: "audio-prepare:start",
      trace: {
        id: "trace-1",
        source: "content-selection",
        action: "select-to-hear",
        startedAt: 1800000000000
      },
      sinceTraceStartMs: 5
    }, {
      at: "2026-06-19T00:00:00.040Z",
      kind: "audio-prepare:result",
      trace: {
        id: "trace-1",
        source: "content-selection",
        action: "select-to-hear",
        startedAt: 1800000000000
      },
      sinceTraceStartMs: 40,
      elapsedMs: 35
    }, {
      at: "2026-06-19T00:00:00.042Z",
      kind: "resolve:start",
      trace: {
        id: "trace-1",
        source: "content-selection",
        action: "select-to-hear",
        startedAt: 1800000000000
      },
      sinceTraceStartMs: 42
    }, {
      at: "2026-06-19T00:00:00.210Z",
      kind: "resolve:result",
      trace: {
        id: "trace-1",
        source: "content-selection",
        action: "select-to-hear",
        startedAt: 1800000000000
      },
      sinceTraceStartMs: 210,
      elapsedMs: 168
    }, {
      at: "2026-06-19T00:00:00.220Z",
      kind: "shared-audio:start",
      trace: {
        id: "trace-1",
        source: "content-selection",
        action: "select-to-hear",
        startedAt: 1800000000000
      },
      sinceTraceStartMs: 220
    }, {
      at: "2026-06-19T00:00:00.245Z",
      kind: "shared-audio:result",
      trace: {
        id: "trace-1",
        source: "content-selection",
        action: "select-to-hear",
        startedAt: 1800000000000
      },
      sinceTraceStartMs: 245,
      elapsedMs: 25
    }, {
      at: "2026-06-19T00:00:00.247Z",
      kind: "audio:start",
      trace: {
        id: "trace-1",
        source: "content-selection",
        action: "select-to-hear",
        startedAt: 1800000000000
      },
      sinceTraceStartMs: 247
    }, {
      at: "2026-06-19T00:00:00.250Z",
      kind: "audio:result",
      trace: {
        id: "trace-1",
        source: "content-selection",
        action: "select-to-hear",
        startedAt: 1800000000000
      },
      sinceTraceStartMs: 250,
      elapsedMs: 3
    }, {
      at: "2026-06-19T00:00:05.000Z",
      kind: "online-refresh:result",
      trace: {
        id: "trace-1",
        source: "content-selection",
        action: "select-to-hear",
        startedAt: 1800000000000
      },
      sinceTraceStartMs: 5000,
      elapsedMs: 4750
    }, {
      kind: "speech:result",
      speech: {
        spoken: true
      }
    }]
  });

  assert.equal(diagnostics.generatedAt, "2026-06-19T00:00:00.000Z");
  assert.equal(diagnostics.extension.version, "1.0.0");
  assert.equal(diagnostics.storage.lastSelection, "Exampletown");
  assert.equal(diagnostics.storage.credentials.forvoApiKeyPresent, true);
  assert.equal("sharedAudioGenerationTokenPresent" in diagnostics.storage.credentials, false);
  assert.equal(diagnostics.storage.approvedEntryCount, 1);
  assert.equal(diagnostics.storage.resultCacheEntryCount, 1);
  assert.equal(diagnostics.storage.syncQueueCount, 1);
  assert.equal(diagnostics.settings.communityAudioEnabled, true);
  assert.equal(diagnostics.lastResult.sourceForm, "Przykladowo");
  assert.equal(diagnostics.speechPlan.text, "Przykladowo");
  assert.equal(diagnostics.speechPlan.lang, "pl-PL");
  assert.equal(diagnostics.speechPlan.selectedVoice, "Polish Remote");
  assert.equal(diagnostics.speechPlan.matchingVoiceCount, 1);
  assert.equal(diagnostics.offscreenSpeech.supported, true);
  assert.equal(diagnostics.offscreenSpeech.requestedLang, "pl-PL");
  assert.equal(diagnostics.offscreenSpeech.selectedVoice.name, "Polish Web");
  assert.equal(diagnostics.playback.sharedAudioCandidate, true);
  assert.equal(diagnostics.timing.audioStartMs, 250);
  assert.equal(diagnostics.timing.triggerKind, "ui:selection-auto-speak");
  assert.equal(diagnostics.timing.prepareReadyMs, 40);
  assert.equal(diagnostics.timing.prepareElapsedMs, 35);
  assert.equal(diagnostics.timing.resolveResultMs, 210);
  assert.equal(diagnostics.timing.resolveElapsedMs, 168);
  assert.equal(diagnostics.timing.sharedAudioResultMs, 245);
  assert.equal(diagnostics.timing.sharedAudioElapsedMs, 25);
  assert.equal(diagnostics.timing.audioRequestMs, 247);
  assert.equal(diagnostics.timing.audioResultMs, 250);
  assert.equal(diagnostics.timing.audioElapsedMs, 3);
  assert.equal(diagnostics.timing.onlineRefreshMs, 5000);
  assert.equal(diagnostics.timing.onlineRefreshElapsedMs, 4750);
  assert.equal(diagnostics.timing.source, "content-selection");
  assert.equal(diagnostics.recentEvents.length, 11);
});

test("summarizes debug payloads without full objects", () => {
  assert.deepEqual(summarizeAudioForDebug({
    label: "Recording",
    source: "Source",
    quality: "verified",
    url: "https://example.com/audio.ogg"
  }), {
    label: "Recording",
    source: "Source",
    quality: "verified",
    url: "https://example.com/audio.ogg"
  });

  assert.equal(summarizeResultForDebug({
    display: "Term",
    sourceForm: "Source",
    pronunciation: {
      audio: [{ url: "https://example.com/audio.ogg" }]
    }
  }).audioCount, 1);

  assert.deepEqual(summarizeSpeechForDebug({
    spoken: false,
    error: "No matching browser voice.",
    options: {
      lang: "pl-PL"
    }
  }), {
    spoken: false,
    text: "",
    fallback: "",
    error: "No matching browser voice.",
    options: {
      lang: "pl-PL",
      voiceName: "",
      rate: undefined
    }
  });
});

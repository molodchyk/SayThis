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
        sharedAudioGenerationToken: "shared-token"
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
  assert.equal(diagnostics.storage.credentials.sharedAudioGenerationTokenPresent, true);
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
  assert.equal(diagnostics.recentEvents.length, 1);
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

import assert from "node:assert/strict";
import test from "node:test";
import {
  resultWithSharedAudioEntry
} from "../../../src/background/community/shared-audio-result.js";
import {
  getBestAudio,
  hasTopTierAudio
} from "../../../src/resolver-core.js";

test("labels source-backed shared audio as top-tier", () => {
  const result = resultWithSharedAudioEntry(baseResult(), {
    term: "Exampletown",
    lookupKey: "exampletown",
    sourceForm: "Przykladowo",
    language: "pl",
    audioUrl: "https://community.example/audio/source-backed.ogg",
    sourceStatus: "verified-audio",
    trustSignals: ["source-backed", "audio-backed"]
  });

  assert.equal(result.sourceStatus, "verified-audio");
  assert.equal(getBestAudio(result).quality, "source-backed");
  assert.equal(getBestAudio(result).url, "https://community.example/audio/source-backed.ogg");
  assert.equal(hasTopTierAudio(result), true);
  assert.ok(result.trustSignals.includes("source-backed"));
});

test("labels curated shared audio above generic verified audio", () => {
  const result = resultWithSharedAudioEntry({
    ...baseResult(),
    pronunciation: {
      audio: [{
        url: "https://dictionary.example/generic.ogg",
        label: "Dictionary recording",
        source: "Dictionary",
        quality: "verified"
      }]
    }
  }, {
    term: "Exampletown",
    lookupKey: "exampletown",
    sourceForm: "Przykladowo",
    language: "pl",
    audioUrl: "https://community.example/audio/curated.ogg",
    sourceStatus: "verified-audio",
    trustSignals: ["curator-reviewed", "audio-backed"]
  });

  assert.equal(getBestAudio(result).quality, "curated");
  assert.equal(getBestAudio(result).url, "https://community.example/audio/curated.ogg");
  assert.deepEqual(result.pronunciation.audio.map((item) => item.quality), ["curated", "verified"]);
});

test("keeps generated shared audio as generated fallback", () => {
  const result = resultWithSharedAudioEntry(baseResult(), {
    term: "Exampletown",
    lookupKey: "exampletown",
    sourceForm: "Przykladowo",
    language: "pl",
    audioUrl: "https://community.example/audio/generated.ogg",
    sourceStatus: "generated-audio",
    trustSignals: ["service-generated", "generated-audio", "audio-backed", "source-backed"]
  });

  assert.equal(result.sourceStatus, "generated-audio");
  assert.equal(getBestAudio(result).quality, "generated");
  assert.equal(hasTopTierAudio(result), false);
});

function baseResult() {
  return {
    query: "Exampletown",
    display: "Exampletown",
    sourceForm: "Przykladowo",
    language: "pl",
    ttsLang: "pl-PL",
    sourceStatus: "structured-source"
  };
}

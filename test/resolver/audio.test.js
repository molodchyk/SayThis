import assert from "node:assert/strict";
import test from "node:test";
import {
  getBestAudio,
  hasGeneratedAudio,
  hasPreferredAudio,
  hasTopTierAudio,
  rankedAudioItems
} from "../../src/resolver-core.js";
import {
  getBestAudio as getBestAudioDirect,
  hasGeneratedAudio as hasGeneratedAudioDirect,
  hasPreferredAudio as hasPreferredAudioDirect,
  hasTopTierAudio as hasTopTierAudioDirect,
  mapResultAudioUrls as mapResultAudioUrlsDirect,
  mergeAudioItems,
  normalizePronunciation,
  rankedAudioItems as rankedAudioItemsDirect
} from "../../src/resolver/audio.js";

test("ranks curated and native audio ahead of generic verified sources", () => {
  const pronunciation = normalizePronunciation({
    ipa: "/a/",
    audio: [
      { url: "https://voice.example/a.ogg", label: " Generated ", source: " Voice service ", quality: "generated" },
      { url: " assets/audio/public/a-curated.ogg ", label: " Curated pronunciation ", source: " SayThis ", quality: "curated" },
      { url: " assets/audio/public/a.ogg ", label: " One ", source: " Local ", quality: "verified" },
      { url: "https://forvo.example/a.ogg", label: " Forvo ", source: " Forvo ", quality: "verified" },
      { url: "", label: "empty" }
    ]
  });

  assert.equal(pronunciation.ipa, "/a/");
  assert.equal(pronunciation.audio.length, 4);
  assert.equal(pronunciation.audio[0].url, "assets/audio/public/a-curated.ogg");
  assert.equal(pronunciation.audio[3].quality, "generated");
  assert.equal(getBestAudioDirect({ pronunciation }).url, "assets/audio/public/a-curated.ogg");
  assert.equal(getBestAudio({ pronunciation }).url, "assets/audio/public/a-curated.ogg");
  assert.equal(hasPreferredAudioDirect({ pronunciation }), true);
  assert.equal(hasPreferredAudio({ pronunciation }), true);
  assert.equal(hasTopTierAudioDirect({ pronunciation }), true);
  assert.equal(hasTopTierAudio({ pronunciation }), true);
  assert.deepEqual(rankedAudioItems(pronunciation.audio).map((item) => item.quality), ["curated", "verified", "verified", "generated"]);
  assert.deepEqual(rankedAudioItemsDirect(pronunciation.audio).map((item) => item.quality), ["curated", "verified", "verified", "generated"]);

  const mapped = mapResultAudioUrlsDirect({ pronunciation }, (url) => `chrome-extension://id/${url}`);

  assert.equal(mapped.pronunciation.audio[0].url, "chrome-extension://id/assets/audio/public/a-curated.ogg");
  assert.equal(mergeAudioItems([pronunciation.audio[0]], [pronunciation.audio[0]]).length, 1);
});

test("treats native-speaker quality labels as stronger than generic verified audio", () => {
  const pronunciation = normalizePronunciation({
    audio: [
      { url: "https://forvo.example/a.ogg", source: "Forvo", quality: "native-speaker" },
      { url: "https://example.com/native.ogg", source: "Archive", quality: "native speaker" }
    ]
  });

  assert.equal(getBestAudioDirect({ pronunciation }).url, "https://forvo.example/a.ogg");
});

test("ranks source-backed audio ahead of generic verified audio", () => {
  const pronunciation = normalizePronunciation({
    audio: [
      { url: "https://commons.example/generic.ogg", source: "Wikimedia Commons", quality: "verified" },
      { url: "https://commons.example/guide.ogg", source: "Wikimedia Commons pronunciation guide", quality: "source-backed" },
      { url: "https://archive.example/recorded.ogg", source: "Archive recording", quality: "recorded" }
    ]
  });

  assert.deepEqual(pronunciation.audio.map((item) => item.quality), ["source-backed", "recorded", "verified"]);
  assert.equal(getBestAudioDirect({ pronunciation }).url, "https://commons.example/guide.ogg");
  assert.equal(hasPreferredAudioDirect({ pronunciation }), true);
  assert.equal(hasTopTierAudioDirect({ pronunciation }), true);
  assert.equal(hasTopTierAudio({ pronunciation }), true);
  assert.equal(hasTopTierAudioDirect({
    pronunciation: {
      audio: [{ url: "https://commons.example/generic.ogg", quality: "verified" }]
    }
  }), false);
});

test("does not treat generated audio as preferred audio", () => {
  const result = {
    sourceStatus: "generated-audio",
    pronunciation: {
      audio: [{
        url: "https://voice.example/a.ogg",
        source: "Voice service",
        quality: "generated"
      }]
    }
  };

  assert.equal(hasPreferredAudioDirect(result), false);
  assert.equal(hasPreferredAudio(result), false);
  assert.equal(hasTopTierAudioDirect(result), false);
  assert.equal(hasTopTierAudio(result), false);
  assert.equal(hasGeneratedAudioDirect(result), true);
  assert.equal(hasGeneratedAudio(result), true);
});

test("does not treat empty generated-audio status as reusable generated audio", () => {
  assert.equal(hasGeneratedAudioDirect({
    sourceStatus: "generated-audio",
    pronunciation: {
      audio: []
    }
  }), false);
});

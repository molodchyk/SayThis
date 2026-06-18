import assert from "node:assert/strict";
import test from "node:test";
import {
  getBestAudio,
  rankedAudioItems
} from "../../src/resolver-core.js";
import {
  getBestAudio as getBestAudioDirect,
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
  assert.deepEqual(rankedAudioItems(pronunciation.audio).map((item) => item.quality), ["curated", "verified", "verified", "generated"]);
  assert.deepEqual(rankedAudioItemsDirect(pronunciation.audio).map((item) => item.quality), ["curated", "verified", "verified", "generated"]);

  const mapped = mapResultAudioUrlsDirect({ pronunciation }, (url) => `chrome-extension://id/${url}`);

  assert.equal(mapped.pronunciation.audio[0].url, "chrome-extension://id/assets/audio/public/a-curated.ogg");
  assert.equal(mergeAudioItems([pronunciation.audio[0]], [pronunciation.audio[0]]).length, 1);
});

test("treats native-speaker quality labels as stronger than generic verified audio", () => {
  const pronunciation = normalizePronunciation({
    audio: [
      { url: "https://forvo.example/a.ogg", source: "Forvo", quality: "verified" },
      { url: "https://example.com/native.ogg", source: "Archive", quality: "native speaker" }
    ]
  });

  assert.equal(getBestAudioDirect({ pronunciation }).url, "https://example.com/native.ogg");
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  shouldRefreshBeforeSpeech
} from "../../src/popup/speech-refresh.js";

test("does not refresh speech when a result already has top-tier audio", () => {
  assert.equal(shouldRefreshBeforeSpeech({
    pronunciation: {
      audio: [{ url: "https://example.test/audio.ogg", quality: "native-speaker" }]
    }
  }), false);
});

test("refreshes generic verified audio before speech", () => {
  assert.equal(shouldRefreshBeforeSpeech({
    display: "Exampleterm",
    pronunciation: {
      audio: [{ url: "https://example.test/audio.ogg", quality: "verified" }]
    }
  }), true);
});

test("refreshes speech when only a guide can be spoken", () => {
  assert.equal(shouldRefreshBeforeSpeech({
    display: "Exampleterm",
    pronunciation: {
      simple: "eg-ZAM-pluh-term"
    }
  }), true);
});

test("refreshes generated audio before speech so recordings can replace it", () => {
  assert.equal(shouldRefreshBeforeSpeech({
    display: "Exampleterm",
    sourceStatus: "generated-audio",
    pronunciation: {
      audio: [{
        url: "https://voice.example/generated.ogg",
        quality: "generated"
      }]
    }
  }), true);
});

test("refreshes best-effort fallback even when a guide exists", () => {
  assert.equal(shouldRefreshBeforeSpeech({
    display: "PNL",
    sourceStatus: "best-effort-fallback",
    pronunciation: {
      simple: "P N L"
    }
  }), true);
});

test("refreshes speech when no playback path exists yet", () => {
  assert.equal(shouldRefreshBeforeSpeech({
    display: "Exampleterm",
    pronunciation: {}
  }), true);
});

test("does not refresh empty speech state", () => {
  assert.equal(shouldRefreshBeforeSpeech(null), false);
});

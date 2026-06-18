import assert from "node:assert/strict";
import test from "node:test";
import {
  shouldRefreshBeforeSpeech
} from "../../src/popup/speech-refresh.js";

test("does not refresh speech when a result already has audio", () => {
  assert.equal(shouldRefreshBeforeSpeech({
    pronunciation: {
      audio: [{ url: "https://example.test/audio.ogg" }]
    }
  }), false);
});

test("does not refresh speech when a guide can be spoken", () => {
  assert.equal(shouldRefreshBeforeSpeech({
    pronunciation: {
      simple: "eg-ZAM-pluh-term"
    }
  }), false);
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

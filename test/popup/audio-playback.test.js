import assert from "node:assert/strict";
import test from "node:test";
import {
  createPopupAudioPlayback,
  playbackRateForSpeechRate
} from "../../src/popup/audio-playback.js";

test("maps speech rates to browser audio playback rates", () => {
  assert.equal(playbackRateForSpeechRate(0.62), 0.75);
  assert.equal(playbackRateForSpeechRate(0.7), 1);
  assert.equal(playbackRateForSpeechRate(0.82), 1);
});

test("plays audio URLs and stops the previous player", async () => {
  const players = [];
  class AudioStub {
    constructor(url) {
      this.url = url;
      this.currentTime = 12;
      this.events = {};
      this.paused = false;
      players.push(this);
    }

    addEventListener(name, callback, options) {
      this.events[name] = { callback, options };
    }

    play() {
      return Promise.resolve();
    }

    pause() {
      this.paused = true;
    }
  }

  const playback = createPopupAudioPlayback({ AudioCtor: AudioStub });

  assert.equal(playback.playUrl("https://example.test/one.ogg", 0.62), true);
  assert.equal(players[0].playbackRate, 0.75);
  assert.deepEqual(players[0].events.error.options, { once: true });
  assert.equal(playback.playUrl("https://example.test/two.ogg", 0.82), true);
  assert.equal(players[0].paused, true);
  assert.equal(players[0].currentTime, 0);
  assert.equal(players[1].playbackRate, 1);

  playback.stop();
  assert.equal(players[1].paused, true);
  assert.equal(players[1].currentTime, 0);
});

test("runs fallback once when browser audio fails", async () => {
  let fallbackCount = 0;
  let player;
  class AudioStub {
    constructor() {
      this.events = {};
      player = this;
    }

    addEventListener(name, callback) {
      this.events[name] = callback;
    }

    play() {
      return Promise.reject(new Error("blocked"));
    }

    pause() {}
  }

  const playback = createPopupAudioPlayback({ AudioCtor: AudioStub });

  assert.equal(playback.playUrl("https://example.test/audio.ogg", 0.82, () => {
    fallbackCount += 1;
  }), true);
  await Promise.resolve();
  player.events.error();

  assert.equal(fallbackCount, 1);
});

test("rejects missing audio inputs", () => {
  const playback = createPopupAudioPlayback({ AudioCtor: null });

  assert.equal(playback.playUrl("", 0.82), false);
  assert.equal(playback.playUrl("https://example.test/audio.ogg", 0.82), false);
});

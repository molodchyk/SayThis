import assert from "node:assert/strict";
import test from "node:test";
import {
  setTimeout as delay
} from "node:timers/promises";
import vm from "node:vm";
import {
  createFakeDom,
  flushPromises,
  overlaySource,
  resultViewSource
} from "../../test-support/content/overlay-test-harness.js";

test("source-form playback row sends a speak message", async () => {
  const sentMessages = [];
  const fakeDom = createFakeDom();
  let showResultListener;

  const context = vm.createContext({
    Audio: class {
      constructor() {
        throw new Error("source-form speech should not construct audio");
      }
    },
    URL,
    document: fakeDom.document,
    window: {}
  });

  context.__sayThisOverlayStyles = "";
  context.__sayThisOverlayRuntimeAdapters = {
    addShowResultListener(listener) {
      showResultListener = listener;
      return true;
    },
    createOverlayRuntimeAdapters() {
      return { surface: "content" };
    },
    async sendRuntimeMessage(message, dependencies) {
      sentMessages.push({ message, dependencies });
      return {
        ok: true,
        speech: {
          text: message.result?.speakText || message.text
        }
      };
    }
  };

  vm.runInContext(resultViewSource, context);
  vm.runInContext(overlaySource, context);

  assert.equal(typeof showResultListener, "function");

  showResultListener({
    query: "Exampletown",
    display: "Exampletown",
    sourceForm: "Przykladowo",
    language: "pl",
    ttsLang: "pl-PL",
    pronunciation: {
      simple: "p-shih-kla-doh-voh"
    }
  }, { onlineChecked: true });

  const buttons = fakeDom.root.querySelectorAll('[data-action="recording"]');
  assert.equal(buttons.length, 2);

  buttons[0].click();
  await Promise.resolve();

  assert.equal(sentMessages.length, 1);
  assert.equal(sentMessages[0].message.type, "SAYTHIS_SPEAK");
  assert.equal(sentMessages[0].message.text, "Exampletown");
  assert.equal(sentMessages[0].message.result.speakText, "Przykladowo");
  assert.equal(sentMessages[0].message.result.ttsLang, "pl-PL");
  assert.equal(sentMessages[0].message.rate, 0.82);
  assert.deepEqual(sentMessages[0].dependencies, { surface: "content" });
});

test("alternate playback prefers source-form speech before guide speech", async () => {
  const sentMessages = [];
  const fakeDom = createFakeDom();
  let showResultListener;

  const context = vm.createContext({
    Audio: class {
      constructor() {
        throw new Error("alternate speech should not construct audio");
      }
    },
    URL,
    document: fakeDom.document,
    window: {}
  });

  context.__sayThisOverlayStyles = "";
  context.__sayThisOverlayRuntimeAdapters = {
    addShowResultListener(listener) {
      showResultListener = listener;
      return true;
    },
    createOverlayRuntimeAdapters() {
      return { surface: "content" };
    },
    async sendRuntimeMessage(message, dependencies) {
      sentMessages.push({ message, dependencies });
      return {
        ok: true,
        speech: {
          text: message.result?.speakText || message.text
        }
      };
    }
  };

  vm.runInContext(resultViewSource, context);
  vm.runInContext(overlaySource, context);

  showResultListener({
    query: "Exampletown",
    display: "Exampletown",
    sourceForm: "Exampletown",
    alternateResults: [{
      display: "Exampletown",
      sourceForm: "Przykladowo",
      language: "pl",
      ttsLang: "pl-PL",
      pronunciation: {
        simple: "p-shih-kla-doh-voh"
      }
    }]
  }, { onlineChecked: true });

  const buttons = fakeDom.root.querySelectorAll('[data-action="alternate"]');
  assert.equal(buttons.length, 1);

  buttons[0].click();
  await Promise.resolve();

  assert.equal(sentMessages.length, 1);
  assert.equal(sentMessages[0].message.type, "SAYTHIS_SPEAK");
  assert.equal(sentMessages[0].message.result.speakText, "Przykladowo");
  assert.equal(sentMessages[0].message.result.ttsLang, "pl-PL");
});

test("alternate playback uses alternate recording before speech", async () => {
  const sentMessages = [];
  const playedUrls = [];
  const fakeDom = createFakeDom();
  let showResultListener;

  const context = vm.createContext({
    Audio: class {
      constructor(url) { this.url = url; }
      addEventListener() {}
      pause() {}
      play() { playedUrls.push(this.url); return Promise.resolve(); }
    },
    URL,
    document: fakeDom.document,
    window: {}
  });

  context.__sayThisOverlayStyles = "";
  context.__sayThisOverlayRuntimeAdapters = {
    addShowResultListener(listener) {
      showResultListener = listener;
      return true;
    },
    async sendRuntimeMessage() {
      sentMessages.push("unexpected");
      return { ok: true };
    }
  };

  vm.runInContext(resultViewSource, context);
  vm.runInContext(overlaySource, context);

  showResultListener({
    query: "Exampletown",
    display: "Exampletown",
    sourceForm: "Exampletown",
    alternateResults: [{
      display: "Exampletown",
      sourceForm: "Przykladowo",
      pronunciation: {
        audio: [{
          label: "Native recording",
          url: "https://audio.example/przykladowo-native.ogg",
          quality: "native-speaker"
        }]
      }
    }]
  }, { onlineChecked: true });

  fakeDom.root.querySelectorAll('[data-action="alternate"]')[0].click();
  await flushPromises();

  assert.deepEqual(playedUrls, ["https://audio.example/przykladowo-native.ogg"]);
  assert.deepEqual(sentMessages, []);
});

test("alternate shared audio playback keeps the primary result visible", async () => {
  const sentMessages = [];
  const fakeDom = createFakeDom();
  let showResultListener;

  const context = vm.createContext({
    Audio: class {
      constructor() {
        throw new Error("shared generated audio should use extension-owned playback");
      }
    },
    URL,
    document: fakeDom.document,
    window: {}
  });

  context.__sayThisOverlayStyles = "";
  context.__sayThisOverlayRuntimeAdapters = {
    addShowResultListener(listener) {
      showResultListener = listener;
      return true;
    },
    createOverlayRuntimeAdapters() {
      return { surface: "content" };
    },
    async sendRuntimeMessage(message, dependencies) {
      sentMessages.push({ message, dependencies });
      if (message.type === "SAYTHIS_REQUEST_SHARED_AUDIO") {
        return {
          ok: true,
          result: {
            ...message.result,
            pronunciation: {
              audio: [{
                label: "Shared generated audio",
                url: "https://audio.example/alternate-shared.ogg",
                quality: "generated"
              }]
            }
          }
        };
      }

      return { ok: true };
    }
  };

  vm.runInContext(resultViewSource, context);
  vm.runInContext(overlaySource, context);

  showResultListener({
    query: "P&L",
    display: "P&L",
    sourceForm: "P&L",
    sourceStatus: "structured-source",
    alternateResults: [{
      query: "P&L",
      display: "P&L",
      sourceForm: "P N L",
      language: "en",
      ttsLang: "en-US",
      sourceStatus: "structured-source"
    }]
  }, { onlineChecked: true });
  const initialHtml = fakeDom.root.innerHTML;

  fakeDom.root.querySelectorAll('[data-action="alternate"]')[0].click();
  await flushPromises();

  assert.deepEqual(sentMessages.map((item) => item.message.type), [
    "SAYTHIS_REQUEST_SHARED_AUDIO",
    "SAYTHIS_PLAY_AUDIO"
  ]);
  assert.equal(sentMessages[0].message.result.sourceForm, "P N L");
  assert.equal(sentMessages[1].message.audio.url, "https://audio.example/alternate-shared.ogg");
  assert.equal(fakeDom.root.innerHTML, initialHtml);
});

test("speak action requests shared audio before generated playback", async () => {
  const sentMessages = [];
  const fakeDom = createFakeDom();
  let showResultListener;

  const context = vm.createContext({
    Audio: class {
      constructor() {
        throw new Error("generated audio should use extension-owned playback");
      }
    },
    URL,
    document: fakeDom.document,
    window: {}
  });

  context.__sayThisOverlayStyles = "";
  context.__sayThisOverlayRuntimeAdapters = {
    addShowResultListener(listener) {
      showResultListener = listener;
      return true;
    },
    createOverlayRuntimeAdapters() {
      return { surface: "content" };
    },
    async sendRuntimeMessage(message, dependencies) {
      sentMessages.push({ message, dependencies });
      if (message.type === "SAYTHIS_REQUEST_SHARED_AUDIO") {
        return {
          ok: true,
          result: {
            ...message.result,
            pronunciation: {
              audio: [{
                label: "Shared generated audio",
                url: "https://audio.example/shared.ogg",
                quality: "generated"
              }]
            }
          }
        };
      }

      return { ok: true };
    }
  };

  vm.runInContext(resultViewSource, context);
  vm.runInContext(overlaySource, context);

  showResultListener(generatedResult(), { onlineChecked: true });
  fakeDom.root.querySelector('[data-action="speak"]').click();
  await flushPromises();

  assert.equal(sentMessages[0].message.type, "SAYTHIS_REQUEST_SHARED_AUDIO");
  assert.equal(sentMessages[0].message.result.sourceForm, "Przykladowo");
  assert.equal(sentMessages[1].message.type, "SAYTHIS_PLAY_AUDIO");
  assert.equal(sentMessages[1].message.audio.url, "https://audio.example/shared.ogg");
  assert.deepEqual(sentMessages[0].dependencies, { surface: "content" });
});

test("speak action requests shared audio for same-language source-form differences", async () => {
  const sentMessages = [];
  const fakeDom = createFakeDom();
  let showResultListener;

  const context = vm.createContext({
    Audio: class {
      constructor() {
        throw new Error("shared generated audio should use extension-owned playback");
      }
    },
    URL,
    document: fakeDom.document,
    window: {}
  });

  context.__sayThisOverlayStyles = "";
  context.__sayThisOverlayRuntimeAdapters = {
    addShowResultListener(listener) {
      showResultListener = listener;
      return true;
    },
    createOverlayRuntimeAdapters() {
      return { surface: "content" };
    },
    async sendRuntimeMessage(message, dependencies) {
      sentMessages.push({ message, dependencies });
      if (message.type === "SAYTHIS_REQUEST_SHARED_AUDIO") {
        return {
          ok: true,
          result: {
            ...message.result,
            pronunciation: {
              audio: [{
                label: "Shared generated audio",
                url: "https://audio.example/shared-abbrev.ogg",
                quality: "generated"
              }]
            }
          }
        };
      }

      return { ok: true };
    }
  };

  vm.runInContext(resultViewSource, context);
  vm.runInContext(overlaySource, context);

  showResultListener({
    query: "P&L",
    display: "P&L",
    sourceForm: "P N L",
    language: "en",
    ttsLang: "en-US",
    sourceStatus: "structured-source"
  }, { onlineChecked: true });
  fakeDom.root.querySelector('[data-action="speak"]').click();
  await flushPromises();

  assert.deepEqual(sentMessages.map((item) => item.message.type), [
    "SAYTHIS_REQUEST_SHARED_AUDIO",
    "SAYTHIS_PLAY_AUDIO"
  ]);
  assert.equal(sentMessages[0].message.text, "P&L");
  assert.equal(sentMessages[0].message.result.sourceForm, "P N L");
  assert.equal(sentMessages[0].message.result.ttsLang, "en-US");
  assert.equal(sentMessages[1].message.audio.url, "https://audio.example/shared-abbrev.ogg");
  assert.deepEqual(sentMessages[0].dependencies, { surface: "content" });
});

test("speak action falls back to source-form speech when shared audio wait expires", async () => {
  const sentMessages = [];
  const fakeDom = createFakeDom();
  let showResultListener;

  const context = vm.createContext({
    Audio: class {
      constructor() {
        throw new Error("source-form speech should not construct audio");
      }
    },
    clearTimeout,
    setTimeout,
    URL,
    document: fakeDom.document,
    window: {}
  });

  context.__sayThisSharedAudioUiWaitMs = 1;
  context.__sayThisOverlayStyles = "";
  context.__sayThisOverlayRuntimeAdapters = {
    addShowResultListener(listener) {
      showResultListener = listener;
      return true;
    },
    createOverlayRuntimeAdapters() {
      return { surface: "content" };
    },
    async sendRuntimeMessage(message, dependencies) {
      sentMessages.push({ message, dependencies });
      if (message.type === "SAYTHIS_REQUEST_SHARED_AUDIO") {
        return new Promise(() => {});
      }

      return {
        ok: true,
        speech: {
          text: message.result?.sourceForm || message.text
        }
      };
    }
  };

  vm.runInContext(resultViewSource, context);
  vm.runInContext(overlaySource, context);

  showResultListener({
    query: "Exampletown",
    display: "Exampletown",
    sourceForm: "Przykladowo",
    language: "pl",
    ttsLang: "pl-PL",
    sourceStatus: "structured-source"
  }, { onlineChecked: true });
  fakeDom.root.querySelector('[data-action="speak"]').click();
  await delay(10);
  await flushPromises();

  assert.deepEqual(sentMessages.map((item) => item.message.type), [
    "SAYTHIS_REQUEST_SHARED_AUDIO",
    "SAYTHIS_SPEAK"
  ]);
  assert.equal(sentMessages[1].message.skipSharedAudio, true);
  assert.equal(sentMessages[1].message.result.sourceForm, "Przykladowo");
  assert.deepEqual(sentMessages[1].dependencies, { surface: "content" });
});

test("generated recording row requests shared audio before playback", async () => {
  const sentMessages = [];
  const fakeDom = createFakeDom();
  let showResultListener;

  const context = vm.createContext({
    Audio: class {
      constructor() {
        throw new Error("generated audio should use extension-owned playback");
      }
    },
    URL,
    document: fakeDom.document,
    window: {}
  });

  context.__sayThisOverlayStyles = "";
  context.__sayThisOverlayRuntimeAdapters = {
    addShowResultListener(listener) {
      showResultListener = listener;
      return true;
    },
    createOverlayRuntimeAdapters() {
      return { surface: "content" };
    },
    async sendRuntimeMessage(message) {
      sentMessages.push({ message });
      if (message.type === "SAYTHIS_REQUEST_SHARED_AUDIO") {
        return {
          ok: true,
          result: {
            ...message.result,
            pronunciation: {
              audio: [{
                label: "Shared generated audio",
                url: "https://audio.example/shared.ogg",
                quality: "generated"
              }]
            }
          }
        };
      }

      return { ok: true };
    }
  };

  vm.runInContext(resultViewSource, context);
  vm.runInContext(overlaySource, context);

  showResultListener(generatedResult(), { onlineChecked: true });
  fakeDom.root.querySelectorAll('[data-action="recording"]')[0].click();
  await flushPromises();

  assert.deepEqual(sentMessages.map((item) => item.message.type), [
    "SAYTHIS_REQUEST_SHARED_AUDIO",
    "SAYTHIS_PLAY_AUDIO"
  ]);
  assert.equal(sentMessages[1].message.audio.url, "https://audio.example/shared.ogg");
});

test("generated audio does not prefill correction audio source", () => {
  const fakeDom = createFakeDom();
  let showResultListener;

  const context = vm.createContext({
    Audio: class {},
    URL,
    document: fakeDom.document,
    window: {}
  });

  context.__sayThisOverlayStyles = "";
  context.__sayThisOverlayRuntimeAdapters = {
    addShowResultListener(listener) {
      showResultListener = listener;
      return true;
    },
    createOverlayRuntimeAdapters() {
      return {};
    },
    async sendRuntimeMessage() {
      return { ok: true };
    }
  };

  vm.runInContext(resultViewSource, context);
  vm.runInContext(overlaySource, context);

  showResultListener(generatedResult(), { onlineChecked: true });

  assert.match(fakeDom.root.innerHTML, /data-correction-field="audioUrl"[^>]*value=""/);
  assert.doesNotMatch(fakeDom.root.innerHTML, /value="https:\/\/voice\.example\/generated\.ogg"/);
});

test("speak action plays shared audio before refreshing generated audio", async () => {
  const sentMessages = [];
  const fakeDom = createFakeDom();
  let showResultListener;

  const context = vm.createContext({
    Audio: class {
      constructor() {
        throw new Error("generated audio should use extension-owned playback");
      }
    },
    URL,
    document: fakeDom.document,
    window: {}
  });

  context.__sayThisOverlayStyles = "";
  context.__sayThisOverlayRuntimeAdapters = {
    addShowResultListener(listener) {
      showResultListener = listener;
      return true;
    },
    createOverlayRuntimeAdapters() {
      return { surface: "content" };
    },
    async sendRuntimeMessage(message) {
      sentMessages.push({ message });
      if (message.type === "SAYTHIS_RESOLVE") {
        return {
          ok: true,
          result: generatedResult()
        };
      }

      if (message.type === "SAYTHIS_REQUEST_SHARED_AUDIO") {
        return {
          ok: true,
          result: {
            ...message.result,
            pronunciation: {
              audio: [{
                label: "Shared generated audio",
                url: "https://audio.example/shared.ogg",
                quality: "generated"
              }]
            }
          }
        };
      }

      return { ok: true };
    }
  };

  vm.runInContext(resultViewSource, context);
  vm.runInContext(overlaySource, context);

  showResultListener(generatedResult(), { onlineChecked: false });
  fakeDom.root.querySelector('[data-action="speak"]').click();
  await flushPromises();

  assert.deepEqual(sentMessages.map((item) => item.message.type), [
    "SAYTHIS_REQUEST_SHARED_AUDIO",
    "SAYTHIS_PLAY_AUDIO"
  ]);
});

function generatedResult() {
  return {
    query: "Exampletown",
    display: "Exampletown",
    sourceForm: "Przykladowo",
    language: "pl",
    ttsLang: "pl-PL",
    sourceStatus: "generated-audio",
    pronunciation: {
      audio: [{
        label: "Generated audio",
        url: "https://voice.example/generated.ogg",
        quality: "generated"
      }]
    }
  };
}

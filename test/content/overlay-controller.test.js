import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import vm from "node:vm";

const resultViewSource = await readFile(join(process.cwd(), "src/content/overlay-result-view.js"), "utf8");
const overlaySource = await readFile(join(process.cwd(), "src/content-overlay.js"), "utf8");

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

test("speak action refreshes generated audio before shared playback", async () => {
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
    "SAYTHIS_RESOLVE",
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

function createFakeDom() {
  const state = {
    root: null
  };

  const document = {
    createElement(tagName) {
      return {
        tagName,
        attachShadow() {
          state.root = new FakeRoot();
          return state.root;
        },
        remove() {}
      };
    },
    documentElement: {
      append() {}
    }
  };

  return {
    get root() {
      return state.root;
    },
    document
  };
}

async function flushPromises(turns = 6) {
  for (let index = 0; index < turns; index += 1) {
    await Promise.resolve();
  }
}

class FakeRoot {
  constructor() {
    this.elements = new Map();
    this.recordingButtons = [];
    this.alternateButtons = [];
    this.correctionFields = [];
    this.html = "";
  }

  set innerHTML(value) {
    this.html = String(value || "");
    this.elements = new Map([
      [".close", new FakeElement()],
      [".status", new FakeElement()],
      ["[data-action=\"speak\"]", new FakeElement()],
      ["[data-action=\"online\"]", new FakeElement()],
      ["[data-action=\"slow\"]", new FakeElement()],
      ["[data-action=\"correct\"]", new FakeElement()],
      ["[data-action=\"confirm\"]", new FakeElement()],
      ["[data-action=\"missing\"]", new FakeElement()],
      ["[data-action=\"wrong\"]", new FakeElement()],
      ["[data-action=\"cancel-correction\"]", new FakeElement()],
      ["[data-correction]", new FakeFormElement()],
      ["[data-lookup-hints]", new FakeElement()]
    ]);
    this.recordingButtons = [...this.html.matchAll(/data-action="recording" data-audio-index="(\d+)"/g)]
      .map((match) => new FakeElement({ audioIndex: match[1] }));
    this.alternateButtons = [...this.html.matchAll(/data-action="alternate" data-alternate-index="(\d+)"/g)]
      .map((match) => new FakeElement({ alternateIndex: match[1] }));
    this.correctionFields = [...this.html.matchAll(/data-correction-field="([^"]+)"/g)]
      .map((match) => new FakeElement({ correctionField: match[1] }));
  }

  get innerHTML() {
    return this.html;
  }

  querySelector(selector) {
    return this.elements.get(selector) || null;
  }

  querySelectorAll(selector) {
    if (selector === '[data-action="recording"]') {
      return this.recordingButtons;
    }

    if (selector === '[data-action="alternate"]') {
      return this.alternateButtons;
    }

    if (selector === "[data-correction-field]") {
      return this.correctionFields;
    }

    return [];
  }
}

class FakeElement {
  constructor(dataset = {}) {
    this.dataset = dataset;
    this.events = {};
    this.hidden = false;
    this.textContent = "";
    this.value = "";
  }

  addEventListener(name, callback) {
    this.events[name] = callback;
  }

  click() {
    this.events.click?.({
      preventDefault() {}
    });
  }

  focus() {}
}

class FakeFormElement extends FakeElement {
  querySelector() {
    return new FakeElement();
  }
}

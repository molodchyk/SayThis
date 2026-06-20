import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import test from "node:test";

const root = fileURLToPath(new URL("..", import.meta.url));

test("committed selection sends prepare and speak with one trace", async () => {
  const harness = await installSelectionListener();

  harness.setSelection("Exampletown");
  harness.dispatch("pointerup");
  await delay(25);

  assert.deepEqual(harness.sentMessages.map((message) => message.type), [
    "SAYTHIS_PREPARE_PLAYBACK",
    "SAYTHIS_SPEAK"
  ]);
  assert.equal(harness.sentMessages[0].text, "Exampletown");
  assert.equal(harness.sentMessages[1].text, "Exampletown");
  assert.equal(harness.sentMessages[0].rate, 0.82);
  assert.equal(harness.sentMessages[1].rate, 0.82);
  assert.equal(harness.sentMessages[0].trace.id, harness.sentMessages[1].trace.id);
});

test("committed selection trims adjacent sentence punctuation before speaking", async () => {
  const harness = await installSelectionListener();

  harness.setSelection('"Exampletown,"');
  harness.dispatch("pointerup");
  await delay(25);

  assert.deepEqual(harness.sentMessages.map((message) => [message.type, message.text || ""]), [
    ["SAYTHIS_PREPARE_PLAYBACK", "Exampletown"],
    ["SAYTHIS_SPEAK", "Exampletown"]
  ]);
});

test("committed selection preserves internal symbol terms while trimming wrappers", async () => {
  const harness = await installSelectionListener();

  harness.setSelection("(P&L),");
  harness.dispatch("pointerup");
  await delay(25);

  assert.deepEqual(harness.sentMessages.map((message) => [message.type, message.text || ""]), [
    ["SAYTHIS_PREPARE_PLAYBACK", "P&L"],
    ["SAYTHIS_SPEAK", "P&L"]
  ]);
});

test("committed selection speaks without waiting for a timer tick", async () => {
  const harness = await installSelectionListener();

  harness.setSelection("Exampletown");
  harness.dispatch("pointerup");
  await Promise.resolve();
  await Promise.resolve();

  assert.deepEqual(harness.sentMessages.map((message) => message.type), [
    "SAYTHIS_PREPARE_PLAYBACK",
    "SAYTHIS_SPEAK"
  ]);
});

test("committed selection trace starts at the pointer gesture", async () => {
  let now = 1000;
  const harness = await installSelectionListener({
    Date: {
      now: () => now
    }
  });

  harness.dispatch("pointerdown");
  now = 1040;
  harness.setSelection("Exampletown");
  harness.dispatch("pointerup");
  await Promise.resolve();
  await Promise.resolve();

  const speakMessage = harness.sentMessages.find((message) => message.type === "SAYTHIS_SPEAK");

  assert.equal(speakMessage.trace.startedAt, 1000);
});

test("native select event speaks textarea selection", async () => {
  const harness = await installSelectionListener();

  harness.setActiveElement({
    tagName: "textarea",
    value: "Practice Chiaroscuro today",
    selectionStart: 9,
    selectionEnd: 20
  });
  harness.dispatch("select");
  await Promise.resolve();
  await Promise.resolve();

  assert.deepEqual(harness.sentMessages.map((message) => [message.type, message.text || ""]), [
    ["SAYTHIS_PREPARE_PLAYBACK", "Chiaroscuro"],
    ["SAYTHIS_SPEAK", "Chiaroscuro"]
  ]);
});

test("overlay events do not prime playback", async () => {
  const harness = await installSelectionListener();
  const target = overlayNode("button");

  harness.dispatch("pointerdown", { target });
  harness.dispatch("selectstart", { target });
  harness.dispatch("keydown", { target, key: "ArrowRight", shiftKey: true });
  await delay(25);

  assert.deepEqual(harness.sentMessages, []);
});

test("overlay editable selections do not speak", async () => {
  const harness = await installSelectionListener();
  const target = {
    ...overlayNode("textarea"),
    value: "Practice Chiaroscuro today",
    selectionStart: 9,
    selectionEnd: 20
  };

  harness.setActiveElement(target);
  harness.dispatch("select", { target });
  await Promise.resolve();
  await Promise.resolve();

  assert.deepEqual(harness.sentMessages, []);
});

test("committed selection does not wait for an unresolved settings read by default", async () => {
  let resolveSettings;
  const settingsPromise = new Promise((resolve) => {
    resolveSettings = resolve;
  });
  const harness = await installSelectionListener({ settingsPromise });

  harness.setSelection("Exampletown");
  harness.dispatch("pointerup");
  await delay(60);

  assert.deepEqual(harness.sentMessages.map((message) => message.type), [
    "SAYTHIS_PREPARE_PLAYBACK",
    "SAYTHIS_SPEAK"
  ]);

  resolveSettings({ selectToHear: true });
});

test("committed selection does not wait for the settings grace window", async () => {
  const settingsPromise = new Promise(() => {});
  const harness = await installSelectionListener({ settingsPromise });

  harness.setSelection("Exampletown");
  harness.dispatch("pointerup");
  await Promise.resolve();
  await Promise.resolve();

  assert.deepEqual(harness.sentMessages.map((message) => message.type), [
    "SAYTHIS_PREPARE_PLAYBACK",
    "SAYTHIS_SPEAK"
  ]);
});

test("committed selection prepares from speak path when earlier prepare is still waiting", async () => {
  let resolveSettings;
  const settingsPromise = new Promise((resolve) => {
    resolveSettings = resolve;
  });
  const harness = await installSelectionListener({ settingsPromise });

  harness.setSelection("Exampletown");
  harness.dispatch("pointerup");
  harness.dispatchStorageChange({ selectToHear: true });
  await delay(25);

  assert.deepEqual(harness.sentMessages.map((message) => message.type), [
    "SAYTHIS_PREPARE_PLAYBACK",
    "SAYTHIS_SPEAK"
  ]);
  assert.equal(harness.sentMessages[0].trace.id, harness.sentMessages[1].trace.id);

  resolveSettings({ selectToHear: true });
  await delay(5);

  assert.equal(harness.sentMessages.filter((message) => message.type === "SAYTHIS_PREPARE_PLAYBACK").length, 1);
});

test("stable selection preparation does not wait for unresolved settings", async () => {
  const settingsPromise = new Promise(() => {});
  const harness = await installSelectionListener({ settingsPromise });

  harness.setSelection("Exampletown");
  harness.dispatch("selectionchange");
  await delay(35);

  assert.deepEqual(harness.sentMessages.map((message) => [message.type, message.text || ""]), [
    ["SAYTHIS_PREPARE_PLAYBACK", ""],
    ["SAYTHIS_PREPARE_PLAYBACK", "Exampletown"]
  ]);
});

test("stable selection trace starts at the first selection change", async () => {
  let now = 2000;
  const harness = await installSelectionListener({
    Date: {
      now: () => now
    }
  });

  harness.setSelection("Exampletown");
  harness.dispatch("selectionchange");
  now = 2035;
  await delay(35);
  now = 2045;
  await delay(15);

  const preparedMessage = harness.sentMessages.find((message) =>
    message.type === "SAYTHIS_PREPARE_PLAYBACK" && message.text === "Exampletown");
  const speakMessage = harness.sentMessages.find((message) => message.type === "SAYTHIS_SPEAK");

  assert.equal(preparedMessage.trace.startedAt, 2000);
  assert.equal(speakMessage.trace.startedAt, 2000);
  assert.equal(preparedMessage.trace.id, speakMessage.trace.id);
});

test("changing selection waits until the selection is stable", async () => {
  const harness = await installSelectionListener();

  harness.setSelection("Exam");
  harness.dispatch("selectionchange");
  await delay(20);
  harness.setSelection("Exampletown");
  harness.dispatch("selectionchange");
  await delay(30);

  assert.equal(harness.sentMessages.some((message) => message.type === "SAYTHIS_SPEAK"), false);

  await delay(25);
  const speakMessages = harness.sentMessages.filter((message) => message.type === "SAYTHIS_SPEAK");

  assert.equal(speakMessages.length, 1);
  assert.equal(speakMessages[0].text, "Exampletown");
});

test("selection changes prime playback without preparing transient text", async () => {
  const harness = await installSelectionListener();

  harness.setSelection("Exam");
  harness.dispatch("selectionchange");
  await delay(25);

  assert.deepEqual(harness.sentMessages.map((message) => [message.type, message.text || ""]), [
    ["SAYTHIS_PREPARE_PLAYBACK", ""]
  ]);
});

test("selection start primes playback before slow settings read resolves", async () => {
  let resolveSettings;
  const settingsPromise = new Promise((resolve) => {
    resolveSettings = resolve;
  });
  const harness = await installSelectionListener({ settingsPromise });

  harness.dispatch("selectstart");
  await delay(5);

  assert.deepEqual(harness.sentMessages.map((message) => [message.type, message.text || ""]), [
    ["SAYTHIS_PREPARE_PLAYBACK", ""]
  ]);

  resolveSettings({ selectToHear: true });
});

test("selection start primes playback before selected text exists", async () => {
  const harness = await installSelectionListener();

  harness.dispatch("selectstart");
  await delay(25);

  assert.deepEqual(harness.sentMessages.map((message) => [message.type, message.text || ""]), [
    ["SAYTHIS_PREPARE_PLAYBACK", ""]
  ]);
});

test("pointer down primes playback before selected text exists", async () => {
  const harness = await installSelectionListener();

  harness.dispatch("pointerdown");
  await delay(25);

  assert.deepEqual(harness.sentMessages.map((message) => [message.type, message.text || ""]), [
    ["SAYTHIS_PREPARE_PLAYBACK", ""]
  ]);
});

test("keyboard selection shortcuts prime playback before selected text exists", async () => {
  const harness = await installSelectionListener();

  harness.dispatch("keydown", { key: "ArrowRight", shiftKey: true });
  await delay(25);

  assert.deepEqual(harness.sentMessages.map((message) => [message.type, message.text || ""]), [
    ["SAYTHIS_PREPARE_PLAYBACK", ""]
  ]);
});

test("pointer selection prepares while dragging and speaks on release", async () => {
  const harness = await installSelectionListener();

  harness.dispatch("pointerdown");
  harness.setSelection("Exampletown");
  harness.dispatch("selectionchange");
  await delay(60);

  assert.deepEqual(harness.sentMessages.map((message) => [message.type, message.text || ""]), [
    ["SAYTHIS_PREPARE_PLAYBACK", ""],
    ["SAYTHIS_PREPARE_PLAYBACK", "Exampletown"]
  ]);

  harness.dispatch("pointerup");
  await Promise.resolve();
  await Promise.resolve();

  assert.deepEqual(harness.sentMessages.map((message) => [message.type, message.text || ""]), [
    ["SAYTHIS_PREPARE_PLAYBACK", ""],
    ["SAYTHIS_PREPARE_PLAYBACK", "Exampletown"],
    ["SAYTHIS_SPEAK", "Exampletown"]
  ]);
});

test("pointer release speaks late browser selection without waiting for stable debounce", async () => {
  const harness = await installSelectionListener();

  harness.dispatch("pointerdown");
  harness.dispatch("pointerup");
  await delay(5);
  harness.setSelection("Exampletown");
  harness.dispatch("selectionchange");
  await delay(35);

  assert.deepEqual(harness.sentMessages.map((message) => [message.type, message.text || ""]), [
    ["SAYTHIS_PREPARE_PLAYBACK", ""],
    ["SAYTHIS_PREPARE_PLAYBACK", "Exampletown"],
    ["SAYTHIS_SPEAK", "Exampletown"]
  ]);
});

test("double click speaks word selection without waiting for stable debounce", async () => {
  const harness = await installSelectionListener();

  harness.dispatch("pointerdown");
  harness.dispatch("pointerup");
  await delay(30);
  harness.setSelection("Exampletown");
  harness.dispatch("selectionchange");
  harness.dispatch("dblclick");
  await Promise.resolve();
  await Promise.resolve();

  assert.deepEqual(harness.sentMessages.map((message) => [message.type, message.text || ""]), [
    ["SAYTHIS_PREPARE_PLAYBACK", ""],
    ["SAYTHIS_PREPARE_PLAYBACK", "Exampletown"],
    ["SAYTHIS_SPEAK", "Exampletown"]
  ]);
});

test("double click does not replay when pointer release already spoke", async () => {
  const harness = await installSelectionListener();

  harness.dispatch("pointerdown");
  harness.setSelection("Exampletown");
  harness.dispatch("pointerup");
  await delay(25);
  harness.dispatch("dblclick");
  await delay(25);

  assert.equal(harness.sentMessages.filter((message) => message.type === "SAYTHIS_SPEAK").length, 1);
});

test("pointer cancellation speaks after a selected word survives the canceled gesture", async () => {
  const harness = await installSelectionListener();

  harness.dispatch("pointerdown");
  harness.setSelection("Exampletown");
  harness.dispatch("selectionchange");
  await delay(35);

  assert.deepEqual(harness.sentMessages.map((message) => [message.type, message.text || ""]), [
    ["SAYTHIS_PREPARE_PLAYBACK", ""],
    ["SAYTHIS_PREPARE_PLAYBACK", "Exampletown"]
  ]);

  harness.dispatch("pointercancel");
  await delay(50);

  assert.deepEqual(harness.sentMessages.map((message) => [message.type, message.text || ""]), [
    ["SAYTHIS_PREPARE_PLAYBACK", ""],
    ["SAYTHIS_PREPARE_PLAYBACK", "Exampletown"],
    ["SAYTHIS_SPEAK", "Exampletown"]
  ]);
});

test("pointer cancellation speaks late browser selection without waiting for stable debounce", async () => {
  const harness = await installSelectionListener();

  harness.dispatch("pointerdown");
  harness.dispatch("pointercancel");
  await delay(5);
  harness.setSelection("Exampletown");
  harness.dispatch("selectionchange");
  await delay(35);

  assert.deepEqual(harness.sentMessages.map((message) => [message.type, message.text || ""]), [
    ["SAYTHIS_PREPARE_PLAYBACK", ""],
    ["SAYTHIS_PREPARE_PLAYBACK", "Exampletown"],
    ["SAYTHIS_SPEAK", "Exampletown"]
  ]);
});

test("overlay pointer cancellation does not speak the page selection", async () => {
  const harness = await installSelectionListener();

  harness.dispatch("pointerdown");
  harness.setSelection("Exampletown");
  harness.dispatch("selectionchange");
  await delay(35);

  harness.dispatch("pointercancel", { target: overlayNode("button") });
  await delay(50);

  assert.equal(harness.sentMessages.filter((message) => message.type === "SAYTHIS_SPEAK").length, 0);
});

test("keyboard selection prepares while extending and speaks on release", async () => {
  const harness = await installSelectionListener();

  harness.dispatch("keydown", { key: "ArrowRight", shiftKey: true });
  harness.setSelection("Exampletown");
  harness.dispatch("selectionchange");
  await delay(60);

  assert.deepEqual(harness.sentMessages.map((message) => [message.type, message.text || ""]), [
    ["SAYTHIS_PREPARE_PLAYBACK", ""],
    ["SAYTHIS_PREPARE_PLAYBACK", "Exampletown"]
  ]);

  harness.dispatch("keyup", { key: "ArrowRight", shiftKey: true });
  await Promise.resolve();
  await Promise.resolve();

  assert.deepEqual(harness.sentMessages.map((message) => [message.type, message.text || ""]), [
    ["SAYTHIS_PREPARE_PLAYBACK", ""],
    ["SAYTHIS_PREPARE_PLAYBACK", "Exampletown"],
    ["SAYTHIS_SPEAK", "Exampletown"]
  ]);
});

test("keyboard selection shortcuts commit selected text on keyup", async () => {
  const harness = await installSelectionListener();

  harness.setSelection("Exampletown");
  harness.dispatch("keyup", { key: "ArrowRight", shiftKey: true });
  await Promise.resolve();
  await Promise.resolve();

  assert.deepEqual(harness.sentMessages.map((message) => [message.type, message.text || ""]), [
    ["SAYTHIS_PREPARE_PLAYBACK", "Exampletown"],
    ["SAYTHIS_SPEAK", "Exampletown"]
  ]);
});

test("keyboard release speaks late browser selection without waiting for stable debounce", async () => {
  const harness = await installSelectionListener();

  harness.dispatch("keydown", { key: "ArrowRight", shiftKey: true });
  harness.dispatch("keyup", { key: "ArrowRight", shiftKey: true });
  await delay(5);
  harness.setSelection("Exampletown");
  harness.dispatch("selectionchange");
  await delay(35);

  assert.deepEqual(harness.sentMessages.map((message) => [message.type, message.text || ""]), [
    ["SAYTHIS_PREPARE_PLAYBACK", ""],
    ["SAYTHIS_PREPARE_PLAYBACK", "Exampletown"],
    ["SAYTHIS_SPEAK", "Exampletown"]
  ]);
});

test("ordinary keyup over an existing selection does not speak", async () => {
  const harness = await installSelectionListener();

  harness.setSelection("Exampletown");
  harness.dispatch("keyup", { key: "c", ctrlKey: true });
  await delay(25);
  harness.dispatch("keyup", { key: "f", ctrlKey: true });
  await delay(25);
  harness.dispatch("keyup", { key: "Escape" });
  await delay(25);

  assert.deepEqual(harness.sentMessages, []);
});

test("ordinary keydown does not prime playback", async () => {
  const harness = await installSelectionListener();

  harness.dispatch("keydown", { key: "r" });
  await delay(25);

  assert.deepEqual(harness.sentMessages, []);
});

test("selection changes do not prime playback when select-to-hear is disabled", async () => {
  const harness = await installSelectionListener({
    settings: { selectToHear: false }
  });

  harness.setSelection("Exampletown");
  harness.dispatch("selectionchange");
  await delay(25);

  assert.deepEqual(harness.sentMessages, []);
});

test("changing selection does not prepare transient fragments", async () => {
  const harness = await installSelectionListener();

  harness.setSelection("Exam");
  harness.dispatch("selectionchange");
  await delay(25);

  assert.deepEqual(harness.sentMessages.map((message) => [message.type, message.text || ""]), [
    ["SAYTHIS_PREPARE_PLAYBACK", ""]
  ]);

  harness.setSelection("Exampletown");
  harness.dispatch("selectionchange");
  await delay(35);

  assert.deepEqual(harness.sentMessages.map((message) => [message.type, message.text || ""]), [
    ["SAYTHIS_PREPARE_PLAYBACK", ""],
    ["SAYTHIS_PREPARE_PLAYBACK", "Exampletown"]
  ]);

  await delay(15);
  assert.deepEqual(harness.sentMessages.map((message) => [message.type, message.text || ""]), [
    ["SAYTHIS_PREPARE_PLAYBACK", ""],
    ["SAYTHIS_PREPARE_PLAYBACK", "Exampletown"],
    ["SAYTHIS_SPEAK", "Exampletown"]
  ]);
});

test("committed selection is not delayed by a later selectionchange event", async () => {
  const harness = await installSelectionListener();

  harness.setSelection("Exampletown");
  harness.dispatch("pointerup");
  harness.dispatch("selectionchange");
  await delay(25);

  const speakMessages = harness.sentMessages.filter((message) => message.type === "SAYTHIS_SPEAK");

  assert.equal(speakMessages.length, 1);
  assert.equal(speakMessages[0].text, "Exampletown");
});

test("same selection is not replayed without a new selection gesture", async () => {
  const harness = await installSelectionListener();

  harness.setSelection("Exampletown");
  harness.dispatch("pointerup");
  await delay(25);

  harness.dispatch("pointerup");
  await delay(25);

  assert.equal(harness.sentMessages.filter((message) => message.type === "SAYTHIS_SPEAK").length, 1);

  await delay(360);
  harness.dispatch("pointerup");
  await delay(25);

  const speakMessages = harness.sentMessages.filter((message) => message.type === "SAYTHIS_SPEAK");

  assert.equal(speakMessages.length, 1);
  assert.equal(speakMessages[0].text, "Exampletown");
});

test("same selection can be replayed after a new selection gesture", async () => {
  const harness = await installSelectionListener();

  harness.setSelection("Exampletown");
  harness.dispatch("pointerup");
  await delay(25);

  await delay(360);
  harness.dispatch("pointerdown");
  harness.dispatch("pointerup");
  await delay(25);

  const speakMessages = harness.sentMessages.filter((message) => message.type === "SAYTHIS_SPEAK");

  assert.equal(speakMessages.length, 2);
  assert.equal(speakMessages[0].text, "Exampletown");
  assert.equal(speakMessages[1].text, "Exampletown");
  assert.notEqual(speakMessages[0].trace.id, speakMessages[1].trace.id);
});

test("clearing selection allows the same word to be heard again immediately", async () => {
  const harness = await installSelectionListener();

  harness.setSelection("Exampletown");
  harness.dispatch("pointerup");
  await delay(25);

  harness.setSelection("");
  harness.dispatch("selectionchange");
  harness.setSelection("Exampletown");
  harness.dispatch("pointerup");
  await delay(25);

  const speakMessages = harness.sentMessages.filter((message) => message.type === "SAYTHIS_SPEAK");

  assert.equal(speakMessages.length, 2);
  assert.equal(speakMessages[0].text, "Exampletown");
  assert.equal(speakMessages[1].text, "Exampletown");
  assert.notEqual(speakMessages[0].trace.id, speakMessages[1].trace.id);
});

async function installSelectionListener(options = {}) {
  const source = await readFile(join(root, "src", "selection-listener.js"), "utf8");
  const listeners = new Map();
  const sentMessages = [];
  let storageListener = null;
  let selectedText = "";
  let activeElement = null;

  const context = {
    globalThis: {},
    window: {
      getSelection: () => ({
        isCollapsed: !selectedText,
        anchorNode: {},
        focusNode: {},
        toString: () => selectedText
      })
    },
    document: {
      visibilityState: "visible",
      get activeElement() {
        return activeElement;
      },
      addEventListener: (type, listener) => {
        const existing = listeners.get(type) || [];
        existing.push(listener);
        listeners.set(type, existing);
      }
    },
    chrome: {
      runtime: {
        sendMessage: (message) => {
          sentMessages.push(message);
          return Promise.resolve(options.runtimeResponse || { ok: true });
        }
      },
      storage: {
        local: {
          get: async () => {
            const settings = options.settingsPromise
              ? await options.settingsPromise
              : options.settings || { selectToHear: true };
            return { settings };
          }
        },
        onChanged: {
          addListener: (listener) => {
            storageListener = listener;
          }
        }
      }
    },
    setTimeout,
    clearTimeout,
    Date: options.Date || Date,
    Math,
    Number,
    Object,
    Promise,
    RegExp,
    String
  };
  context.globalThis = context;

  vm.runInNewContext(source, context, {
    filename: "src/selection-listener.js"
  });
  await delay(0);

  return {
    sentMessages,
    setSelection(value) {
      selectedText = value;
    },
    setActiveElement(element) {
      activeElement = element;
    },
    dispatch(type, event = {}) {
      for (const listener of listeners.get(type) || []) {
        listener(event);
      }
    },
    dispatchStorageChange(settings) {
      storageListener?.({
        settings: {
          newValue: settings
        }
      }, "local");
    }
  };
}

function overlayNode(tagName = "span") {
  return {
    tagName,
    getRootNode: () => ({
      host: {
        tagName: "saythis-overlay"
      }
    })
  };
}

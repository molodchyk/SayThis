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

test("same selection can be replayed after the short duplicate cooldown", async () => {
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
      activeElement: null,
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
    Date,
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

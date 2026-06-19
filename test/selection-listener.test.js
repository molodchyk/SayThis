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

test("changing selection waits until the selection is stable", async () => {
  const harness = await installSelectionListener();

  harness.setSelection("Exam");
  harness.dispatch("selectionchange");
  await delay(80);
  harness.setSelection("Exampletown");
  harness.dispatch("selectionchange");
  await delay(100);

  assert.equal(harness.sentMessages.some((message) => message.type === "SAYTHIS_SPEAK"), false);

  await delay(90);
  const speakMessages = harness.sentMessages.filter((message) => message.type === "SAYTHIS_SPEAK");

  assert.equal(speakMessages.length, 1);
  assert.equal(speakMessages[0].text, "Exampletown");
});

test("changing selection does not prepare transient fragments", async () => {
  const harness = await installSelectionListener();

  harness.setSelection("Exam");
  harness.dispatch("selectionchange");
  await delay(70);

  assert.deepEqual(harness.sentMessages, []);

  harness.setSelection("Exampletown");
  harness.dispatch("selectionchange");
  await delay(110);

  assert.deepEqual(harness.sentMessages.map((message) => [message.type, message.text]), [
    ["SAYTHIS_PREPARE_PLAYBACK", "Exampletown"]
  ]);

  await delay(70);
  assert.deepEqual(harness.sentMessages.map((message) => [message.type, message.text]), [
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
          get: async () => ({
            settings: options.settings || { selectToHear: true }
          })
        },
        onChanged: {
          addListener: () => {}
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
    dispatch(type) {
      for (const listener of listeners.get(type) || []) {
        listener();
      }
    }
  };
}

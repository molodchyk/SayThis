import assert from "node:assert/strict";
import test from "node:test";
import {
  addOffscreenMessageListener,
  createOffscreenRuntimeAdapters
} from "../../src/offscreen/runtime-adapters.js";

test("creates an offscreen runtime listener adapter", () => {
  const calls = [];
  const adapters = createOffscreenRuntimeAdapters({
    runtime: {
      onMessage: {
        addListener: (listener) => calls.push(listener)
      }
    }
  });
  const listener = () => false;

  assert.equal(addOffscreenMessageListener(listener, adapters), true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]("message", "sender", "respond"), false);
});

test("reports missing listener support", () => {
  assert.equal(addOffscreenMessageListener(() => {}, {}), false);
});

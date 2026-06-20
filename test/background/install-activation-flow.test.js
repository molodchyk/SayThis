import assert from "node:assert/strict";
import test from "node:test";
import {
  activateSelectionListenerOnOpenTabs,
  registerContextMenus,
  SELECTION_LISTENER_FILES
} from "../../src/background/install-activation-flow.js";

test("registers context menu definitions", () => {
  const calls = [];
  registerContextMenus([
    { id: "saythis-local", title: "SayThis" },
    { id: "saythis-online", title: "SayThis online" }
  ], {
    createContextMenu: item => calls.push(item)
  });

  assert.deepEqual(calls, [
    { id: "saythis-local", title: "SayThis" },
    { id: "saythis-online", title: "SayThis online" }
  ]);
});

test("activates the selection listener in existing tabs best-effort", async () => {
  const calls = [];
  const summary = await activateSelectionListenerOnOpenTabs({
    queryTabs: async (query) => {
      calls.push(["queryTabs", query]);
      return [{ id: 7 }, { id: 8 }, { id: null }, {}];
    },
    executeScript: async (details) => {
      calls.push(["executeScript", details]);
      if (details.target.tabId === 8) {
        throw new Error("restricted page");
      }
    },
    recordDebugEvent: (kind, payload) => calls.push(["recordDebugEvent", kind, payload])
  });

  assert.equal(summary.injected, 1);
  assert.equal(summary.failed, 1);
  assert.equal(summary.skipped, 2);
  assert.equal(typeof summary.elapsedMs, "number");
  assert.deepEqual(calls.slice(0, 4), [
    ["recordDebugEvent", "selection-listener:activate:start", {}],
    ["queryTabs", {}],
    ["executeScript", {
      target: { tabId: 7, allFrames: true },
      files: SELECTION_LISTENER_FILES
    }],
    ["executeScript", {
      target: { tabId: 8, allFrames: true },
      files: SELECTION_LISTENER_FILES
    }]
  ]);
  assert.equal(calls.at(-1)[0], "recordDebugEvent");
  assert.equal(calls.at(-1)[1], "selection-listener:activate:result");
  assert.equal(calls.at(-1)[2].injected, 1);
  assert.equal(calls.at(-1)[2].failed, 1);
  assert.equal(calls.at(-1)[2].skipped, 2);
});

test("reports tab-query activation failures without throwing", async () => {
  const calls = [];
  const summary = await activateSelectionListenerOnOpenTabs({
    queryTabs: async () => {
      throw new Error("tabs unavailable");
    },
    executeScript: async () => {
      throw new Error("should not inject without tabs");
    },
    recordDebugEvent: (kind, payload) => calls.push([kind, payload])
  });

  assert.deepEqual(summary, {
    injected: 0,
    failed: 0,
    skipped: 0,
    error: "tabs unavailable"
  });
  assert.equal(calls[0][0], "selection-listener:activate:start");
  assert.equal(calls[1][0], "selection-listener:activate:error");
  assert.equal(calls[1][1].error, "tabs unavailable");
});

test("skips existing tabs when scripting is unavailable", async () => {
  const calls = [];
  const summary = await activateSelectionListenerOnOpenTabs({
    queryTabs: async () => [{ id: 7 }, { id: 8 }],
    recordDebugEvent: (kind, payload) => calls.push([kind, payload])
  });

  assert.equal(summary.injected, 0);
  assert.equal(summary.failed, 0);
  assert.equal(summary.skipped, 2);
  assert.equal(calls.at(-1)[0], "selection-listener:activate:result");
  assert.equal(calls.at(-1)[1].skipped, 2);
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  createRuntimeAdapters
} from "../../src/background/runtime-adapters-flow.js";

test("loads seed data through runtime URLs and caches the request", async () => {
  const requestedUrls = [];
  const adapters = createRuntimeAdapters({
    seedDataUrl: "data/pronunciation-seed.json",
    getRuntimeUrl: (url) => `chrome-extension://saythis/${url}`,
    fetchJson: async (url) => {
      requestedUrls.push(url);
      return { entries: [{ id: "sample" }] };
    }
  });

  const first = await adapters.loadSeedData();
  const second = await adapters.loadSeedData();

  assert.equal(first, second);
  assert.deepEqual(first, { entries: [{ id: "sample" }] });
  assert.deepEqual(requestedUrls, ["chrome-extension://saythis/data/pronunciation-seed.json"]);
});

test("reads and normalizes selected text from a tab", async () => {
  const calls = [];
  const adapters = createRuntimeAdapters({
    executeScript: async (details) => {
      calls.push(details);
      return [{ result: "  Gnocchi\nalla   romana  " }];
    }
  });

  const selection = await adapters.readSelectionFromTab(7);

  assert.equal(selection, "Gnocchi alla romana");
  assert.deepEqual(calls[0].target, { tabId: 7 });
  assert.equal(typeof calls[0].func, "function");
});

test("returns an empty selection when tab script execution fails", async () => {
  const adapters = createRuntimeAdapters({
    executeScript: async () => {
      throw new Error("restricted page");
    }
  });

  assert.equal(await adapters.readSelectionFromTab(7), "");
});

test("builds active-selection dependencies from browser adapters and workflows", async () => {
  const calls = [];
  const workflows = {
    resolveSelection: async () => {},
    playResolvedResult: async () => {}
  };
  const adapters = createRuntimeAdapters({
    queryTabs: async (query) => {
      calls.push(["queryTabs", query]);
      return [{ id: 7 }];
    },
    executeScript: async () => [{ result: "Gnocchi" }],
    setStorage: async (value) => calls.push(["setStorage", value]),
    storageKeys: {
      lastSelection: "customLastSelection",
      lastSource: "customLastSource"
    }
  });
  const dependencies = adapters.activeSelectionDependencies(workflows);

  assert.deepEqual(await dependencies.getActiveTab(), { id: 7 });
  assert.equal(await dependencies.readSelectionFromTab(7), "Gnocchi");
  await dependencies.setStorage({ customLastSelection: "Gnocchi" });
  assert.equal(dependencies.resolveSelection, workflows.resolveSelection);
  assert.equal(dependencies.playResolvedResult, workflows.playResolvedResult);
  assert.equal(dependencies.lastSelectionKey, "customLastSelection");
  assert.equal(dependencies.lastSourceKey, "customLastSource");
  assert.deepEqual(calls, [
    ["queryTabs", { active: true, currentWindow: true }],
    ["setStorage", { customLastSelection: "Gnocchi" }]
  ]);
});

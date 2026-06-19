import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(join(process.cwd(), "src/content/overlay-runtime-adapters.js"), "utf8");

test("creates content overlay runtime adapters from chrome APIs", async () => {
  const calls = [];
  const runtime = loadRuntime({
    chrome: {
      runtime: {
        lastError: null,
        onMessage: {
          addListener: (listener) => calls.push(["addListener", listener])
        },
        sendMessage: (message, respond) => {
          calls.push(["sendMessage", message]);
          respond({ ok: true });
        }
      }
    }
  });
  const adapters = runtime.createOverlayRuntimeAdapters();
  const listener = () => false;

  adapters.addMessageListener(listener);
  assert.deepEqual(plain(await runtime.sendRuntimeMessage({ type: "SAYTHIS_SPEAK" }, adapters)), { ok: true });
  assert.equal(calls[0][0], "addListener");
  assert.equal(calls[0][1], listener);
  assert.deepEqual(calls[1], ["sendMessage", { type: "SAYTHIS_SPEAK" }]);
});

test("registers a show-result listener with response handling", () => {
  let registered;
  const shown = [];
  const responses = [];
  const runtime = loadRuntime();
  const added = runtime.addShowResultListener((result, options) => {
    shown.push([result, options]);
  }, {
    addMessageListener: (listener) => {
      registered = listener;
    }
  });

  assert.equal(added, true);
  assert.equal(registered({ type: "OTHER" }, {}, () => {
    throw new Error("should not respond");
  }), false);
  assert.equal(registered({
    type: "SAYTHIS_SHOW_RESULT",
    result: { display: "Gnocchi" },
    autoPlay: true
  }, {}, (response) => responses.push(response)), true);
  assert.deepEqual(plain(shown), [[{ display: "Gnocchi" }, { autoPlay: true }]]);
  assert.deepEqual(plain(responses), [{ ok: true }]);
});

test("registers a visible-result listener with response handling", () => {
  let registered;
  const responses = [];
  const runtime = loadRuntime();
  const visible = { display: "Gnocchi" };
  const added = runtime.addVisibleResultListener(() => visible, {
    addMessageListener: (listener) => {
      registered = listener;
    }
  });

  assert.equal(added, true);
  assert.equal(registered({ type: "OTHER" }, {}, () => {
    throw new Error("should not respond");
  }), false);
  assert.equal(registered({
    type: "SAYTHIS_GET_VISIBLE_RESULT"
  }, {}, (response) => responses.push(response)), true);
  assert.deepEqual(plain(responses), [{
    ok: true,
    result: visible
  }]);
});

test("reports missing listener support", () => {
  const runtime = loadRuntime();

  assert.equal(runtime.addShowResultListener(() => {}, {}), false);
  assert.equal(runtime.addVisibleResultListener(() => {}, {}), false);
});

test("normalizes runtime message failures", async () => {
  const runtime = loadRuntime();

  assert.deepEqual(plain(await runtime.sendRuntimeMessage({ type: "SAYTHIS_SPEAK" })), {
    ok: false,
    error: "Runtime messaging unavailable."
  });
  assert.deepEqual(plain(await runtime.sendRuntimeMessage({ type: "SAYTHIS_SPEAK" }, {
    sendMessage: (_message, respond) => respond(undefined),
    lastError: () => ({ message: "No receiver" })
  })), {
    ok: false,
    error: "No receiver"
  });
  assert.deepEqual(plain(await runtime.sendRuntimeMessage({ type: "SAYTHIS_SPEAK" }, {
    sendMessage: (_message, respond) => respond(undefined),
    lastError: () => null
  })), {
    ok: false,
    error: "No response."
  });
});

function loadRuntime(extra = {}) {
  const context = vm.createContext({
    ...extra
  });
  vm.runInContext(source, context);
  return context.__sayThisOverlayRuntimeAdapters;
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

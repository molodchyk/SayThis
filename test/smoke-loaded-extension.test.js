import assert from "node:assert/strict";
import test from "node:test";
import {
  contextMenuProbeExpression,
  expectedContextMenuItems,
  runLoadedExtensionSmoke,
  shouldCloseLaunchedBrowser
} from "../scripts/smoke-loaded-extension.mjs";

test("loaded-extension smoke skips unless launch is explicit", async () => {
  const result = await runLoadedExtensionSmoke({
    allowLaunch: false,
    executable: "not-used"
  });

  assert.equal(result.skipped, true);
  assert.match(result.reason, /SAYTHIS_SMOKE_LAUNCH=1/);
});

test("loaded-extension smoke does not close from environment settings", () => {
  const previous = process.env.SAYTHIS_SMOKE_CLOSE;
  process.env.SAYTHIS_SMOKE_CLOSE = "1";

  try {
    assert.equal(shouldCloseLaunchedBrowser({}), false);
  } finally {
    if (previous === undefined) {
      delete process.env.SAYTHIS_SMOKE_CLOSE;
    } else {
      process.env.SAYTHIS_SMOKE_CLOSE = previous;
    }
  }
});

test("loaded-extension smoke never closes launched browser processes", () => {
  assert.equal(shouldCloseLaunchedBrowser({ closeLaunchedBrowser: true }), false);
  assert.equal(shouldCloseLaunchedBrowser({ closeLaunchedBrowser: false }), false);
});

test("loaded-extension smoke probes registered context menu entries", () => {
  const items = expectedContextMenuItems();
  assert.deepEqual(items, [{
    id: "saythis-pronounce-selection",
    title: "SayThis: pronounce \"%s\""
  }, {
    id: "saythis-pronounce-selection-online",
    title: "SayThis: online lookup and pronounce \"%s\""
  }]);

  const expression = contextMenuProbeExpression(items);
  assert.match(expression, /chrome\.contextMenus/);
  assert.match(expression, /saythis-pronounce-selection/);
  assert.match(expression, /saythis-pronounce-selection-online/);
  assert.doesNotMatch(expression, /remove/);
});

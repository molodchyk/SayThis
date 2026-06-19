import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const manifest = JSON.parse(await readFile(new URL("../manifest.json", import.meta.url), "utf8"));
const PNG_SIGNATURE = "89504e470d0a1a0a";

test("manifest references packaged png icons", async () => {
  const expected = {
    16: "assets/icons/icon16.png",
    32: "assets/icons/icon32.png",
    48: "assets/icons/icon48.png",
    128: "assets/icons/icon128.png"
  };

  assert.deepEqual(manifest.icons, expected);
  assert.deepEqual(manifest.action.default_icon, expected);

  for (const [size, iconPath] of Object.entries(expected)) {
    const png = await readFile(new URL(`../${iconPath}`, import.meta.url));
    const dimensions = pngDimensions(png);
    assert.equal(png.subarray(0, 8).toString("hex"), PNG_SIGNATURE);
    assert.equal(dimensions.width, Number(size));
    assert.equal(dimensions.height, Number(size));
  }
});

test("manifest allows hinted Wiktionary editions", () => {
  assert.ok(manifest.host_permissions.includes("https://*.wiktionary.org/*"));
});

test("manifest installs the low-friction selection listener", () => {
  const scripts = manifest.content_scripts || [];
  assert.equal(scripts.length, 1);
  assert.deepEqual(scripts[0].matches, ["<all_urls>"]);
  assert.deepEqual(scripts[0].js, ["src/selection-listener.js"]);
  assert.equal(scripts[0].run_at, "document_start");
});

function pngDimensions(buffer) {
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20)
  };
}

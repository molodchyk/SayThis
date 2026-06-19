import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  auditReleaseReadiness,
  hasRetiredDirectGeneratedAudioControl
} from "../scripts/audit-release-readiness.mjs";
import {
  BACKGROUND_STORAGE_KEYS
} from "../src/background/runtime-platform.js";
import {
  OPTIONS_STORAGE_KEYS
} from "../src/options/runtime-adapters.js";

const PNG_SIGNATURE = "89504e470d0a1a0a";

test("README links the public privacy policy", async () => {
  const readme = await readFile(new URL("../README.md", import.meta.url), "utf8");
  const rootPolicy = await readFile(new URL("../PRIVACY.md", import.meta.url), "utf8");
  const policy = await readFile(new URL("../docs/privacy-policy.md", import.meta.url), "utf8");

  assert.match(readme, /PRIVACY\.md/);
  assert.match(readme, /docs\/privacy-policy\.md/);
  assert.match(rootPolicy, /## Permissions/);
  assert.match(rootPolicy, /No Sale Or Sharing/);
  assert.match(policy, /## Data Sent To Remote Services/);
  assert.match(policy, /Forvo API keys and shared-audio generation tokens stay in local extension storage/);
  assert.match(policy, /does not submit page URLs or browsing history/);
});

test("documents public license and source URL", async () => {
  const readme = await readFile(new URL("../README.md", import.meta.url), "utf8");
  const license = await readFile(new URL("../LICENSE", import.meta.url), "utf8");
  const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));

  assert.equal(packageJson.license, "GPL-3.0-only");
  assert.match(readme, /GPL-3\.0-only/);
  assert.match(readme, /https:\/\/github\.com\/molodchyk\/SayThis/);
  assert.match(license, /GNU GENERAL PUBLIC LICENSE/);
});

test("documents local storage ownership for exported keys", async () => {
  const readme = await readFile(new URL("../README.md", import.meta.url), "utf8");
  const privacy = await readFile(new URL("../PRIVACY.md", import.meta.url), "utf8");
  const publicPrivacy = await readFile(new URL("../docs/privacy-policy.md", import.meta.url), "utf8");
  const storageDoc = await readFile(new URL("../docs/architecture/storage-ownership.md", import.meta.url), "utf8");
  const keys = [...new Set([
    ...Object.values(BACKGROUND_STORAGE_KEYS),
    ...Object.values(OPTIONS_STORAGE_KEYS)
  ])].sort();

  assert.match(readme, /docs\/architecture\/storage-ownership\.md/);
  assert.match(privacy, /docs\/architecture\/storage-ownership\.md/);
  assert.match(publicPrivacy, /docs\/architecture\/storage-ownership\.md/);
  assert.match(storageDoc, /Chrome extension local storage/);

  for (const key of keys) {
    assert.match(storageDoc, new RegExp(`\\| \`${escapeRegExp(key)}\` \\|`));
  }
});

test("keeps Chrome Web Store automation docs aligned with StorePilot shape", async () => {
  const listing = await readFile(new URL("../store-listing/chrome-web-store/listing/en.md", import.meta.url), "utf8");
  const additionalFields = await readFile(new URL("../docs/chrome-web-store-additional-fields.md", import.meta.url), "utf8");
  const nestedAdditionalFields = await readFile(new URL("../docs/chrome-web-store/additional-fields.md", import.meta.url), "utf8");
  const category = await readFile(new URL("../docs/chrome-web-store-category.md", import.meta.url), "utf8");
  const nestedCategory = await readFile(new URL("../docs/chrome-web-store/category.md", import.meta.url), "utf8");
  const privacyForm = await readFile(new URL("../docs/chrome-web-store-privacy-form.md", import.meta.url), "utf8");
  const nestedPrivacyForm = await readFile(new URL("../docs/chrome-web-store/privacy-form.md", import.meta.url), "utf8");
  const icon = await readFile(new URL("../store-listing/chrome-web-store/media/icon-128.png", import.meta.url));
  const popupScreenshot = await readFile(new URL("../store-listing/chrome-web-store/media/screenshots/01-popup-lookup.png", import.meta.url));
  const optionsScreenshot = await readFile(new URL("../store-listing/chrome-web-store/media/screenshots/02-options-controls.png", import.meta.url));

  assert.match(listing, /SayThis lets you highlight unfamiliar text/);
  assert.match(listing, /Open source under the GPL-3\.0 license/);
  assert.doesNotMatch(listing, /^(?:#|Name:|Summary:|Description:|Detailed Description:)/m);
  assert.equal(additionalFields, nestedAdditionalFields);
  assert.equal(category, nestedCategory);
  assert.equal(privacyForm, nestedPrivacyForm);
  assert.match(additionalFields, /\[additional_fields\]/);
  assert.match(additionalFields, /homepage_url:\nhttps:\/\/github\.com\/molodchyk\/SayThis/);
  assert.match(category, /Selected category: Tools/);
  assert.match(privacyForm, /\[privacy\]/);
  assert.match(privacyForm, /permission\.tts:/);
  assert.match(privacyForm, /remote_code:\nno/);
  assert.match(privacyForm, /certification\.no_sell_or_transfer:\nyes/);
  assert.equal(icon.subarray(0, 8).toString("hex"), PNG_SIGNATURE);
  assert.deepEqual(pngDimensions(icon), { width: 128, height: 128 });
  assert.equal(popupScreenshot.subarray(0, 8).toString("hex"), PNG_SIGNATURE);
  assert.equal(optionsScreenshot.subarray(0, 8).toString("hex"), PNG_SIGNATURE);
  assert.deepEqual(pngDimensions(popupScreenshot), { width: 1280, height: 800 });
  assert.deepEqual(pngDimensions(optionsScreenshot), { width: 1280, height: 800 });
});

test("documents community service deployment artifacts", async () => {
  const readme = await readFile(new URL("../README.md", import.meta.url), "utf8");
  const communityService = await readFile(new URL("../docs/community-service.md", import.meta.url), "utf8");
  const deployment = await readFile(new URL("../docs/deployment.md", import.meta.url), "utf8");
  const releaseNotes = await readFile(new URL("../docs/chrome-web-store/release-notes.md", import.meta.url), "utf8");
  const dockerfile = await readFile(new URL("../Dockerfile.community", import.meta.url), "utf8");
  const dockerignore = await readFile(new URL("../.dockerignore", import.meta.url), "utf8");

  assert.match(readme, /docs\/deployment\.md/);
  assert.match(deployment, /docker build -f Dockerfile\.community/);
  assert.match(deployment, /SAYTHIS_ADMIN_TOKEN/);
  assert.match(deployment, /SAYTHIS_PUBLIC_AUDIO_GENERATION_TOKEN`: required bearer token/);
  assert.match(communityService, /Authorization: Bearer <SAYTHIS_PUBLIC_AUDIO_GENERATION_TOKEN>/);
  assert.match(releaseNotes, /required bearer-token controls/);
  assert.match(releaseNotes, /Preserves returned shared audio/);
  assert.match(dockerfile, /SAYTHIS_STORE=\/data\/community-store\.json/);
  assert.match(dockerfile, /server\/community-service\.js/);
  assert.match(dockerignore, /assets\/audio\/private/);
  assert.match(dockerignore, /data\/licensed/);
});

test("documents public audio release guardrails", async () => {
  const readme = await readFile(new URL("../README.md", import.meta.url), "utf8");
  const audioReadme = await readFile(new URL("../assets/audio/public/README.md", import.meta.url), "utf8");
  const manifest = JSON.parse(await readFile(new URL("../data/public-audio-manifest.json", import.meta.url), "utf8"));

  assert.match(readme, /audit:public-audio/);
  assert.match(audioReadme, /data\/public-audio-manifest\.json/);
  assert.equal(manifest.schemaVersion, 1);
});

test("runs release audits in non-browser CI", async () => {
  const readme = await readFile(new URL("../README.md", import.meta.url), "utf8");
  const workflow = await readFile(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
  const failures = await auditReleaseReadiness(fileURLToPath(new URL("..", import.meta.url)));

  assert.match(readme, /release audits/);
  assert.match(readme, /audit:release/);
  assert.match(workflow, /npm run audit:architecture/);
  assert.match(workflow, /npm run audit:public-audio/);
  assert.match(workflow, /npm run audit:release/);
  assert.deepEqual(failures, []);
});

test("release audit detects retired direct generated-audio controls", () => {
  assert.equal(hasRetiredDirectGeneratedAudioControl("voiceServiceEnabled"), true);
  assert.equal(hasRetiredDirectGeneratedAudioControl("voice-service URL template"), true);
  assert.equal(hasRetiredDirectGeneratedAudioControl("shared audio generation token"), false);
});

function pngDimensions(buffer) {
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20)
  };
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

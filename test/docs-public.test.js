import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("README links the public privacy policy", async () => {
  const readme = await readFile(new URL("../README.md", import.meta.url), "utf8");
  const rootPolicy = await readFile(new URL("../PRIVACY.md", import.meta.url), "utf8");
  const policy = await readFile(new URL("../docs/privacy-policy.md", import.meta.url), "utf8");

  assert.match(readme, /PRIVACY\.md/);
  assert.match(readme, /docs\/privacy-policy\.md/);
  assert.match(rootPolicy, /## Permissions/);
  assert.match(rootPolicy, /No Sale Or Sharing/);
  assert.match(policy, /## Data Sent To Remote Services/);
  assert.match(policy, /Forvo API keys stay in local extension storage/);
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

test("keeps Chrome Web Store automation docs aligned with StorePilot shape", async () => {
  const listing = await readFile(new URL("../store-listing/chrome-web-store/listing/en.md", import.meta.url), "utf8");
  const additionalFields = await readFile(new URL("../docs/chrome-web-store/additional-fields.md", import.meta.url), "utf8");
  const category = await readFile(new URL("../docs/chrome-web-store/category.md", import.meta.url), "utf8");
  const privacyForm = await readFile(new URL("../docs/chrome-web-store/privacy-form.md", import.meta.url), "utf8");

  assert.match(listing, /SayThis lets you highlight unfamiliar text/);
  assert.match(listing, /Open source under the GPL-3\.0 license/);
  assert.match(additionalFields, /\[additional_fields\]/);
  assert.match(additionalFields, /homepage_url:\nhttps:\/\/github\.com\/molodchyk\/SayThis/);
  assert.match(category, /Selected category: Tools/);
  assert.match(privacyForm, /\[privacy\]/);
  assert.match(privacyForm, /permission\.tts:/);
  assert.match(privacyForm, /remote_code:\nno/);
  assert.match(privacyForm, /certification\.no_sell_or_transfer:\nyes/);
});

test("documents community service deployment artifacts", async () => {
  const readme = await readFile(new URL("../README.md", import.meta.url), "utf8");
  const deployment = await readFile(new URL("../docs/deployment.md", import.meta.url), "utf8");
  const dockerfile = await readFile(new URL("../Dockerfile.community", import.meta.url), "utf8");
  const dockerignore = await readFile(new URL("../.dockerignore", import.meta.url), "utf8");

  assert.match(readme, /docs\/deployment\.md/);
  assert.match(deployment, /docker build -f Dockerfile\.community/);
  assert.match(deployment, /SAYTHIS_ADMIN_TOKEN/);
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

  assert.match(readme, /release audits/);
  assert.match(workflow, /npm run audit:architecture/);
  assert.match(workflow, /npm run audit:public-audio/);
});

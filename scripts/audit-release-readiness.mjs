import { access, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));

const REQUIRED_PRIVACY_SECTIONS = [
  "## Stored Data",
  "## Network Behavior",
  "## Permissions",
  "## No Sale Or Sharing",
  "## User Controls"
];

export async function auditReleaseReadiness(root = ROOT) {
  const failures = [];
  const fail = (message) => failures.push(message);

  const packageJson = await readJson(root, "package.json");
  const manifest = await readJson(root, "manifest.json");
  const privacy = await readText(root, "PRIVACY.md");
  const readme = await readText(root, "README.md");
  const listing = await readText(root, "store-listing/chrome-web-store/listing/en.md");
  const privacyForm = await readText(root, "docs/chrome-web-store/privacy-form.md");
  const reviewerNotes = await readText(root, "docs/chrome-web-store/reviewer-notes.md");
  const extraFields = await readText(root, "docs/chrome-web-store/additional-fields.md");

  if (packageJson.license !== "GPL-3.0-only") {
    fail("package.json license must be GPL-3.0-only.");
  }

  if (packageJson.version !== manifest.version) {
    fail("package.json and manifest.json versions must match.");
  }

  await expectPath(root, manifest.action?.default_popup, "manifest action popup", fail);
  await expectPath(root, manifest.background?.service_worker, "manifest service worker", fail);
  await expectPath(root, manifest.options_ui?.page, "manifest options page", fail);

  for (const [size, iconPath] of Object.entries(manifest.icons || {})) {
    await expectPath(root, iconPath, `manifest ${size}px icon`, fail);
  }

  for (const [size, iconPath] of Object.entries(manifest.action?.default_icon || {})) {
    await expectPath(root, iconPath, `manifest action ${size}px icon`, fail);
  }

  for (const group of manifest.web_accessible_resources || []) {
    for (const resource of group.resources || []) {
      await expectPath(root, resourceBasePath(resource), `web accessible resource ${resource}`, fail);
    }
  }

  for (const permission of manifest.permissions || []) {
    if (!privacy.includes(`\`${permission}\``)) {
      fail(`PRIVACY.md must explain the ${permission} permission.`);
    }

    if (!privacyForm.includes(`permission.${permission}:`)) {
      fail(`Chrome Web Store privacy form must explain the ${permission} permission.`);
    }
  }

  for (const section of REQUIRED_PRIVACY_SECTIONS) {
    if (!privacy.includes(section)) {
      fail(`PRIVACY.md must include ${section}.`);
    }
  }

  if (!privacyForm.includes("remote_code:\nno")) {
    fail("Chrome Web Store privacy form must state remote_code: no.");
  }

  if (!privacyForm.includes("certification.no_sell_or_transfer:\nyes")) {
    fail("Chrome Web Store privacy form must certify no sale or transfer.");
  }

  if (!readme.includes("https://github.com/molodchyk/SayThis")) {
    fail("README.md must publish the source URL.");
  }

  if (!readme.includes("PRIVACY.md") || !readme.includes("docs/privacy-policy.md")) {
    fail("README.md must link privacy docs.");
  }

  if (!readme.includes("## Load Locally")) {
    fail("README.md must include local load steps.");
  }

  if (!listing.includes("https://github.com/molodchyk/SayThis")) {
    fail("Store listing must include the public source URL.");
  }

  if (!listing.includes("GPL-3.0")) {
    fail("Store listing must include the license.");
  }

  if (!reviewerNotes.includes("Default online sources")) {
    fail("Reviewer notes must describe default online sources.");
  }

  if (!extraFields.includes("homepage_url:\nhttps://github.com/molodchyk/SayThis")) {
    fail("Chrome Web Store fields must use the public homepage URL.");
  }

  return failures;
}

async function readText(root, path) {
  return readFile(join(root, path), "utf8");
}

async function readJson(root, path) {
  return JSON.parse(await readText(root, path));
}

async function expectPath(root, path, label, fail) {
  if (!path) {
    fail(`${label} is missing.`);
    return;
  }

  try {
    await access(join(root, path));
  } catch {
    fail(`${label} does not exist: ${path}`);
  }
}

function resourceBasePath(resource) {
  return String(resource || "")
    .replace(/\*.*$/, "")
    .replace(/[\\/]+$/, "");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const failures = await auditReleaseReadiness();
  if (failures.length) {
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exitCode = 1;
  } else {
    console.log("Release readiness audit passed.");
  }
}

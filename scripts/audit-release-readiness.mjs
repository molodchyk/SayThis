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
  const privacyForm = await readText(root, "docs/chrome-web-store-privacy-form.md");
  const nestedPrivacyForm = await readText(root, "docs/chrome-web-store/privacy-form.md");
  const reviewerNotes = await readText(root, "docs/chrome-web-store/reviewer-notes.md");
  const extraFields = await readText(root, "docs/chrome-web-store-additional-fields.md");
  const nestedExtraFields = await readText(root, "docs/chrome-web-store/additional-fields.md");
  const category = await readText(root, "docs/chrome-web-store-category.md");
  const nestedCategory = await readText(root, "docs/chrome-web-store/category.md");
  const optionsHtml = await readText(root, "src/options/options.html");
  const optionsScript = await readText(root, "src/options/index.js");
  const settingsScript = await readText(root, "src/shared/settings.js");
  const permissionScript = await readText(root, "src/permission-origins.js");
  const storeIconPath = "store-listing/chrome-web-store/media/icon-128.png";
  const storeScreenshotPaths = [
    "store-listing/chrome-web-store/media/screenshots/01-popup-lookup.png",
    "store-listing/chrome-web-store/media/screenshots/02-options-controls.png"
  ];

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

  if (/^(?:#|Name:|Summary:|Description:|Detailed Description:)/m.test(listing)) {
    fail("Store listing en.md must contain only the detailed description body.");
  }

  await expectPngDimensions(root, storeIconPath, 128, 128, "StorePilot 128px icon", fail);
  for (const path of storeScreenshotPaths) {
    await expectPngDimensions(root, path, 1280, 800, `StorePilot screenshot ${path}`, fail);
  }

  if (!reviewerNotes.includes("Default online sources")) {
    fail("Reviewer notes must describe default online sources.");
  }

  if (!extraFields.includes("homepage_url:\nhttps://github.com/molodchyk/SayThis")) {
    fail("Chrome Web Store fields must use the public homepage URL.");
  }

  if (!category.includes("Selected category: Tools")) {
    fail("Chrome Web Store category document must use an explicit selected category.");
  }

  if (privacyForm !== nestedPrivacyForm) {
    fail("Root and nested Chrome Web Store privacy forms must match.");
  }

  if (extraFields !== nestedExtraFields) {
    fail("Root and nested Chrome Web Store additional fields must match.");
  }

  if (category !== nestedCategory) {
    fail("Root and nested Chrome Web Store category docs must match.");
  }

  for (const id of ["clear-cache", "clear-memory", "clear-approved", "clear-sync"]) {
    if (!optionsHtml.includes(`id="${id}"`)) {
      fail(`Options page must expose reset control ${id}.`);
    }
  }

  for (const [label, source] of [
    ["options HTML", optionsHtml],
    ["options script", optionsScript],
    ["settings normalizer", settingsScript],
    ["permission origin adapter", permissionScript]
  ]) {
    if (hasRetiredDirectGeneratedAudioControl(source)) {
      fail(`${label} must not expose retired direct generated-audio controls.`);
    }
  }

  return failures;
}

export function hasRetiredDirectGeneratedAudioControl(value) {
  return /voiceService|voice-service|voice service|voice service URL template|voice-service URL template/i.test(String(value || ""));
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

async function expectPngDimensions(root, path, width, height, label, fail) {
  try {
    const png = await readFile(join(root, path));
    if (png.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") {
      fail(`${label} must be a PNG file: ${path}`);
      return;
    }

    const actualWidth = png.readUInt32BE(16);
    const actualHeight = png.readUInt32BE(20);
    if (actualWidth !== width || actualHeight !== height) {
      fail(`${label} must be ${width} x ${height}; found ${actualWidth} x ${actualHeight}.`);
    }
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

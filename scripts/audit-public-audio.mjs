import { readdir, readFile, stat } from "node:fs/promises";
import { posix } from "node:path";
import { pathToFileURL } from "node:url";

const SEED_PATH = "data/pronunciation-seed.json";
const MANIFEST_PATH = "data/public-audio-manifest.json";
const PUBLIC_AUDIO_PREFIX = "assets/audio/public/";
const AUDIO_EXTENSIONS = new Set([".mp3", ".ogg", ".wav", ".webm"]);
const REQUIRED_ENTRY_FIELDS = [
  "path",
  "label",
  "source",
  "license",
  "attribution",
  "reviewStatus"
];
const PUBLISHABLE_REVIEW_STATUSES = new Set(["approved"]);

export async function auditPublicAudio(root = process.cwd()) {
  const [seed, manifest] = await Promise.all([
    readJson(root, SEED_PATH),
    readJson(root, MANIFEST_PATH)
  ]);
  const findings = [];
  const manifestEntries = Array.isArray(manifest.entries) ? manifest.entries : [];
  const manifestByPath = new Map();
  const referencedPaths = seedPublicAudioPaths(seed);
  const packagedAudioPaths = await publicAudioFiles(root);

  if (manifest.schemaVersion !== 1) {
    findings.push(finding("manifest-schema", MANIFEST_PATH, "Public audio manifest schemaVersion must be 1."));
  }

  for (const entry of manifestEntries) {
    const path = normalizePath(entry?.path);
    const missingFields = REQUIRED_ENTRY_FIELDS.filter((field) => !normalizeText(entry?.[field]));

    if (!path) {
      findings.push(finding("manifest-path", MANIFEST_PATH, "Public audio manifest entry is missing a path."));
      continue;
    }
    if (!isPublicAudioPath(path)) {
      findings.push(finding("manifest-path", path, "Public audio manifest entries must stay under assets/audio/public/."));
      continue;
    }
    if (!AUDIO_EXTENSIONS.has(posix.extname(path).toLowerCase())) {
      findings.push(finding("manifest-extension", path, "Public audio manifest entry must use a supported audio extension."));
    }
    if (missingFields.length) {
      findings.push(finding("manifest-fields", path, `Public audio manifest entry is missing: ${missingFields.join(", ")}.`));
    }
    if (!PUBLISHABLE_REVIEW_STATUSES.has(normalizeText(entry.reviewStatus))) {
      findings.push(finding("manifest-review", path, "Public audio manifest entry must be approved before release."));
    }
    if (manifestByPath.has(path)) {
      findings.push(finding("manifest-duplicate", path, "Public audio manifest has a duplicate path."));
    }

    manifestByPath.set(path, entry);
  }

  for (const path of referencedPaths) {
    if (!manifestByPath.has(path)) {
      findings.push(finding("seed-reference", path, "Seed entry references packaged audio that is missing public manifest metadata."));
    }
    if (!await exists(root, path)) {
      findings.push(finding("seed-reference", path, "Seed entry references packaged audio that is missing from disk."));
    }
  }

  for (const path of packagedAudioPaths) {
    if (!manifestByPath.has(path)) {
      findings.push(finding("packaged-audio", path, "Packaged public audio file is missing public manifest metadata."));
    }
  }

  for (const path of manifestByPath.keys()) {
    if (!await exists(root, path)) {
      findings.push(finding("manifest-path", path, "Public audio manifest entry points to a missing file."));
    }
  }

  return {
    ok: findings.length === 0,
    findings,
    referencedCount: referencedPaths.length,
    manifestCount: manifestByPath.size,
    packagedCount: packagedAudioPaths.length
  };
}

export function seedPublicAudioPaths(seed = {}) {
  const entries = Array.isArray(seed.entries) ? seed.entries : [];
  const paths = [];
  const seen = new Set();

  for (const entry of entries) {
    const audio = Array.isArray(entry?.pronunciation?.audio) ? entry.pronunciation.audio : [];
    for (const item of audio) {
      const path = normalizePath(item?.url);
      if (!isPublicAudioPath(path) || seen.has(path)) {
        continue;
      }
      seen.add(path);
      paths.push(path);
    }
  }

  return paths;
}

export function isPublicAudioPath(path) {
  const normalized = normalizePath(path);
  return normalized.startsWith(PUBLIC_AUDIO_PREFIX) && AUDIO_EXTENSIONS.has(posix.extname(normalized).toLowerCase());
}

function finding(type, path, message) {
  return { type, path, message };
}

async function publicAudioFiles(root) {
  const files = [];
  await walkAudioDirectory(root, PUBLIC_AUDIO_PREFIX, files);
  return files.sort((left, right) => left.localeCompare(right));
}

async function walkAudioDirectory(root, directoryPath, files) {
  const absolutePath = joinRoot(root, directoryPath);
  let entries;

  try {
    entries = await readdir(absolutePath, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const path = posix.join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      await walkAudioDirectory(root, path, files);
    } else if (entry.isFile() && isPublicAudioPath(path)) {
      files.push(path);
    }
  }
}

async function readJson(root, path) {
  return JSON.parse(await readFile(joinRoot(root, path), "utf8"));
}

async function exists(root, path) {
  try {
    const stats = await stat(joinRoot(root, path));
    return stats.isFile();
  } catch {
    return false;
  }
}

function normalizePath(value) {
  return String(value || "").replaceAll("\\", "/").replace(/^\/+/, "").trim();
}

function normalizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function joinRoot(root, ...parts) {
  return posix.join(String(root).replaceAll("\\", "/"), ...parts);
}

function printAudit(audit) {
  if (audit.ok) {
    console.log("public audio audit clean");
    return;
  }

  for (const item of audit.findings) {
    console.log(`${item.type}: ${item.path}: ${item.message}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const audit = await auditPublicAudio();
  printAudit(audit);
  if (!audit.ok) {
    process.exitCode = 1;
  }
}

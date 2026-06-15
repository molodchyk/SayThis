import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, posix } from "node:path";
import { pathToFileURL } from "node:url";
import { deflateRawSync } from "node:zlib";

const PACKAGE_ROOTS = [
  "manifest.json",
  "src",
  "data",
  "assets/icons",
  "assets/audio/public"
];
const DEFAULT_OUTPUT_DIR = "dist";

export async function collectPackageFiles(root = process.cwd()) {
  const { readdir, stat } = await import("node:fs/promises");
  const files = [];

  for (const entry of PACKAGE_ROOTS) {
    const path = posix.join(rootToPosix(root), entry);
    const stats = await stat(path);
    if (stats.isDirectory()) {
      await walkDirectory(path, entry, files, readdir, stat);
    } else {
      files.push(entry);
    }
  }

  return files
    .filter(isPackageFile)
    .sort((left, right) => left.localeCompare(right));
}

export function packageNameFromManifest(manifest) {
  const name = String(manifest.name || "extension")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "extension";
  const version = String(manifest.version || "0.0.0").replace(/[^0-9a-z.-]+/gi, "-");
  return `${name}-chrome-v${version}.zip`;
}

export async function createExtensionPackage(options = {}) {
  const root = options.root || process.cwd();
  const outputDir = options.outputDir || DEFAULT_OUTPUT_DIR;
  const manifest = JSON.parse(await readFile(joinRoot(root, "manifest.json"), "utf8"));
  const outputPath = options.outputPath || joinRoot(root, outputDir, packageNameFromManifest(manifest));
  const files = await collectPackageFiles(root);
  const entries = [];

  for (const relativePath of files) {
    entries.push({
      path: relativePath,
      data: await readFile(joinRoot(root, relativePath))
    });
  }

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, createZip(entries));
  return {
    outputPath,
    files
  };
}

export function createZip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const entry of entries) {
    const path = normalizeZipPath(entry.path);
    const name = Buffer.from(path, "utf8");
    const data = Buffer.from(entry.data);
    const compressed = deflateRawSync(data);
    const crc = crc32(data);
    const local = localHeader(name, compressed.length, data.length, crc);
    const central = centralHeader(name, compressed.length, data.length, crc, offset);

    localParts.push(local, compressed);
    centralParts.push(central);
    offset += local.length + compressed.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const localData = Buffer.concat(localParts);
  const end = endRecord(entries.length, centralDirectory.length, localData.length);
  return Buffer.concat([localData, centralDirectory, end]);
}

async function walkDirectory(rootPath, packagePath, files, readdir, stat) {
  const items = await readdir(rootPath);
  for (const item of items) {
    const absolute = posix.join(rootPath, item);
    const relative = posix.join(packagePath, item);
    const stats = await stat(absolute);
    if (stats.isDirectory()) {
      await walkDirectory(absolute, relative, files, readdir, stat);
    } else {
      files.push(relative);
    }
  }
}

function isPackageFile(path) {
  if (path.includes("/README.md")) {
    return false;
  }

  return ![
    ".map",
    ".test.js",
    ".spec.js"
  ].some((suffix) => path.endsWith(suffix));
}

function normalizeZipPath(path) {
  return path.replaceAll("\\", "/").replace(/^\/+/, "");
}

function joinRoot(root, ...parts) {
  return posix.join(rootToPosix(root), ...parts);
}

function rootToPosix(root) {
  return String(root).replaceAll("\\", "/");
}

function localHeader(name, compressedSize, uncompressedSize, crc) {
  const buffer = Buffer.alloc(30);
  buffer.writeUInt32LE(0x04034b50, 0);
  buffer.writeUInt16LE(20, 4);
  buffer.writeUInt16LE(0x0800, 6);
  buffer.writeUInt16LE(8, 8);
  buffer.writeUInt16LE(0, 10);
  buffer.writeUInt16LE(0, 12);
  buffer.writeUInt32LE(crc, 14);
  buffer.writeUInt32LE(compressedSize, 18);
  buffer.writeUInt32LE(uncompressedSize, 22);
  buffer.writeUInt16LE(name.length, 26);
  buffer.writeUInt16LE(0, 28);
  return Buffer.concat([buffer, name]);
}

function centralHeader(name, compressedSize, uncompressedSize, crc, localOffset) {
  const buffer = Buffer.alloc(46);
  buffer.writeUInt32LE(0x02014b50, 0);
  buffer.writeUInt16LE(20, 4);
  buffer.writeUInt16LE(20, 6);
  buffer.writeUInt16LE(0x0800, 8);
  buffer.writeUInt16LE(8, 10);
  buffer.writeUInt16LE(0, 12);
  buffer.writeUInt16LE(0, 14);
  buffer.writeUInt32LE(crc, 16);
  buffer.writeUInt32LE(compressedSize, 20);
  buffer.writeUInt32LE(uncompressedSize, 24);
  buffer.writeUInt16LE(name.length, 28);
  buffer.writeUInt16LE(0, 30);
  buffer.writeUInt16LE(0, 32);
  buffer.writeUInt16LE(0, 34);
  buffer.writeUInt16LE(0, 36);
  buffer.writeUInt32LE(0, 38);
  buffer.writeUInt32LE(localOffset, 42);
  return Buffer.concat([buffer, name]);
}

function endRecord(entryCount, centralSize, centralOffset) {
  const buffer = Buffer.alloc(22);
  buffer.writeUInt32LE(0x06054b50, 0);
  buffer.writeUInt16LE(0, 4);
  buffer.writeUInt16LE(0, 6);
  buffer.writeUInt16LE(entryCount, 8);
  buffer.writeUInt16LE(entryCount, 10);
  buffer.writeUInt32LE(centralSize, 12);
  buffer.writeUInt32LE(centralOffset, 16);
  buffer.writeUInt16LE(0, 20);
  return buffer;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createCrcTable() {
  return Array.from({ length: 256 }, (_, index) => {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    return value >>> 0;
  });
}

const CRC_TABLE = createCrcTable();

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await createExtensionPackage();
  console.log(`wrote ${result.outputPath}`);
}

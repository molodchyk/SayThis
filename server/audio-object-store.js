import { createHash, createHmac } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";

const AUDIO_CACHE_CONTROL = "public, max-age=31536000, immutable";
const AWS_SIGNING_ALGORITHM = "AWS4-HMAC-SHA256";
const AWS_SERVICE = "s3";
const EMPTY_SHA256 = sha256Hex(Buffer.alloc(0));

export function createConfiguredAudioObjectStore(options = {}) {
  const objectStore = createS3CompatibleAudioObjectStore({
    endpoint: options.s3Endpoint,
    bucket: options.s3Bucket,
    region: options.s3Region,
    accessKeyId: options.s3AccessKeyId,
    secretAccessKey: options.s3SecretAccessKey,
    fetch: options.fetch
  });
  if (objectStore) {
    return objectStore;
  }

  return createLocalAudioObjectStore({
    rootDir: options.localDir || options.rootDir
  });
}

export function createConfiguredAudioObjectStoreFromEnvironment(options = {}) {
  return createConfiguredAudioObjectStore({
    localDir: process.env.SAYTHIS_AUDIO_OBJECT_DIR,
    s3Endpoint: process.env.SAYTHIS_AUDIO_S3_ENDPOINT,
    s3Bucket: process.env.SAYTHIS_AUDIO_S3_BUCKET,
    s3Region: process.env.SAYTHIS_AUDIO_S3_REGION,
    s3AccessKeyId: process.env.SAYTHIS_AUDIO_S3_ACCESS_KEY_ID,
    s3SecretAccessKey: process.env.SAYTHIS_AUDIO_S3_SECRET_ACCESS_KEY,
    fetch: options.fetch
  });
}

export function createS3CompatibleAudioObjectStore(options = {}) {
  const endpoint = normalizeHttpsEndpoint(options.endpoint);
  const bucket = normalizeBucketName(options.bucket);
  const region = normalizeAwsRegion(options.region) || "auto";
  const accessKeyId = normalizeCredential(options.accessKeyId);
  const secretAccessKey = normalizeCredential(options.secretAccessKey);
  const fetchImpl = typeof options.fetch === "function" ? options.fetch : globalThis.fetch;
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey || typeof fetchImpl !== "function") {
    return null;
  }

  return {
    name: "s3-compatible-audio-store",
    configured: true,
    inlineBytes: false,
    async put(artifact = {}) {
      const storageKey = normalizeAudioStorageKey(artifact.storageKey);
      const bytes = audioBytesFromArtifact(artifact);
      if (!storageKey || !bytes.length) {
        return { ok: false, error: "invalid-audio-object" };
      }

      const request = signedS3ObjectRequest({
        method: "PUT",
        endpoint,
        bucket,
        storageKey,
        region,
        accessKeyId,
        secretAccessKey,
        body: bytes,
        headers: {
          "cache-control": AUDIO_CACHE_CONTROL,
          "content-type": normalizeContentType(artifact.mimeType)
        },
        now: options.now
      });
      const response = await fetchImpl(request.url, {
        method: "PUT",
        headers: request.headers,
        body: bytes
      });
      if (!response?.ok) {
        return { ok: false, error: `audio-object-upload-failed-${response?.status || "unknown"}` };
      }

      return {
        ok: true,
        storageKey,
        byteLength: bytes.length
      };
    },
    async get(storageKey) {
      const key = normalizeAudioStorageKey(storageKey);
      if (!key) {
        return null;
      }

      const request = signedS3ObjectRequest({
        method: "GET",
        endpoint,
        bucket,
        storageKey: key,
        region,
        accessKeyId,
        secretAccessKey,
        now: options.now
      });
      const response = await fetchImpl(request.url, {
        method: "GET",
        headers: request.headers
      });
      if (!response?.ok || typeof response.arrayBuffer !== "function") {
        return null;
      }

      return Buffer.from(await response.arrayBuffer());
    }
  };
}

export function createLocalAudioObjectStore(options = {}) {
  const rootDir = normalizePath(options.rootDir);
  if (!rootDir) {
    return null;
  }

  const root = resolve(rootDir);
  return {
    name: "local-file-audio-store",
    configured: true,
    inlineBytes: false,
    async put(artifact = {}) {
      const storageKey = normalizeAudioStorageKey(artifact.storageKey);
      const bytes = audioBytesFromArtifact(artifact);
      if (!storageKey || !bytes.length) {
        return { ok: false, error: "invalid-audio-object" };
      }

      const filePath = objectPath(root, storageKey);
      if (!filePath) {
        return { ok: false, error: "invalid-audio-object-path" };
      }

      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, bytes);
      return {
        ok: true,
        storageKey,
        byteLength: bytes.length
      };
    },
    async get(storageKey) {
      const key = normalizeAudioStorageKey(storageKey);
      if (!key) {
        return null;
      }

      const filePath = objectPath(root, key);
      if (!filePath) {
        return null;
      }

      try {
        return await readFile(filePath);
      } catch {
        return null;
      }
    }
  };
}

export async function persistAudioArtifactBytes(artifact = {}, objectStore = null) {
  const safeArtifact = safeObject(artifact);
  if (!objectStore || typeof objectStore.put !== "function") {
    return { ok: true, artifact: safeArtifact };
  }

  const result = await objectStore.put(safeArtifact);
  if (!result?.ok) {
    return {
      ok: false,
      status: 500,
      error: result?.error || "audio-storage-failed"
    };
  }

  return {
    ok: true,
    artifact: {
      ...safeArtifact,
      storageKey: result.storageKey || safeArtifact.storageKey,
      ...(objectStore.inlineBytes === false ? { dataBase64: "" } : {})
    }
  };
}

export async function readAudioArtifactBytes(artifact = {}, objectStore = null) {
  const safeArtifact = safeObject(artifact);
  const inlineBytes = audioBytesFromArtifact(safeArtifact);
  if (inlineBytes.length) {
    return inlineBytes;
  }

  if (!objectStore || typeof objectStore.get !== "function") {
    return null;
  }

  return objectStore.get(safeArtifact.storageKey);
}

export function checkPublicAudioStorage(options = {}) {
  if (options.audioPublicBaseUrl && !options.audioObjectStore) {
    return {
      ok: false,
      status: 503,
      error: "audio-object-store-not-configured"
    };
  }

  return {
    ok: true,
    audioPublicBaseUrl: options.audioPublicBaseUrl || ""
  };
}

export function normalizeAudioStorageKey(value) {
  return String(value || "")
    .trim()
    .replace(/\\/g, "/")
    .match(/^audio\/sha256\/[a-f0-9]{64}\.(?:mp3|ogg|wav|webm|m4a)$/)?.[0] || "";
}

function audioBytesFromArtifact(artifact = {}) {
  const safeArtifact = safeObject(artifact);
  const raw = String(safeArtifact.dataBase64 || "").replace(/\s+/g, "");
  if (!raw || !/^[A-Za-z0-9+/]+={0,2}$/.test(raw)) {
    return Buffer.alloc(0);
  }

  return Buffer.from(raw, "base64");
}

function objectPath(root, storageKey) {
  const key = normalizeAudioStorageKey(storageKey);
  if (!key) {
    return "";
  }

  const target = resolve(root, ...key.split("/"));
  const rootPrefix = root.endsWith(sep) ? root : `${root}${sep}`;
  return target === root || target.startsWith(rootPrefix) ? target : "";
}

function normalizePath(value) {
  return String(value || "").trim();
}

function signedS3ObjectRequest(options = {}) {
  const method = String(options.method || "GET").toUpperCase();
  const url = s3ObjectUrl(options.endpoint, options.bucket, options.storageKey);
  const payloadHash = method === "PUT" ? sha256Hex(options.body || Buffer.alloc(0)) : EMPTY_SHA256;
  const amzDate = awsDate(options.now || new Date());
  const dateStamp = amzDate.slice(0, 8);
  const headers = lowerCaseHeaders({
    ...options.headers,
    host: url.host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate
  });
  const signedHeaders = Object.keys(headers).sort();
  const canonicalHeaders = signedHeaders
    .map((name) => `${name}:${normalizeHeaderValue(headers[name])}\n`)
    .join("");
  const canonicalRequest = [
    method,
    url.pathname,
    "",
    canonicalHeaders,
    signedHeaders.join(";"),
    payloadHash
  ].join("\n");
  const credentialScope = `${dateStamp}/${options.region}/${AWS_SERVICE}/aws4_request`;
  const stringToSign = [
    AWS_SIGNING_ALGORITHM,
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest)
  ].join("\n");
  const signature = hmacHex(signingKey(options.secretAccessKey, dateStamp, options.region), stringToSign);

  return {
    url: url.toString(),
    headers: {
      ...headers,
      authorization: `${AWS_SIGNING_ALGORITHM} Credential=${options.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders.join(";")}, Signature=${signature}`
    }
  };
}

function s3ObjectUrl(endpoint, bucket, storageKey) {
  const url = new URL(endpoint);
  const basePath = url.pathname.replace(/\/+$/, "");
  url.pathname = [
    basePath,
    encodeURIComponent(bucket),
    ...storageKey.split("/").map((part) => encodeURIComponent(part))
  ].filter(Boolean).join("/");
  return url;
}

function signingKey(secretAccessKey, dateStamp, region) {
  const kDate = hmac(Buffer.from(`AWS4${secretAccessKey}`, "utf8"), dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, AWS_SERVICE);
  return hmac(kService, "aws4_request");
}

function hmac(key, value) {
  return createHmac("sha256", key).update(value).digest();
}

function hmacHex(key, value) {
  return createHmac("sha256", key).update(value).digest("hex");
}

function sha256Hex(value) {
  return createHash("sha256").update(value).digest("hex");
}

function awsDate(value) {
  return new Date(value).toISOString().replace(/[:-]|\.\d{3}/g, "");
}

function lowerCaseHeaders(headers = {}) {
  return Object.fromEntries(
    Object.entries(headers)
      .map(([key, value]) => [String(key).trim().toLowerCase(), normalizeHeaderValue(value)])
      .filter(([key, value]) => key && value)
  );
}

function normalizeHeaderValue(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function normalizeHttpsEndpoint(value) {
  const raw = normalizePath(value);
  if (!raw) {
    return "";
  }

  try {
    const url = new URL(raw);
    url.search = "";
    url.hash = "";
    return url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

function normalizeBucketName(value) {
  return String(value || "")
    .trim()
    .match(/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/)?.[0] || "";
}

function normalizeAwsRegion(value) {
  return String(value || "")
    .trim()
    .match(/^[a-z0-9-]{1,32}$/)?.[0] || "";
}

function normalizeCredential(value) {
  return String(value || "").trim();
}

function normalizeContentType(value) {
  const contentType = String(value || "").trim().toLowerCase();
  return /^audio\/[a-z0-9.+-]+$/.test(contentType) ? contentType : "application/octet-stream";
}

function safeObject(value) {
  return value && typeof value === "object" ? value : {};
}

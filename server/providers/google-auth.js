import { createSign } from "node:crypto";
import { readFile } from "node:fs/promises";

const DEFAULT_SCOPE = "https://www.googleapis.com/auth/cloud-platform";
const DEFAULT_TOKEN_URI = "https://oauth2.googleapis.com/token";
const DEFAULT_EXPIRES_IN_SECONDS = 3600;
const TOKEN_REFRESH_SKEW_MS = 60 * 1000;

export function createGoogleAccessTokenProvider(options = {}) {
  const staticToken = normalizeToken(options.accessToken);
  if (staticToken) {
    return Object.assign(async () => staticToken, { configured: true });
  }

  const fetchImpl = options.fetch || globalThis.fetch?.bind(globalThis);
  const credentialsProvider = createServiceAccountCredentialsProvider(options);
  const configured = Boolean(typeof fetchImpl === "function" && credentialsProvider.configured);
  let cachedToken = null;

  return Object.assign(async function accessToken() {
    if (!configured) {
      return "";
    }

    const now = nowMs(options);
    if (cachedToken && cachedToken.expiresAt - TOKEN_REFRESH_SKEW_MS > now) {
      return cachedToken.value;
    }

    const credentials = await credentialsProvider();
    if (!credentials) {
      return "";
    }

    const tokenUri = credentials.tokenUri || DEFAULT_TOKEN_URI;
    const assertion = createServiceAccountJwt(credentials, {
      now: options.now,
      scope: options.scope
    });
    const response = await fetchImpl(tokenUri, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion
      }).toString()
    });
    if (!response?.ok) {
      return "";
    }

    const payload = await response.json();
    const token = normalizeToken(payload?.access_token);
    if (!token) {
      return "";
    }

    cachedToken = {
      value: token,
      expiresAt: now + normalizeExpiresIn(payload?.expires_in) * 1000
    };
    return token;
  }, { configured });
}

export function createServiceAccountCredentialsProvider(options = {}) {
  const inlineCredentials = normalizeServiceAccountCredentials(
    options.serviceAccount || parseJson(options.serviceAccountJson)
  );
  const credentialsPath = normalizePath(
    options.credentialsPath ||
    options.applicationCredentialsPath ||
    options.googleApplicationCredentials
  );
  let loaded = false;
  let cachedCredentials = inlineCredentials;

  return Object.assign(async function serviceAccountCredentials() {
    if (cachedCredentials || loaded || !credentialsPath) {
      loaded = true;
      return cachedCredentials;
    }

    loaded = true;
    try {
      cachedCredentials = normalizeServiceAccountCredentials(
        JSON.parse(await readFile(credentialsPath, "utf8"))
      );
    } catch {
      cachedCredentials = null;
    }
    return cachedCredentials;
  }, {
    configured: Boolean(inlineCredentials || credentialsPath)
  });
}

export function createServiceAccountJwt(credentials = {}, options = {}) {
  const normalized = normalizeServiceAccountCredentials(credentials);
  if (!normalized) {
    return "";
  }

  const issuedAt = Math.floor(nowMs(options) / 1000);
  const header = {
    alg: "RS256",
    typ: "JWT"
  };
  const payload = {
    iss: normalized.clientEmail,
    scope: normalizeScope(options.scope),
    aud: normalized.tokenUri || DEFAULT_TOKEN_URI,
    iat: issuedAt,
    exp: issuedAt + DEFAULT_EXPIRES_IN_SECONDS
  };
  const unsigned = `${base64UrlJson(header)}.${base64UrlJson(payload)}`;
  const signature = createSign("RSA-SHA256")
    .update(unsigned)
    .end()
    .sign(normalized.privateKey);

  return `${unsigned}.${base64Url(signature)}`;
}

function normalizeServiceAccountCredentials(value = {}) {
  const clientEmail = String(value?.client_email || value?.clientEmail || "").trim();
  const privateKey = String(value?.private_key || value?.privateKey || "")
    .replace(/\\n/g, "\n")
    .trim();
  const tokenUri = String(value?.token_uri || value?.tokenUri || DEFAULT_TOKEN_URI).trim();

  if (!clientEmail || !privateKey || !tokenUri) {
    return null;
  }

  return {
    clientEmail,
    privateKey,
    tokenUri
  };
}

function parseJson(value) {
  if (!value || typeof value === "object") {
    return value;
  }

  try {
    return JSON.parse(String(value));
  } catch {
    return null;
  }
}

function normalizePath(value) {
  return String(value || "").trim();
}

function normalizeToken(value) {
  return String(value || "").trim();
}

function normalizeScope(value) {
  return String(value || "").trim() || DEFAULT_SCOPE;
}

function normalizeExpiresIn(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0
    ? Math.min(number, DEFAULT_EXPIRES_IN_SECONDS)
    : DEFAULT_EXPIRES_IN_SECONDS;
}

function nowMs(options = {}) {
  return typeof options.now === "function" ? Number(options.now()) : Date.now();
}

function base64UrlJson(value) {
  return base64Url(Buffer.from(JSON.stringify(value), "utf8"));
}

function base64Url(value) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

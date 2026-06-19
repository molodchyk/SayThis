import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import test from "node:test";
import {
  createGoogleAccessTokenProvider,
  createServiceAccountJwt
} from "../../server/google-auth.js";

test("creates service-account JWTs for Google OAuth token exchange", () => {
  const credentials = serviceAccountCredentials();
  const jwt = createServiceAccountJwt(credentials, {
    now: () => Date.parse("2026-01-01T00:00:00.000Z"),
    scope: "https://www.googleapis.com/auth/cloud-platform"
  });
  const [header, payload, signature] = jwt.split(".");

  assert.equal(JSON.parse(base64UrlDecode(header)).alg, "RS256");
  assert.equal(signature.length > 40, true);
  assert.deepEqual(JSON.parse(base64UrlDecode(payload)), {
    iss: "voice-service@example-project.iam.gserviceaccount.com",
    scope: "https://www.googleapis.com/auth/cloud-platform",
    aud: "https://oauth2.googleapis.com/token",
    iat: 1767225600,
    exp: 1767229200
  });
});

test("exchanges service-account JWTs for cached access tokens", async () => {
  const credentials = serviceAccountCredentials();
  const calls = [];
  const provider = createGoogleAccessTokenProvider({
    serviceAccount: credentials,
    now: () => Date.parse("2026-01-01T00:00:00.000Z"),
    fetch: async (url, init) => {
      calls.push({ url, init });
      const body = new URLSearchParams(init.body);
      assert.equal(body.get("grant_type"), "urn:ietf:params:oauth:grant-type:jwt-bearer");
      assert.equal(JSON.parse(base64UrlDecode(body.get("assertion").split(".")[1])).iss, credentials.client_email);
      return {
        ok: true,
        async json() {
          return {
            access_token: "google-access-token",
            expires_in: 3600
          };
        }
      };
    }
  });

  assert.equal(provider.configured, true);
  assert.equal(await provider(), "google-access-token");
  assert.equal(await provider(), "google-access-token");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://oauth2.googleapis.com/token");
  assert.equal(calls[0].init.headers["content-type"], "application/x-www-form-urlencoded");
});

function serviceAccountCredentials() {
  const { privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048
  });

  return {
    client_email: "voice-service@example-project.iam.gserviceaccount.com",
    private_key: privateKey.export({
      format: "pem",
      type: "pkcs8"
    }),
    token_uri: "https://oauth2.googleapis.com/token"
  };
}

function base64UrlDecode(value) {
  return Buffer.from(
    String(value || "")
      .replace(/-/g, "+")
      .replace(/_/g, "/"),
    "base64"
  ).toString("utf8");
}

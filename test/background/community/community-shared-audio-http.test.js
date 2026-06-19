import assert from "node:assert/strict";
import test from "node:test";
import {
  requestSharedAudioEntry
} from "../../../src/background/community-feedback-flow.js";

const REQUEST_BODY = {
  term: "Exampletown",
  lookupKey: "exampletown",
  sourceForm: "Przykladowo",
  ttsLang: "pl-PL"
};

test("builds shared audio HTTP requests", async () => {
  const payload = await requestSharedAudioEntry("https://example.com/community?client=public", REQUEST_BODY, {
    fetch: async (url, options) => {
      assert.equal(url, "https://example.com/community?client=public&action=audio");
      assert.equal(options.method, "POST");
      assert.equal(options.headers.Accept, "application/json");
      assert.equal(options.headers.Authorization, undefined);
      assert.equal(JSON.parse(options.body).sourceForm, "Przykladowo");
      return sharedAudioResponse();
    }
  });

  assert.equal(payload.entry.audioUrl, "https://example.com/audio/aud_1234567890abcdef");
});

test("does not send client generation tokens to shared audio endpoints", async () => {
  const payload = await requestSharedAudioEntry("https://example.com/community", REQUEST_BODY, {
    sharedAudioGenerationToken: " client-token ",
    fetch: async (url, options) => {
      assert.equal(url, "https://example.com/community?action=audio");
      assert.equal(options.headers.Authorization, undefined);
      return sharedAudioResponse();
    }
  });

  assert.equal(payload.entry.audioUrl, "https://example.com/audio/aud_1234567890abcdef");
});

test("times out shared audio HTTP requests", async () => {
  await assert.rejects(
    requestSharedAudioEntry("https://example.com/community", REQUEST_BODY, {
      sharedAudioHttpTimeoutMs: 1,
      fetch: async (_url, options) => new Promise((_resolve, reject) => {
        assert.ok(options.signal);
        options.signal.addEventListener("abort", () => {
          reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
        });
      })
    }),
    /Shared audio timed out/
  );
});

function sharedAudioResponse() {
  return {
    ok: true,
    async json() {
      return {
        entry: {
          audioUrl: "https://example.com/audio/aud_1234567890abcdef"
        }
      };
    }
  };
}

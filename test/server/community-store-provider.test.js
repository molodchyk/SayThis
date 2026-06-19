import assert from "node:assert/strict";
import test from "node:test";
import {
  acceptSubmission,
  approveSubmission,
  createEmptyStore
} from "../../server/community-store.js";

test("approves generated result provider voice from submissions", () => {
  let result = acceptSubmission(createEmptyStore("2026-01-01T00:00:00.000Z"), {
    id: "sub_generated_provider",
    term: "Exampletown",
    lookupKey: "exampletown",
    kind: "confirm",
    result: {
      display: "Exampletown",
      sourceForm: "Przykladowo",
      language: "pl",
      ttsLang: "pl-PL",
      audioUrl: "https://community.example/audio/generated.ogg",
      provider: "pl-PL-TestVoice",
      sourceStatus: "generated-audio",
      trustSignals: ["service-generated", "generated-audio", "audio-backed"]
    }
  }, "2026-01-01T00:00:00.000Z");

  result = approveSubmission(result.store, "sub_generated_provider", {}, "2026-01-02T00:00:00.000Z");

  assert.equal(result.approved, true);
  assert.equal(result.entry.provider, "pl-PL-TestVoice");
  assert.equal(result.entry.sourceStatus, "generated-audio");
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  hasPlayableAudio,
  resolvePlayableResult
} from "../../src/background/pronunciation-playback-flow.js";

test("detects preferred pronunciation audio", () => {
  assert.equal(hasPlayableAudio({
    pronunciation: {
      audio: [{ url: "https://audio.example/item.ogg", quality: "verified" }]
    }
  }), true);
  assert.equal(hasPlayableAudio({
    sourceStatus: "generated-audio",
    pronunciation: {
      audio: [{ url: "https://voice.example/item.ogg", quality: "generated" }]
    }
  }), false);
  assert.equal(hasPlayableAudio({
    pronunciation: {
      audio: [{ label: "missing url" }]
    }
  }), false);
});

test("retries no-audio results online with local context", async () => {
  const calls = [];
  const result = { display: "Exampletown", sourceStatus: "structured-source" };
  const enriched = {
    display: "Exampletown",
    sourceStatus: "verified-audio",
    pronunciation: {
      audio: [{ url: "https://audio.example/item.ogg" }]
    }
  };

  const playable = await resolvePlayableResult("Exampletown", result, {}, {
    resolveSelection: async (text, options) => {
      calls.push([text, options]);
      return enriched;
    }
  });

  assert.equal(playable, enriched);
  assert.deepEqual(calls, [["Exampletown", { useOnline: true, localResult: result }]]);
});

test("retries generated-audio results before playback", async () => {
  const calls = [];
  const generated = {
    display: "Exampletown",
    sourceStatus: "generated-audio",
    pronunciation: {
      audio: [{ url: "https://voice.example/item.ogg", quality: "generated" }]
    }
  };
  const verified = {
    display: "Exampletown",
    sourceStatus: "verified-audio",
    pronunciation: {
      audio: [{ url: "https://audio.example/item.ogg", quality: "verified" }]
    }
  };

  const playable = await resolvePlayableResult("Exampletown", generated, {}, {
    resolveSelection: async (text, options) => {
      calls.push([text, options]);
      return verified;
    }
  });

  assert.equal(playable, verified);
  assert.deepEqual(calls, [["Exampletown", { useOnline: true, localResult: generated }]]);
});

test("requests shared audio after online retry still has no preferred audio", async () => {
  const calls = [];
  const result = { display: "Exampletown", sourceStatus: "structured-source" };
  const enriched = {
    display: "Exampletown",
    sourceStatus: "structured-source",
    sourceForm: "Przykladowo",
    ttsLang: "pl-PL"
  };
  const shared = {
    ...enriched,
    sourceStatus: "generated-audio",
    pronunciation: {
      audio: [{ url: "https://audio.example/generated.ogg", quality: "generated" }]
    }
  };

  const playable = await resolvePlayableResult("Exampletown", result, {}, {
    resolveSelection: async (text, options) => {
      calls.push(["resolveSelection", text, options]);
      return enriched;
    },
    requestSharedAudio: async (text, item, options) => {
      calls.push(["requestSharedAudio", text, item, options]);
      return shared;
    }
  });

  assert.equal(playable, shared);
  assert.deepEqual(calls, [
    ["resolveSelection", "Exampletown", { useOnline: true, localResult: result }],
    ["requestSharedAudio", "Exampletown", enriched, {}]
  ]);
});

test("keeps current result when audio exists or retry fails", async () => {
  const audioResult = {
    display: "Exampletown",
    pronunciation: {
      audio: [{ url: "https://audio.example/item.ogg", quality: "verified" }]
    }
  };
  const noAudioResult = { display: "Exampletown" };

  assert.equal(await resolvePlayableResult("Exampletown", audioResult, {}, {
    resolveSelection: async () => {
      throw new Error("should not retry");
    }
  }), audioResult);

  assert.equal(await resolvePlayableResult("Exampletown", noAudioResult, {}, {
    resolveSelection: async () => {
      throw new Error("offline");
    }
  }), noAudioResult);

  assert.equal(await resolvePlayableResult("Exampletown", null, {}, {
    resolveSelection: async () => {
      throw new Error("should not retry");
    }
  }), null);
});

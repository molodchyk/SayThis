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

test("retries generic verified audio before playback to find stronger audio", async () => {
  const calls = [];
  const generic = {
    display: "Exampletown",
    sourceStatus: "verified-audio",
    pronunciation: {
      audio: [{
        url: "https://dictionary.example/item.ogg",
        quality: "verified"
      }]
    }
  };
  const stronger = {
    display: "Exampletown",
    sourceStatus: "verified-audio",
    pronunciation: {
      audio: [{
        url: "https://audio.example/native.ogg",
        quality: "native-speaker"
      }, {
        url: "https://dictionary.example/item.ogg",
        quality: "verified"
      }]
    }
  };

  const playable = await resolvePlayableResult("Exampletown", generic, {}, {
    resolveSelection: async (text, options) => {
      calls.push([text, options]);
      return stronger;
    }
  });

  assert.equal(playable, stronger);
  assert.deepEqual(calls, [["Exampletown", { useOnline: true, localResult: generic }]]);
});

test("checks shared audio when refresh leaves generic verified audio", async () => {
  const calls = [];
  const generic = {
    display: "Exampletown",
    sourceStatus: "verified-audio",
    pronunciation: {
      audio: [{
        url: "https://dictionary.example/item.ogg",
        quality: "verified"
      }]
    }
  };

  const playable = await resolvePlayableResult("Exampletown", generic, {}, {
    resolveSelection: async (text, options) => {
      calls.push([text, options]);
      return generic;
    },
    requestSharedAudio: async () => {
      calls.push(["requestSharedAudio", "Exampletown", generic, {}]);
      return generic;
    }
  });

  assert.equal(playable, generic);
  assert.deepEqual(calls, [
    ["Exampletown", { useOnline: true, localResult: generic }],
    ["requestSharedAudio", "Exampletown", generic, {}]
  ]);
});

test("does not retry top-tier audio before playback", async () => {
  const calls = [];
  const native = {
    display: "Exampletown",
    sourceStatus: "verified-audio",
    pronunciation: {
      audio: [{
        url: "https://audio.example/native.ogg",
        quality: "native-speaker"
      }]
    }
  };

  const playable = await resolvePlayableResult("Exampletown", native, {}, {
    resolveSelection: async () => {
      calls.push("unexpected");
      return null;
    }
  });

  assert.equal(playable, native);
  assert.deepEqual(calls, []);
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

test("requests shared audio after generated-audio retry finds no recording", async () => {
  const calls = [];
  const generated = {
    display: "Exampletown",
    sourceStatus: "generated-audio",
    sourceForm: "Przykladowo",
    ttsLang: "pl-PL",
    pronunciation: {
      audio: [{ url: "https://voice.example/item.ogg", quality: "generated" }]
    }
  };
  const shared = {
    ...generated,
    pronunciation: {
      audio: [{ url: "https://audio.example/shared.ogg", quality: "generated" }]
    }
  };

  const playable = await resolvePlayableResult("Exampletown", generated, {}, {
    resolveSelection: async (text, options) => {
      calls.push(["resolveSelection", text, options]);
      return generated;
    },
    requestSharedAudio: async (text, item, options) => {
      calls.push(["requestSharedAudio", text, item, options]);
      return shared;
    }
  });

  assert.equal(playable, shared);
  assert.deepEqual(calls, [
    ["resolveSelection", "Exampletown", { useOnline: true, localResult: generated }],
    ["requestSharedAudio", "Exampletown", generated, {}]
  ]);
});

test("skips shared audio when caller already tried it", async () => {
  const calls = [];
  const enriched = {
    display: "Exampletown",
    sourceForm: "Przykladowo",
    ttsLang: "pl-PL",
    sourceStatus: "structured-source"
  };

  const playable = await resolvePlayableResult("Exampletown", enriched, { skipSharedAudio: true }, {
    resolveSelection: async (text, options) => {
      calls.push(["resolveSelection", text, options]);
      return enriched;
    },
    requestSharedAudio: async () => {
      throw new Error("should not request shared audio");
    }
  });

  assert.equal(playable, enriched);
  assert.deepEqual(calls, [
    ["resolveSelection", "Exampletown", { useOnline: true, localResult: enriched }]
  ]);
});

test("keeps source-form result when shared audio wait expires", async () => {
  const calls = [];
  const enriched = {
    display: "Exampletown",
    sourceForm: "Przykladowo",
    ttsLang: "pl-PL",
    sourceStatus: "structured-source"
  };

  const playable = await resolvePlayableResult("Exampletown", enriched, {}, {
    sharedAudioWaitMs: 1,
    resolveSelection: async (text, options) => {
      calls.push(["resolveSelection", text, options]);
      return enriched;
    },
    requestSharedAudio: async (text, item, options) => {
      calls.push(["requestSharedAudio", text, item, options]);
      return new Promise(() => {});
    }
  });

  assert.equal(playable, enriched);
  assert.deepEqual(calls, [
    ["resolveSelection", "Exampletown", { useOnline: true, localResult: enriched }],
    ["requestSharedAudio", "Exampletown", enriched, {}]
  ]);
});

test("keeps current result when audio exists or retry fails", async () => {
  const calls = [];
  const audioResult = {
    display: "Exampletown",
    pronunciation: {
      audio: [{ url: "https://audio.example/item.ogg", quality: "native-speaker" }]
    }
  };
  const noAudioResult = { display: "Exampletown" };

  assert.equal(await resolvePlayableResult("Exampletown", audioResult, {}, {
    resolveSelection: async () => {
      calls.push("unexpected");
      return null;
    }
  }), audioResult);
  assert.deepEqual(calls, []);

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

import assert from "node:assert/strict";
import test from "node:test";
import {
  createGoogleTtsProvider,
  generatedAudioArtifactFromTts,
  preferredGoogleVoiceNamesForLocale,
  selectGoogleVoiceName
} from "../../server/tts-provider.js";

test("selects preferred provider voice names for configured locales", () => {
  assert.equal(selectGoogleVoiceName({ languageCode: "uk-UA" }), "uk-UA-Chirp3-HD-Gacrux");
  assert.equal(selectGoogleVoiceName({
    languageCode: "uk-UA",
    requestedVoiceName: "uk-UA-Chirp3-HD-Leda"
  }), "uk-UA-Chirp3-HD-Leda");
  assert.equal(preferredGoogleVoiceNamesForLocale("uk-UA").at(-1), "uk-UA-Chirp3-HD-Zephyr");
  assert.equal(selectGoogleVoiceName({ languageCode: "pl-PL" }), "");
});

test("calls Google-compatible TTS endpoint with selected voice", async () => {
  const calls = [];
  const provider = createGoogleTtsProvider({
    accessToken: "token",
    fetch: async (url, init) => {
      calls.push({ url, init });
      return {
        ok: true,
        async json() {
          return { audioContent: Buffer.from("audio").toString("base64") };
        }
      };
    }
  });

  const result = await provider.synthesize({
    text: "Sample",
    ttsLang: "uk-UA"
  });

  assert.equal(result.ok, true);
  assert.equal(result.audio.mimeType, "audio/mpeg");
  assert.equal(result.voice.name, "uk-UA-Chirp3-HD-Gacrux");
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /^https:\/\/texttospeech\.googleapis\.com/);
  assert.equal(calls[0].init.headers.authorization, "Bearer token");
  assert.deepEqual(JSON.parse(calls[0].init.body).voice, {
    languageCode: "uk-UA",
    name: "uk-UA-Chirp3-HD-Gacrux"
  });
});

test("converts provider output into a shared audio artifact payload", async () => {
  const provider = {
    async synthesize() {
      return {
        ok: true,
        provider: "test-tts",
        audio: {
          mimeType: "audio/ogg",
          dataBase64: Buffer.from("sample").toString("base64")
        },
        voice: {
          languageCode: "pl-PL",
          name: "pl-PL-TestVoice"
        }
      };
    }
  };

  const result = await generatedAudioArtifactFromTts({
    term: "Exampletown",
    lookupKey: "exampletown",
    sourceForm: "Przykladowo",
    language: "pl",
    ttsLang: "pl-PL"
  }, {
    publicBaseUrl: "https://community.example",
    ttsProvider: provider
  });

  assert.equal(result.ok, true);
  assert.equal(result.value.provider, "pl-PL-TestVoice");
  assert.equal(result.value.mimeType, "audio/ogg");
  assert.match(result.value.audioUrl, /^https:\/\/community\.example\/audio\/aud_[a-f0-9]{32}$/);
});

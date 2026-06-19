import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import {
  createFakeDom,
  flushPromises,
  overlaySource,
  resultViewSource
} from "../../test-support/content/overlay-test-harness.js";

test("speak action checks shared audio before refreshing generic verified audio", async () => {
  const sentMessages = [];
  const playedUrls = [];
  const fakeDom = createFakeDom();
  let showResultListener;

  const context = vm.createContext({
    Audio: class {
      constructor(url) {
        this.url = url;
        this.events = {};
        playedUrls.push(url);
      }

      addEventListener(name, callback) {
        this.events[name] = callback;
      }

      play() {
        return Promise.resolve();
      }

      pause() {}
    },
    URL,
    document: fakeDom.document,
    window: {}
  });

  context.__sayThisOverlayStyles = "";
  context.__sayThisOverlayRuntimeAdapters = {
    addShowResultListener(listener) {
      showResultListener = listener;
      return true;
    },
    createOverlayRuntimeAdapters() {
      return { surface: "content" };
    },
    async sendRuntimeMessage(message) {
      sentMessages.push({ message });
      if (message.type === "SAYTHIS_RESOLVE") {
        return {
          ok: true,
          result: {
            ...genericVerifiedResult(),
            pronunciation: {
              audio: [{
                label: "Native speaker recording",
                url: "https://audio.example/native.ogg",
                quality: "native-speaker"
              }, {
                label: "Dictionary recording",
                url: "https://audio.example/generic.ogg",
                quality: "verified"
              }]
            }
          }
        };
      }

      return { ok: true };
    }
  };

  vm.runInContext(resultViewSource, context);
  vm.runInContext(overlaySource, context);

  showResultListener(genericVerifiedResult(), { onlineChecked: false });
  fakeDom.root.querySelector('[data-action="speak"]').click();
  await flushPromises();

  assert.deepEqual(sentMessages.map((item) => item.message.type), [
    "SAYTHIS_REQUEST_SHARED_AUDIO",
    "SAYTHIS_RESOLVE"
  ]);
  assert.deepEqual(playedUrls, ["https://audio.example/native.ogg"]);
});

function genericVerifiedResult() {
  return {
    query: "Exampletown",
    display: "Exampletown",
    sourceForm: "Przykladowo",
    language: "pl",
    ttsLang: "pl-PL",
    sourceStatus: "verified-audio",
    pronunciation: {
      audio: [{
        label: "Dictionary recording",
        url: "https://audio.example/generic.ogg",
        quality: "verified"
      }]
    }
  };
}

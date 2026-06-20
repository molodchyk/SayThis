import assert from "node:assert/strict";
import test from "node:test";
import {
  setTimeout as delay
} from "node:timers/promises";
import vm from "node:vm";
import {
  createFakeDom,
  flushPromises,
  overlaySource,
  resultViewSource
} from "../../../test-support/content/overlay-test-harness.js";

test("speak action uses guide speech when shared audio misses for non-English source forms", async () => {
  const sentMessages = [];
  const fakeDom = createFakeDom();
  let showResultListener;

  const context = vm.createContext({
    Audio: class {
      constructor() {
        throw new Error("guide speech should not construct audio");
      }
    },
    clearTimeout,
    setTimeout,
    URL,
    document: fakeDom.document,
    window: {}
  });

  context.__sayThisSharedAudioUiWaitMs = 1;
  context.__sayThisOverlayStyles = "";
  context.__sayThisOverlayRuntimeAdapters = {
    addShowResultListener(listener) {
      showResultListener = listener;
      return true;
    },
    createOverlayRuntimeAdapters() {
      return { surface: "content" };
    },
    async sendRuntimeMessage(message, dependencies) {
      sentMessages.push({ message, dependencies });
      if (message.type === "SAYTHIS_REQUEST_SHARED_AUDIO") {
        return new Promise(() => {});
      }

      return {
        ok: true,
        speech: {
          fallback: "guide",
          text: message.result?.speakText || message.text
        }
      };
    }
  };

  vm.runInContext(resultViewSource, context);
  vm.runInContext(overlaySource, context);

  showResultListener({
    query: "Borisoglebsk",
    display: "Borisoglebsk",
    sourceForm: "Борисоглебск",
    language: "ru",
    ttsLang: "ru-RU",
    sourceStatus: "structured-source",
    pronunciation: {
      simple: "boh-ree-soh-glehbsk"
    }
  }, { onlineChecked: true });
  fakeDom.root.querySelector('[data-action="speak"]').click();
  await delay(10);
  await flushPromises();

  assert.deepEqual(sentMessages.map((item) => item.message.type), [
    "SAYTHIS_REQUEST_SHARED_AUDIO",
    "SAYTHIS_SPEAK"
  ]);
  assert.equal(sentMessages[1].message.skipSharedAudio, true);
  assert.equal(sentMessages[1].message.result.speakText, "boh-ree-soh-glehbsk");
  assert.equal(sentMessages[1].message.result.ttsLang, "en-US");
  assert.match(fakeDom.root.querySelector(".status").textContent, /browser TTS|guide/i);
});

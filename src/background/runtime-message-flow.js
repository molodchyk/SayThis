import {
  MESSAGE_TYPES
} from "../message-contracts.js";
import {
  normalizeSelection
} from "../resolver-core.js";
import {
  normalizeLanguageHints
} from "../shared/settings.js";

export function handleRuntimeMessage(message = {}, sendResponse = () => {}, dependencies = {}) {
  if (message?.type === MESSAGE_TYPES.resolve) {
    respondWithResult(
      dependencies.resolveSelection(message.text, useOnlineMessageOptions(message)),
      sendResponse,
      (result) => ({ ok: true, result }),
      "Resolve failed."
    );
    return true;
  }

  if (message?.type === MESSAGE_TYPES.speak) {
    const selectedText = normalizeSelection(message.text);
    if (!selectedText) {
      sendResponse({ ok: false, error: "No text selected." });
      return true;
    }

    const resultPromise = message.result
      ? Promise.resolve(message.result)
      : dependencies.resolveSelection(selectedText, useOnlineMessageOptions(message));
    respondWithResult(
      resultPromise.then(async (result) => {
        const speech = await dependencies.speakResult(result, { rate: message.rate, lang: message.lang });
        if (!speech || speech.spoken === false) {
          throw new Error(speech?.error || "Speech unavailable.");
        }
        return { result, speech: speechSummary(speech) };
      }),
      sendResponse,
      ({ result, speech }) => ({
        ok: true,
        result,
        ...(speech ? { speech } : {})
      }),
      "Speech failed."
    );
    return true;
  }

  if (message?.type === MESSAGE_TYPES.stop) {
    respondWithResult(
      Promise.resolve(dependencies.stopPlayback()).catch(() => null),
      sendResponse,
      () => ({ ok: true }),
      "Stop failed."
    );
    return true;
  }

  if (message?.type === MESSAGE_TYPES.feedback) {
    respondWithResult(
      dependencies.saveFeedback(message.text, message.feedback || {}),
      sendResponse,
      (result) => ({ ok: true, result }),
      "Feedback failed."
    );
    return true;
  }

  if (message?.type === MESSAGE_TYPES.flushSync) {
    respondWithResult(
      dependencies.flushCommunitySync(),
      sendResponse,
      (summary) => ({ ok: true, summary }),
      "Sync failed."
    );
    return true;
  }

  if (message?.type === MESSAGE_TYPES.pullApproved) {
    respondWithResult(
      dependencies.pullApprovedCommunityEntries(),
      sendResponse,
      (summary) => ({ ok: true, summary }),
      "Refresh failed."
    );
    return true;
  }

  return false;
}

export function useOnlineMessageOptions(message = {}) {
  const languageHints = normalizeLanguageHints(message.languageHints);
  if (!Object.prototype.hasOwnProperty.call(message, "useOnline")) {
    return languageHints.length ? { languageHints } : {};
  }

  return {
    useOnline: Boolean(message.useOnline),
    ...(languageHints.length ? { languageHints } : {})
  };
}

function respondWithResult(promise, sendResponse, buildResponse, fallbackError) {
  Promise.resolve(promise)
    .then((value) => {
      sendResponse(buildResponse(value));
    })
    .catch((error) => {
      sendResponse({ ok: false, error: error?.message || fallbackError });
    });
}

function speechSummary(speech = {}) {
  const fallback = normalizeSelection(speech.fallback);
  const text = normalizeSelection(speech.text);

  if (!fallback && !text) {
    return null;
  }

  return {
    ...(fallback ? { fallback } : {}),
    ...(text ? { text } : {})
  };
}

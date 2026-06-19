import {
  getBestAudio
} from "../resolver-core.js";
import {
  resolvePlayableResult
} from "./pronunciation-playback-flow.js";

const KEYBOARD_COMMANDS = {
  local: "pronounce-selection",
  online: "pronounce-selection-online"
};

export async function handleActiveSelectionCommandName(command, dependencies = {}) {
  const options = activeSelectionOptionsForCommand(command);
  if (!options) {
    return { handled: false, reason: "unknown-command" };
  }

  return handleActiveSelectionCommand(options, dependencies);
}

export async function handleActiveSelectionCommand(options = {}, dependencies = {}) {
  const tab = await dependencies.getActiveTab?.();
  if (!tab?.id) {
    return { handled: false, reason: "no-active-tab" };
  }

  const selectedText = await dependencies.readSelectionFromTab?.(tab.id);
  if (!selectedText) {
    return { handled: false, reason: "empty-selection" };
  }

  try {
    const trace = createTrace(options.source || "keyboard");
    dependencies.recordDebugEvent?.("ui:keyboard-command", {
      text: selectedText,
      trace
    });

    await dependencies.setStorage?.({
      [dependencies.lastSelectionKey || "lastSelection"]: selectedText,
      [dependencies.lastSourceKey || "lastSource"]: options.source || "keyboard"
    });

    if (options.useOnline === true) {
      return await handleOnlineLookupAndPronounce(selectedText, tab.id, options, dependencies, trace);
    }

    const result = await dependencies.resolveSelection?.(selectedText, {
      useOnline: options.useOnline
    });
    const playableResult = await resolvePlayableResult(selectedText, result, {
      useOnline: options.useOnline
    }, dependencies);
    await dependencies.playResolvedResult?.(playableResult, tab.id, trace);

    return { handled: true, result: playableResult };
  } catch (error) {
    return {
      handled: false,
      reason: "resolve-failed",
      error
    };
  }
}

export function activeSelectionOptionsForCommand(command) {
  if (command === KEYBOARD_COMMANDS.local) {
    return { source: "keyboard" };
  }

  if (command === KEYBOARD_COMMANDS.online) {
    return {
      source: "keyboard-online",
      useOnline: true
    };
  }

  return null;
}

async function handleOnlineLookupAndPronounce(selectedText, tabId, options = {}, dependencies = {}, trace = null) {
  const localResult = await dependencies.resolveSelection?.(selectedText, {
    useOnline: false
  });
  const immediateResult = await resolvePlayableResult(selectedText, localResult, {
    useOnline: true,
    trace
  }, dependencies);
  const playedImmediate = Boolean(getBestAudio(immediateResult)?.url);

  if (playedImmediate) {
    await dependencies.playResolvedResult?.(immediateResult, tabId, trace);
  }

  try {
    const onlineResult = await dependencies.resolveSelection?.(selectedText, {
      useOnline: true,
      localResult
    });
    const playableResult = await resolvePlayableResult(selectedText, onlineResult, {
      useOnline: true,
      trace
    }, dependencies);

    if (playedImmediate) {
      await dependencies.showResultOnTab?.(tabId, playableResult);
    } else {
      await dependencies.playResolvedResult?.(playableResult, tabId, trace);
    }

    return { handled: true, result: playableResult };
  } catch (error) {
    if (playedImmediate) {
      return { handled: true, result: immediateResult, onlineError: error };
    }

    throw error;
  }
}

function createTrace(action) {
  const startedAt = Date.now();
  const random = Math.random().toString(36).slice(2, 8);
  return {
    id: `background-${startedAt.toString(36)}-${random}`,
    source: "background",
    action,
    startedAt
  };
}

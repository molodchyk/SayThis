export async function resolvePlayableResult(selectedText, result, options = {}, dependencies = {}) {
  if (!result) {
    return result;
  }

  if (hasPlayableAudio(result) || options.useOnline === true) {
    return result;
  }

  try {
    return await dependencies.resolveSelection?.(selectedText, {
      ...options,
      useOnline: true,
      localResult: result
    }) || result;
  } catch {
    return result;
  }
}

export function hasPlayableAudio(result = {}) {
  return Boolean(result?.pronunciation?.audio?.some((item) => item?.url));
}

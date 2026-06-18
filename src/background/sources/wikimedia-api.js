const WIKIMEDIA_API_HEADERS = Object.freeze({
  "Accept": "application/json",
  "Api-User-Agent": "SayThis/1.0.0 (https://github.com/molodchyk/SayThis)"
});

export function fetchWikimediaApi(url, options = {}) {
  return fetch(url, {
    ...options,
    headers: {
      ...WIKIMEDIA_API_HEADERS,
      ...(options.headers || {})
    }
  });
}

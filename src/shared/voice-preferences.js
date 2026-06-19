const PREFERRED_VOICE_NAMES_BY_LOCALE = {
  "uk-UA": [
    "uk-UA-Chirp3-HD-Gacrux",
    "uk-UA-Chirp3-HD-Achernar",
    "uk-UA-Chirp3-HD-Aoede",
    "uk-UA-Chirp3-HD-Autonoe",
    "uk-UA-Chirp3-HD-Callirrhoe",
    "uk-UA-Chirp3-HD-Despina",
    "uk-UA-Chirp3-HD-Erinome",
    "uk-UA-Chirp3-HD-Kore",
    "uk-UA-Chirp3-HD-Laomedeia",
    "uk-UA-Chirp3-HD-Leda",
    "uk-UA-Chirp3-HD-Pulcherrima",
    "uk-UA-Chirp3-HD-Sulafat",
    "uk-UA-Chirp3-HD-Vindemiatrix",
    "uk-UA-Chirp3-HD-Zephyr",
    "uk-UA-Chirp3-HD-Achird",
    "uk-UA-Chirp3-HD-Algenib",
    "uk-UA-Chirp3-HD-Algieba",
    "uk-UA-Chirp3-HD-Alnilam",
    "uk-UA-Chirp3-HD-Charon",
    "uk-UA-Chirp3-HD-Enceladus",
    "uk-UA-Chirp3-HD-Fenrir",
    "uk-UA-Chirp3-HD-Iapetus",
    "uk-UA-Chirp3-HD-Orus",
    "uk-UA-Chirp3-HD-Puck",
    "uk-UA-Chirp3-HD-Rasalgethi",
    "uk-UA-Chirp3-HD-Sadachbia",
    "uk-UA-Chirp3-HD-Sadaltager",
    "uk-UA-Chirp3-HD-Schedar",
    "uk-UA-Chirp3-HD-Umbriel",
    "uk-UA-Chirp3-HD-Zubenelgenubi",
    "uk-UA-Standard-B",
    "uk-UA-Wavenet-B"
  ]
};

export function preferredVoiceNamesForLocale(locale) {
  const normalized = normalizeVoiceLocale(locale);
  if (!normalized) {
    return [];
  }

  const exact = PREFERRED_VOICE_NAMES_BY_LOCALE[normalized] || [];
  if (exact.length) {
    return exact;
  }

  const base = baseVoiceLocale(normalized);
  return Object.entries(PREFERRED_VOICE_NAMES_BY_LOCALE)
    .filter(([key]) => baseVoiceLocale(key) === base)
    .flatMap(([, names]) => names);
}

export function preferredVoiceScoreForLabel(label, locale) {
  const normalizedLabel = normalizeVoiceName(label);
  if (!normalizedLabel) {
    return 0;
  }

  const names = preferredVoiceNamesForLocale(locale).map(normalizeVoiceName);
  const index = names.findIndex((name) => normalizedLabel.includes(name));
  return index >= 0 ? 1000 - index : 0;
}

export function normalizeVoiceLocale(value) {
  const raw = String(value || "")
    .trim()
    .replace(/_/g, "-");
  const match = raw.match(/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})?$/i)?.[0] || "";
  if (!match) {
    return "";
  }

  const [base, region] = match.split("-");
  return [
    base.toLowerCase(),
    region ? region.toUpperCase() : ""
  ].filter(Boolean).join("-");
}

export function baseVoiceLocale(value) {
  return normalizeVoiceLocale(value).split("-")[0];
}

export function voiceLocaleMatchesRequest(voiceLocale, requestedLocale) {
  const voice = normalizeVoiceLocale(voiceLocale);
  const requested = normalizeVoiceLocale(requestedLocale);
  if (!voice || !requested) {
    return false;
  }

  if (voice === requested) {
    return true;
  }

  if (baseVoiceLocale(voice) !== baseVoiceLocale(requested)) {
    return false;
  }

  return !voice.includes("-") || !requested.includes("-");
}

export function normalizeVoiceName(value) {
  return String(value || "")
    .trim()
    .replace(/_/g, "-")
    .toLowerCase();
}

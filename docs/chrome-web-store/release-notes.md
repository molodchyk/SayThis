# Release Notes

## 1.0.0

- Adds shared generated audio requests through the configured community endpoint.
- Reuses approved shared audio artifacts before any provider generation.
- Reuses reviewed shared audio across alternate spellings when the resolved source form and base language match.
- Keeps shared-audio lookup timeout-bounded so matching browser speech can start when the endpoint is slow or unavailable.
- Preserves returned shared audio on the current result when local refresh does not expose it immediately.
- Preserves source-backed or curated shared recording quality when approved audio is attached to results.
- Reuses approved shared artifacts for generic verified recordings from local memory or the configured endpoint without authorizing fresh provider generation.
- Adds context-menu registration coverage to the opt-in loaded-extension smoke runner.
- Keeps the opt-in loaded-extension smoke runner from terminating launched browser processes.
- Adds an approved public-domain packaged pronunciation sample to verify curated audio playback and release metadata.
- Keeps connector words in abbreviation guides for forms like M&A, R&D, and C++.
- Treats compact lowercase-n connector abbreviations as connector speech.
- Shows source-form speech rows for abbreviations and other same-language resolved readings.
- Keeps the primary result visible when playing shared audio for an alternate candidate.
- Refreshes cached no-audio lookups for structured local entries so public recordings can replace guide-only playback.
- Keeps verified recording labels when generated fallback samples are also available.
- Shows source and quality context on popup playback rows.
- Labels generated fallback playback separately from source-backed recordings in the popup and on-page card.
- Keeps source-form speech and guide rows visible when generated fallback or unknown-quality audio is the only audio.
- Skips automatic playback for unknown-quality audio while keeping it available as a manual choice.
- Avoids generated fallback audio for plain English same-text structured results.
- Avoids browser TTS fallback for plain English same-text structured results without a guide.
- Avoids browser TTS fallback when a non-English resolved language would use an English voice.
- Avoids guessed browser speech for unresolved scripts shared by multiple languages.
- Rejects public shared-audio generation for plain English same-text requests at the service boundary.
- Rejects generated provider/shared audio when a non-English resolved language would use an English TTS locale.
- Removes direct client audio URL template generation; generated provider output now belongs on the shared-audio endpoint path.
- Labels token-gated public generated shared audio as service-generated instead of moderator-reviewed.
- Preserves provider voice names on generated shared audio entries and playback labels.
- Sends aliases and variants with shared-audio requests so reviewed samples can be reused across known written forms.
- Normalizes known language names to provider locales before speech generation and shared-audio matching.
- Applies language-name locale normalization to the on-page card and shared-audio service generation path.
- Continues custom-source retries after generic audio when a later source-form or alias can provide native/source-backed pack audio.
- Explicit online refresh retries cached generic verified audio so stronger source-backed or native recordings can replace it.
- Speak retries online before playing generic verified recordings so native/source-backed audio can replace them when available.
- Popup and on-page Speak use the same top-tier audio rule before playing local recording URLs.
- Uses one-off lookup hints to prefer matching Wiktionary language sections, continue target-language edition retries after generic audio, and avoid later mismatched dictionary audio.
- Prefers Wikidata pronunciation audio with matching language qualifiers before unqualified recordings.
- Ranks Forvo recordings as native-speaker audio ahead of generic verified recordings.
- Ranks Lingua Libre recordings found through Commons-backed sources as native-speaker audio ahead of generic verified recordings.
- Ranks source-backed pronunciation-guide recordings found through Commons-backed sources ahead of generic verified recordings.
- Checks Commons for source-backed or native recordings even when dictionary lookup already found generic verified audio.
- Requires word-boundary matches before treating Wikimedia Commons audio as verified pronunciation audio.
- Rejects region-specific browser voices from the wrong locale variant when using verified speech fallback.
- Reports unresolved raw text as unavailable instead of speaking it through generic browser TTS.
- Requires an explicit resolved speech locale before using browser TTS for non-guide fallback.
- Filters on-page guide speech so explanatory guide notes are not offered as spoken fallback.
- Makes generated Cyrillic source-form guides language-sensitive.
- Ignores incompatible provider voice overrides so generated fallback audio follows the resolved TTS locale.
- Keeps provider generation behind service-side opt-in, rate limits, and required bearer-token controls.
- Adds a persisted public provider-generation budget before paid shared-audio synthesis.
- Updates the Chrome extension and package version to 1.0.0.

## 0.1.0

- Adds selected-text pronunciation lookup for the popup, context menu, and keyboard command.
- Prefers verified recordings from source-backed pronunciation data.
- Shows source-form speech and guide speech choices when no recording is available.
- Blocks misleading non-English speech through unverified fallback voices.
- Adds privacy, license, and Chrome Web Store review documents.

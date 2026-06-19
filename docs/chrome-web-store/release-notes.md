# Release Notes

## 1.0.0

- Adds shared generated audio requests through the configured community endpoint.
- Reuses approved shared audio artifacts before any provider generation.
- Reuses reviewed shared audio across alternate spellings when the resolved source form and base language match.
- Preserves returned shared audio on the current result when local refresh does not expose it immediately.
- Adds context-menu registration coverage to the opt-in loaded-extension smoke runner.
- Adds an approved public-domain packaged pronunciation sample to verify curated audio playback and release metadata.
- Keeps connector words in abbreviation guides for forms like M&A, R&D, and C++.
- Treats compact lowercase-n connector abbreviations as connector speech.
- Shows source-form speech rows for abbreviations and other same-language resolved readings.
- Keeps the primary result visible when playing shared audio for an alternate candidate.
- Refreshes cached no-audio lookups for structured local entries so public recordings can replace guide-only playback.
- Keeps verified recording labels when generated fallback samples are also available.
- Labels generated fallback playback separately from source-backed recordings in the popup and on-page card.
- Avoids generated fallback audio for plain English same-text structured results.
- Avoids browser TTS fallback for plain English same-text structured results without a guide.
- Avoids browser TTS fallback when a non-English resolved language would use an English voice.
- Rejects public shared-audio generation for plain English same-text requests at the service boundary.
- Rejects generated provider/shared audio when a non-English resolved language would use an English TTS locale.
- Removes direct client audio URL template generation; generated provider output now belongs on the shared-audio endpoint path.
- Labels token-gated public generated shared audio as service-generated instead of moderator-reviewed.
- Sends aliases and variants with shared-audio requests so reviewed samples can be reused across known written forms.
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
- Updates the Chrome extension and package version to 1.0.0.

## 0.1.0

- Adds selected-text pronunciation lookup for the popup, context menu, and keyboard command.
- Prefers verified recordings from source-backed pronunciation data.
- Shows source-form speech and guide speech choices when no recording is available.
- Blocks misleading non-English speech through unverified fallback voices.
- Adds privacy, license, and Chrome Web Store review documents.

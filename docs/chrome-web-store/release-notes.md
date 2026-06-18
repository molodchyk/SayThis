# Release Notes

## 1.0.0

- Adds shared generated audio requests through the configured community endpoint.
- Reuses approved shared audio artifacts before any provider generation.
- Reuses reviewed shared audio across alternate spellings when the resolved source form and base language match.
- Shows source-form speech rows for abbreviations and other same-language resolved readings.
- Refreshes cached no-audio lookups for structured local entries so public recordings can replace guide-only playback.
- Keeps verified recording labels when generated fallback samples are also available.
- Labels generated fallback playback separately from source-backed recordings in the popup and on-page card.
- Avoids generated fallback audio for plain English same-text structured results.
- Sends aliases and variants with shared-audio requests so reviewed samples can be reused across known written forms.
- Keeps provider generation behind service-side opt-in, rate limits, and required bearer-token controls.
- Updates the Chrome extension and package version to 1.0.0.

## 0.1.0

- Adds selected-text pronunciation lookup for the popup, context menu, and keyboard command.
- Prefers verified recordings from source-backed pronunciation data.
- Shows source-form speech and guide speech choices when no recording is available.
- Blocks misleading non-English speech through unverified fallback voices.
- Adds privacy, license, and Chrome Web Store review documents.

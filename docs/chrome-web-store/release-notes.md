# Release Notes

## 1.0.0

- Adds shared generated audio requests through the configured community endpoint.
- Reuses approved shared audio artifacts before any provider generation.
- Reuses reviewed shared audio across alternate spellings when the resolved source form and base language match.
- Keeps provider generation behind service-side opt-in, rate limits, and optional bearer-token controls.
- Updates the Chrome extension and package version to 1.0.0.

## 0.1.0

- Adds selected-text pronunciation lookup for the popup, context menu, and keyboard command.
- Prefers verified recordings from source-backed pronunciation data.
- Shows source-form speech and guide speech choices when no recording is available.
- Blocks misleading non-English speech through unverified fallback voices.
- Adds privacy, license, and Chrome Web Store review documents.

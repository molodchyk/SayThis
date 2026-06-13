# Technical Plan

## Extension Architecture

Initial Chrome Manifest V3 components:

- `background.js`: creates the context menu and handles text-to-speech messages.
- `popup.html/js/css`: captures current selection and provides speak/stop controls.
- `data/pronunciation-seed.json`: stores early glossary entries and fields.

The scaffold currently uses Chrome's `tts` API as a placeholder. That is only a fallback path for the final product.

## Future Lookup Pipeline

1. Normalize the selected text.
2. Match against a curated dictionary of aliases and common misspellings.
3. If matched, resolve to canonical native spelling and available audio.
4. If unmatched, attempt source-specific lookup:
   - Forvo API by exact selected text.
   - Forvo API by known transliteration candidates.
   - Local transliteration and entity lookup.
5. If no native audio exists, fall back to generated speech with a visible fallback label.
6. Cache successful lookups locally.

## Data Model

Core fields:

- `id`: stable internal key.
- `language`: BCP-47 or ISO language code.
- `display`: default user-facing form.
- `native`: native-script form when known.
- `aliases`: romanized forms, alternate spellings, common old spellings.
- `category`: city, village, region, person, organization, term.
- `priority`: high, medium, low.
- `sourceStatus`: curated, needs-audio, generated-fallback, unknown.
- `sources`: source URLs or source IDs.
- `notes`: curator notes.

## Privacy

The MVP should avoid sending every highlighted word to a server by default. A conservative sequence:

1. Check local curated dictionary.
2. Ask for remote lookup only when needed.
3. Cache only lookup data, not page URLs or browsing history.
4. Do not collect selected text analytics unless explicitly opted in.

## Technical Risks

- Single-word language detection is unreliable.
- Romanized names can be ambiguous.
- TTS voices may pronounce proper nouns incorrectly.
- Native-audio databases may have multiple variants or stale entries.
- Some pages block extension selection capture.

## Near-Term Tasks

- Replace raw Chrome TTS with a lookup result object.
- Add a result popover with source and confidence.
- Build the curated pronunciation dictionary.
- Add audio playback from bundled or remote MP3 sources.
- Add a request/report workflow.
- Add lightweight tests for normalization and alias matching.

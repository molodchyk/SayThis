# Technical Plan

## Extension Architecture

Chrome Manifest V3 components:

- `background.js`: creates the context menu and handles text-to-speech messages.
- `resolver-core.js`: pure resolver logic for normalization, script detection, local entries, community entries, confidence labels, and speech options.
- `popup.html/js/css`: captures current selection, shows the resolver card, and provides speak/slow/stop plus correction controls.
- `content-overlay.js`: shows a compact on-page resolver card after context-menu or keyboard-command use.
- `data/pronunciation-seed.json`: stores early resolver entry shape and sample fields.
- `test/resolver-core.test.js`: verifies resolver behavior and manifest capabilities.

Chrome's `tts` API is the current audio path. It should remain a fallback path once native audio sources are added.

## Implemented MVP

- Selection capture from popup, context menu, and `Alt+Shift+S`.
- Local resolver over bundled entries and local community memory.
- Script-sensitive fallback for non-Latin selected text.
- Optional Wikidata lookup from the popup `Online` action.
- Result card with source form, language, category, origin, IPA/simple guide, confidence, source label, and evidence.
- Local confirmation, wrong-result, missing-term, and correction storage.
- TTS playback from resolved source form with normal and slow rates.

## Future Lookup Pipeline

1. Normalize the selected text.
2. Detect script and obvious language hints.
3. Check local cache and community-confirmed entries.
4. Resolve known entities and terms through structured sources:
   - knowledge graphs and aliases
   - dictionaries and pronunciation databases
   - gazetteers and map databases
   - domain-specific term sources
5. Resolve native/source form and candidate languages.
6. Query pronunciation sources for native audio. Not implemented yet.
7. Generate TTS from the resolved source form if native audio is unavailable.
8. Show confidence and source labels.
9. Collect correction, confirmation, or missing-entry feedback.
10. Cache successful lookups locally.

For Latin-script input, entity or term resolution should happen before generic language detection. A romanized term can look like many languages, but a matched entity can provide a reliable native/source form.

## Data Model

Core fields:

- `id`: stable internal key.
- `language`: BCP-47 or ISO language code.
- `display`: default user-facing form.
- `native`: native-script form when known.
- `aliases`: romanized forms, alternate spellings, common old spellings.
- `category`: place, person, organization, term, loanword, scientific-term, technical-term, other.
- `origin`: source language, etymological root, or domain where known.
- `pronunciation`: IPA, simple guide, and audio references.
- `priority`: high, medium, low.
- `sourceStatus`: verified-audio, community-confirmed, structured-source, generated-fallback, unknown.
- `confidence`: high, medium, low, unknown.
- `community`: correction and confirmation summary.
- `sources`: source URLs or source IDs.
- `notes`: curator notes.

## Community Memory Layer

The resolver should improve through constrained user feedback, not open-ended chat.

Supported feedback:

- correct pronunciation
- wrong pronunciation
- better native/source spelling
- better audio source
- phonetic guide
- regional variant
- missing term request

Community entries should be promoted only when they are source-backed, repeated, or manually verified. The system should preserve variants rather than forcing one global pronunciation when multiple are valid.

## Privacy

The MVP should avoid sending every highlighted word to a server by default. A conservative sequence:

1. Check local cache and bundled resolver data.
2. Ask for remote lookup only when needed.
3. Cache only lookup data, not page URLs or browsing history.
4. Do not collect selected text analytics unless explicitly opted in.
5. Keep community submissions scoped to the selected term and pronunciation metadata.

## Technical Risks

- Single-word language detection is unreliable.
- Romanized names can be ambiguous.
- TTS voices may pronounce proper nouns incorrectly.
- Native-audio databases may have multiple variants or stale entries.
- Some pages block extension selection capture.
- Community data can introduce spam, regional disputes, or confident incorrect corrections.
- Etymology and origin notes can expand scope unless kept pronunciation-relevant.
- Online lookup currently uses a single structured source and needs better scoring before it can be treated as high confidence.

## Near-Term Tasks

- Add native-audio playback when resolver entries or remote sources provide audio.
- Build more resolver adapters for structured sources and pronunciation databases.
- Improve online entity scoring and source-form selection.
- Add import/export for local community memory.
- Add options for remote lookup privacy behavior.
- Add audio playback from bundled or remote MP3 sources.
- Add broader tests around popup/background message contracts.

# Technical Plan

## Extension Architecture

Chrome Manifest V3 components:

- `background.js`: creates the context menu and handles text-to-speech messages.
- `extension-actions.js`: defines context-menu actions and maps them to resolver options.
- `message-contracts.js`: defines shared popup, options, offscreen-audio, and service-worker message builders, including overlay payloads sent by the background worker.
- `resolver-core.js`: pure resolver logic for normalization, script detection, local entries, community entries, confidence labels, and speech options.
- `wikidata-adapter.js`: extracts source forms, native/official names, IPA, and pronunciation audio from Wikidata entities.
- `wiktionary-adapter.js`: extracts dictionary-term IPA, pronunciation audio, language, and pronunciation-relevant etymology from Wiktionary wikitext.
- `nominatim-adapter.js`: extracts place-name source forms and OpenStreetMap attribution from Nominatim-compatible search results.
- `forvo-adapter.js`: extracts verified pronunciation audio from Forvo word-pronunciation API payloads.
- `custom-source-adapter.js`: extracts domain-specific pronunciation entries from a configured structured JSON endpoint.
- `popup.html/js/css`: captures current selection, shows the resolver card, and provides speak/slow/stop plus correction controls.
- `correction-form.js`: normalizes correction-form prefill and submission data.
- `options.html/js/css`: manages remote-lookup behavior, on-page card display, and local community-memory data.
- `content-overlay.js`: shows a compact on-page resolver card after context-menu or keyboard-command use.
- `offscreen-audio.html/js`: plays verified audio from the service worker path when page injection is unavailable.
- `community-sync.js`: builds privacy-scoped feedback submissions, manages a retry queue, and flushes to an opt-in HTTPS endpoint.
- `server/community-service.js`: dependency-free Node community service for submission intake, moderation, and approved-entry serving.
- `server/community-store.js`: pure store logic for pending, approved, and rejected community data.
- `server/admin-page.js`: static moderator UI for reviewing pending community submissions.
- `assets/icons/`: generated PNG icons referenced by the manifest and toolbar action.
- `data/pronunciation-seed.json`: stores early resolver entry shape and sample fields.
- `assets/audio/public/`: stores redistributable packaged audio referenced by resolver entries.
- `scripts/package-extension.mjs`: builds a deterministic Chrome ZIP from runtime extension files.
- `test/resolver-core.test.js`: verifies resolver behavior and manifest capabilities.
- `test/extension-smoke.test.js`: verifies extension page DOM bindings, packaged manifest references, and static module import resolution.

Verified audio from resolver results is preferred when available. Chrome's `tts` API remains the fallback path.

## Implemented MVP

- Selection capture from popup, privacy-first context menu, explicit online context menu, and `Alt+Shift+S`.
- Shared runtime message builders with unit tests for popup, options, offscreen-audio, and service-worker commands.
- Static smoke tests for popup/options DOM bindings, manifest-linked files, extension page scripts, and runtime import resolution.
- Packaged PNG icons for toolbar and install surfaces.
- Local resolver over bundled entries and local community memory.
- Script-sensitive fallback for non-Latin selected text.
- Optional Wikidata lookup from the popup `Online` action.
- Multi-candidate Wikidata search ranking before entity-detail extraction.
- Wikidata native/official source-form scoring, IPA extraction, and pronunciation-audio extraction where available.
- Wiktionary lookup for dictionary-like terms with IPA, pronunciation-audio, and short origin extraction.
- Optional structured custom source lookup for domain-specific pronunciation entries.
- Optional Forvo pronunciation-audio lookup with user-provided API key and attribution links.
- Optional Nominatim-compatible gazetteer lookup from a configured HTTPS endpoint, with OpenStreetMap attribution links.
- Local TTL-bounded cache for successful online lookup results, with options-page summary and clearing.
- Result card with source form, language, category, origin, IPA/simple guide, confidence, source label, evidence, and source links.
- Local confirmation, wrong-result, missing-term, correction, audio-source, and variant-note storage.
- Opt-in community sync endpoint with queued retry behavior.
- Optional host permission request for the configured community sync endpoint.
- Approved shared-entry pull from the community endpoint, merged below local corrections.
- Self-hostable moderation service with token-protected pending, approve, and reject endpoints.
- Static moderator page for loading pending submissions and approving or rejecting structured pronunciation entries.
- Community service request-size limits and in-memory public submission rate limiting.
- Options page for remote lookup defaults, on-page card display, and import/export/clear controls.
- Verified-audio playback from popup, page overlay, or offscreen audio document, with TTS playback from resolved source form as fallback.
- Packaged public audio path rewriting for curated entries.
- Chrome ZIP packaging from an explicit runtime-file allowlist.

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
6. Query pronunciation sources for native audio.
7. Generate TTS from the resolved source form if native audio is unavailable.
8. Show confidence and source labels.
9. Collect correction, confirmation, or missing-entry feedback.
10. Cache successful lookups locally.

For Latin-script input, entity or term resolution should happen before generic language detection. A romanized term can look like many languages, but a matched entity can provide a reliable native/source form.

The resolver should keep multiple candidates alive until it has enough source evidence to rank them. A single early language guess should not decide the result for rare terms.

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
- `approvedCommunityEntries`: remote approved entries pulled from the configured community endpoint.
- `resultCache`: local successful online lookup results keyed by normalized selected term.
- `sources`: source URLs or source IDs.
- `variants`: regional, professional, historical, or source-specific pronunciation variants.
- `trustSignals`: source-backed, repeated, moderator-reviewed, or local-only status.
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

Approved shared entries are stored separately from local feedback. During lookup, approved entries are merged under local entries, so a user's correction keeps priority on that user's machine.

Community memory should produce a structured pronunciation graph, not a discussion feed. Accepted entries should capture source form, aliases, language, origin or root, IPA, simple guide, audio source, source links, variants, and trust signals.

## Privacy

The MVP should avoid sending every highlighted word to a server by default. A conservative sequence:

1. Check local cache and bundled resolver data.
2. Ask for remote lookup only when needed.
3. Cache only lookup data, not page URLs or browsing history.
4. Do not collect selected text analytics unless explicitly opted in.
5. Keep community submissions scoped to the selected term and pronunciation metadata.
6. Community sync is disabled by default, accepts only HTTPS endpoints, and requests endpoint-origin access only after the user enables sync.
7. Approved-entry refresh stores only approved pronunciation metadata.
8. Gazetteer lookup accepts only HTTPS endpoints and is disabled until a user configures one.
9. Forvo lookup is disabled until a user enables it and stores a local API key; the key is not included in exports.
10. Custom source lookup accepts only HTTPS endpoints and sends only the selected term.

## Technical Risks

- Single-word language detection is unreliable.
- Romanized names can be ambiguous.
- TTS voices may pronounce proper nouns incorrectly.
- Native-audio databases may have multiple variants or stale entries.
- Some pages block extension selection capture.
- Community data can introduce spam, regional disputes, or confident incorrect corrections.
- Etymology and origin notes can expand scope unless kept pronunciation-relevant.
- Online lookup still needs broader source coverage before it can be treated as universal.
- The included moderation service still needs production deployment hardening before public operation.

## Near-Term Tasks

- Broaden online entity scoring with additional structured sources.
- Add durable abuse controls and deployment recipes for the community backend.
- Add actual curated public audio files after source/license review.
- Add loaded-extension browser smoke tests for popup, context menu, overlay, and options flows.

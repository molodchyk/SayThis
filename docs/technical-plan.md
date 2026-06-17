# Technical Plan

## Extension Architecture

Chrome Manifest V3 components:

- `background.js`: creates the context menu and handles text-to-speech messages.
- `background/active-selection-flow.js`: owns keyboard-command name routing, selected-text resolution, storage updates, result playback, and fallback behavior.
- `background/context-menu-flow.js`: owns context-menu selection resolution, storage updates, result playback, and fallback behavior.
- `background/runtime-message-flow.js`: owns service-worker runtime message routing, validation, response shaping, and error handling.
- `background/runtime-adapters-flow.js`: owns seed-data fetch caching, active-tab lookup, selected-text extraction, and keyboard dependency wiring.
- `background/runtime-platform.js`: owns service-worker Chrome API adapters, storage-key constants, listener registration wrappers, and dependency bundles.
- `background/result-playback-flow.js`: owns result playback order across page overlay audio, offscreen audio, and TTS fallback.
- `background/playback-surface-flow.js`: owns TTS calls, offscreen audio document lifecycle, page overlay injection, and playback-surface settings reads.
- `background/selection-resolver-flow.js`: owns local lookup, online lookup, cache use, packaged audio URL mapping, and result storage updates.
- `background/community-feedback-flow.js`: owns local feedback storage, sync queue updates, approved-entry refresh, and feedback-triggered result updates.
- `background/online-sources.js`: orchestrates optional online source lookups, source-form retries, and pronunciation-audio fallback candidates.
- `background/dbpedia-source.js`: extracts source-form, entity-context, source-link, and redirect-label variant signals from DBpedia Lookup-compatible JSON.
- `extension-actions.js`: defines context-menu actions and maps them to resolver options.
- `message-contracts.js`: defines shared popup, options, offscreen-audio, and service-worker message builders, including overlay payloads sent by the background worker.
- `resolver-core.js`: pure resolver logic for normalization, script detection, local entries, community entries, confidence labels, and speech options.
- `resolver/audio.js`: pure pronunciation-audio selection, URL mapping, and pronunciation normalization helpers used by resolver results.
- `resolver/community.js`: pure local community-memory normalization, lookup, summary, and trust-signal helpers used by resolver results.
- `resolver/language.js`: pure language display-name, speech-locale, and script-hint helpers used by resolver results.
- `resolver/orthography.js`: pure Latin orthography hints for fallback language and audio lookup when structured sources are absent.
- `resolver/status.js`: pure source-status labels, confidence ranking, and status normalization helpers used by resolver results.
- `resolver/text.js`: pure selected-text normalization, lookup-key generation, and script detection helpers re-exported by `resolver-core.js`.
- `resolver/transliteration.js`: pure Latin-to-Cyrillic lookup candidate generation for bounded source-form retries.
- `resolver/values.js`: pure URL, count, alias, trust-signal, and long-field normalization helpers used by resolver data.
- `wikidata-adapter.js`: extracts source forms, native-name style claims, string-valued name claims, sitelink titles, aliases, variants, IPA, and pronunciation audio from Wikidata entities.
- `wikidata/search-languages.js`: plans bounded Wikidata search languages from selected script and explicit user hints.
- `wikidata/language-claims.js`: maps selected Wikidata language and country claims into bounded result-language hints.
- `wikidata/entity-types.js`: maps selected Wikidata instance, subclass, field, and main-subject claims into bounded result categories and ranking signals.
- `wiktionary-adapter.js`: extracts dictionary-term IPA, pronunciation audio, language, pronunciation-relevant etymology, and alternative written forms from Wiktionary wikitext.
- `wiktionary/variants.js`: pure parser for bounded Wiktionary alternative-form and variant-section entries.
- `nominatim-adapter.js`: extracts place-name source forms and OpenStreetMap attribution from Nominatim-compatible search results.
- `forvo-adapter.js`: extracts verified pronunciation audio from Forvo word-pronunciation API payloads.
- `custom-source-adapter.js`: extracts domain-specific pronunciation entries from a configured structured JSON endpoint.
- `pronunciation-source-plan.js`: orders pronunciation-audio lookup candidates from resolved source forms, aliases, variants, alternates, and raw selected text.
- `popup.html/js/css`: captures current selection, shows the resolver card, and provides speak/slow/stop plus correction controls.
- `popup/audio-playback.js`: owns popup browser `Audio` element lifecycle, playback-rate mapping, stop handling, and single fallback trigger behavior.
- `popup/result-renderer.js`: owns popup result field rendering, correction prefill, evidence lists, source links, alternate candidates, and audio choices.
- `popup/runtime-adapters.js`: owns popup active-tab selection reads, stored popup state, settings reads, runtime-message responses, and lookup-hint normalization.
- `correction-form.js`: normalizes correction-form prefill and submission data.
- `options.html/js/css`: manages remote-lookup behavior, on-page card display, and local community-memory data.
- `options/runtime-adapters.js`: owns options-page storage calls, optional endpoint permission requests, stale permission cleanup, and runtime-message responses.
- `options/summary-view.js`: owns options-page summary labels for cache, sync, approved entries, and local memory.
- `content-overlay.js`: shows a compact on-page resolver card with playback, online lookup, structured correction, and quick-feedback actions after context-menu or keyboard-command use.
- `content/overlay-style.js`: owns the classic-script style payload injected before the on-page card.
- `content/overlay-runtime-adapters.js`: owns classic content-script runtime message listener and send-message wrappers for the on-page card.
- `content/overlay-result-view.js`: owns classic content-script result formatting, URL filtering, HTML escaping, lookup-hint parsing, and correction-field markup helpers.
- `offscreen-audio.html/js`: wires the offscreen audio runtime modules for service-worker playback messages.
- `offscreen/audio-playback-flow.js`: owns offscreen `Audio` element lifecycle and playback-rate bounds.
- `offscreen/runtime-message-flow.js`: owns offscreen play/stop message routing and response shaping.
- `offscreen/runtime-adapters.js`: owns offscreen runtime listener registration.
- `community-sync.js`: builds privacy-scoped feedback submissions, manages a retry queue, and flushes to an opt-in HTTPS endpoint.
- `server/community-service.js`: dependency-free Node community service for submission intake, moderation, and approved-entry serving.
- `server/community-store.js`: pure store logic for pending, approved, and rejected community data.
- `server/admin-page.js`: static moderator UI for reviewing pending community submissions.
- `shared/settings.js`: pure settings and credential normalization used by the background worker and options page.
- `assets/icons/`: generated PNG icons referenced by the manifest and toolbar action.
- `data/pronunciation-seed.json`: stores early resolver entry shape and sample fields.
- `assets/audio/public/`: stores redistributable packaged audio referenced by resolver entries.
- `scripts/package-extension.mjs`: builds a deterministic Chrome ZIP from runtime extension files.
- `scripts/audit-architecture.mjs`: checks file-size and folder-density budgets against the modularization playbook baseline.
- `scripts/audit-public-audio.mjs`: validates packaged public-audio file presence and release metadata before Chrome ZIP creation.
- `scripts/smoke-loaded-extension.mjs`: opt-in Chrome or Edge launch smoke runner for service-worker, popup, options startup, and keyboard-overlay flow.
- `Dockerfile.community`: builds the self-hostable community moderation service image.
- `test/resolver-core.test.js`: verifies resolver behavior and manifest capabilities.
- `test/extension-smoke.test.js`: verifies extension page DOM bindings, packaged manifest references, and static module import resolution.

Verified audio from resolver results is preferred when available. Chrome's `tts` API remains the fallback path.

## Implemented MVP

- Selection capture from popup, privacy-first context menu, explicit online context menu, `Alt+Shift+S`, and online lookup with `Alt+Shift+O`.
- Keyboard command routing and handling has a narrow background module with deterministic mapping and fallback tests.
- Context-menu click handling has a narrow background module with deterministic fallback tests.
- Runtime message handling has a narrow background router with deterministic validation and error-response tests.
- Runtime browser adapters have a narrow background module with tests for seed-data caching, tab selection extraction, and keyboard dependency wiring.
- Service-worker platform adapters have deterministic tests for storage, runtime, tabs, scripting, commands, context menus, TTS, offscreen APIs, and dependency bundles.
- Result playback order has a narrow background module with deterministic overlay, offscreen, and TTS fallback tests.
- Playback surface wiring has a narrow background module with tests for TTS, overlay injection, offscreen audio lifecycle, client detection, and stop handling.
- Offscreen audio playback has narrow modules with tests for playback-rate bounds, audio lifecycle, listener registration, and play/stop message responses.
- Selection resolution has a narrow background module with tests for local lookup, online cache hits, remote cache writes, and online fallback evidence.
- Community feedback and sync handling has a narrow background module with tests for local memory, queue updates, sync flush, approved-entry refresh, and HTTP wrappers.
- Popup active-selection flow can auto-speak after resolving, with a user setting to disable it.
- Popup browser audio playback has deterministic tests for playback-rate mapping, stop handling, and fallback trigger behavior.
- Popup result rendering has deterministic tests for visible fields, correction prefill, source lists, alternate candidates, and audio choices.
- Popup runtime adapters have deterministic tests for active-tab selection, stored popup state, settings reads, runtime-message errors, and lookup hints.
- Options runtime adapters have deterministic tests for storage calls, optional endpoint permissions, stale permission cleanup, and runtime-message errors.
- Options summary labels have deterministic tests for cache, sync, approved entries, and local memory.
- Shared runtime message builders with unit tests for popup, options, offscreen-audio, and service-worker commands.
- Shared settings and credential normalization for the background worker and options page.
- Static smoke tests for popup/options DOM bindings, manifest-linked files, extension page scripts, and runtime import resolution.
- Optional loaded-extension smoke runner for service-worker, popup, options startup, and keyboard-overlay flow in a separate opt-in Chrome or Edge profile.
- Packaged PNG icons for toolbar and install surfaces.
- Local resolver over bundled entries and local community memory.
- Language names, speech locales, and script hints have a narrow pure module.
- Source-status labels and confidence ranking have a narrow pure module.
- Text normalization and script detection have a narrow pure module behind resolver-core compatibility exports.
- URL, count, alias, trust-signal, and long-field normalization have a narrow pure module.
- Pronunciation-audio selection and normalization have a narrow pure module.
- Local community-memory normalization and summaries have a narrow pure module.
- Script-sensitive fallback for non-Latin selected text.
- Latin orthography hints can guide fallback TTS and optional pronunciation-audio lookup when structured sources are absent.
- Latin-to-Cyrillic transliteration candidates, including bounded suffix heuristics, can broaden Wikidata lookup for romanized terms without adding a chat surface.
- Optional Wikidata lookup from the popup `Online` action.
- Online source orchestration has a background-owned module outside the service-worker entry point.
- Multi-candidate Wikidata search ranking before entity-detail extraction.
- Script-based Wikidata search languages for non-Latin selections.
- Optional lookup language hints expand Wikidata search and source-form scoring for rare Latin-script terms without adding a chat surface.
- Popup and on-page one-off lookup language hints can guide a single online resolve without changing saved defaults.
- Structured source aliases preserved for resolver results and correction prefill.
- Wikidata native-label, native-name, official-name, birth-name, generic-name, short-name, and sitelink-title source-form scoring, IPA extraction, and pronunciation-audio extraction where available.
- Wikidata source-form extraction handles both monolingual and string-valued name claims.
- Wikidata preserves non-primary source-form claims and sitelinks as variants for later pronunciation-audio lookup.
- Wikidata title, nickname, taxon-name, taxon common-name, and pseudonym source-form scoring for proper nouns and research terms.
- Wikidata native-script alias scoring when stronger source-form claims are absent.
- Wikidata instance/subclass claim mapping for result categories and candidate ranking.
- Wikidata entity-type scoring covers additional scientific, medical, academic, and technical term classes.
- Wikidata field and main-subject domain claims can specialize generic concepts for rare term ranking.
- Wikidata candidate ranking uses bounded description relevance when explicit entity-type claims are sparse.
- Wikidata language claims can guide result language, TTS locale, and pronunciation-audio lookup when source-form fields are sparse.
- Wikidata selection preserves useful alternate entity candidates for result ambiguity and follow-up audio lookup.
- Wikidata pronunciation-audio extraction preserves multiple Commons recordings from one entity.
- Wiktionary lookup for dictionary-like terms with IPA, pronunciation-audio, and short origin extraction.
- Wiktionary section selection can use resolved language hints from earlier structured sources.
- Hinted Wiktionary edition retries after English Wiktionary for dictionary entries missing from English Wiktionary.
- Wiktionary etymology lines can populate pronunciation-relevant root fields.
- Wiktionary enPR and respelling templates parsed into simple pronunciation guides.
- Wiktionary alternative-form sections can populate variant spellings for later pronunciation-audio lookup.
- Source-provided simple guides can drive fallback speech when no verified audio is available.
- Wiktionary pronunciation-audio extraction preserves multiple Commons recordings from one language section.
- Source-form and alias-guided Wiktionary retries after other structured sources resolve a better lookup form.
- Optional structured custom source lookup for domain-specific pronunciation entries.
- Custom source matching uses term, source form, aliases, and variants from returned entries.
- Source-form and alias-guided custom source retries after other structured sources resolve a better lookup form.
- Optional DBpedia-compatible knowledge graph lookup for entity context and source-form candidates.
- Source-form and alias-guided DBpedia-compatible retries after other structured sources resolve a better lookup form.
- DBpedia-compatible lookup preserves redirect labels as variants for later pronunciation-audio lookup.
- Optional Forvo pronunciation-audio lookup with user-provided API key and attribution links.
- Forvo lookup preserves additional same-word, same-language recordings on the resolved result.
- Forvo lookup can use lookup language hints when no dedicated Forvo language filter is set.
- Popup and on-page result cards expose playable recording choices when multiple audio sources are available.
- Source-form, alias, and variant-guided pronunciation-audio lookup after structured resolution, with raw selected text as fallback.
- Forvo candidate planning can retry configured-language lookups with resolved source-language hints.
- Matching verified audio is merged onto structured results so source context, IPA, and origin are preserved.
- Optional Nominatim-compatible gazetteer lookup from a configured HTTPS endpoint, with OpenStreetMap attribution links.
- Gazetteer lookup accepts language hints for request language order and source-form scoring.
- Gazetteer lookup can preserve alternate and historical place names as variants for audio lookup and review.
- Nominatim-compatible lookup keeps language-tagged alternate place names as alternate results, so audio lookup can retry the same spelling with the right language hint.
- Source-form and alias-guided gazetteer retries after other structured sources resolve a better lookup form.
- Local TTL-bounded cache for successful online lookup results, with options-page summary, clearing, and trust/variant metadata preservation.
- Result card with source form, aliases, language, category, origin, root, domain hint, variants, IPA/simple guide, confidence, source label, evidence, source links, alternate candidate summaries, quick feedback actions, and structured correction capture.
- On-page overlay styles are split into a companion injected content script, keeping the overlay controller below the file-size soft limit.
- On-page overlay runtime messaging is split into a companion injected content script with deterministic listener and message tests.
- On-page overlay result formatting is split into a companion injected content script with deterministic formatting and escaping tests.
- Alternate candidate summaries preserve speech-locale hints and can be spoken directly from popup or on-page result cards.
- Local confirmation, wrong-result, missing-term, correction, aliases, root, domain-hint, audio-source, source-link, variant-note storage, and import/export normalization.
- Missing-entry requests can carry candidate source forms, aliases, roots, domain hints, guides, and source links without promoting them to local pronunciation answers.
- Variant-only local corrections are treated as lookup data so valid variants stay visible.
- Remote structured results can preserve bounded variant lists for result evidence and cache storage.
- Guide-only local corrections can drive fallback speech when no community audio source is present.
- Local community entries preserve and derive trust signals from local actions and source evidence.
- Remote structured results derive bounded trust signals from source, audio, and root evidence.
- Result and correction views accept root, domain-hint, variant-list, and variant-note metadata from cached and shared payloads.
- Opt-in community sync endpoint with queued retry behavior.
- Community submissions preserve result trust signals, domain hints, variant lists, and variant notes through moderation.
- Optional host permission request for the configured community sync endpoint.
- Approved shared-entry pull from the community endpoint, merged below local corrections.
- Self-hostable moderation service with token-protected pending, approve, and reject endpoints.
- Static moderator page for loading pending submissions and approving or rejecting structured pronunciation entries.
- Community service request-size limits, in-memory public submission rate limiting, and configurable pending-queue caps.
- Community service serialized store writes for overlapping public or moderator requests.
- Community service proxy IP headers are ignored for rate limiting unless explicitly enabled.
- Community service container image and deployment notes.
- Options page for remote lookup defaults, on-page card display, and import/export/clear controls for local and shared memory.
- Verified-audio playback from popup, page overlay, or offscreen audio document, with TTS playback from resolved source form as fallback.
- Popup source-audio failures automatically fall back to TTS playback.
- Packaged public audio path rewriting for curated entries.
- Public audio release audit for packaged recording metadata, file presence, and seed-reference coverage.
- Chrome ZIP packaging from an explicit runtime-file allowlist with private, licensed, and raw data exclusions.
- Architecture audit for file-size and folder-density budgets, with current broad files tracked as explicit baseline debt.

## Future Lookup Pipeline

1. Normalize the selected text.
2. Detect script and apply optional lookup language hints.
3. Check local cache and community-confirmed entries.
4. Resolve known entities and terms through structured sources:
   - knowledge graphs and aliases
   - dictionaries, hinted Wiktionary editions, and pronunciation databases
   - gazetteers and map databases
   - domain-specific term sources
5. Resolve native/source form and candidate languages.
6. Query pronunciation sources for native audio.
7. Generate TTS from the resolved source form if native audio is unavailable.
8. Show confidence and source labels.
9. Collect correction, confirmation, or missing-entry feedback.
10. Cache successful lookups locally.

For Latin-script input, entity or term resolution should happen before generic language detection. A romanized term can look like many languages, but a matched entity can provide a reliable native/source form.

The resolver keeps useful displaced candidates on the winning result so the UI can show ambiguity when structured sources disagree or a higher-confidence audio source outranks another source-backed match. A single early language guess should not decide the result for rare terms.

## Data Model

Core fields:

- `id`: stable internal key.
- `language`: BCP-47 or ISO language code.
- `display`: default user-facing form.
- `native`: native-script form when known.
- `aliases`: romanized forms, alternate spellings, common old spellings.
- `category`: place, person, organization, term, loanword, scientific-term, technical-term, other.
- `origin`: source language, etymological root, or domain where known.
- `root`: pronunciation-relevant root, stem, component word, or etymological cue when distinct from origin.
- `domainHint`: pronunciation-relevant topical or professional context for review and disambiguation.
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

Community memory should produce a structured pronunciation graph, not a discussion feed. Accepted entries should capture source form, aliases, language, origin or root, domain hint, IPA, simple guide, audio source, source links, variants, and trust signals.

Missing or low-confidence lookups should use the same shape. A request for an unfamiliar term can record the selected spelling, candidate aliases, suggested source form, domain hint, requested guide, and optional source link so later moderation can promote it without inventing a second data model.

## Privacy

Public privacy policy: `docs/privacy-policy.md`.

The MVP should avoid sending every highlighted word to a server by default. A conservative sequence:

1. Check local cache and bundled resolver data.
2. Ask for remote lookup only when needed.
3. Cache only lookup data, not page URLs or browsing history.
4. Do not collect selected text analytics unless explicitly opted in.
5. Keep community submissions scoped to the selected term and pronunciation metadata.
6. Community sync is disabled by default, accepts only HTTPS endpoints, queues feedback only when enabled, and requests endpoint-origin access only after the user enables submission or approved-entry refresh.
7. Approved-entry refresh is a separate opt-in and stores only approved pronunciation metadata.
8. Gazetteer lookup accepts only HTTPS endpoints, is disabled until a user configures one, and uses lookup language hints only as request/source-form hints.
9. Forvo lookup is disabled until a user enables it and stores a local API key; the key is not included in exports, and lookup hints only shape language filters.
10. Custom source lookup accepts only HTTPS endpoints and sends only the selected term or resolved pronunciation candidates.
11. DBpedia-compatible lookup accepts only HTTPS endpoints and sends only the selected term or resolved pronunciation candidates.

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

- Keep broadening online entity scoring with more structured-source signals.
- Add actual curated public audio files after source/license review.
- Add loaded-extension smoke coverage for the context-menu flow.

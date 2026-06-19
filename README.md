# SayThis

SayThis is a Chrome extension concept for one-click pronunciation help.

The initial audience is creators, journalists, educators, and professionals who run into unfamiliar words or names while preparing scripts, recordings, presentations, lessons, or calls. The product goal is simple: highlight a word or phrase, click once, hear a trustworthy pronunciation.

## Working Store Title

> SayThis: One-Click Pronunciation

## Current Status

This repository is an early Manifest V3 Chrome extension implementation. It includes:

- Context-menu actions for selected text, including an explicit online lookup action.
- Background-owned context-menu workflow coverage with deterministic fallback behavior.
- Background-owned keyboard command routing and selection workflow coverage with deterministic fallback behavior.
- Background-owned runtime message routing with deterministic validation and error responses.
- Runtime speak messages refresh online, play available audio, and reuse shared audio before falling back to speech.
- Background-owned result playback flow for overlay audio, offscreen audio, and verified speech fallback.
- Background-owned playback surface wiring for verified speech, offscreen audio lifecycle, and overlay injection.
- Background-owned runtime adapters for seed-data loading, active-tab lookup, and tab selection extraction.
- Background-owned platform adapters for service-worker storage, runtime, tab, scripting, command, menu, TTS, and offscreen APIs.
- Background-owned selection resolution for local lookup, online lookup, cache use, and storage updates.
- Abbreviation guides for compact initialisms, symbol connectors, and lowercase-`n` connector forms.
- Background-owned community feedback and sync flow for local memory, queueing, approved-entry refresh, and result updates.
- Background-owned online source orchestration outside the service-worker entry point.
- Shared runtime message builders for popup, options, offscreen-audio, and background commands.
- Shared settings and credential normalization for the background worker and options page.
- Static Chrome-surface smoke tests for HTML bindings, packaged files, and module imports.
- Optional loaded-extension Chrome smoke runner for service-worker startup, context-menu registration, popup/options pages, and keyboard-overlay checks.
- Packaged extension icons for toolbar and install surfaces.
- Keyboard commands for selected text: `Alt+Shift+S` and online lookup with `Alt+Shift+O`.
- A popup with selected-text capture and speak/stop controls.
- Popup header shortcut for opening extension options.
- Popup audio playback helper for browser `Audio` lifecycle, stop handling, and speech fallback triggers.
- Popup result renderer for result fields, correction prefill, evidence, sources, alternate candidates, and audio choices.
- Popup runtime adapters for active-tab selection, stored popup state, settings, runtime messaging, and lookup hints.
- Options runtime adapters for storage, endpoint permissions, and background runtime messages.
- Options summary helpers for cache, sync, shared entries, and local memory.
- Popup, options, source adapters, and shared result helpers live in owned folders to keep Chrome surfaces and lookup sources modular.
- Shared voice preferences rank known high-quality locale voices across browser speech and provider generation.
- Popup opens can auto-speak the active selection, with an options-page toggle.
- A resolver result card with source form, aliases, language, origin, root, domain hint, variants, IPA/simple guide, confidence, evidence, and source links.
- Alternate candidate display when structured sources disagree or a stronger source displaces another useful match.
- Alternate candidates can be spoken from the popup or on-page card, so ambiguity is actionable instead of only informational.
- Alias capture from structured sources and community corrections.
- Wikidata name-variant aliases from labels, sitelink titles, and native, native-name, official, birth-name, generic-name, and short-name claims.
- Wikidata source-form extraction handles both monolingual and string-valued name claims.
- Wikidata preserves non-primary source-form claims and sitelinks as variants for review and audio lookup.
- Wikidata title, nickname, taxon-name, taxon common-name, and pseudonym claims as source-form and alias signals.
- Wikidata native-script aliases can be promoted to source forms when stronger name fields are missing.
- Wikidata instance/subclass claims inform result categories and candidate ranking.
- Wikidata entity-type scoring covers additional scientific, medical, academic, and technical term classes.
- Wikidata field and main-subject domain claims can specialize generic concepts for rare term ranking.
- Wikidata candidate ranking uses bounded description relevance when explicit entity-type claims are sparse.
- Wikidata language claims can guide result language, TTS locale, and pronunciation-audio lookup when source-form fields are sparse.
- Wikidata lookup preserves useful alternate entity candidates for ambiguity review and follow-up audio lookup.
- Wikidata pronunciation-audio lookup preserves multiple Commons recordings when an entity provides them, preferring language-qualified recordings that match the resolved result.
- Optional Wikidata lookup language hints for rare Latin-script terms and competing source forms.
- Popup and on-page one-off lookup language hints can guide a single online resolve without changing saved defaults.
- A compact on-page result card with aliases, speak, online lookup, slow replay, structured correction, confirm, missing, and wrong actions after context-menu or keyboard use.
- Split on-page overlay style payload so the overlay controller stays narrow.
- Split on-page overlay runtime messaging into a companion content adapter.
- Split on-page overlay result formatting, escaping, and correction-field helpers into a companion content script.
- An offscreen audio player for verified audio when the page card cannot be injected.
- Offscreen audio playback, runtime listener wiring, and message routing are split into tested modules.
- Local community-memory controls for confirmations, wrong results, missing terms, richer corrections, aliases, roots, domain hints, audio sources, variant lists, and variant notes.
- Missing-entry requests can carry candidate source forms, aliases, roots, domain hints, guides, and source links for later moderation.
- Variant-only local corrections are surfaced on later lookup results.
- Remote structured results can preserve bounded variant lists for result evidence and cache storage.
- Guide-only local corrections can drive fallback speech when no community audio source is present.
- Local community memory preserves and derives trust signals from confirmations, corrections, source links, audio links, and variant notes.
- Remote structured results derive bounded trust signals from source, audio, and root evidence.
- Result and correction views accept root, domain-hint, variant-list, and variant-note metadata from cached and shared result payloads.
- Correction audio and source links are normalized before local storage or shared submission.
- Import and export cleanup for local and approved shared pronunciation memory.
- Sparse keyed memory imports preserve selected-term lookup keys while keeping source-form pronunciation data.
- Local results without a preferred recording automatically check public structured sources for pronunciation data; the popup `Online` action still forces a refresh.
- Cached no-audio results do not block recording refresh for structured local entries that still need preferred audio.
- Latin orthography hints can guide fallback TTS and optional pronunciation-audio lookup when structured sources are absent.
- Compact, connector-marked, punctuation-spaced, and technical mixed-case initialisms can use guide speech instead of raw fallback reading.
- Latin-to-Cyrillic transliteration candidates, including bounded suffix heuristics, can broaden Wikidata lookup for romanized terms without adding a chat surface.
- Optional structured custom source lookup for domain-specific pronunciation entries.
- Optional DBpedia-compatible knowledge graph lookup for entity context and source-form candidates.
- Custom source lookup can retry resolved source forms and aliases from structured results.
- Wikidata lookup adds script-based search languages for non-Latin selections.
- Custom sources can provide array or text aliases and keyed entry maps.
- Custom sources can match selected text by variant spellings as well as aliases and source forms.
- Custom sources preserve matching alternate entries for variants or language-specific pronunciations.
- Generic custom-source audio does not stop source-form or alias retries for native/source-backed pack audio.
- Explicit online refresh treats cached generic verified audio as improvable and retries stronger audio sources.
- DBpedia-compatible lookup can retry resolved source forms and aliases from other structured results.
- DBpedia-compatible lookup preserves redirect labels as variants for later audio lookup and review.
- Source-form and alias-guided Wiktionary lookup after structured resolution.
- Wiktionary language-section selection can use resolved source languages and one-off lookup hints from the user.
- Wiktionary lookup tries resolved or hinted target-language editions before English fallback.
- Wiktionary etymology lines can populate pronunciation-relevant root fields.
- Wiktionary enPR and respelling guides are surfaced as simple pronunciation guides.
- Wiktionary alternative-form sections can populate variant spellings for later audio lookup and review.
- Source-provided simple guides can drive fallback speech when no verified audio is available.
- Guide fallback speaks only guide-like text and leaves explanatory notes as metadata instead of reading them aloud.
- Generated Cyrillic source-form guides account for resolved language differences.
- Wiktionary pronunciation-audio lookup preserves multiple Commons recordings from one language section.
- Lingua Libre recordings found through Commons-backed sources are ranked as native-speaker audio ahead of generic verified recordings.
- Source-backed pronunciation-guide recordings found through Commons-backed sources are ranked ahead of generic verified recordings.
- Generic verified dictionary audio does not stop target-language edition or source-form retries.
- Generic verified dictionary audio does not block a Commons check for source-backed or native recordings.
- Optional Forvo pronunciation-audio lookup with a local user-provided API key.
- Forvo audio paths are preserved as long source URLs for playback.
- Forvo results preserve additional same-word, same-language recordings for source-backed practice options.
- Forvo recordings are ranked as native-speaker audio ahead of generic verified recordings.
- Forvo lookup can use lookup language hints when no Forvo-specific language filter is set.
- Popup and on-page cards expose playable recording choices with source and quality context when a result has multiple audio sources.
- Source-form, alias, and variant-guided pronunciation-audio lookup that tries resolved spellings before raw selected text.
- Forvo lookup retries configured-language candidates with resolved source-language hints when available.
- Verified audio from matching sources is merged onto structured results so IPA, origin, and source context stay visible.
- Optional Nominatim-compatible place-name lookup from a configured HTTPS endpoint.
- Gazetteer lookup can use language hints for `accept-language` and source-form ranking.
- Gazetteer lookup can preserve alternate and historical place names as variants for audio lookup and review.
- Source-form and alias-guided gazetteer retries after structured lookup.
- Local cache for successful online lookup results.
- Imported lookup-cache results are allowlisted to pronunciation result fields while preserving trust and variant metadata.
- Verified pronunciation-audio playback from structured sources when available, with verified matching browser voice or guide speech fallback.
- Speak retries online before playing generic verified recordings so native/source-backed audio can replace them when available.
- Popup and on-page Speak use the same top-tier audio rule before playing local recording URLs.
- Popup source-audio playback falls back through the same verified speech policy if the audio cannot start.
- Browser speech is blocked when a non-English resolved language would be routed through an English voice, except for explicit simple guide speech.
- Fallbacks for scripts shared by multiple languages remain unresolved until a structured source identifies the language, instead of speaking through a guessed browser voice.
- Options for default online lookup, on-page card display, and local/shared community-memory data management.
- Opt-in community sync endpoint with a local retry queue for correction submissions.
- Privacy-scoped community submissions can carry resolver aliases, origin, root, domain hints, guides, audio, variants, and source links for moderator review.
- Community submissions preserve result trust signals, domain hints, variant lists, and variant notes for moderator review.
- Sync retry queues are normalized on import and export so queued submissions stay scoped to pronunciation fields.
- Optional host permission request for the configured community sync endpoint.
- No-longer-used optional endpoint permissions are removed when remote features are disabled or endpoints change.
- Approved shared-entry refresh from the configured community endpoint, with local corrections taking priority.
- Community moderation service with body-size, rate-limit, and pending-queue abuse controls.
- Community moderation rejected-history storage is bounded.
- Community service can reject browser-originated requests outside configured allowed origins.
- Community service serializes store writes so concurrent submissions do not overwrite pending entries.
- Community service trusts proxy rate-limit headers only when explicitly enabled.
- Community service enforces a persisted public provider-generation budget before paid shared-audio synthesis.
- Community service can store reviewed or token-gated service-generated audio artifacts and publish shared audio URLs through approved entries.
- Popup, on-page, context-menu, and keyboard playback can request shared generated audio from the configured community endpoint when no preferred recording exists.
- Shared audio checks are timeout-bounded and non-gating, so verified matching browser speech can start when the endpoint is slow or unavailable.
- Shared audio requests reuse approved artifacts first and require server-side opt-in before provider generation can run.
- Shared audio requests reuse locally approved shared artifacts before contacting the endpoint again, even after endpoint access is disabled.
- Shared audio playback has its own endpoint toggle, so users can enable reusable audio for Speak without enabling correction sync or approved-entry refresh.
- Generic verified recordings can reuse approved shared artifacts from local memory or the configured endpoint without authorizing fresh provider generation.
- Shared audio reuse can match lookup key, term, source form, alias, or variant when the base language matches, and stores a selected-key alias so refreshed results can play the shared sample.
- Returned shared audio is attached to the current result when resolver refresh does not surface it immediately, so the same click can still play the approved sample.
- Source-backed or curated shared recordings keep top-tier audio quality when attached to results.
- Generated provider/shared audio is blocked when a non-English resolved language would be routed through an English TTS locale.
- Legacy direct audio URL templates are ignored; provider generation runs through shared-audio endpoints so useful samples can be reused.
- Generated fallback samples do not relabel a result that already has a verified or native-speaker recording.
- Generated fallback samples are labeled separately from source-backed recordings in popup and on-page playback rows.
- Generated-only or unknown-quality audio results keep source-form speech and guide rows visible so users can compare practice options.
- Automatic playback skips unknown-quality audio URLs and leaves them as manual choices beside source-form speech or guide fallback.
- Container image and deployment notes for the community service.
- Non-browser CI for unit tests, syntax checks, release audits, and Chrome package creation.
- Architecture audit for file-size, folder-density, and browser API adapter-boundary budgets with an explicit current-debt baseline.
- Chrome packaging excludes private, licensed, and raw data paths even if they exist locally.
- Packaged public-audio support for curated entries under `assets/audio/public/`, including one approved public-domain pronunciation sample.
- Verified matching browser voice as a temporary local fallback when no recording is available.
- Product, research, and technical planning docs.
- A seed resolver dataset for pronunciation entries.
- Pure resolver language helpers split into a narrow module.
- Pure resolver status and confidence helpers split into a narrow module.
- Pure resolver text helpers split into a narrow module behind compatibility exports.
- Pure resolver value sanitizers split into a narrow module.
- Pure resolver audio helpers split into a narrow module.
- Pure resolver merge helpers split into a narrow module.
- Pure resolver community-memory helpers split into a narrow module.

Chrome TTS is not the final product. The intended product should prioritize curated native recordings and reliable pronunciation databases, then use browser speech only when the voice is verified for the resolved language or when a simple guide can be spoken. It should not route a non-English resolved language through an English voice for source-form speech. Paid-provider generation belongs behind service-side controls, with useful generated samples saved as shared reviewed audio artifacts.

MVP quality bar: SayThis should prefer verified recordings from source-backed services. If no recording is available, it may use a verified matching browser voice for the resolved source form. Shared audio lookup must not block that verified matching voice path. If the browser cannot verify a matching voice, SayThis should use the simple guide when present or report that speech is unavailable instead of playing a misleading fallback voice.

## Core Docs

- Original idea: `docs/original-idea.md`
- Product thesis: `docs/product-thesis.md`
- Pronunciation graph: `docs/pronunciation-graph.md`
- Product brief: `docs/product-brief.md`
- Privacy policy: `PRIVACY.md` and `docs/privacy-policy.md`
- SWOT analysis: `docs/product/swot-analysis.md`
- Research notes: `docs/product/research-notes.md`
- Technical plan: `docs/technical-plan.md`
- Storage ownership: `docs/architecture/storage-ownership.md`
- Browser extension playbook: `C:\Users\molod\Documents\Personal\settings\browser-extension-playbook.md`
- Community service: `docs/community-service.md`
- Deployment: `docs/deployment.md`
- Custom source: `docs/custom-source.md`
- Chrome Web Store listing: `store-listing/chrome-web-store/listing/en.md`
- Chrome Web Store review fields: `docs/chrome-web-store/`
- StorePilot import fields: `docs/chrome-web-store-additional-fields.md`, `docs/chrome-web-store-category.md`, and `docs/chrome-web-store-privacy-form.md`
- Seed glossary: `data/pronunciation-seed.json`

## Load Locally

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Choose Load unpacked.
4. Select this folder:

```powershell
C:\Users\molod\Documents\Personal\settings\SayThis
```

Then highlight text on a web page and either:

- Right-click and choose `SayThis: pronounce...`.
- Right-click and choose `SayThis: online lookup and pronounce...` for a one-off remote lookup.
- Press `Alt+Shift+S`.
- Press `Alt+Shift+O` for a one-off remote lookup.
- Click the extension icon to open the popup and press Speak.

## Product Direction

The first useful version should be narrow and trusted:

- Resolve unfamiliar terms through structured sources before falling back to generated speech.
- Let users add lookup language hints when a Latin spelling is ambiguous, keeping the resolver explicit instead of chat-based.
- Let popup and on-page users add one-off lookup hints for a single term without changing their default resolver settings.
- Use structured source language claims to guide audio lookup when a term's spelling alone is ambiguous.
- Store native-script forms, romanized variants, source confidence, and native audio.
- Treat each useful lookup as a reusable pronunciation-graph entry, not a chat response or a closed-list item.
- Treat community submissions as structured pronunciation knowledge: source form, root, domain hint, audio, guide, variant, source, and trust signal.
- Prefer curated or native-speaker audio over generated voices.
- Use detected or resolved language to feed source forms into shared provider generation only when there is a resolved source-form difference or a non-English provider locale, then publish useful generated results as reviewed shared audio artifacts and keep them below recordings.
- Promote useful generated samples into moderated shared audio artifacts so one reviewed generation can be reused by every client that resolves the same source form and language.
- Keep shared provider generation behind service-side opt-in, bearer-token authorization, rate limits, useful-target validation, and persisted generation budgets.
- Show confidence and source labels in the UI.
- Let users confirm, correct, or request missing entries so SayThis becomes a community memory layer.

Community sync, shared-audio endpoint use, approved-entry refresh, custom source lookup, DBpedia-compatible lookup, Forvo audio lookup, and Nominatim-compatible place-name lookup are disabled by default. When any remote feature is enabled, SayThis asks Chrome for access to the relevant endpoint origin. Lookup language hints only alter Wikidata API language parameters, local source-form ranking, Wiktionary language-section and edition selection, gazetteer language parameters, and Forvo language filters. Community sync submits only the selected term, feedback type, correction or missing-request candidate fields, and resolver metadata. Feedback is not queued for sync until community sync is enabled. Approved-entry refresh is a separate opt-in and stores only approved pronunciation metadata. Shared-audio endpoint use is a separate opt-in for Speak actions; it sends term-level pronunciation metadata only when a preferred recording is missing or a reusable approved sample may be better. SayThis does not submit page URLs or browsing history. Custom source and DBpedia-compatible lookup send only the selected term or a resolved pronunciation candidate. Optional Forvo API keys and shared-audio generation tokens are stored locally and are not included in data exports.

## Development

Run the resolver tests:

```powershell
npm test
```

Regenerate extension icons:

```powershell
npm run assets:icons
```

Create a Chrome ZIP package:

```powershell
npm run package:chrome
```

Audit packaged public audio metadata:

```powershell
npm run audit:public-audio
```

Run the release readiness audit:

```powershell
npm run audit:release
```

Run the architecture audit:

```powershell
npm run audit:architecture
```

Run the optional loaded-extension smoke check:

```powershell
$env:SAYTHIS_SMOKE_LAUNCH = "1"
npm run smoke:chrome
```

By default this command skips without launching Chrome or Edge. Set `SAYTHIS_SMOKE_LAUNCH=1` only when you want a separate temporary smoke profile. Set `SAYTHIS_CHROME_PATH` if Chrome or Edge is not found automatically. Set `SAYTHIS_SMOKE_HEADLESS=0` for a visible local run, `SAYTHIS_SMOKE_REQUIRED=1` when extension startup must fail instead of skipping, or `SAYTHIS_SMOKE_OVERLAY_REQUIRED=1` when the keyboard-overlay path must fail instead of skipping. The smoke runner also verifies that the loaded service worker registered the expected context-menu entries. The CLI leaves the launched smoke profile open for manual review and does not terminate the launched browser process.

Run the community moderation service locally:

```powershell
$env:SAYTHIS_ADMIN_TOKEN = "change-me"
npm run community:serve
```

## Privacy

SayThis stores settings, local pronunciation memory, lookup cache data, and optional local credentials in Chrome extension local storage. Online lookup sends only the selected term or resolved pronunciation candidate to source services. See `PRIVACY.md` for the browser permissions, network behavior, and user controls.

## Open Source

SayThis is open source under the GPL-3.0-only license:
https://github.com/molodchyk/SayThis

See `LICENSE` for the full license text.

## Support

If this extension saves you time and you want to support its development:

[![Buy Me a Coffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-support-FFDD00?logo=buymeacoffee&logoColor=000)](https://buymeacoffee.com/molodchyk)
[![Patreon](https://img.shields.io/badge/Patreon-support-F96854?logo=patreon&logoColor=fff)](https://www.patreon.com/OMolodchyk)

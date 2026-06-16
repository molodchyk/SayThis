# SayThis

SayThis is a Chrome extension concept for one-click pronunciation help.

The initial audience is creators, journalists, educators, and professionals who run into unfamiliar words or names while preparing scripts, recordings, presentations, lessons, or calls. The product goal is simple: highlight a word or phrase, click once, hear a trustworthy pronunciation.

## Working Store Title

> SayThis: One-Click Pronunciation

## Current Status

This repository is an early Manifest V3 Chrome extension implementation. It includes:

- Context-menu actions for selected text, including an explicit online lookup action.
- Shared runtime message builders for popup, options, offscreen-audio, and background commands.
- Static Chrome-surface smoke tests for HTML bindings, packaged files, and module imports.
- Optional loaded-extension Chrome smoke runner for popup/options/service-worker startup and keyboard-overlay checks.
- Packaged extension icons for toolbar and install surfaces.
- Keyboard commands for selected text: `Alt+Shift+S` and online lookup with `Alt+Shift+O`.
- A popup with selected-text capture and speak/stop controls.
- A resolver result card with source form, aliases, language, origin, IPA/simple guide, confidence, evidence, and source links.
- Alternate candidate display when structured sources disagree or a stronger source displaces another useful match.
- Alias capture from structured sources and community corrections.
- Wikidata name-variant aliases from labels and native, native-name, official, birth-name, generic-name, and short-name claims.
- A compact on-page result card with aliases, speak, online lookup, slow replay, structured correction, confirm, missing, and wrong actions after context-menu or keyboard use.
- An offscreen audio player for verified audio when the page card cannot be injected.
- Local community-memory controls for confirmations, wrong results, missing terms, richer corrections, aliases, audio sources, and variant notes.
- Correction audio and source links are normalized before local storage or shared submission.
- Import and export cleanup for local and approved shared pronunciation memory.
- Sparse keyed memory imports preserve selected-term lookup keys while keeping source-form pronunciation data.
- Optional Wikidata lookup from the popup when the user chooses `Online`.
- Optional structured custom source lookup for domain-specific pronunciation entries.
- Wikidata lookup adds script-based search languages for non-Latin selections.
- Custom sources can provide array or text aliases and keyed entry maps.
- Optional Forvo pronunciation-audio lookup with a local user-provided API key.
- Forvo audio paths are preserved as long source URLs for playback.
- Source-form and alias-guided pronunciation-audio lookup that tries resolved spellings before raw selected text.
- Optional Nominatim-compatible place-name lookup from a configured HTTPS endpoint.
- Local cache for successful online lookup results.
- Imported lookup-cache results are allowlisted to pronunciation result fields.
- Verified pronunciation-audio playback from structured sources when available, with Chrome TTS fallback.
- Popup source-audio playback falls back to TTS automatically if the audio cannot start.
- Options for default online lookup, on-page card display, and local/shared community-memory data management.
- Opt-in community sync endpoint with a local retry queue for correction submissions.
- Privacy-scoped community submissions can carry resolver aliases, origin, guides, audio, and source links for moderator review.
- Sync retry queues are normalized on import and export so queued submissions stay scoped to pronunciation fields.
- Optional host permission request for the configured community sync endpoint.
- No-longer-used optional endpoint permissions are removed when remote features are disabled or endpoints change.
- Approved shared-entry refresh from the configured community endpoint, with local corrections taking priority.
- Community moderation service with body-size, rate-limit, and pending-queue abuse controls.
- Community moderation rejected-history storage is bounded.
- Community service can reject browser-originated requests outside configured allowed origins.
- Community service serializes store writes so concurrent submissions do not overwrite pending entries.
- Community service trusts proxy rate-limit headers only when explicitly enabled.
- Container image and deployment notes for the community service.
- Non-browser CI for unit tests, syntax checks, and Chrome package creation.
- Chrome packaging excludes private, licensed, and raw data paths even if they exist locally.
- Packaged public-audio support for curated entries under `assets/audio/public/`.
- Chrome TTS as a temporary local fallback.
- Product, research, and technical planning docs.
- A seed resolver dataset for pronunciation entries.

Chrome TTS is not the final product. The intended product should prioritize curated native recordings and reliable pronunciation databases, then use synthetic TTS only as a clearly labeled fallback.

## Core Docs

- Original idea: `docs/original-idea.md`
- Product thesis: `docs/product-thesis.md`
- Pronunciation graph: `docs/pronunciation-graph.md`
- Product brief: `docs/product-brief.md`
- Privacy policy: `docs/privacy-policy.md`
- SWOT analysis: `docs/swot-analysis.md`
- Research notes: `docs/research-notes.md`
- Technical plan: `docs/technical-plan.md`
- Community service: `docs/community-service.md`
- Deployment: `docs/deployment.md`
- Custom source: `docs/custom-source.md`
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
- Store native-script forms, romanized variants, source confidence, and native audio.
- Treat each useful lookup as a reusable pronunciation-graph entry, not a chat response or a closed-list item.
- Treat community submissions as structured pronunciation knowledge: source form, root, audio, guide, variant, source, and trust signal.
- Prefer curated or native-speaker audio over generated voices.
- Show confidence and source labels in the UI.
- Let users confirm, correct, or request missing entries so SayThis becomes a community memory layer.

Community sync, approved-entry refresh, custom source lookup, Forvo audio lookup, and Nominatim-compatible place-name lookup are disabled by default. When any remote feature is enabled, SayThis asks Chrome for access to the relevant endpoint origin. Community sync submits only the selected term, feedback type, correction fields, and resolver metadata. Feedback is not queued for sync until community sync is enabled. Approved-entry refresh is a separate opt-in and stores only approved pronunciation metadata. SayThis does not submit page URLs or browsing history. Forvo API keys are stored locally and are not included in data exports.

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

Run the optional loaded-extension smoke check:

```powershell
$env:SAYTHIS_SMOKE_LAUNCH = "1"
npm run smoke:chrome
```

By default this command skips without launching Chrome or Edge. Set `SAYTHIS_SMOKE_LAUNCH=1` only when you want a separate temporary smoke profile. Set `SAYTHIS_CHROME_PATH` if Chrome or Edge is not found automatically. Set `SAYTHIS_SMOKE_HEADLESS=0` for a visible local run, `SAYTHIS_SMOKE_REQUIRED=1` when extension startup must fail instead of skipping, or `SAYTHIS_SMOKE_OVERLAY_REQUIRED=1` when the keyboard-overlay path must fail instead of skipping. The CLI leaves the launched smoke profile open for manual review.

Run the community moderation service locally:

```powershell
$env:SAYTHIS_ADMIN_TOKEN = "change-me"
npm run community:serve
```

## License

TBD.

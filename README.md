# SayThis

SayThis is a Chrome extension concept for one-click pronunciation help.

The initial audience is creators, journalists, educators, and professionals who run into unfamiliar words or names while preparing scripts, recordings, presentations, lessons, or calls. The product goal is simple: highlight a word or phrase, click once, hear a trustworthy pronunciation.

## Working Store Title

> SayThis: One-Click Pronunciation

## Current Status

This repository is an early Manifest V3 Chrome extension implementation. It includes:

- Context-menu actions for selected text, including an explicit online lookup action.
- A keyboard command for selected text: `Alt+Shift+S`.
- A popup with selected-text capture and speak/stop controls.
- A resolver result card with source form, language, origin, IPA/simple guide, confidence, and evidence.
- A compact on-page result card after context-menu or keyboard use.
- An offscreen audio player for verified audio when the page card cannot be injected.
- Local community-memory controls for confirmations, wrong results, missing terms, and corrections.
- Optional Wikidata lookup from the popup when the user chooses `Online`.
- Local cache for successful online lookup results.
- Verified pronunciation-audio playback from structured sources when available, with Chrome TTS fallback.
- Options for default online lookup, on-page card display, and local community-memory data management.
- Opt-in community sync endpoint with a local retry queue for correction submissions.
- Approved shared-entry refresh from the configured community endpoint, with local corrections taking priority.
- Packaged public-audio support for curated entries under `assets/audio/public/`.
- Chrome TTS as a temporary local fallback.
- Product, research, and technical planning docs.
- A seed resolver dataset for pronunciation entries.

Chrome TTS is not the final product. The intended product should prioritize curated native recordings and reliable pronunciation databases, then use synthetic TTS only as a clearly labeled fallback.

## Core Docs

- Original idea: `docs/original-idea.md`
- Product thesis: `docs/product-thesis.md`
- Product brief: `docs/product-brief.md`
- SWOT analysis: `docs/swot-analysis.md`
- Research notes: `docs/research-notes.md`
- Technical plan: `docs/technical-plan.md`
- Community service: `docs/community-service.md`
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
- Click the extension icon to open the popup and press Speak.

## Product Direction

The first useful version should be narrow and trusted:

- Resolve unfamiliar terms through structured sources before falling back to generated speech.
- Store native-script forms, romanized variants, source confidence, and native audio.
- Prefer curated or native-speaker audio over generated voices.
- Show confidence and source labels in the UI.
- Let users confirm, correct, or request missing entries so SayThis becomes a community memory layer.

Community sync is disabled by default. When enabled, SayThis submits only the selected term, feedback type, correction fields, and resolver metadata to the configured HTTPS endpoint. It can also refresh approved shared entries from that endpoint. It does not submit page URLs or browsing history.

## Development

Run the resolver tests:

```powershell
npm test
```

Run the community moderation service locally:

```powershell
$env:SAYTHIS_ADMIN_TOKEN = "change-me"
npm run community:serve
```

## License

TBD.

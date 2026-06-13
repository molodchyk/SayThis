# Product Brief

## Summary

SayThis is a Chrome extension for instant pronunciation help from selected text. It starts with spoken-content workflows because the pain is repeated, visible, and tied to credibility: creators encounter unfamiliar words and proper nouns, then either waste time looking them up or pronounce them badly on air.

## Target Users

- Journalists, podcasters, streamers, and editors preparing scripts.
- Viewers or researchers who want to hear unfamiliar words quickly.
- Later: language learners, teachers, sales teams, and anyone handling international names.

## Jobs To Be Done

- When I see an unfamiliar name in a script, article, map, or source post, I want to hear it immediately so I can say it correctly.
- When I am preparing a video, I want a fast pronunciation check without opening several tabs.
- When the extension is unsure, I want to know that instead of being given false confidence.

## MVP Scope

The first version should support:

- Selection-based lookup from any web page.
- Context menu and popup entry points.
- A curated pronunciation dictionary.
- Native audio playback where available.
- Source labels: curated, native database, generated fallback, unknown.
- Basic romanized-to-native-script matching for known entries.
- A missing-entry request/report flow.

## Out Of Scope For MVP

- Full universal language detection.
- Perfect IPA generation for arbitrary names.
- Automatic pronunciation correction for long paragraphs.
- Speech coaching or user-recording evaluation.
- Mobile browser support.

## Trust Model

Every pronunciation result should expose its source and confidence:

- `Curated native audio`: highest confidence.
- `Native-speaker database`: high confidence, but may include regional variants.
- `Official pronunciation guide`: useful for text/IPA, but may lack audio.
- `Generated TTS`: fallback only.
- `Unknown`: no confident answer.

## UX Shape

The interaction should be compact:

- Highlight text.
- Click SayThis or use the context menu.
- Hear audio immediately.
- Optional popup shows native spelling, source, slow replay, and report controls.

The UI should avoid teaching users how to use the extension inside the product surface. The extension should be self-evident from the action.

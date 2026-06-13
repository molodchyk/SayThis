# Original Idea

Captured on 2026-06-13. This public version intentionally keeps the source scenario generalized and product-focused.

## User Notes

One-button pronunciation extension: highlight the word, determine the likely language or source form, pull the right voice or audio service, and give audio.

The problem: creators and professionals often run into unfamiliar names and terms while preparing spoken content. Existing lookup flows take too many steps, so people either guess or lose momentum. The product should make it easy to get audio for quick practice. Implementation can differ, but the core idea is for it to be easy to use and high return: highlight a word, match it against a relevant database or detect the likely language/source form, transform it to a native script when useful, and provide audio output.

## Naming Decision

The product name is `SayThis`.

The name was chosen because it describes the action rather than locking the product into names, places, journalism, or any single category. The extension should feel like a direct command: highlight something and ask the browser to say this.

## Core Product Promise

SayThis should make pronunciation lookup feel like one button:

1. Highlight a word or phrase.
2. SayThis identifies what it likely is.
3. SayThis resolves the most useful native spelling or source form.
4. SayThis plays the best available audio.
5. SayThis shows confidence, source, and a simple fallback guide.

## Initial Wedge

The first high-value audience is English-speaking creators and professionals preparing spoken content with unfamiliar names, places, and terms.

## Product Constraints

- Accuracy matters more than broad coverage.
- Native or curated audio should outrank generated speech.
- Synthetic TTS should be visibly labeled as fallback.
- Single-word language detection is unreliable, so entity matching and curated dictionaries should be preferred for the MVP.
- The workflow must stay fast enough to use while scripting or recording.

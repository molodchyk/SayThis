# Original Idea

Captured on 2026-06-13. This public version intentionally keeps the source scenario generalized and product-focused.

## User Notes

One-button pronunciation extension: highlight the word, determine the likely language or source form, pull the right voice or audio service, and give audio.

The problem: creators and professionals often run into unfamiliar names and terms while preparing spoken content. Existing lookup flows take too many steps, so people either guess or lose momentum. The product should make it easy to get audio for quick practice. Implementation can differ, but the core idea is for it to be easy to use and high return: highlight a word, match it against a relevant database or detect the likely language/source form, transform it to a native script when useful, and provide audio output.

The later product insight is broader: SayThis should not be just a text-to-speech button, a chatbot, or a static word list. It should become a community-driven pronunciation memory layer for unfamiliar terms on the web. The extension should resolve selected text into the most likely pronounceable source form, play audio, show why the result is trustworthy, and learn from corrections.

The deeper product insight is that unfamiliar-term pronunciation is reusable knowledge. A user is not only asking for sound; they are asking what this term is, what form should be spoken, what root or origin explains it, which variants are valid, and which source makes the answer trustworthy. SayThis should turn that into a compact pronunciation unit that can help the next person.

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

## Product Thesis

SayThis is a pronunciation resolver. It should answer one narrow question: how should this selected term be pronounced, and why should the user trust that result?

The product should avoid two weak extremes:

- It should not become a built-in chatbot or generic AI assistant.
- It should not depend on a manually maintained list of pre-curated words.

Instead, SayThis should combine structured sources, pronunciation services, language rules, and community corrections.

The key asset should be a pronunciation graph, not a chat transcript and not a fixed glossary.

## Initial Wedge

The first high-value audience is English-speaking creators, researchers, educators, and professionals preparing spoken content with unfamiliar names, places, technical terms, loanwords, and research vocabulary.

## Product Constraints

- Accuracy matters more than broad coverage.
- Native or curated audio should outrank generated speech.
- Synthetic TTS should be visibly labeled as fallback.
- Single-word language detection is unreliable, so entity and term resolution should happen before generic language detection.
- The workflow must stay fast enough to use while scripting or recording.
- Etymology, roots, and origin notes are useful only when they improve pronunciation or trust.

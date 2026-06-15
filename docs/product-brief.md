# Product Brief

## Summary

SayThis is a Chrome extension for instant pronunciation help from selected text. It starts with spoken-content and research workflows because the pain is repeated, visible, and tied to credibility: people encounter unfamiliar words and proper nouns, then either waste time looking them up or pronounce them badly out loud.

The long-term product is a community-driven pronunciation memory layer for the web. SayThis should resolve selected text into a pronounceable source form, play audio, show confidence, and learn from corrections without becoming a general chatbot.

The durable product asset is a pronunciation graph, not a static glossary. Each useful lookup can connect selected forms, aliases, source forms, languages, origins, roots, audio sources, phonetic guides, variants, and trust signals.

The product should capture pronunciation knowledge in a reusable shape: selected spelling, source form, origin or root, pronunciation evidence, audio, variants, and trust. This is what lets SayThis stay one-button simple without becoming either a chatbot or a closed list.

## Target Users

- Journalists, podcasters, streamers, and editors preparing scripts.
- Researchers who want to hear unfamiliar terms quickly.
- Students and educators handling technical, historical, scientific, or loanword-heavy material.
- Later: language learners, teachers, sales teams, and anyone handling international names.

## Jobs To Be Done

- When I see an unfamiliar name in a script, article, map, or source post, I want to hear it immediately so I can say it correctly.
- When I find an unfamiliar research term, I want to know its source form, origin, and pronunciation without opening a chatbot or several search tabs.
- When I correct a rare term, I want that fix to help me and future users without turning the product into a wiki editor.
- When a term has a root, source language, or domain context that affects pronunciation, I want that context captured only as far as it helps me say the term.
- When I am preparing a video, I want a fast pronunciation check without opening several tabs.
- When the extension is unsure, I want to know that instead of being given false confidence.

## MVP Scope

The first version should support:

- Selection-based lookup from any web page.
- Context menu and popup entry points.
- A pronunciation resolver that checks local cache, structured sources, pronunciation databases, and generated fallback.
- Native audio playback where available.
- Source labels: verified audio, community confirmed, structured source, generated fallback, unknown.
- Basic romanized-to-native-script matching after entity or term resolution.
- A correction, confirmation, and missing-entry request flow.
- Structured community entries for source form, language, origin or root, IPA, simple guide, audio source, and variant notes.

## Out Of Scope For MVP

- Full universal language detection.
- Perfect IPA generation for arbitrary names.
- Automatic pronunciation correction for long paragraphs.
- Open-ended chat or general question answering.
- Broad explanations unrelated to pronunciation.
- Speech coaching or user-recording evaluation.
- Mobile browser support.

## Trust Model

Every pronunciation result should expose its source and confidence:

- `Verified native audio`: highest confidence.
- `Community confirmed`: multiple trusted confirmations agree.
- `Structured source match`: matched a trusted dictionary, gazetteer, knowledge graph, or pronunciation guide.
- `Generated from source form`: generated speech from a resolved native/source form.
- `Best-effort TTS`: fallback only.
- `Unknown`: no confident answer.

## UX Shape

The interaction should be compact:

- Highlight text.
- Click SayThis or use the context menu.
- Hear audio immediately.
- Optional popup shows native/source spelling, origin, source, confidence, slow replay, and correction controls.

The UI should avoid teaching users how to use the extension inside the product surface. The extension should be self-evident from the action.

The UI should also avoid becoming chat-like. Results should appear as a constrained pronunciation card, not a conversation.

The UI should also avoid feeling like a closed word list. When SayThis cannot resolve a term, the useful action is to expose uncertainty and collect a structured missing-entry or correction signal.

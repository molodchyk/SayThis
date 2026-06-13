# Product Thesis

SayThis is a community-driven pronunciation memory layer for unfamiliar terms on the web.

It should not become a chatbot, and it should not depend on a static pre-curated word list. The useful middle path is a constrained resolver: given selected text, SayThis resolves the term into the most likely pronounceable source form, plays audio, explains only pronunciation-relevant context, and remembers corrections for future users.

## Core Insight

Most rare terms are not random. They usually belong to some structured source:

- a place name in a gazetteer or map database
- a personal name in a public knowledge graph
- a loanword with a source language
- a scientific, medical, legal, or technical term
- a historical, religious, philosophical, or academic term
- a taxonomy, species, theorem, method, artifact, or cultural reference

The extension should use those structures before falling back to generic language detection or generated speech.

## Product Boundary

SayThis should answer one narrow question:

> How should I pronounce this selected term, and why should I trust that pronunciation?

Allowed:

- pronunciation audio
- native or source spelling
- language, origin, or term category
- IPA or simple phonetic guide
- pronunciation-relevant roots or etymology
- source and confidence labels
- community corrections and confirmations

Not allowed:

- open-ended chat
- broad explanations unrelated to pronunciation
- paragraph summarization
- generic question answering
- opaque AI answers without source or confidence

## Resolver Model

The product should act like a resolver, not a reader:

```text
selected text
-> normalize
-> detect script
-> resolve entity or term
-> find source/native form
-> choose pronunciation source
-> play audio
-> show confidence
-> collect correction if needed
```

For Latin-script text, entity and term resolution should happen before language detection. A rare romanized term may not be meaningfully classifiable by spelling alone. The correct native/source form often comes from a known entity, dictionary, gazetteer, or knowledge graph rather than from generic transliteration.

## Community Memory Layer

Community input should improve the resolver without making the product feel like a wiki editor.

Users should be able to:

- mark a pronunciation correct or wrong
- submit a better native/source form
- submit an audio source
- add a simple phonetic guide
- flag regional variants
- request a missing term

The system should turn those signals into shared entries with confidence levels. One correction for a rare term can help many future users because rare research terms often recur within the same communities.

## Confidence Ladder

SayThis should show confidence rather than hide uncertainty:

1. `Verified native audio`: curated or strongly sourced audio from a native or domain-qualified speaker.
2. `Community confirmed`: multiple independent confirmations agree.
3. `Structured source match`: matched a trusted database, dictionary, gazetteer, or knowledge graph.
4. `Generated from source form`: TTS generated from a resolved native/source form.
5. `Best-effort fallback`: generated from the selected text with low confidence.
6. `Unknown`: no useful result.

## Strategic Direction

The long-term asset is not a list of words. It is a pronunciation graph:

- selected forms
- aliases and romanizations
- native/source forms
- languages and origins
- audio sources
- phonetic guides
- roots and etymology where relevant
- community trust signals

This gives SayThis a defensible shape: it remains simple at the UI layer while becoming smarter through structured sources and community memory.


# Pronunciation Graph

SayThis is strongest when it treats each lookup as a small piece of structured pronunciation knowledge.

The product should not become a general chat surface, and it should not rely on a closed glossary. The useful middle path is a pronunciation graph: selected forms, aliases, source forms, languages, roots, audio, variants, sources, and trust signals connected through a resolver.

## Core Insight

Rare terms are often rare to the user, not random to the world. They usually belong to an existing structure:

- a named entity in a knowledge graph
- a place in a gazetteer or map source
- a term in a dictionary, encyclopedia, paper, glossary, or domain database
- a loanword with a source language
- a technical, scientific, legal, historical, religious, or cultural root
- a person, organization, method, species, artifact, theorem, or concept with aliases

That means the hard part is not just "detect the language." For many Latin-script selections, language detection is the wrong first move. The resolver should identify the term, find the source form, then choose pronunciation.

## Product Doctrine

SayThis should be:

- a constrained pronunciation resolver
- a source-ranked memory layer
- a community correction loop
- fast enough to use during research, writing, recording, editing, or presentation prep

SayThis should not be:

- an open-ended chatbot
- a definition engine
- a generic reading tool
- a static list of manually selected words
- a hidden remote lookup system with no user control

The result card should answer only this:

> How do I say this, what source form is being spoken, and why should I trust it?

## Resolution Principles

- Resolve the entity or term before generic language classification.
- Treat romanized text as an alias until a source form is found.
- Prefer native or curator-approved audio over generated audio.
- Prefer source-backed IPA and simple guides over guessed phonetics.
- Show roots and origin only when they improve pronunciation or confidence.
- Preserve regional, professional, and historical variants instead of forcing a single answer.
- Treat uncertainty as useful product output.
- Keep every correction structured so it can improve future lookup.

## Community Knowledge Unit

A useful community entry is not a comment thread. It is a structured pronunciation unit:

- selected form
- normalized lookup key
- aliases and romanized variants
- native or source form
- language, origin, root, or domain
- category
- IPA
- simple phonetic guide
- audio URL and source
- source links
- regional or usage note
- confidence label
- contributor and moderator trust signals

This structure keeps community input useful even if the community starts small.

## Knowledge Capture Rule

Treat every useful lookup as a chance to capture the pronunciation root of an unfamiliar term:

- the selected spelling as seen by the user
- the source or native form that should be spoken
- the reason that form is preferred
- the audio or guide that makes it usable
- the evidence and confidence that make it trustworthy

If a lookup is missing or low confidence, that is still useful signal. The product should capture a missing-entry request, candidate alias, suggested source form, or correction in the same structured shape so it can later become an approved entry.

## Why Community Can Work

The product does not need a huge public wiki on day one. Rare terms cluster inside communities and workflows. A researcher, creator, teacher, editor, or domain expert may fix one term, then many later users benefit from that same structured entry.

Useful community actions should stay lightweight:

- confirm this result
- mark this result wrong
- submit a better source form
- submit a better audio source
- add IPA or a simple guide
- note a valid variant
- request a missing term

Moderation should turn those signals into approved entries only when they are source-backed, repeated, or reviewed.

## Coverage Target

The practical target is not perfect universal language detection. The target is that most unfamiliar terms produce one of these useful outcomes:

1. verified audio or a source-backed pronunciation
2. a resolved source form with verified speech or guide fallback
3. a low-confidence result with clear uncertainty
4. a missing-entry request that improves the shared graph

That makes the extension useful even before it has complete coverage.

## Technical Implications

The resolver should build candidates, not a single early guess:

```text
selection
-> normalized aliases
-> candidate entities or terms
-> candidate source forms
-> candidate languages and origins
-> candidate audio and phonetic guides
-> confidence-ranked result
-> correction or confirmation signal
```

The local seed data, structured adapters, custom sources, cache, and community service should all speak the same entry shape. That keeps SayThis from drifting into two weak extremes: generic AI response on one side, frozen glossary on the other.

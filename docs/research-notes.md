# Research Notes

These notes capture early public signals and adjacent solutions found before the initial repository commit.

## Problem Signal

- People actively ask for seamless browser pronunciation tools. A Language Learning Stack Exchange question asks whether there is a browser extension that makes selected-word pronunciation seamless: https://languagelearning.stackexchange.com/questions/4542/is-there-a-browser-extension-to-pronounce-the-words
- A Reddit language-learning thread asks for a simple workflow: select text, right-click, click extension, hear pronunciation: https://www.reddit.com/r/duolingo/comments/10vp91d/i_need_a_tts_text_to_speech_extension_for_quickly_listening_to_the_pronunciation_of_a_piece_of_text_on_a_website/
- Name-pronunciation services market correctness as a trust and respect problem, not just a dictionary feature. NameShouts frames the value around getting names right in one click: https://chromewebstore.google.com/detail/nameshouts-name-pronuncia/cfjmdoknapjfodjomjdldohemeiggmgo
- Native-speaker pronunciation databases already have broad coverage, which suggests the missing layer is workflow integration and confidence labeling: https://api.forvo.com/

## Existing Solutions

- Forvo has native-speaker recordings and an API with millions of pronunciations across hundreds of languages: https://api.forvo.com/
- Generic TTS extensions already support selected text, but they are optimized for reading, not proper-noun correctness. Examples: Speechify, Voice Out, and Highlighted Text-to-Speech.
- NameShouts offers name-pronunciation workflows and a Chrome extension, but the use case is personal names and workplace/social tools rather than news/geopolitical pronunciation: https://chromewebstore.google.com/detail/nameshouts-name-pronuncia/cfjmdoknapjfodjomjdldohemeiggmgo
- A Firefox `Search on Forvo` extension can open selected text on Forvo, but it does not provide immediate in-place audio: https://addons.mozilla.org/en-US/firefox/addon/search-forvo/
- Nominatim search can return place records with `namedetails`, `addressdetails`, and `extratags`, which makes it useful as a configurable place-name source: https://nominatim.org/release-docs/latest/api/Search/
- The OSMF-hosted Nominatim service has strict capacity, attribution, caching, and identification requirements, so SayThis treats gazetteer lookup as a configurable endpoint rather than a silent always-on public source: https://operations.osmfoundation.org/policies/nominatim/

## Product Implication

The opportunity is not generic text-to-speech. The opportunity is reducing pronunciation lookup friction while improving trust:

- Find the likely entity.
- Map romanized spellings to native spellings.
- Prefer verified audio.
- Show confidence instead of hiding uncertainty.
- Keep the action one click.

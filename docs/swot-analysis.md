# SWOT Analysis

## Strengths

- Clear one-step value proposition: highlight text and hear it pronounced.
- Low-friction Chrome extension surface fits the moment of need inside articles, scripts, docs, and research pages.
- Broad audience without being tied to one content category: creators, journalists, educators, language learners, sales teams, and professionals who handle unfamiliar terms.
- Trust can become the differentiator if results show source, confidence, native spelling, and fallback status.
- A curated-first approach can outperform generic text-to-speech for hard names and borrowed terms.
- The product can start narrow with high-frequency entries, then expand through packs, reports, and user requests.
- Existing native-audio databases and TTS services reduce the need to build every pronunciation asset from scratch.

## Weaknesses

- Generic text-to-speech is often weak for proper nouns, loanwords, and ambiguous romanized spellings.
- Single-word language detection is unreliable, so the product needs entity matching and curated data to avoid false confidence.
- A trustworthy pronunciation database requires ongoing curation, source review, and correction workflows.
- Licensing can become complex if native-speaker audio is pulled from third-party services.
- The first Chrome extension scaffold is useful as a shell but not yet the real product experience.
- A broad general-purpose positioning may be harder to market than a sharper vertical wedge.
- Wrong pronunciations are highly visible failures because the product's promise is correctness.

## Opportunities

- Chrome Web Store demand exists for selected-text pronunciation, but current tools tend to be generic readers rather than pronunciation-checking tools.
- Creator workflows are underserved: script preparation, research, livestream prep, and video editing all have repeated pronunciation friction.
- Professional workflows can broaden the market: sales calls, recruiting, customer support, education, conference talks, and podcast production.
- A source-ranked result model can make SayThis feel more reliable than plain TTS extensions.
- Curated topical packs could create a practical expansion path without needing universal coverage on day one.
- Community correction and request flows can turn user demand into the roadmap.
- Browser-side lookup and local caching can provide a privacy advantage over server-first tools.
- A small API or embeddable widget could later serve CMS, teleprompter, and scriptwriting tools.

## Threats

- Browser, operating-system, and search products may improve built-in pronunciation and selected-text audio.
- Existing pronunciation platforms, TTS extensions, and AI writing tools may add a similar one-click workflow.
- API pricing, rate limits, or licensing changes could make third-party audio sources expensive or unstable.
- Chrome extension policy or Manifest V3 changes could affect selection capture, background behavior, or audio playback.
- Users may reject the product quickly if the first few results are wrong or lack source transparency.
- Privacy concerns can arise if highlighted text is sent to remote services without clear controls.
- Search and store visibility may be difficult because pronunciation, TTS, and reading extensions are crowded categories.
- Brand or trademark conflicts need to be checked before serious distribution.

## Strategic Implications

SayThis should compete on trust, not just playback. The MVP should avoid pretending to solve universal pronunciation. A better path is to provide a fast shell, a small but reliable curated dictionary, clear source labels, and an obvious way to request or correct entries.

The near-term product bet should be:

1. Keep the interaction one click.
2. Make confidence visible.
3. Build a curated dataset where generic TTS fails.
4. Use generated voices only as labeled fallback.
5. Let user requests guide which packs or domains to build next.


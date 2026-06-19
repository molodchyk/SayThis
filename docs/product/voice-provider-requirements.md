# Voice Provider Requirements

SayThis cannot depend on built-in browser speech as the primary pronunciation path. Browser voices are inconsistent across machines and may be absent for the exact resolved locale even when the resolver finds the right source form.

## Non-Negotiable Requirements

- Resolve the selected term into the best pronounceable source form before speech.
- Prefer native or curated recordings when available.
- Use high-quality provider voices for generated fallback audio when recordings are missing.
- Store useful generated audio as shared reviewed artifacts so the next user reuses the same sample instead of regenerating it.
- Make approved shared audio fast: return direct object-storage or CDN-style audio URLs instead of proxying every playback through the community API.
- Keep provider generation behind server-side controls: moderator/admin approval, authenticated entitlement or paywall checks, rate limits, and persisted generation budgets.
- Do not let hosted anonymous public traffic trigger paid provider generation; public shared-audio requests should reuse approved audio only.
- Never require extension users to paste provider or generation tokens; provider credentials belong to the hosted service operator.
- Report missing local voices as a configuration/readiness problem, not as a silent fallback to an unrelated voice.

## Product Boundaries

SayThis should not become a general chatbot, and it should not be only a static hand-curated list. The durable asset is a pronunciation memory graph: selected form, source form, language or locale, guide, audio, aliases, variants, roots, trust signals, and approved shared artifacts.

Provider TTS is a bridge, not the final knowledge layer. The important product move is turning a successful generated sample into reusable shared audio once it is approved.

## Implementation Implications

- Local browser speech can be used only when the voice locale matches the resolved speech locale.
- If no matching local voice exists, the UI should point to shared audio/provider configuration instead of claiming a matching voice exists.
- Generated audio must be attached to approved shared entries with source form and locale metadata.
- Generated audio bytes should live outside the metadata store under deterministic content-addressed keys, with immutable cache headers.
- Public shared-audio lookup should work through the configured service endpoint without extension-side bearer tokens, but hosted public lookup must not synthesize new paid audio.
- Provider voice preferences should rank known high-quality voices for each locale, but exact provider names and sensitive test cases belong in private docs.

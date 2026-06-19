# Chrome Web Store Reviewer Notes

SayThis acts only after user action: popup lookup, context menu, or keyboard command.

## Browser-Controlled Behavior

Browser voice availability varies by operating system and installed voices. SayThis prefers verified recordings. If no recording is available, it uses a verified matching browser voice for the resolved source form. If a matching voice cannot be verified, it uses a simple guide when available or reports that speech is unavailable.

## Network Behavior

Default online sources are Wikidata, Wiktionary, Wikimedia Commons, and Wikimedia upload URLs. Optional endpoints for Forvo, shared audio, community sync, custom sources, DBpedia-compatible lookup, and Nominatim-compatible lookup require user configuration. A configured community endpoint may host reviewed or token-gated service-generated audio artifacts for shared reuse.

## Page Limitations

Some pages block extension script injection. When the on-page result card cannot be injected, SayThis can still use the popup and offscreen path for recordings and matching browser voices.

## Incognito

Incognito behavior follows Chrome extension settings. SayThis does not require incognito access.

# SayThis Privacy Policy

SayThis is a pronunciation extension for selected text. It is designed to keep lookup data local unless the user triggers online lookup or enables an optional remote source.

## Stored Data

SayThis uses Chrome extension local storage for:

- last selected text and last resolver result
- extension settings and endpoint settings
- lookup language hints
- local pronunciation feedback and corrections
- approved shared pronunciation entries from a configured community endpoint
- bounded online lookup cache
- community sync retry queue
- optional Forvo API key
- optional shared-audio generation token

Forvo API keys and shared-audio generation tokens stay in local extension storage and are not included in data exports.

The detailed local storage key map is documented in `docs/architecture/storage-ownership.md`.

## Network Behavior

Online lookup can send the selected term or resolved pronunciation candidate to:

- Wikidata, Wiktionary, and Wikimedia Commons
- Forvo, only when enabled with a user-provided API key
- a user-configured custom source endpoint
- a user-configured DBpedia-compatible endpoint
- a user-configured Nominatim-compatible endpoint
- a user-configured community endpoint

Community sync sends only the selected term, feedback type, correction or missing-entry fields, and resolver metadata. SayThis does not send page URLs, browsing history, full page text, or full documents.

Reviewed generated-audio artifacts may be hosted by a configured community service for shared reuse. Those artifacts are keyed to term-level pronunciation metadata and do not include page URLs, browsing history, full page text, or user recordings.

If a community service operator uses moderator or explicitly enabled shared provider generation, the service sends only the source form or term text, locale, optional voice name, and speaking rate to the configured speech provider.

## Permissions

- `activeTab`: read the current selection after user action.
- `contextMenus`: add selected-text pronunciation actions.
- `offscreen`: play verified audio when the page card cannot play it.
- `scripting`: read selected text and inject the on-page result card after user action.
- `storage`: store settings, cache data, and local pronunciation memory.
- `tts`: play verified matching browser voices or simple guides when no recording is available.

Host access is limited to Wikidata, Wiktionary, Wikimedia Commons, and Wikimedia upload URLs by default. Optional HTTPS host access is requested only for user-configured endpoints.

## No Sale Or Sharing

SayThis does not sell user data, use ads, or include analytics. It does not share lookup data except for the remote services the user triggers or enables.

## User Controls

Users can disable online lookup by default, disable the on-page result card, clear local memory, clear cache data, clear sync queue data, clear approved shared entries, and disable optional remote services.

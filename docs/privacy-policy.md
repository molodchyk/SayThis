# Privacy Policy

SayThis is built around selected text pronunciation lookup. The extension is designed to keep lookup activity local unless a user enables or triggers a remote feature.

## Data SayThis Stores Locally

SayThis may store this data in Chrome extension local storage:

- the last selected term and last resolver result
- resolver settings and endpoint settings
- lookup language hints
- local pronunciation feedback, such as confirmations, missing-entry requests, and corrections
- approved shared pronunciation entries pulled from a configured community endpoint
- a bounded cache of successful online lookup results
- a retry queue for community sync submissions
- a user-provided Forvo API key

Forvo API keys stay in local extension storage and are not included in data exports.

## Data Sent To Remote Services

Remote lookup is user-triggered or opt-in. SayThis can send the selected term to these services:

- Wikidata and Wiktionary lookup; Wikidata requests may include lookup language hints as API language parameters
- Wikimedia Commons audio URLs when audio is played
- Forvo lookup, only after the user enables Forvo and stores an API key
- a user-configured custom source endpoint
- a user-configured Nominatim-compatible place-name endpoint
- a user-configured community endpoint, only after community submission or approved-entry refresh is enabled

Community sync submits only the selected term, feedback type, correction fields, and resolver metadata. It does not submit page URLs or browsing history.

## Data SayThis Does Not Collect

SayThis does not collect:

- browsing history
- page URLs
- analytics events
- account identifiers
- payment data
- user recordings
- long-page text or full documents

## User Controls

Users can:

- disable online lookup by default
- disable the on-page result card
- clear local community memory
- clear cached lookup results
- clear the community sync queue
- clear approved shared entries
- disable community submission, approved-entry refresh, custom source lookup, Forvo lookup, and place-name lookup

When optional remote features are disabled or their endpoints change, SayThis removes no-longer-used optional endpoint permissions where Chrome allows it.

## Publication Notes

This policy describes the public SayThis extension in this repository. Private research notes, private audio, licensed audio, raw source data, local environment files, and credentials are excluded by `.gitignore` and the Chrome package builder.

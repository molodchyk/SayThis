# Custom Source

SayThis can query a user-configured HTTPS endpoint for structured pronunciation entries.

This is for domain packs and community-maintained term sets that are too specific for broad public dictionaries. The endpoint must return pronunciation data, not free-form text.

SayThis also supports a separate DBpedia Lookup-compatible endpoint for entity context. That source is configured in options, stays disabled by default, and is treated as structured context rather than native pronunciation audio.

## Request

SayThis sends a user-triggered `GET` request and appends the selected term as `q`:

```http
GET https://example.com/saythis/search?q=chiaroscuro
Accept: application/json
```

The extension asks Chrome for access to the endpoint origin only after the user enables the source in options.

## Response

The endpoint may return a single entry:

```json
{
  "sourceName": "Art terms",
  "entry": {
    "id": "art:chiaroscuro",
    "term": "chiaroscuro",
    "aliases": ["light-dark"],
    "trustSignals": ["source-backed", "domain-reviewed"],
    "sourceForm": "chiaroscuro",
    "language": "it",
    "languageName": "Italian",
    "category": "art-term",
    "root": "chiaro + scuro",
    "domain": "painting",
    "ipa": "kjaroˈskuːro",
    "simple": "kee-ah-roh-SKOO-roh",
    "audioUrl": "https://example.com/audio/chiaroscuro.ogg",
    "sourceUrl": "https://example.com/terms/chiaroscuro",
    "confidence": "high",
    "evidence": ["Reviewed by domain editor"],
    "notes": "Common English use keeps the Italian root."
  }
}
```

Or multiple entries:

```json
{
  "sourceName": "Research pack",
  "entries": [
    {
      "term": "example",
      "sourceForm": "example",
      "language": "en",
      "simple": "ig-ZAM-pul"
    }
  ]
}
```

## Fields

- `term`: selected or canonical term.
- `aliases`: alternate selected forms that should match this entry.
- `trustSignals`: short labels that explain why this entry is reliable.
- `sourceForm`: native, canonical, or source spelling to speak.
- `language`: BCP-47 or short language code.
- `languageName`: display language name.
- `category`: term category such as `art-term`, `medical-term`, or `person`.
- `origin`, `root`, `domain`, or `domainHint`: pronunciation-relevant context.
- `ipa`: IPA guide.
- `simple`: plain phonetic guide.
- `audioUrl`: HTTPS pronunciation audio.
- `sourceUrl`: HTTPS source page.
- `sources`: extra source links as `{ "label": "...", "url": "https://..." }`.
- `variants`: regional, professional, historical, or source-specific pronunciation variants.
- `confidence`: `high`, `medium`, `low`, or `unknown`.
- `sourceStatus`: `verified-audio`, `community-confirmed`, `structured-source`, `generated-from-source`, or `unknown`.
- `evidence`: short source-backed notes.
- `notes`: regional or usage note.

SayThis ranks returned entries by exact alias/source-form match, pronunciation evidence, audio, and confidence. A configured custom source is queried before generic online sources, so domain-reviewed data can take priority when confidence is equal.

When several returned entries match the selected term, SayThis keeps the strongest entry as the primary result and preserves the next matching entries as alternate candidates. This lets a domain pack represent variants, roots, or language-specific pronunciations without forcing them into one entry.

After other structured sources resolve a better source form or alias, SayThis can retry the custom endpoint with those candidate spellings while preserving the user's original selected term in the result. This lets a pack serve canonical entries even when the selected text is a romanized alias, alternate spelling, or short form.

## Privacy

Custom sources are disabled by default. SayThis sends only the selected term or resolved pronunciation candidate to the configured endpoint. It does not send page URLs or browsing history.

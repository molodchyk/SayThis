# Community Service

SayThis includes a small self-hostable moderation service for community pronunciation memory.

The service is dependency-free Node.js. It receives privacy-scoped correction submissions, keeps them pending for moderator review, publishes approved entries, and exposes the approved-entry shape that the extension already knows how to pull.

## Run Locally

```powershell
$env:SAYTHIS_ADMIN_TOKEN = "change-me"
$env:SAYTHIS_STORE = "data/community-store.json"
$env:SAYTHIS_MAX_BODY_BYTES = "16384"
$env:SAYTHIS_MAX_AUDIO_BYTES = "524288"
$env:SAYTHIS_PUBLIC_BASE_URL = "https://example.com"
$env:SAYTHIS_GOOGLE_TTS_ACCESS_TOKEN = ""
$env:SAYTHIS_GOOGLE_TTS_VOICE = ""
$env:SAYTHIS_GOOGLE_TTS_AUDIO_ENCODING = "MP3"
$env:SAYTHIS_RATE_LIMIT = "20"
$env:SAYTHIS_RATE_WINDOW_MS = "60000"
$env:SAYTHIS_MAX_PENDING_SUBMISSIONS = "1000"
$env:SAYTHIS_MAX_REJECTED_SUBMISSIONS = "1000"
$env:SAYTHIS_ALLOWED_ORIGINS = "*"
$env:SAYTHIS_TRUST_PROXY_HEADERS = "0"
npm run community:serve
```

The service listens on `http://127.0.0.1:8787` by default. For real extension sync, deploy it behind HTTPS and configure the extension endpoint to the public `/community` URL.

Container deployment notes are in `docs/deployment.md`.

Open the moderator page locally at:

```http
GET /admin
```

The page is a static shell. It loads pending submissions only after a moderator enters the service URL and admin token.

## Public Endpoint

Submit a correction:

```http
POST /community
Content-Type: application/json
```

Fetch approved entries:

```http
GET /community?action=approved
```

Fetch a reviewed shared audio artifact:

```http
GET /audio/<artifact-id>
```

The extension submits only term-level pronunciation metadata. It does not submit page URLs or browsing history.

The public submission endpoint rejects oversized bodies and limits repeated submissions per client. Defaults:

- `SAYTHIS_MAX_BODY_BYTES`: `16384`
- `SAYTHIS_MAX_AUDIO_BYTES`: `524288`
- `SAYTHIS_PUBLIC_BASE_URL`: required before storing shared generated-audio artifacts
- `SAYTHIS_GOOGLE_TTS_ACCESS_TOKEN`: bearer token for admin-only Google-compatible speech generation
- `SAYTHIS_GOOGLE_TTS_ENDPOINT`: optional override for the Google-compatible speech endpoint
- `SAYTHIS_GOOGLE_TTS_VOICE`: optional exact provider voice name override
- `SAYTHIS_GOOGLE_TTS_AUDIO_ENCODING`: `MP3`, `OGG_OPUS`, or `LINEAR16`
- `SAYTHIS_RATE_LIMIT`: `20`
- `SAYTHIS_RATE_WINDOW_MS`: `60000`
- `SAYTHIS_MAX_PENDING_SUBMISSIONS`: `1000`
- `SAYTHIS_MAX_REJECTED_SUBMISSIONS`: `1000`
- `SAYTHIS_ALLOWED_ORIGINS`: `*`
- `SAYTHIS_TRUST_PROXY_HEADERS`: `0`

When the pending moderation queue reaches `SAYTHIS_MAX_PENDING_SUBMISSIONS`, new public submissions are rejected with `pending-limit-reached`. Duplicate retries of an already pending submission id are still accepted without adding another entry.

Rejected submission summaries are capped by `SAYTHIS_MAX_REJECTED_SUBMISSIONS`; the newest summaries are kept.

Correction submissions must include at least one structured pronunciation field, such as source form, aliases, language, origin, root, domain hint, variants, IPA, simple guide, audio URL, source URL, or variant note. Empty correction submissions are rejected as invalid.

Missing requests may also carry structured candidate fields, such as source form, aliases, root, domain hint, guide, and source URL. They remain pending until a moderator approves, edits, or rejects them.

Approving a pending submission publishes it only when the final entry includes pronunciation data such as a distinct source form, aliases, language, origin, root, variants, IPA, simple guide, audio URL, source URL, or variant note. A domain hint by itself is context for review, not enough to publish a pronunciation answer.

For a production deployment, set `SAYTHIS_ALLOWED_ORIGINS` to a comma-separated list of trusted origins, such as `https://example.com,chrome-extension://<extension-id>`. The default `*` keeps local and early public testing simple.

Requests with an `Origin` header outside `SAYTHIS_ALLOWED_ORIGINS` are rejected with `origin-not-allowed`. Requests without an `Origin` header are accepted for server-to-server use.

Set `SAYTHIS_TRUST_PROXY_HEADERS=1` only when the service runs behind a trusted proxy that sets `cf-connecting-ip` or `x-real-ip`. Otherwise rate limiting uses the direct remote address.

## Moderator Endpoints

All moderator endpoints require:

```http
Authorization: Bearer <SAYTHIS_ADMIN_TOKEN>
```

List pending submissions:

```http
GET /admin/pending
```

Approve a submission:

```http
POST /admin/approve
Content-Type: application/json

{ "id": "sub_..." }
```

Approve with entry overrides:

```http
POST /admin/approve
Content-Type: application/json

{
  "id": "sub_...",
  "entry": {
    "sourceForm": "chiaroscuro",
    "aliases": ["light-dark"],
    "root": "chiaro + oscuro",
    "domainHint": "art history",
    "variants": ["studio pronunciation", "regional pronunciation"],
    "trustSignals": ["moderator-reviewed", "source-backed"],
    "language": "it",
    "simple": "kee-ah-roh-SKOO-roh",
    "sourceUrl": "https://example.com/terms/chiaroscuro"
  }
}
```

Reject a submission:

```http
POST /admin/reject
Content-Type: application/json

{
  "id": "sub_...",
  "reason": "not pronunciation data"
}
```

Store a reviewed generated-audio artifact:

```http
POST /admin/audio-artifacts
Content-Type: application/json
Authorization: Bearer <SAYTHIS_ADMIN_TOKEN>

{
  "term": "Exampletown",
  "lookupKey": "exampletown",
  "sourceForm": "Przykladowo",
  "language": "pl",
  "ttsLang": "pl-PL",
  "provider": "Example voice",
  "mimeType": "audio/ogg",
  "dataBase64": "<base64 audio bytes>"
}
```

The service stores the bytes under `/audio/<artifact-id>`, adds an approved shared entry with that audio URL, and serves the artifact with immutable public cache headers. This path is moderator-only so generated samples can be checked, cost-controlled, and reused by every client through approved-entry refresh.

Generate provider audio and store it as a reviewed artifact:

```http
POST /admin/generate-audio-artifact
Content-Type: application/json
Authorization: Bearer <SAYTHIS_ADMIN_TOKEN>

{
  "term": "Exampletown",
  "lookupKey": "exampletown",
  "sourceForm": "Przykladowo",
  "language": "pl",
  "ttsLang": "pl-PL",
  "voiceName": "pl-PL-ExampleVoice"
}
```

This endpoint is admin-only and requires `SAYTHIS_PUBLIC_BASE_URL` plus a configured provider token. It sends only the source form or term text, locale, optional voice name, and speaking rate to the provider. The returned audio is stored once as `/audio/<artifact-id>` and published through an approved shared entry, so clients reuse the shared sample instead of regenerating it.

The `/admin` page supports pending submission review. It can approve submissions with edited source form, aliases, language, origin, root, domain hint, variants, IPA, simple guide, audio URL, source URL, trust signals, and variant note fields. It can also generate provider audio from a pending submission, publish the returned shared audio artifact, and clear the pending item in one moderator action.

## Storage

The service writes a JSON store containing:

- `pending`: unreviewed submissions
- `approved`: approved shared entries keyed by lookup key
- `audioArtifacts`: reviewed generated-audio artifacts keyed by artifact id
- `rejected`: rejected submission summaries

The built-in Node service serializes store writes in process so overlapping requests do not overwrite pending entries.

The store intentionally excludes request headers, IP addresses, and page URLs.

# Community Service

SayThis includes a small self-hostable moderation service for community pronunciation memory.

The service is dependency-free Node.js. It receives privacy-scoped correction submissions, keeps them pending for moderator review, publishes approved entries, and exposes the approved-entry shape that the extension already knows how to pull.

## Run Locally

```powershell
$env:SAYTHIS_ADMIN_TOKEN = "change-me"
$env:SAYTHIS_STORE = "data/community-store.json"
$env:SAYTHIS_MAX_BODY_BYTES = "16384"
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

The extension submits only term-level pronunciation metadata. It does not submit page URLs or browsing history.

The public submission endpoint rejects oversized bodies and limits repeated submissions per client. Defaults:

- `SAYTHIS_MAX_BODY_BYTES`: `16384`
- `SAYTHIS_RATE_LIMIT`: `20`
- `SAYTHIS_RATE_WINDOW_MS`: `60000`
- `SAYTHIS_MAX_PENDING_SUBMISSIONS`: `1000`
- `SAYTHIS_MAX_REJECTED_SUBMISSIONS`: `1000`
- `SAYTHIS_ALLOWED_ORIGINS`: `*`
- `SAYTHIS_TRUST_PROXY_HEADERS`: `0`

When the pending moderation queue reaches `SAYTHIS_MAX_PENDING_SUBMISSIONS`, new public submissions are rejected with `pending-limit-reached`. Duplicate retries of an already pending submission id are still accepted without adding another entry.

Rejected submission summaries are capped by `SAYTHIS_MAX_REJECTED_SUBMISSIONS`; the newest summaries are kept.

Correction submissions must include at least one structured pronunciation field, such as source form, aliases, language, origin, root, variants, IPA, simple guide, audio URL, source URL, or variant note. Empty correction submissions are rejected as invalid.

Missing requests may also carry structured candidate fields, such as source form, aliases, root, guide, and source URL. They remain pending until a moderator approves, edits, or rejects them.

Approving a pending submission publishes it only when the final entry includes pronunciation data such as a distinct source form, aliases, language, origin, root, variants, IPA, simple guide, audio URL, source URL, or variant note. Bare missing requests can remain pending until a moderator adds that data or rejects them.

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

The `/admin` page uses these same endpoints. It can approve submissions with edited source form, aliases, language, origin, root, variants, IPA, simple guide, audio URL, source URL, trust signals, and variant note fields.

## Storage

The service writes a JSON store containing:

- `pending`: unreviewed submissions
- `approved`: approved shared entries keyed by lookup key
- `rejected`: rejected submission summaries

The built-in Node service serializes store writes in process so overlapping requests do not overwrite pending entries.

The store intentionally excludes request headers, IP addresses, and page URLs.

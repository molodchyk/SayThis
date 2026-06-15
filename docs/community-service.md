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
npm run community:serve
```

The service listens on `http://127.0.0.1:8787` by default. For real extension sync, deploy it behind HTTPS and configure the extension endpoint to the public `/community` URL.

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
    "language": "it",
    "simple": "kee-ah-roh-SKOO-roh"
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

The `/admin` page uses these same endpoints. It can approve submissions with edited source form, language, origin, IPA, simple guide, audio URL, and variant note fields.

## Storage

The service writes a JSON store containing:

- `pending`: unreviewed submissions
- `approved`: approved shared entries keyed by lookup key
- `rejected`: rejected submission summaries

The store intentionally excludes request headers, IP addresses, and page URLs.

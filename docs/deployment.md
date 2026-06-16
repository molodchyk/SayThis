# Deployment

## Community Service Image

Build the community moderation service image:

```powershell
docker build -f Dockerfile.community -t saythis-community .
```

Run it locally:

```powershell
docker run --rm -p 8787:8787 `
  -e SAYTHIS_ADMIN_TOKEN="change-me" `
  -e SAYTHIS_ALLOWED_ORIGINS="chrome-extension://<extension-id>" `
  -v saythis-community-data:/data `
  saythis-community
```

Use the public HTTPS `/community` URL as the extension community endpoint.

## Required Settings

- `SAYTHIS_ADMIN_TOKEN`: required for `/admin/pending`, `/admin/approve`, and `/admin/reject`.
- `SAYTHIS_ALLOWED_ORIGINS`: set to the extension origin and any trusted admin origins.
- `SAYTHIS_STORE`: defaults to `/data/community-store.json` in the image.

## Abuse Controls

These defaults can be tuned per deployment:

- `SAYTHIS_MAX_BODY_BYTES`: `16384`
- `SAYTHIS_RATE_LIMIT`: `20`
- `SAYTHIS_RATE_WINDOW_MS`: `60000`
- `SAYTHIS_MAX_PENDING_SUBMISSIONS`: `1000`
- `SAYTHIS_MAX_REJECTED_SUBMISSIONS`: `1000`
- `SAYTHIS_TRUST_PROXY_HEADERS`: `0`

Set `SAYTHIS_TRUST_PROXY_HEADERS=1` only when a trusted proxy sets `cf-connecting-ip` or `x-real-ip`.

## Data

Persist `/data` so pending, approved, and rejected community entries survive image restarts.

The image build context excludes local credentials, private notes, private audio, licensed audio, and raw source data through `.dockerignore`.

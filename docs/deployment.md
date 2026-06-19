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
  -e SAYTHIS_PUBLIC_BASE_URL="https://example.com" `
  -e SAYTHIS_AUDIO_OBJECT_DIR="/data/audio-objects" `
  -e SAYTHIS_GOOGLE_TTS_ACCESS_TOKEN="" `
  -v saythis-community-data:/data `
  saythis-community
```

Use the public HTTPS `/community` URL as the extension community endpoint.

## Required Settings

- `SAYTHIS_ADMIN_TOKEN`: required for `/admin/pending`, `/admin/approve`, and `/admin/reject`.
- `SAYTHIS_ALLOWED_ORIGINS`: set to the extension origin and any trusted admin origins.
- `SAYTHIS_STORE`: defaults to `/data/community-store.json` in the image.
- `SAYTHIS_PUBLIC_BASE_URL`: required before shared generated-audio artifacts can be stored and served.
- `SAYTHIS_AUDIO_OBJECT_DIR`: optional local file-backed object storage root for generated audio bytes. Use this for local development or a single-node deployment.
- `SAYTHIS_AUDIO_PUBLIC_BASE_URL`: optional public audio origin. When set, approved generated audio URLs point directly to this origin plus `audio/sha256/<hash>.<ext>`.
- `SAYTHIS_AUDIO_S3_ENDPOINT`: optional S3-compatible object storage endpoint for generated audio bytes.
- `SAYTHIS_AUDIO_S3_BUCKET`: optional object storage bucket name.
- `SAYTHIS_AUDIO_S3_REGION`: optional object storage signing region; use `auto` for Cloudflare R2.
- `SAYTHIS_AUDIO_S3_ACCESS_KEY_ID`: server-only object storage access key.
- `SAYTHIS_AUDIO_S3_SECRET_ACCESS_KEY`: server-only object storage secret.
- `SAYTHIS_GOOGLE_TTS_ACCESS_TOKEN`: optional short-lived bearer token for provider generation.
- `SAYTHIS_GOOGLE_APPLICATION_CREDENTIALS` or `GOOGLE_APPLICATION_CREDENTIALS`: optional service-account JSON path for server-owned Google authentication.
- `SAYTHIS_GOOGLE_SERVICE_ACCOUNT_JSON`: optional inline service-account JSON for environments that cannot mount a file.
- `SAYTHIS_PUBLIC_AUDIO_GENERATION_ENABLED`: leave unset or `0` in hosted deployments. `1` is only a loopback local-development escape hatch and is ignored for hosted HTTPS public shared-audio generation.
- `SAYTHIS_GOOGLE_TTS_ENDPOINT`: optional Google-compatible speech endpoint override.
- `SAYTHIS_GOOGLE_TTS_VOICE`: optional exact provider voice override. Locale-prefixed voice names are used only when compatible with the requested TTS locale.
- `SAYTHIS_GOOGLE_TTS_AUDIO_ENCODING`: `MP3`, `OGG_OPUS`, or `LINEAR16`; defaults to `MP3`.

Provider generation is exposed through token-protected moderator endpoints. Public clients can consume approved audio URLs after review, but hosted public shared-audio requests cannot trigger paid provider synthesis. The `SAYTHIS_PUBLIC_AUDIO_GENERATION_ENABLED=1` path is limited to loopback local development: it requires a loopback HTTP public base URL, a loopback client address, useful-target validation, rate limiting, and a persisted local generation budget. Hosted deployments that need payment or account gating should add that inside the community service, not through extension-side tokens.

## Shared Audio Storage

Production playback should be direct and cacheable:

1. The community service generates or receives an approved audio artifact.
2. The service writes audio bytes to local file-backed storage or an S3-compatible object storage bucket.
3. The metadata store keeps `storageKey` and `audioUrl`, not inline audio bytes.
4. The extension receives the approved `audioUrl` and plays it directly.

Use `SAYTHIS_AUDIO_PUBLIC_BASE_URL` with object storage for hosted deployments so audio does not stream through the community API on every playback. See `docs/architecture/shared-audio-storage.md` for the full storage and speed contract.

## Abuse Controls

These defaults can be tuned per deployment:

- `SAYTHIS_MAX_BODY_BYTES`: `16384`
- `SAYTHIS_MAX_AUDIO_BYTES`: `524288`
- `SAYTHIS_RATE_LIMIT`: `20`
- `SAYTHIS_RATE_WINDOW_MS`: `60000`
- `SAYTHIS_MAX_PENDING_SUBMISSIONS`: `1000`
- `SAYTHIS_MAX_REJECTED_SUBMISSIONS`: `1000`
- `SAYTHIS_TRUST_PROXY_HEADERS`: `0`

Set `SAYTHIS_TRUST_PROXY_HEADERS=1` only when a trusted proxy sets `cf-connecting-ip` or `x-real-ip`.

## Data

Persist `/data` so pending, approved, and rejected community entries survive image restarts.

If `SAYTHIS_AUDIO_OBJECT_DIR` points inside `/data`, generated audio objects also survive image restarts. For multi-node hosted deployments, use the S3-compatible object store settings instead of local disk.

The image build context excludes local credentials, private notes, private audio, licensed audio, and raw source data through `.dockerignore`.

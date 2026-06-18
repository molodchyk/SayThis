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
- `SAYTHIS_GOOGLE_TTS_ACCESS_TOKEN`: optional bearer token for provider generation.
- `SAYTHIS_PUBLIC_AUDIO_GENERATION_ENABLED`: set to `1` only when shared provider generation should be available beyond already approved artifacts.
- `SAYTHIS_PUBLIC_AUDIO_GENERATION_TOKEN`: required bearer token for shared provider generation when public generation is enabled.
- `SAYTHIS_GOOGLE_TTS_ENDPOINT`: optional Google-compatible speech endpoint override.
- `SAYTHIS_GOOGLE_TTS_VOICE`: optional exact provider voice override. Locale-prefixed voice names are used only when compatible with the requested TTS locale.
- `SAYTHIS_GOOGLE_TTS_AUDIO_ENCODING`: `MP3`, `OGG_OPUS`, or `LINEAR16`; defaults to `MP3`.

Provider generation is exposed through token-protected moderator endpoints. Public clients can consume approved audio URLs after review. Direct public provider generation requires both `SAYTHIS_PUBLIC_AUDIO_GENERATION_ENABLED=1` and `Authorization: Bearer <SAYTHIS_PUBLIC_AUDIO_GENERATION_TOKEN>`. Public generation also rejects non-English resolved languages when the request would use an English TTS locale.

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

The image build context excludes local credentials, private notes, private audio, licensed audio, and raw source data through `.dockerignore`.

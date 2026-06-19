# Shared Audio Storage

SayThis shared audio should be fast by design. The community service should resolve metadata, but approved audio bytes should be delivered from object storage or a CDN-style public audio origin.

## Fast Path

1. A moderator or server-side job generates or uploads a pronunciation clip.
2. The service writes the bytes to immutable object storage under `audio/sha256/<content-hash>.<ext>`.
3. The metadata store keeps `storageKey`, `audioUrl`, language, source form, aliases, variants, guide, provider, and trust signals.
4. The extension asks the community endpoint for a reusable approved sample.
5. Playback uses the returned `audioUrl` directly.

The public Speak path must not call the paid speech provider. It should reuse approved audio, use a verified matching local voice, use a guide fallback, or report that speech is unavailable.

## Storage Rules

- Store generated audio bytes outside the JSON metadata store.
- Use content-addressed keys so duplicate generated clips collapse to the same object path.
- Use immutable cache headers for generated objects: `public, max-age=31536000, immutable`.
- Keep provider credentials only on the community service.
- Keep public provider generation disabled in hosted deployments.
- Do not proxy normal public playback through the community API in production; return direct object URLs.
- Keep clips short and compressed. A useful pronunciation sample should be far smaller than 1 MB.

## Local Development

Use local file-backed object storage:

```powershell
$env:SAYTHIS_AUDIO_OBJECT_DIR="private/audio-objects"
$env:SAYTHIS_PUBLIC_BASE_URL="http://127.0.0.1:8787"
```

This stores bytes on disk and keeps only `storageKey` in the community metadata store. Legacy inline audio entries remain readable.

## Production Shape

Use an object storage bucket with a public audio base URL. Cloudflare R2 is a good fit because it is S3-compatible and can serve public objects without routing every playback through the application server.

```powershell
$env:SAYTHIS_AUDIO_PUBLIC_BASE_URL="https://audio.example.com/"
$env:SAYTHIS_AUDIO_S3_ENDPOINT="https://<account>.r2.cloudflarestorage.com"
$env:SAYTHIS_AUDIO_S3_BUCKET="saythis-audio"
$env:SAYTHIS_AUDIO_S3_REGION="auto"
$env:SAYTHIS_AUDIO_S3_ACCESS_KEY_ID="<server-only-access-key>"
$env:SAYTHIS_AUDIO_S3_SECRET_ACCESS_KEY="<server-only-secret>"
```

The extension never sees these credentials. The service uses them only when an approved generated artifact is created.

## Speed Budget

The product loses value if Speak feels slow. The runtime target is:

- community metadata lookup: bounded and non-gating;
- approved audio playback: direct from the public audio origin;
- no paid generation on the public click path;
- no application-server byte streaming for normal approved audio playback.

If a shared endpoint is unavailable or slow, the extension should fall back to a verified matching voice or guide path instead of blocking the user.

# Public Audio Assets

Put extension-bundled pronunciation audio here only when the file is safe to publish and redistribute with the repository.

Entries in `data/pronunciation-seed.json` can reference files in this folder with relative paths, for example:

```json
{
  "pronunciation": {
    "audio": [
      {
        "url": "assets/audio/public/example.ogg",
        "label": "Curated pronunciation",
        "source": "SayThis",
        "quality": "verified"
      }
    ]
  }
}
```

Do not put raw recordings, licensed third-party source files, private submissions, or unverified audio in this folder.


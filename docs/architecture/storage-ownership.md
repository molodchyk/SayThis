# Storage Ownership

SayThis stores extension state only in Chrome extension local storage. This map is the source of truth for local keys used by the background worker and options page.

| Key | Owner | Shape And Version | Retention And Pruning | Data Class | Migration Notes |
| --- | --- | --- | --- | --- | --- |
| `approvedCommunityEntries` | Community memory | Object map keyed by lookup key; values use the approved-entry shape normalized by `normalizeApprovedEntries`. | Kept until the user clears approved shared entries, imports a replacement data set, or a later pull merges replacements. | Approved pronunciation metadata and reviewed audio URLs. | Preserve keyed entries; do not rename without a migration that keeps existing approved audio reusable. |
| `communityEntries` | Local pronunciation memory | Object map keyed by lookup key; values use the local community-entry shape normalized by `normalizeCommunityEntries`. | Kept until the user clears local memory or imports a replacement data set. | User corrections, confirmations, missing-entry requests, pronunciation metadata, and safe source/audio links. | Preserve selected-term keys because local corrections may target aliases or variants. |
| `communityPullState` | Community memory | Plain summary object with counts and last pull status. | Replaced on each approved-entry pull; cleared with approved shared entries. | Sync status metadata, not pronunciation content. | Safe to rebuild from the next pull. |
| `credentials` | Remote source settings | Object normalized by `normalizeCredentials`; currently stores only the optional Forvo API key. | Kept until the user clears or changes credentials through options. | Local-only secret material for optional source access. | Never export API keys; provider credentials for shared generated audio belong to the community service, not extension storage. |
| `lastResult` | Selection resolver | Single normalized pronunciation result from the most recent resolve, feedback update, or shared-audio refresh. | Replaced on the next lookup; cleared only by storage reset or import. | Current pronunciation result and source metadata. | Keep shape allowlisted through resolver/cache normalizers before reuse. |
| `lastSelection` | Selection resolver | Plain selected-text string. | Replaced on the next lookup. | Current selected term or phrase. | Treat as user text; do not attach page URL or page context. |
| `lastSource` | Active-selection commands | Plain action-source string such as keyboard or context menu. | Replaced on the next active-selection action. | UI state metadata. | Safe to drop if unused; no migration needed beyond tolerant reads. |
| `resultCache` | Online result cache | Schema-versioned object normalized by `normalizeResultCache`. | Pruned by TTL and entry limit during normalization; clearable in options. | Cached online pronunciation results and source metadata. | Bump `RESULT_CACHE_SCHEMA_VERSION` for incompatible shape changes and add migration tests. |
| `settings` | Extension settings | Object normalized by `normalizeSettings`; includes toggles, endpoints, labels, lookup hints, shared-audio endpoint use, and sync flags. | Kept until changed in options, import, or storage reset. | User preferences and optional endpoint URLs. | Normalize before reads; endpoint permission cleanup must compare previous and next normalized settings. |
| `syncQueue` | Community sync | Array normalized by `normalizeSubmissionQueue`. | Flushed when sync is enabled; failed items remain bounded by retry policy; clearable in options. | Pending pronunciation feedback submissions. | Keep queue items privacy-scoped to pronunciation fields only. |
| `syncSummary` | Community sync | Plain queue summary object from `syncSummary`. | Replaced when queue changes or sync runs; clearable with the queue. | Sync status metadata. | Safe to rebuild from `syncQueue`. |

## Rules

- New persistent keys must be added to `BACKGROUND_STORAGE_KEYS`, documented here, and covered by a synchronization test.
- Store pronunciation data by lookup key, source form, alias, or variant only; do not store page URLs, browsing history, full page text, or documents.
- Keep optional extension credentials in `credentials`, not in exports or sync queues.
- Keep cache and queue shapes bounded so extension local storage stays reviewable and clearable.

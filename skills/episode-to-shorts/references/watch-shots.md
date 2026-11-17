# Optional public clip gallery

The repository's `gallery/` directory contains the minimal Watch Out gallery and Worker backend used with this workflow. Deploy your own copy; it contains no account IDs, tokens, or media. Branding and destination belong to the user. The core editing skill works without this gallery or ChatGPT Sites.

## Deploy your own destination

The Worker requires an R2-compatible `BUCKET` binding and a strong server-only `UPLOAD_TOKEN`. It serves public reads, checks authentication for writes, validates uploaded SHA-256 checksums, supports video byte ranges, and prevents catalog updates from dropping existing IDs. Configure these through your hosting provider. If using ChatGPT Sites, read that integration's current skill, create/reuse the user's project, and declare `"r2": "BUCKET"` in `.openai/hosting.json`. Keep that account-specific file out of this repository.

Use a fresh random upload token from session memory. Set it as a secret in your hosting provider and apply the environment revision. Never put it in a URL, source file, public browser bundle, shell command argument, or receipt. Use the uploader's hidden stdin. A host without secure secret input should use its own credential mechanism instead of exposing the token.

## Batch shape

Keep final MP4s in `OUTPUTS/vertical_9x16/` and posters in `OUTPUTS/thumbnails/`. Supply a JSON array with objects of this form:

```json
[{"id":"EPISODE-01","title":"An accessible clip label","file":"EPISODE/01_clip.mp4","poster":"EPISODE/01.jpg","caption":"A source-grounded caption. #WatchOut","duration":32.28}]
```

Use stable IDs and unique episode keys. On a media revision, use a new episode/version key to avoid stale browser caches. Filenames must use ASCII letters, digits, underscores, hyphens and dots; no spaces or traversal. Supply real captions and verified final media, not placeholders.

Run `node scripts/publish_watch_shots.mjs` in a retained terminal. After its hidden-input prompt, send one JSON line through the agent's stdin tool:

```json
{"origin":"https://YOUR-OWN-SITE","token":"SESSION-ONLY-SECRET","sourceDir":"ABSOLUTE_OUTPUTS_PATH","seedFile":"ABSOLUTE_BATCH_JSON_PATH","receiptFile":"ABSOLUTE_RECEIPT_JSON_PATH","concurrency":4}
```

The script needs Node 20+. It uploads exact original export bytes, checks stored lengths and hashes, and publishes each clip only after its video and poster verify. Existing matching uploads are skipped, and older catalog entries remain. A stopped run can be resumed with the same batch. Keep one publisher active at a time; catalog writes are not a multi-writer transaction.

Verify anonymous access, playback and seeking, attachment download headers, and copied captions. Download must return the original MP4, not a preview or transcoded copy. Test a full downloaded file's SHA-256 against the export. Clipboard permission depends on the visitor's browser; keep Copy Caption and manual text selection available. Publish only reviewed clips.

Direct YouTube publishing is not included. It requires a separate OAuth integration and channel authorization; a public gallery must never expose the owner's channel token.

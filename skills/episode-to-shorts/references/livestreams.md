# Live gaming streams

Process complete hourly batches when requested. Read the whole available transcript of each hour before final selection, retain handles across boundaries, and avoid duplicate moments from overlapping captures. Treat the last partial hour as real work when the stream ends; do not abandon it because it is shorter than an hour.

For reaction-focused gaming clips, prioritize visible surprises, physical reactions, funny failures and unexpected interactions. Inspect the action itself; a transcript alone misses silent visual comedy. Rank candidates across batches instead of filling each hour with weaker dialogue. Keep capture, editing, independent QA and approved uploads moving in parallel, with serialized catalog merges and publication reservations.

Include mission mini-stories when requested: a clear objective, an intense chase or encounter, a funny failed attempt, or a satisfying completion. Retain chronological setup, action and payoff; do not select generic gunfire without a comprehensible objective.

Persist source-specific required description hashtags in the job state. Include the user's exact requested spelling in every relevant social caption, gallery entry and provider description, including scheduled posts. Add only grounded context tags. Do not apply a game's hashtag to unrelated future sources. A request for description hashtags does not authorize adding on-video headlines or a new voiceover.

## Capture and clocks

- Verify source channel, current live state, highest available format and frame rate. A live stream may expose different formats after it ends.
- Test a bounded capture before launching a long job. Some adaptive YouTube live formats do not support yt-dlp download sections. Unbounded live fragment iterators combined with concurrent eager downloads can accumulate fragments without finalizing a playable file. Use bounded, resumable ranges when necessary; verify the actual fragment duration instead of assuming two seconds.
- Keep source-global times, each batch's original PTS origin, and edited-output times distinct. Rebasing video and audio separately can discard their original offset. For separate tracks, a common FFmpeg timestamp shift preserves their relationship: `-copyts -i VIDEO -i AUDIO -c copy -output_ts_offset -ORIGIN -avoid_negative_ts disabled OUT.mkv`.
- Probe each transcription chunk's measured audio origin; do not assume it starts at exactly a multiple of five minutes. Reattach ASR word times to that measured origin.
- Verify per-stream coverage and packet continuity, not only the maximum container duration. Preserve the highest-quality merged source until final QA succeeds. A worker lock must be checked against its live process before restarting.
- Persist completed hours, selected global ranges, final hashes, uploads and provider post IDs. A recurrence must resume this state, not repeat already published clips. Store signed source URLs and credentials outside public repositories.

## Gameplay and facecam

Map the facecam from actual source frames and independently map the relevant game action. Keep gameplay above the streamer when both matter; use gameplay alone when it carries the action and the streamer is quiet. Preserve necessary targets, NPCs, prompts, subtitles and HUD. Do not crop by the most prominent face alone.

Inspect rapid lateral movement throughout the selected interval. A static crop that works at the first and last frames can still cut off a face between them. Track only when the whole movement has been verified. Otherwise preserve the full original facecam without distortion. The renderer supports `"fit_regions": [false, true]` on a split part: the second source rectangle is fitted into its panel with blurred fill, rather than stretched or cropped. This is useful when the original facecam is wide and the person moves quickly. Crop source counters or overlay fragments out before fitting; never leave half a subscriber number at the panel boundary.

Distinguish the streamer, game characters, donation TTS and radio lyrics. Diarization IDs can change between ASR chunks. Caption the actual foreground exchange, with enough game dialogue for its setup. Do not attribute NPC dialogue or music to the streamer. State whether captions cover foreground speech only.

## Formats and release cadence

The user's latest format request overrides examples elsewhere in the skill. For 9:16-only work, run the renderer with `--format vertical`; deliver only 1080x1920 videos. Generating auxiliary ASS layouts does not require rendering an unwanted landscape video.

Require independent source/export QA for every released clip, exact manifest/video hashes, full decoding and honest review scope. Waveform correlation checks synchronization; it does not establish that every ASR word is correct. Do not claim full listening when only sampled visual, ASR and waveform checks were possible.

When publication is authorized, rank the QA-passed clips and lead with the strongest. Read the actual channel queue, including earlier projects. Use the user's cadence, or state a reasonable cadence when none was specified. Schedule future slots instead of publishing the entire batch simultaneously. Preserve existing scheduled posts unless changing them is authorized. Store slot reservations before submitting, then reconcile actual provider IDs and statuses. Never turn an uncertain submission into a second direct upload. Gallery upload, scheduled status and published status are distinct outcomes.

For Zernio video uploads, use `POST /v1/media/presign` then PUT the exact original file to the returned storage URL with matching Content-Type. As verified2026-11-18, `/media/upload-direct` has an effective hosting limit around4.5MB despite an internal25MB check and rejected a21.6MiB clip with413. See https://docs.zernio.com/messages/upload-media-direct and https://docs.zernio.com/guides/media-uploads. Keep signed URLs private, verify the public object's SHA-256, and import that object into the gallery without a second laptop upload when supported. Never reduce approved quality just to fit an upload endpoint. Transfer100percent is not server acceptance or publication. Preserve an in-progress slow transfer while useful independent work continues; change routes only after a concrete failure or verified incompatibility, checking first whether a post was actually submitted.

If whole-file uploads repeatedly reset, the included gallery supports authenticated128KiB chunks and streaming assembly for files up to120MiB. Run `scripts/upload_resumable.py FILE VERSIONED_KEY --origin https://YOUR_GALLERY` with the upload token in `WATCHOUT_UPLOAD_TOKEN`. Each chunk and the final object are checksum-verified; retries retain accepted parts and immutable completed media. This helper uploads only: complete independent QA before calling it, and merge the catalog and submit posts separately. The live workflow verified two original MP4 files end to end with this route after direct uploads failed. Keep catalog read/merge/write and post reservations serialized across parallel workers.

Balance quick reaction clips with longer mission stories when requested. Use45-90seconds when the objective and payoff need room, and up to180seconds for a coherent story. Do not pad a short joke or force every moment below30seconds. Check final duration and source continuity; a revised longer cut requires fresh video QA. Preserve the latest source-specific language preference for titles, descriptions and word captions.

Private staging can run while independent QA is in progress: `upload_resumable.py --stage-only` uploads content-addressed chunks only, without creating a public video or catalog entry. After QA passes the exact final hash, run the normal upload; verified existing chunks are skipped using authenticated HEAD checks. Never treat successful private staging as QA approval or publication. Temporary assembly failures have bounded retries; immutable-key conflicts and authorization failures stop immediately.

At each edit boundary, inspect the actual word spans and the rendered caption. Avoid starts that cut a word or leave an isolated fragment such as `up-`. Extend to the complete setup or move to a clean word boundary while preserving context. Extremely short ASR tokens can be artifacts: cross-check unclear wording against the source and a second transcription pass before burning it in. Apply a precise caption correction without removing valid source audio, then rerender and renew the QA hash.

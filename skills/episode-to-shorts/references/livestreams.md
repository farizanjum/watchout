# Live gaming streams

Process complete hourly batches when requested. Read the whole available transcript of each hour before final selection, retain handles across boundaries, and avoid duplicate moments from overlapping captures. Treat the last partial hour as real work when the stream ends; do not abandon it because it is shorter than an hour.

For reaction-focused gaming clips, prioritize visible surprises, physical reactions, funny failures and unexpected interactions. Inspect the action itself; a transcript alone misses silent visual comedy. Rank candidates across batches instead of filling each hour with weaker dialogue. Keep capture, editing, independent QA and approved uploads moving in parallel, with serialized catalog merges and publication reservations.

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

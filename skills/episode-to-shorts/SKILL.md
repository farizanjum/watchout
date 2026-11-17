---
name: episode-to-shorts
description: Turn a long episode, podcast, interview, or comedy show into reviewed short video edits with timed captions, speaker-aware framing, and matching vertical and landscape exports. Use for source-video clipping, not generating fictional footage.
---

# Episode to Shorts

Deliver finished clips, a timestamped full transcript, editable caption/timeline data, and a simple preview gallery. Use the user's requested count and formats. For a request like the workflow this skill was built from, target 10–15 standalone moments, prioritize 1080×1920, and also export 1920×1080.

This is an agent-readable workflow, not an autonomous clip picker. Any assistant that can read Markdown can follow the editorial instructions. Executing the helpers needs filesystem access and a shell; reviewing media needs image/video/audio tools. Use the user's requested language, branding, destination, and publication scope.

Publishing is optional. When explicitly requested, use a destination owned by the user, preserve existing clips, and follow `references/watch-shots.md`. Never upload to the original author's account or assume that installing this skill authorizes public publication.

## Editorial decisions

Read the whole episode transcript before choosing highlights. Inspect the source video throughout and review candidate scenes at their actual boundaries. Look for self-contained setups and payoffs, character interactions, personal stories, emotion, and varied tone. Avoid selecting fifteen versions of the same joke. A funny excerpt that needs unseen context is not ready to clip.

Preserve chronology and meaning. Keep enough setup and a brief authentic reaction after the payoff. Trim pauses, repetitions, or unrelated promotions only when the resulting dialogue still makes sense. Never manufacture a reaction by moving footage from another moment. A stacked split screen must show simultaneous source views or be clearly presented as a flashback/context insert.

Use external footage only when it improves the specific edit. This workflow does not require meme inserts, music, artificial laughter, or sound effects. Do not post or publish unless the user requests it.

## Source and transcript

1. Use `scripts/acquire.py` to download the highest available video/audio and metadata. Keep originals in the job's work directory. Inspect actual duration, dimensions, frame rate, and audio streams with ffprobe.
2. Use `scripts/transcribe.py`. Read credentials only from environment variables. Scribe is useful for Hindi/English code-switching; Groq Whisper is a fallback. Keep raw responses and word timestamps. Long requests can take several minutes; continue independent editing work while they run.
3. Treat ASR as evidence, not unquestionable truth. In the demonstrated workflow Whisper sometimes translated spoken English into Hindi, hallucinated speech over applause, overlapped word timestamps, and missed jokes. Scribe recovered many of these, but a mostly English short missed its Hindi question until Hindi was explicitly selected. Compare engines or retranscribe uncertain short passages, and inspect/listen to the source before asserting quote accuracy.
4. Speaker diarization IDs are not verified identities. Assign names only from reliable context in the recording.

## Hinglish captions

Use spoken-dialogue captions only by default. Do not add opening title text, hook headlines, or editorial summaries over the video unless explicitly requested. Clip names can remain in the gallery and filenames.

Use the user's exact channel name for a requested watermark. For example, `Watch Out` goes near the top, clear of faces and captions. Do not add branding when the user did not request it. Set `watermark` in the manifest; the caption generator renders it for the full duration in both formats. This branding is separate from the unwanted opening headlines.

When requested, Hindi must be in Roman letters; preserve spoken English as English. Romanization is not English translation. Use natural spellings and confirm proper names. Preserve the meaning and the user's profanity preference.

Keep original audio timestamps outside the language model's control. Ask a model to return one Roman string per source word, verify the count, then reattach the original times. Do not ask a model to invent caption timestamps. A vocabulary cache reduces repeated transliteration work, but review context-sensitive words and names.

Preserve word order when repairing overlapping ASR timestamps. Never sort words into a different sentence just because noisy timestamps overlap. Do not spread text across silent laughter intervals. A second ASR pass is preferable to guessing missing speech.

For a Kalakar/MrBeast reference: inspect its actual sample, then use heavy rounded sans-serif text, short readable phrases, a dark outline, a subtle entrance pop, and a restrained active-word highlight. Usually 2–4 words per phrase works well. Break before punchline words/names so the answer is not displayed early. Use separate caption positions for solo and stacked layouts; keep captions off faces and away from platform controls. A divider must be drawn before captions, never across their foreground.

Run `scripts/captions.py --manifest EDIT_JSON` after reviewing the manifest's output-relative `words` list (`start`, `end`, `text`). It creates both ASS layouts and SRT beside the manifest. Clamp any phrase-tail hold to the next phrase's start: otherwise technically nonoverlapping word times can still produce overlapping rendered text.

## Framing and editing

Inspect shot boundaries, not just a few thumbnail frames. Face detection can assist, but guards, audience members, posters, and side profiles can mislead it. Keep a visual contact sheet of every chosen crop. Check that the important speaker remains visible for the whole shot.

Identify every essential participant before choosing a crop, including the person being addressed and meaningful reactions. Do not rank people only by face size or screen position. In a three-person exchange, use a shared two-person crop plus the third participant, or switch shots with the dialogue; do not permanently exclude someone who carries the setup or reaction. Verify participant coverage across the full selected exchange.

Create an explicit participant registry and per-shot whitelist before rendering. Use stable role IDs when a name is uncertain. Map the actual contestant, host, panelists, and conversation partner; mark security/audience as background and exclude them as crop subjects. A guard incidentally behind a speaker is different from making the guard the subject. Never infer panel-versus-stage solely from face height: that exact mistake selected guards while discarding taller contestants in the original workflow.

Read `references/subject-qa.md` and run `scripts/review_subjects.py --manifest EDIT_JSON`. The renderer requires this participant-map check. It rejects unknown/background crop subjects, empty regions, unreviewed parts, and omitted `required_subjects`. These structural checks do not replace inspecting the image.

Map speaker changes inside a camera shot. Split the crop plan at those turns or use a composition that keeps all involved speakers visible. For four-person panel exchanges, complementary two-person panels can retain both the questioner and the response; do not keep only the two most prominent guests while a third person speaks off-crop. ASR diarization IDs can conflate different people and must be corroborated against the source footage and timing.

Sample the middle and end of moving shots too. A face location from the first frame becomes stale when a speaker enters or the camera pans. Use explicit reviewed crops or subdivide the shot. For oblique panel views where two faces overlap, prefer one coherent solo frame; for wide panel shots, tighten the two crops enough that the stacked views are distinct.

Keep the best source resolution until the final crop. For a 4K source, avoid making a 1080p intermediate and then enlarging a narrow vertical crop. Use solo close crops when one person carries the story and simultaneous stacked crops when an exchange benefits from both people. Review stage roleplays manually so secondary speakers are not cropped away.

Build an explicit edit manifest with source times, kept intervals, per-shot crop rectangles, and caption words. Snap edit boundaries to source frames. Do not cut the first or last syllable of a sentence. Save ASS for styling and SRT for portable text editing.

Read `references/manifest.md` when preparing a render manifest. `scripts/render.py` renders a completed manifest in both formats and verifies basic output dimensions/duration. It does not choose moments or prove caption accuracy. Its crop coordinates are scaled to the actual source dimensions; set the manifest's source dimensions correctly.

## Verification and delivery

Before calling clips finished:

- Use a separate QA agent when available and permitted by the host. An independent human reviewer can fill this role too. Give it the source, every finished export, timeline/caption files, participant map, and known findings. It should review independently rather than relying on the editor's description. If agents are unavailable, disclose that and perform a separate QA pass; do not claim independent review.
- Have the reviewer cover the whole timeline: every shot, speaker change, internal cut, start/end, and moving-subject interval. Compare the original and edited frames, and listen where audio is available. One midpoint per shot is insufficient; inspect near both ends and through movement. Record the actual inspection scope and any unverified audio wording.
- Require a finding log with clip/time, evidence, severity, fix, and recheck result. Fix every blocking finding, rerender, then ask the reviewer to recheck the changed footage. Do not treat full-file decoding as proof of correct editorial framing.
- Tie the independent QA report to SHA-256 hashes of all final exports and edit manifests. Run `scripts/verify_qa.py --report REPORT_JSON --output-dir OUTPUTS --manifest-dir EDITS` before packaging. This gate rejects open findings, missing clip/export coverage, and files changed after review. Participant-map approval alone is not independent editorial approval.

- Verify every export has video and audio, the requested dimensions, and the expected edited duration. Decode the entire file to detect corruption.
- Inspect all shot layouts and representative caption frames in both formats. Check long words, line widths, face overlap, and title safe areas.
- Review beginnings, endings, internal cuts, punchlines, and flagged wording with the actual source/audio. Distinguish visual inspection and technical decoding from a full real-time listening review; never claim the latter unless performed.
- Check subtitle times for negative values, overlap, zero-length flashes, omitted speech, and entries beyond the final duration. If Hinglish was requested, search for remaining Devanagari.
- Provide a gallery linking every vertical and landscape file, full transcript, clip guide with source timecodes, SRT/ASS files, manifests, and a quality report describing the checks actually performed and remaining uncertainty.

Keep intermediate files out of the deliverable directory. Cache keys must include source identity, source range, layout, and render settings. Avoid reusing numbered parts after changing a timeline without validating the cache. On failure, leave the previous finished output intact and record the failed command's error.

## Watch Out publication

Publish only QA-passed final exports. For the included optional gallery, show: video, social caption, Download Clip, Copy Caption. No hero, explanatory copy, dashboards, or extra on-screen labels. Download Clip also attempts to copy that clip's caption, with the separate button available when clipboard permission is restricted. Keep the original full-quality MP4 bytes and support video seeking and direct downloads.

Write distinct social captions in the requested language from the actual moment; this workflow includes a Hinglish style. Use an accurate setup and curiosity; avoid invented dialogue, false reactions, misleading names, or revealing the punchline through text/emojis/hashtags. Ask the QA reviewer to check caption grounding and accidental spoilers too. Do not promise virality. Upload videos and posters first, verify their stored sizes/checksums, then append the catalog atomically. Verify anonymous access, all media URLs, download headers, and the copy/download flow. Deliver the live Site URL.

## Optional YouTube publishing

When requested, read `references/youtube-publishing.md` for the private review/publish flow, channel verification, secret handling, and retry safeguards. Gallery publication and YouTube posting are separate actions; the owner confirms the reviewed post.

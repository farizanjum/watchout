# Watch Out

An agent skill for turning episodes, podcasts, interviews, and comedy shows into reviewed short clips. It includes speaker-aware vertical framing, word-timed Hinglish captions, optional channel watermarks, landscape exports, and a public download gallery.

## Use with your AI agent

Clone this repository and give your agent this instruction:

> Read `skills/episode-to-shorts/SKILL.md` and use it to edit my source video. Follow my language, branding, export formats, and publishing preferences. Inspect the actual footage and perform the participant and editorial QA checks before delivery.

The instructions work with any agent that can read Markdown. Running the helpers requires shell and filesystem access. Visual/audio review requires media tools or a human reviewer. This is not a promise that every chat-only assistant can render or inspect video.

For hosts with skill discovery, copy the complete `skills/episode-to-shorts` folder into the host's skill directory. For example, Codex uses `~/.codex/skills/`; other hosts can load the same `SKILL.md` directly. Keep `scripts/` and `references/` beside it. The optional `agents/openai.yaml` is Codex UI metadata, not a runtime dependency.

## Local requirements

- Python 3.11 or newer; `python -m pip install -r requirements.txt`
- FFmpeg and ffprobe on PATH, with the libass subtitle filter and libx264 encoder
- A bold sans-serif font. The caption template uses Montserrat; provide a licensed font directory with `--fonts-dir`, or edit the template to use an installed font.
- Optional transcription: your own `ELEVENLABS_API_KEY` for Scribe or `GROQ_API_KEY` for Whisper. These provider calls may cost money. You can instead supply reviewed word timestamps from another transcription engine.
- Optional gallery publisher: Node 20 or newer and your own configured hosting/storage.

The renderer selects NVIDIA encoding when available and falls back to CPU libx264. The helpers use cross-platform Python/Node APIs; the current workflow was exercised on Windows. Other operating systems still need their FFmpeg and font setup verified.

## Workflow

1. Acquire the best available source and read the whole transcript.
2. Select complete moments with setup, payoff, and authentic reactions.
3. Map essential participants and speaking turns. Background guards are not crop subjects.
4. Build a reviewed timeline and timestamped caption manifest. See [the schema](skills/episode-to-shorts/references/manifest.md).
5. Render 1080x1920 and 1920x1080 exports from the highest-resolution source.
6. Review every shot and speaker change, fix findings, decode all exports, and bind the QA report to final hashes.
7. Deliver original MP4s. Publish only to a destination the user has authorized.

Example helper commands, from `skills/episode-to-shorts/`:

```sh
python scripts/acquire.py "VIDEO_URL" --work-dir /path/to/job/work
python scripts/transcribe.py /path/to/job/work/source.mkv --out-dir /path/to/job/transcript --engine scribe --language hi
python scripts/captions.py --manifest /path/to/job/edits/01/edit.json
python scripts/review_subjects.py --manifest /path/to/job/edits/01/edit.json
python scripts/render.py --source /path/to/job/work/source.mkv --manifest /path/to/job/edits/01/edit.json --output-dir /path/to/job/outputs --work-dir /path/to/job/render --fonts-dir /path/to/fonts
python scripts/verify_qa.py --report /path/to/job/qa.json --output-dir /path/to/job/outputs --manifest-dir /path/to/job/edits
```

The agent must create and review the manifests; these commands do not automatically discover the best moments or prove quote accuracy. A participant map prevents known structural mistakes but cannot identify a face. Report sampled visual inspection honestly; it is not uninterrupted listening.

## Optional gallery

`gallery/` contains a minimal public Worker app: clips, social captions, Download Clip, and Copy Caption. Download also attempts to copy the caption. It serves original MP4 bytes with seeking and checksum verification, never a lower-quality preview download. It requires your own storage and upload secret. Read [the deployment and upload guide](skills/episode-to-shorts/references/watch-shots.md).

The editing skill does not require ChatGPT Sites. Any compatible Worker host can run the gallery after you configure `BUCKET` and `UPLOAD_TOKEN`. No credentials, channel access, source episodes, or finished clips are included. The studio preview is public. An optional owner-only Zernio integration adds a review/publish flow for YouTube. Read [the connection and security guide](skills/episode-to-shorts/references/youtube-publishing.md). Its supplied identity adapter requires ChatGPT Sites; other hosts must provide verified owner authentication before enabling publishing.

## Checks

```sh
python -m unittest discover -s tests
cd gallery
node build.mjs
node --test tests.mjs publisher.test.mjs
```

MIT licensed for the code and documentation. Source videos, music, likenesses, and third-party fonts retain their respective rights; this repository does not license them.

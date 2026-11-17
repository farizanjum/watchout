# Render manifest

The renderer accepts one JSON edit per clip and adjacent `vertical.ass` and `horizontal.ass`. This separates editorial decisions from repeatable rendering. The timing example below must be augmented with the participant registry and per-part review fields in `subject-qa.md`; the renderer rejects unreviewed crops.

```json
{
  "id": "01",
  "slug": "a-standalone-moment",
  "title": "A standalone moment",
  "watermark": "Watch Out",
  "subject_registry": {
    "host": {"label": "Host", "role": "speaker", "important": true},
    "guest": {"label": "Guest", "role": "participant", "important": true}
  },
  "start": 100.0,
  "source_width": 3840,
  "source_height": 2160,
  "fps": 25,
  "duration": 12.0,
  "keep": [[0.0, 6.0], [8.0, 14.0]],
  "parts": [
    {"source_start": 0.0, "source_end": 6.0, "start": 0.0, "end": 6.0, "mode": "solo", "rects": [[1216, 2160, 1300, 0]], "subject_review": {"approved": true, "source_shot": "01", "regions": [["host"]], "evidence": "Replace with actual reviewed evidence"}, "required_subjects": ["host"]},
    {"source_start": 8.0, "source_end": 14.0, "start": 6.0, "end": 12.0, "mode": "split", "rects": [[1280, 1138, 700, 400], [1280, 1138, 2100, 400]], "subject_review": {"approved": true, "source_shot": "02", "regions": [["host"], ["guest"]], "evidence": "Replace with actual reviewed evidence"}, "required_subjects": ["host", "guest"]}
  ],
  "words": [{"start": 0.1, "end": 0.4, "text": "Example"}]
}
```

- `start`: global start of the source excerpt. Every source time in `keep` and `parts` is relative to this offset.
- `keep`: ordered, nonoverlapping source intervals; used for original audio and landscape video. Their summed length must equal `duration`.
- `parts`: an ordered partition of the kept intervals. It must cover exactly the same source times as `keep`, with no missing/repeated frames.
- Each part's `start` and `end` are edited-output times, used to place captions according to the current layout. `words` uses the same output clock; include every reviewed spoken word, not just the example above.
- A rectangle is `[width, height, x, y]`, measured in `source_width` × `source_height` pixels. One rectangle for `solo`; two simultaneous rectangles for `split` (top, bottom).
- ASS times are relative to the edited output, after removing excluded source intervals. Set PlayRes 1080×1920 for vertical and 1920×1080 for landscape.
- Use even crop dimensions/coordinates for YUV video. Quantize boundaries to the source frame rate.

Example invocation:

```powershell
python scripts/acquire.py "https://www.youtube.com/watch?v=VIDEO_ID" --work-dir "C:\job\work"
python scripts/transcribe.py "C:\job\work\source.mkv" --out-dir "C:\job\work\transcript" --engine scribe --language hi
python scripts/captions.py --manifest "C:\job\edit\01\edit.json"
python scripts/render.py --source "C:\job\work\source.mkv" --manifest "C:\job\edit\01\edit.json" --output-dir "C:\job\outputs" --work-dir "C:\job\work\render" --fonts-dir "C:\job\fonts"
```

Requirements: Python 3.11+, FFmpeg/ffprobe, yt-dlp, and requests. Source acquisition and rendering are local. Transcription uses the selected provider account. The scripts never create API keys or subscriptions.

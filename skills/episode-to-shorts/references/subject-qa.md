# Participant mapping and independent QA

The map is an editorial artifact, not a face-recognition classifier. Establish the roles from source context, clothing, scene continuity, microphone use, speech timing, and verified names. Do not guess an identity from a face or equate an ASR speaker ID with a real person.

## Required manifest fields

```json
{
  "watermark": "Watch Out",
  "subject_registry": {
    "host": {"label": "Host", "role": "speaker", "important": true},
    "guest": {"label": "Guest", "role": "participant", "important": true},
    "security": {"label": "Security behind stage", "role": "background", "important": false}
  }
}
```

Each part also needs this review record, alongside its crop rectangles:

```json
{
  "subject_review": {
    "approved": true,
    "source_shot": "source-time-or-shot-id",
    "regions": [["host"], ["guest"]],
    "evidence": "Source/export frames at the start, middle, end and speaking turns"
  },
  "required_subjects": ["host", "guest"]
}
```

One region corresponds to each crop, in the same order. List the important people intentionally framed there. A two-person upper crop can have two IDs. Do not add security as a subject merely because they are incidentally visible in the background. Set `required_subjects` from the dialogue and visual context before choosing the crops; do not derive it from whatever the automatic crop happened to retain.

The reviewer must verify that the actual people match these IDs. Do not mark `approved` before inspecting the source. If a person enters, moves, turns, or becomes the speaker, update the evidence and crop plan. Reused coordinates are not proof of coverage.

## Mandatory independent review

Ask a QA agent to inspect all clips against their source. Give it exact paths and request:

1. A complete coverage ledger of clips, shot intervals, and frames/playback examined.
2. Missing active speakers, questioners, conversation partners, and meaningful reactions.
3. Wrong targets such as guards, audience faces, or duplicated views that omit an important person.
4. Head/face clipping during movement, bad boundaries, caption collisions, wrong names, unwanted headings, and watermark safe placement.
5. Source/output timestamps for each finding, suggested correction, and a recheck of the actual new render.

The editor fixes findings, then returns updated files to the reviewer. Ship only after blocking findings are resolved and technical verification passes. Include the report with the delivery. Be precise: frame sampling, transcript comparison, and decoding are not a full real-time listening review, and no automated check guarantees zero editorial errors.

The independent reviewer writes JSON with `reviewer`, `status` (`pass` or `needs_fixes`), honest `review_scope`, `findings` (each with `status: resolved` or `open`), and `clips`. Each clip has `id`, `verdict`, `evidence` or `inspected_windows`, `manifest_sha256`, and `files` containing `{path, sha256}` for both exports. Paths are relative to the output directory. Hash final files only after rendering completes. The release gate compares this report against every manifest and export; changed files require a new review record.

## Failure cases to preserve

- A stage shot was labeled as panel footage from vertical face position. Filtering then removed the contestant and kept the guard. Require a reviewed role whitelist instead.
- The chai roleplay kept two men but omitted the woman being addressed. Require all essential participants, using shared crops or speaker-led switches.
- Balraj asked a question while only Raftaar and Samay were shown. Map speaking turns inside a shot; retain the questioner.
- A correct mid-shot crop lost the woman at the end as she moved. Review the full movement, not only a midpoint.
- Green-shirt panelist lines were missed because a fixed two-person panel crop never switched. Review each speaking turn, even when the source camera does not cut.
- Opening editorial headings were unwanted. Keep dialogue captions only, with the explicitly requested persistent Watch Out watermark.

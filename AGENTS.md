# Watch Out

For clipping tasks, read `skills/episode-to-shorts/SKILL.md` and the referenced manifest and participant-QA guides. The skill is plain Markdown; use equivalent tools in your host.

Keep source media, transcripts, credentials, output clips, and account-specific hosting configuration out of this repository. Do not publish clips or connect accounts without user authorization. Source quality, participant coverage, word timing, and honest QA scope matter more than passing a structural validator.

Run `python -m unittest discover -s tests` after changing the helpers. For gallery edits, run `node build.mjs` and `node --test tests.mjs` from `gallery/`. Use the default configured Git author; do not add co-authors.

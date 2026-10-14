# Episode 004: "The Reality of Cold Outreach"

Educational episode in the same faceless animated style as Episode 001: navy night palette,
amber for progress, the same character "V". 73 s, vertical 9:16.

| File | What it is |
|---|---|
| `EP004_cold_outreach_master.mp4` | Full-quality master: 1080×1920, 24 fps, voiceover, captions, soundtrack (−14 LUFS) |
| `EP004_cold_outreach_preview.mp4` | Smaller copy (~26 MB) for sharing |
| `Cold_Email_Playbook.md` | The full playbook: domain setup, DNS records, list building, 4 scripts, 3 follow-ups, reply handling, metrics, legal notes, 14-day launch plan |
| `Post_Caption.md` | Caption, pinned comment and posting notes |

## What the episode teaches
1. **Hook:** most cold emails never reach a human; they land in spam.
2. **Setup:** separate domain · SPF/DKIM/DMARC · 2-week warm-up · ~30 emails/day per inbox.
3. **List:** verify every address; bounces hurt reputation faster than bad copy.
4. **The email:** under 80 words, plain text, no links. True first line, one problem, a small question.
5. **Follow-ups:** 3 more (day 4, 8, 14), each adding something new.
6. **Truth:** sending messages isn't the same as earning trust.

The voiceover is a synthetic placeholder (Kokoro, voice `am_michael`). Swap in your own voice when you can.

## Rebuild (in `source/`)
```bash
python3 vo004.py <kokoro_model_dir> lines.json vo.wav 6   # voice + vo.wav.json timings
python3 build.py                                          # template.html + timings → ep004.html (captions)
node render.mjs full                                      # video_only.mp4 (~12 min)
python3 audio004.py soundtrack.wav vo.wav.json            # score + SFX timed to the voice
```
Then mix the voice over the soundtrack with ducking and `loudnorm=I=-14`, and mux with the video
(same ffmpeg chain as Episode 001). Edit the script in `lines.json`: column 2 is what the voice says,
column 3 is the caption text, and `|` forces a caption break.

# Playbook reel: "How to Get Your First Clients"

Standalone educational reel in the series' faceless animated style. 70 s, vertical 9:16.

| File | What it is |
|---|---|
| `PB01_first_clients_master.mp4` | Full-quality master: 1080×1920, 24 fps, voiceover, captions, soundtrack (−14 LUFS) |
| `PB01_first_clients_preview.mp4` | Smaller copy (~25 MB) for sharing |
| `Client_Acquisition_Playbook.md` | Full playbook: offer formula, 100-person list, warm scripts, 2-minute video structure, call script, pilot proposal, objections, daily system, 30-day plan |
| `Post_Caption.md` | Caption, pinned comment and posting notes |

## The steps in the reel
1. One customer + one painful problem ("I help dentists fill empty appointment slots")
2. Write down 100 people. Start warm, then ask who they know
3. Don't pitch, show: a 2-minute video with 2 fixes
4. On the call, ask more than you talk (3 questions)
5. A small paid pilot: one outcome, one price, two weeks
6. The loop: deliver → testimonial → "who else?" → 10 conversations a day

The voiceover is a synthetic placeholder (Kokoro, voice `am_michael`).

## Rebuild (in `source/`)
Same pipeline as Episode 004: `vo.py` (voice + timings) → `build.py` (captions into `pb01.html`)
→ `node render.mjs full` → `audiopb.py` (score + SFX) → mix with ducking + `loudnorm=I=-14` → mux.
Scene drawing code is in `scenes.js` (already spliced into `template.html`).

# Episode 001 — "I'm 19, and I Haven't Made It Yet."

Faceless animated documentary short, 60 s, vertical 9:16.

| File | What it is |
|---|---|
| `EP001_im19_master_v1.mp4` | Full-quality master: 1080×1920, 24 fps, H.264, AAC 320 kbps, −14 LUFS |
| `EP001_im19_preview.mp4` | Smaller copy (~27 MB) for quick viewing and sharing |
| `EP001_im19_master_v2_vo.mp4` | **With voiceover.** Synthetic male voice (Kokoro, voice `am_michael`); captions, cut to black and SFX re-timed to the voice |
| `EP001_im19_preview_vo.mp4` | Smaller copy of the voiced version |
| `source/ep001.html` | The animation: 12 scenes, captions, grain and vignette, drawn per frame with `render(t)` |
| `source/render.mjs` | Renders the page frame by frame with Playwright and pipes it to ffmpeg |
| `source/audio.py` | Synthesizes the soundtrack: piano score, pad, room tone and timed sound effects |
| `source/vo.py` | Generates the voiceover line by line with sherpa-onnx + Kokoro and writes the actual line timings to JSON |

The v2 voiceover is synthetic and a placeholder. The series plan calls for your own voice: record it
to the timecodes in `source/ep001.html` (`CUES`) and replace the voice track.

`vo.py` needs `pip install sherpa-onnx soundfile` and the `kokoro-int8-en-v0_19` model folder
(model.int8.onnx, voices.bin, tokens.txt, espeak-ng-data):
`python3 vo.py <model_dir> vo.wav 6`.

## Re-render

```bash
cd source
node render.mjs full                      # writes video_only.mp4 (about 10 min)
python3 audio.py soundtrack.wav
ffmpeg -i video_only.mp4 -i soundtrack.wav -map 0:v -map 1:a -c:v copy \
  -af "loudnorm=I=-14:TP=-1.5:LRA=11" -c:a aac -b:a 320k -movflags +faststart \
  ../EP001_im19_master_v2.mp4
```

`node render.mjs test 2 19 44` renders single test frames (`test_<t>.png`) for checking.
`render.mjs` imports Playwright from `/opt/node22/lib/node_modules/playwright`; change
that path to wherever Playwright is installed on your machine.

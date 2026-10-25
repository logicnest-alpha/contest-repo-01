# Oyelo: 7 reels for local shop owners (Warangal)

Each reel: a hook naming something owners are missing → why it costs them → the Oyelo feature that
fixes it → CTA (**oyelo.in** · comment **"DEMO"**). 9:16, 1080×1920, 24 fps, 31–37 s, voiceover,
captions and soundtrack (−14 LUFS). See `Posting_Kit.md` for captions, schedule and CTA handling.

| File | Hook |
|---|---|
| `Oyelo_R1_reviews.mp4` | Why your best customers never review you |
| `Oyelo_R2_silent_complaints.mp4` | The complaint you never hear |
| `Oyelo_R3_table_qr.mp4` | Your table QR is wasting customers |
| `Oyelo_R4_walkins.mp4` | Your walk-ins are strangers forever |
| `Oyelo_R5_waiting_time.mp4` | Turn waiting time into return visits |
| `Oyelo_R6_shop_next_door.mp4` | The shop next door could send you customers |
| `Oyelo_R7_guesswork.mp4` | Stop running your shop on guesswork |

Screens shown in the reels are illustrative mockups ("Your Café", sample names), not real customer data.
The voice is a synthetic placeholder (Kokoro `am_michael`). Swap in your own voice, or a Telugu version, for best reach.

## Rebuild (in `source/`)
1. Edit scripts in `reels.json` (`lines`: scene label, spoken text, caption with `|` breaks and `<em>` highlights).
2. `python3 vo.py <kokoro_model_dir> rN_lines.json rN_vo.wav 6` per reel (`rN_lines.json` = the reel's `lines` array).
3. `python3 build_all.py` → `r1.html` … `r7.html`
4. `node render.mjs full rN` → `rN_video.mp4` (`node render.mjs test rN 1.5 10` for single frames)
5. `python3 audio_reel.py rN_bed.wav rN_vo.wav.json`, then mix the voice over the bed with ducking + `loudnorm=I=-14` and mux.

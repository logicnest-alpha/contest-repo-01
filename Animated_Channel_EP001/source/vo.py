import sys, json, numpy as np, sherpa_onnx, soundfile as sf
M = sys.argv[1]; OUT = sys.argv[2]; SID = int(sys.argv[3]) if len(sys.argv) > 3 else 6
cfg = sherpa_onnx.OfflineTtsConfig(model=sherpa_onnx.OfflineTtsModelConfig(
    kokoro=sherpa_onnx.OfflineTtsKokoroModelConfig(model=f"{M}/model.int8.onnx", voices=f"{M}/voices.bin",
        tokens=f"{M}/tokens.txt", data_dir=f"{M}/espeak-ng-data"), num_threads=4), max_num_sentences=4)
tts = sherpa_onnx.OfflineTts(cfg)
LINES = [
 (0.5,1.8,"I'm nineteen years old."),(2.3,4.4,"And honestly... I haven't made it yet."),
 (4.6,6.2,"I've tried building businesses."),(6.4,9.8,"I've spent nights on ideas I genuinely believed would change my life."),
 (10.1,11.4,"Some things didn't work."),(11.8,13.2,"Some plans fell apart."),
 (14.2,17.4,"And sometimes I was so busy building, I forgot to ask myself..."),(18.1,20.3,"Am I even building the right thing?"),
 (20.9,22.8,"The hardest part isn't losing money."),(23.1,26.2,"It's watching time pass while you're still figuring it all out."),
 (26.6,29.6,"Watching people move ahead, while you're starting over again."),
 (30.9,32.9,"But maybe that's the part nobody talks about."),(33.1,35.6,"The stage where you have no success story to tell."),
 (35.9,37.2,"No big results to show."),(37.5,40.8,"Just a laptop, a thousand doubts, and a reason to keep going."),
 (41.2,42.3,"I'm still a student."),(42.6,43.5,"I'm still learning."),(43.8,46.2,"And I'm still trying to build something real."),
 (46.8,48.6,"I don't know how this story ends."),(49.0,51.7,"But I'm done pretending I have everything figured out."),
 (52.3,54.6,"This is day one of documenting the journey."),(54.9,55.6,"The failures."),(55.65,56.4,"The lessons."),(56.45,57.3,"The work."),
 (57.5,59.4,"Let's see if I can actually make it."),
]
def trim(x, sr, thr=0.012):
    idx = np.where(np.abs(x) > thr)[0]
    if len(idx) == 0: return x
    a = max(0, idx[0] - int(0.02 * sr)); b = min(len(x), idx[-1] + int(0.06 * sr)); return x[a:b]
SR = None; track = None; report = []; prev_end = 0.0; timing = []
for i, (a, b, text) in enumerate(LINES):
    nxt = LINES[i + 1][0] if i + 1 < len(LINES) else 59.8
    slot = max(b - a, nxt - a - 0.12); speed = 1.0
    for _ in range(4):
        g = tts.generate(text, sid=SID, speed=speed); SR = g.sample_rate
        x = trim(np.array(g.samples, dtype=np.float32), SR); d = len(x) / SR
        if d <= slot + 0.25 or speed >= 1.15: break
        speed = min(1.15, speed * d / slot * 1.02)
    if track is None: track = np.zeros(int(61 * SR), dtype=np.float32)
    start = max(a, prev_end + 0.18)
    i0 = int(start * SR); track[i0:i0 + len(x)] += x; prev_end = start + d
    timing.append([a, b, start, d])
    report.append((i + 1, a, b, round(d, 2), round(speed, 2)))
track /= max(1e-6, np.max(np.abs(track))) / 0.89
sf.write(OUT, track[: int(60 * SR)], SR)
for r, tm in zip(report, timing): print(r, 'placed', round(tm[2], 2), 'end', round(tm[2] + tm[3], 2))
json.dump(timing, open(OUT + '.json', 'w'))

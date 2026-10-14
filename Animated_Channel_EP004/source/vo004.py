import sys, json, numpy as np, sherpa_onnx, soundfile as sf
M, LINES_F, OUT = sys.argv[1], sys.argv[2], sys.argv[3]; SID = int(sys.argv[4]) if len(sys.argv) > 4 else 6
cfg = sherpa_onnx.OfflineTtsConfig(model=sherpa_onnx.OfflineTtsModelConfig(
    kokoro=sherpa_onnx.OfflineTtsKokoroModelConfig(model=f"{M}/model.int8.onnx", voices=f"{M}/voices.bin",
        tokens=f"{M}/tokens.txt", data_dir=f"{M}/espeak-ng-data"), num_threads=4))
tts = sherpa_onnx.OfflineTts(cfg)
lines = json.load(open(LINES_F))
def trim(x, sr, thr=0.012):
    idx = np.where(np.abs(x) > thr)[0]
    if len(idx) == 0: return x
    return x[max(0, idx[0] - int(0.02 * sr)): min(len(x), idx[-1] + int(0.06 * sr))]
clips, SR = [], 24000
for scene, text, _ in lines:
    g = tts.generate(text, sid=SID, speed=1.0); SR = g.sample_rate
    clips.append(trim(np.array(g.samples, dtype=np.float32), SR))
t = 0.45; timing = []; prev = None
for (scene, _, cap), x in zip(lines, clips):
    if prev is not None: t += 0.75 if scene != prev else 0.28
    timing.append({"scene": scene, "start": round(t, 3), "end": round(t + len(x) / SR, 3), "cap": cap}); t += len(x) / SR; prev = scene
total = t + 2.6
track = np.zeros(int((total + 0.5) * SR), dtype=np.float32)
for tm, x in zip(timing, clips):
    i = int(tm["start"] * SR); track[i:i + len(x)] += x
track /= np.max(np.abs(track)) / 0.89
sf.write(OUT, track[: int(total * SR)], SR)
json.dump({"total": round(total, 2), "lines": timing}, open(OUT + ".json", "w"), indent=1)
print("total", round(total, 2))
for tm in timing: print(tm["scene"], tm["start"], tm["end"])

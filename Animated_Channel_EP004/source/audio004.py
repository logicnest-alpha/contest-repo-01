import numpy as np, wave, sys, json
tm = json.load(open(sys.argv[2])); Ls = [l['start'] for l in tm['lines']]; Le = [l['end'] for l in tm['lines']]
SR = 48000; DUR = tm['total']; N = int(SR * DUR); t = np.arange(N) / SR
rng = np.random.default_rng(11); mix = np.zeros((N, 2))
mid = lambda a, b: (Le[a] + Ls[b]) / 2
B_setup, B_truth, B_end = mid(1, 2), mid(16, 17), mid(19, 20)
def db(x): return 10 ** (x / 20)
def place(sig, start, g=0.0, pan=0.0):
    i = int(start * SR); j = min(N, i + len(sig))
    if i >= N or i < 0: return
    s = sig[:j - i] * db(g); mix[i:j, 0] += s * np.sqrt(.5 * (1 - pan)); mix[i:j, 1] += s * np.sqrt(.5 * (1 + pan))
def lp(x, c):
    X = np.fft.rfft(x); f = np.fft.rfftfreq(len(x), 1 / SR); X *= 1 / (1 + (f / c) ** 4); return np.fft.irfft(X, len(x))
def bp(x, lo, hi):
    X = np.fft.rfft(x); f = np.fft.rfftfreq(len(x), 1 / SR)
    X *= (1 / (1 + (lo / np.maximum(f, 1)) ** 4)) * (1 / (1 + (f / hi) ** 4)); return np.fft.irfft(X, len(x))
def env(n, a, r):
    e = np.ones(n); na, nr = int(a * SR), int(r * SR)
    if na: e[:na] = np.linspace(0, 1, na)
    if nr: e[-nr:] *= np.linspace(1, 0, nr)
    return e
def note(fq, dur=4.0, vel=1.0, br=1.0):
    n = int(dur * SR); tt = np.arange(n) / SR; s = np.zeros(n)
    for h, a in [(1, 1), (2, .42 * br), (3, .16 * br), (4, .07 * br)]:
        s += a * np.sin(2 * np.pi * fq * h * tt * (1 + .0004 * h)) * np.exp(-tt * (1.1 + .9 * h))
    return lp(s * np.minimum(1, tt / .012) * vel, 2600 * br + 400)
hz = lambda m: 440 * 2 ** ((m - 69) / 12)
mus = np.zeros(N)
def mn(m, st, v=.5, d=4.5, br=1.0):
    s = note(hz(m), d, v, br); i = int(st * SR); j = min(N, i + len(s))
    if i < N: mus[i:j] += s[:j - i]
# hook: sparse D minor
for st, m, v in [(0.3, 62, .65), (1.6, 57, .45), (3.0, 65, .55), (4.4, 64, .45), (5.6, 62, .5)]: mn(m, st, v)
mn(38, 0.3, .35, 7, .6)
# knowledge sections: soft pulse with Dm - Bb - F - C
beat = 60 / 84 / 2; prog = [(50, 57, 62), (46, 53, 62), (53, 57, 60), (48, 55, 64)]
k, bar = B_setup, 0
while k < B_truth - 0.1:
    ch = prog[int((k - B_setup) / (beat * 16)) % 4]
    step = int(round((k - B_setup) / beat))
    mn(ch[1 + step % 2] + 12, k, .18, 1.4, .8)
    if step % 16 == 0:
        mn(ch[0] - 12, k, .4, 6, .6); mn(ch[2] + 12, k + beat * 2, .32, 4, 1.0)
    k += beat
# truth: lift to F major, no pulse
for st, ms, v in [(B_truth, (41, 57, 65, 69), .5), (B_truth + 3.2, (36, 55, 64, 67), .45), (B_truth + 6.4, (38, 57, 62, 69), .45)]:
    for i, m in enumerate(ms): mn(m, st + i * .05, v * (1.2 if i == 0 else .8), 6, 1.1)
for st, m in [(B_truth + 1.4, 72), (B_truth + 2.6, 74), (B_truth + 4.6, 72), (B_truth + 7.8, 69)]: mn(m, st, .4, 4, 1.15)
# end: resolve
for i, m in enumerate((41, 57, 65, 69, 72)): mn(m, B_end + .1 + i * .06, .45, 7, 1.0)
mn(77, B_end + 3.6, .3, 4, 1.1)
pad = np.zeros(N)
def padc(ms, a, b, lvl):
    i, j = int(a * SR), min(N, int(b * SR)); tt = np.arange(j - i) / SR
    pad[i:j] += sum(np.sin(2 * np.pi * hz(m) * tt + .3 * np.sin(2 * np.pi * .2 * tt)) for m in ms) / len(ms) * env(j - i, 1.5, 1.5) * lvl
padc([38, 45, 50], 0, B_setup + 1, .45); padc([41, 48, 57], B_truth - .3, B_end + .5, .6); padc([41, 48, 53, 57], B_end, DUR, .5)
music = mus / np.max(np.abs(mus)) + .5 * lp(pad, 900) / np.max(np.abs(pad))
music *= np.minimum(1, t / .8) * np.where(t > DUR - 1.5, np.clip((DUR - t) / 1.5, 0, 1), 1)
place(music / np.max(np.abs(music)), 0, -15)
# room tone
br_ = np.cumsum(rng.standard_normal(N)); br_ -= lp(br_, 8); room = lp(br_ / np.max(np.abs(br_)), 400) * (t < B_end)
place(room / np.max(np.abs(room)), 0, -37)
def burst(d, lo, hi, dec):
    n = int(d * SR); x = bp(rng.standard_normal(n), lo, hi) * np.exp(-np.arange(n) / SR * dec); return x / np.max(np.abs(x))
def chime(fs, d=1.5, dec=2.5):
    n = int(d * SR); tt = np.arange(n) / SR; return sum(np.sin(2 * np.pi * f * tt) for f in fs) / len(fs) * np.exp(-tt * dec) * env(n, .005, .05)
click = lambda: burst(.05, 1500, 6000, 100)
for i in range(10):                                         # envelopes whoosh
    t0 = 0.4 + i * 0.52; place(burst(.6, 800, 5000, 3) * env(int(.6 * SR), .2, .3), t0, -36, .3)
place(burst(.25, 80, 400, 12), Ls[1], -24)                  # spam folder thump
for li in (3, 4, 5, 6): place(click(), Ls[li] + .7, -24); place(chime([1568, 2349], .6, 6), Ls[li] + .72, -36)
sw = burst(Le[7] - Ls[7], 2000, 9000, .2) * env(int((Le[7] - Ls[7]) * SR), .3, .3); place(sw, Ls[7], -38)   # scan
for r in (1, 4, 6):
    yy = 31 + r * 6.6; ts = Ls[7] + (yy - 26) / 54 * (Le[7] - Ls[7]); place(chime([330, 311], .3, 12), ts, -30)
place(chime([1047, 1319, 1568], 1.6, 2), Ls[8] + .6, -34)  # reputation recovers
for li in (10, 11, 12):
    for k in np.arange(0, .6, .07): place(click(), Ls[li] + k, -33, .2)
place(burst(.3, 1000, 6000, 8), Ls[13] + 1.0, -28); place(chime([1319, 1760], 1.0, 3), Ls[13] + 1.2, -30)
for ta in (Ls[14], Ls[15] + .2, Ls[15] + .7, Ls[15] + 1.2): place(chime([880], .25, 14), ta, -30)
for i in (1, 2, 3): place(click(), Ls[16] + .15 * i, -28)
place(burst(.3, 1000, 6000, 8), Ls[16] + 1.9, -28)
for k2 in np.arange(B_truth + 1, B_end - .5, 1.3):           # distant birds
    n = int(.12 * SR); tt = np.arange(n) / SR; c = np.sin(2 * np.pi * (3200 + 1400 * np.sin(tt * 60)) * tt) * env(n, .01, .06)
    place(c, k2 + rng.uniform(0, .4), -38, .6)
mix = mix / np.max(np.abs(mix)) * db(-2)
out = (np.clip(mix, -1, 1) * 32767).astype(np.int16)
with wave.open(sys.argv[1], 'wb') as w: w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(out.tobytes())
print('ok', DUR)

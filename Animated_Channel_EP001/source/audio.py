import numpy as np, wave, sys
SR = 48000; DUR = 60.0; N = int(SR * DUR)
rng = np.random.default_rng(7)
mix = np.zeros((N, 2))
t = np.arange(N) / SR

def db(x): return 10 ** (x / 20)
def place(sig, start, gain_db=0.0, pan=0.0):
    i = int(start * SR); j = min(N, i + len(sig))
    if i >= N: return
    s = sig[: j - i] * db(gain_db)
    mix[i:j, 0] += s * np.sqrt(0.5 * (1 - pan)); mix[i:j, 1] += s * np.sqrt(0.5 * (1 + pan))
def lp(x, a):  # one-pole lowpass, a in (0,1)
    y = np.empty_like(x); acc = 0.0
    for k in range(len(x)): acc += a * (x[k] - acc); y[k] = acc
    return y
def lp_fast(x, cutoff):
    # FFT brick-ish lowpass for long signals
    X = np.fft.rfft(x); f = np.fft.rfftfreq(len(x), 1 / SR)
    X *= 1 / (1 + (f / cutoff) ** 4); return np.fft.irfft(X, len(x))
def bp_fast(x, lo, hi):
    X = np.fft.rfft(x); f = np.fft.rfftfreq(len(x), 1 / SR)
    X *= (1 / (1 + (lo / np.maximum(f, 1)) ** 4)) * (1 / (1 + (f / hi) ** 4)); return np.fft.irfft(X, len(x))
def env(n, a, r):
    e = np.ones(n); na = int(a * SR); nr = int(r * SR)
    if na: e[:na] = np.linspace(0, 1, na)
    if nr: e[-nr:] *= np.linspace(1, 0, nr)
    return e
def note(freq, dur=4.0, vel=1.0, bright=1.0):
    n = int(dur * SR); tt = np.arange(n) / SR
    s = np.zeros(n)
    for h, amp in [(1, 1.0), (2, 0.42 * bright), (3, 0.16 * bright), (4, 0.07 * bright)]:
        s += amp * np.sin(2 * np.pi * freq * h * tt * (1 + 0.0004 * h)) * np.exp(-tt * (1.1 + 0.9 * h))
    att = np.minimum(1, tt / 0.012)
    s *= att * vel
    # soft felt: low-pass via gentle smoothing
    return lp_fast(s, 2600 * bright + 400)
def hz(m): return 440 * 2 ** ((m - 69) / 12)

# ---------- room tone (0 – 57.4) ----------
brown = np.cumsum(rng.standard_normal(N)); brown -= lp_fast(brown, 8); brown /= np.max(np.abs(brown))
room = lp_fast(brown, 400) * 0.9 + 0.02 * np.sin(2 * np.pi * 50 * t)
room *= (t < 57.8) * np.minimum(1, t / 1.0)
place(room / np.max(np.abs(room)), 0, -36)

# ---------- music ----------
D3, F3, A3, C4, D4, E4, F4, G4, A4, Bb3, C5, D5 = 50, 53, 57, 60, 62, 64, 65, 67, 69, 58, 72, 74
mus = np.zeros(N)
def mnote(m, start, vel=0.8, dur=4.5, bright=1.0):
    s = note(hz(m), dur, vel, bright); i = int(start * SR); j = min(N, i + len(s)); mus[i:j] += s[: j - i]
# 0–18: sparse D minor
seq1 = [(0.3, D4, .7), (1.8, A3, .5), (3.2, F4, .6), (4.6, E4, .45), (6.2, D4, .6), (7.6, A3, .45), (9.0, C4, .5),
        (10.4, D4, .55), (11.8, F3, .45), (13.2, A3, .5), (14.6, G4, .45), (16.0, F4, .5)]
for st, m, v in seq1: mnote(m, st, v)
mnote(D3, 0.3, .35, 6, .6); mnote(Bb3 - 12, 9.0, .3, 6, .6)
# 20.3–38.4: piano + low pad (D minor / Bb / F / C)
seq2 = [(20.6, A4, .5), (22.2, F4, .45), (23.8, D4, .5), (25.4, E4, .4), (27.0, F4, .45), (28.6, C4, .4), (30.4, D4, .45),
        (32.2, A3, .4), (34.0, F4, .45), (35.8, E4, .4), (37.2, D4, .45)]
for st, m, v in seq2: mnote(m, st, v)
# 38.4–57.2: lift toward F major, then soft pulse from 46.5
seq3 = [(38.4, F4, .55), (38.4, A4, .4), (38.4, C5, .35), (40.0, C4, .45), (41.4, A4, .5), (42.8, G4, .45), (44.2, F4, .5), (45.6, E4, .4)]
for st, m, v in seq3: mnote(m, st, v, 5, 1.1)
beat = 60 / 70 / 2
chords = [(46.5, [F3, C4]), (49.6, [Bb3 - 12 + 12, D4]), (52.0, [F3, A3]), (54.6, [C4, E4])]
k = 46.5
while k < 57.2:
    root = [c for c in chords if c[0] <= k][-1][1]
    mnote(root[int((k - 46.5) / beat) % 2] + 12, k, 0.22 + 0.12 * (k - 46.5) / 10.7, 1.6, 0.8)
    k += beat
for st, m, v in [(46.5, A4, .5), (49.0, C5, .5), (50.4, A4, .45), (52.0, F4, .6), (52.0, C5, .45), (53.6, D5, .45), (55.0, C5, .5), (56.4, A4, .5)]:
    mnote(m, st, v, 5, 1.15)
# 59.0 final ringing note
mnote(D4, 59.0, .55, 1.0, 0.9); mnote(A4, 59.0, .3, 1.0, 0.9)
# pad
pad = np.zeros(N)
def padchord(ms, a, b, lvl):
    i, j = int(a * SR), int(b * SR); tt = np.arange(j - i) / SR
    s = sum(np.sin(2 * np.pi * hz(m) * tt + 0.3 * np.sin(2 * np.pi * 0.2 * tt)) for m in ms) / len(ms)
    pad[i:j] += s * env(j - i, 1.6, 1.4) * lvl
padchord([D3 - 12, A3 - 12, D3], 20.3, 30.6, .5); padchord([Bb3 - 24, F3 - 12, D3], 30.4, 38.6, .5)
padchord([F3 - 12, C4 - 12, A3], 38.4, 46.7, .55); padchord([F3 - 12, C4 - 12, F3, A3], 46.5, 57.4, .7)
pad = lp_fast(pad, 900)
music = mus / np.max(np.abs(mus)) + 0.55 * pad / np.max(np.abs(pad))
# hard drop 18.0–20.3 and hard cut at 57.4 (keep 59.0 note)
gate = np.ones(N)
gate[(t >= 18.0) & (t < 20.3)] = 0
i0 = int(17.85 * SR); gate[i0:int(18.0 * SR)] = np.linspace(1, 0, int(18.0 * SR) - i0)
gate[(t >= 57.8) & (t < 59.0)] = 0
music *= gate
music *= np.where(t < 46.5, 1.0, 1.0 + 0.35 * np.clip((t - 46.5) / 10, 0, 1))
place(music / np.max(np.abs(music)), 0, -15)

# ---------- SFX ----------
def burst(dur, lo, hi, decay):
    n = int(dur * SR); x = bp_fast(rng.standard_normal(n), lo, hi); x *= np.exp(-np.arange(n) / SR * decay)
    return x / np.max(np.abs(x))
def click(): return burst(0.06, 1500, 6000, 90)
place(burst(0.25, 300, 3000, 20) * 0.7, 4.6, -20); place(click(), 4.76, -20)   # lid
fan = bp_fast(rng.standard_normal(int(36 * SR)), 200, 900); fan /= np.max(np.abs(fan)); fan *= env(len(fan), 1.0, 1.0)
place(fan, 5.0, -38)
for k2 in [7.5, 7.75, 7.95, 8.3]: place(click(), k2, -30, 0.2)
place(burst(0.6, 800, 7000, 6), 10.0, -27)                                                   # paper
place(burst(0.35, 1500, 8000, 10), 12.8, -25, 0.3)                                           # note peel
place(burst(0.5, 600, 4000, 6), 13.1, -32, 0.4)
for k2 in np.arange(20.3, 26.5, 1.0):                                                       # clock
    g = -24 if k2 < 22 else -31
    place(burst(0.03, 2000, 9000, 200), k2, g)
crowd = bp_fast(rng.standard_normal(int(4.2 * SR)), 150, 900); crowd /= np.max(np.abs(crowd))
crowd *= (0.6 + 0.4 * np.sin(2 * np.pi * 3.1 * np.arange(len(crowd)) / SR) ** 2) * env(len(crowd), 0.4, 0.5)
place(crowd, 26.4, -27)
for k2 in np.arange(26.6, 30.4, 0.52): place(burst(0.08, 100, 800, 40), k2, -33, -0.3)
wh = burst(1.4, 100, 1200, 1.2) * env(int(1.4 * SR), 0.7, 0.7); place(wh, 30.1, -28)       # whoosh
shim = sum(np.sin(2 * np.pi * f * np.arange(int(2.5 * SR)) / SR) for f in [2093, 2637, 3136]) / 3
place(shim * np.exp(-np.arange(len(shim)) / SR * 1.5) * env(len(shim), 0.3, 0.3), 38.4, -34)
for k2 in [42.12, 43.44, 44.64]: place(click(), k2, -26)                                       # tabs
place(click() * 1.2, 45.6, -22)                                                              # pen cap
cre = np.sin(2 * np.pi * (180 + 60 * np.sin(np.arange(int(.5 * SR)) / SR * 9)) * np.arange(int(.5 * SR)) / SR)
place(bp_fast(cre * rng.uniform(.6, 1, len(cre)), 120, 900) * env(len(cre), .05, .2), 46.6, -30)
cur = burst(0.9, 1000, 6000, 1.0) * env(int(0.9 * SR), 0.15, 0.3); place(cur, 48.9, -25)    # curtain
for k2 in [50.2, 51.1, 52.6, 53.4, 54.4, 56.0, 56.9]:                                       # birds
    n = int(0.12 * SR); tt = np.arange(n) / SR
    ch = np.sin(2 * np.pi * (3200 + 1400 * np.sin(tt * 60)) * tt) * env(n, .01, .06)
    place(ch, k2, -36, 0.6); place(ch, k2 + 0.16, -38, 0.6)
for k2 in np.arange(52.3, 54.8, 0.21): place(burst(0.09, 2000, 7000, 30), k2, -32)        # pencil
place(burst(0.5, 2000, 7000, 8), 54.9, -26); place(click(), 56.0, -24); place(burst(0.5, 600, 6000, 6), 57.1, -24)

# ---------- master ----------
mix[int(57.8 * SR):int(59.0 * SR)] *= 0
peak = np.max(np.abs(mix)); mix = mix / peak * db(-2.0)
rms = np.sqrt(np.mean(mix ** 2)); print('rms dBFS', 20 * np.log10(rms))
fade = np.ones(N); fade[-int(0.25 * SR):] = np.linspace(1, 0, int(0.25 * SR)); mix *= fade[:, None]
out = (np.clip(mix, -1, 1) * 32767).astype(np.int16)
with wave.open(sys.argv[1], 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(out.tobytes())

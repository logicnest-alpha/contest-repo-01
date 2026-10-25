import numpy as np, wave, sys, json
tm = json.load(open(sys.argv[2])); lines = tm['lines']
Ls = [l['start'] for l in lines]; Le = [l['end'] for l in lines]; lab = [l['scene'] for l in lines]
SR = 48000; DUR = tm['total']; N = int(SR * DUR); t = np.arange(N) / SR
rng = np.random.default_rng(int(sys.argv[3]) if len(sys.argv) > 3 else 5); mix = np.zeros((N, 2))
mid = lambda a, b: (Le[a] + Ls[b]) / 2
first = lambda s: next(i for i, x in enumerate(lab) if x == s)
B_fix = mid(first('fix') - 1, first('fix')); B_end = mid(5, 6)
def db(x): return 10 ** (x / 20)
def place(sig, start, g=0.0, pan=0.0):
    i = int(start * SR); j = min(N, i + len(sig))
    if i >= N or i < 0: return
    s = sig[:j - i] * db(g); mix[i:j, 0] += s * np.sqrt(.5 * (1 - pan)); mix[i:j, 1] += s * np.sqrt(.5 * (1 + pan))
def lp(x, c):
    X = np.fft.rfft(x); f = np.fft.rfftfreq(len(x), 1 / SR); X *= 1 / (1 + (f / c) ** 4); return np.fft.irfft(X, len(x))
def bp(x, lo, hi):
    X = np.fft.rfft(x); f = np.fft.rfftfreq(len(x), 1 / SR); X *= (1 / (1 + (lo / np.maximum(f, 1)) ** 4)) * (1 / (1 + (f / hi) ** 4)); return np.fft.irfft(X, len(x))
def env(n, a, r):
    e = np.ones(n); na, nr = int(a * SR), int(r * SR)
    if na: e[:na] = np.linspace(0, 1, na)
    if nr: e[-nr:] *= np.linspace(1, 0, nr)
    return e
def note(fq, dur=4.0, vel=1.0, br=1.0):
    n = int(dur * SR); tt = np.arange(n) / SR; s = np.zeros(n)
    for h, a in [(1, 1), (2, .42 * br), (3, .16 * br), (4, .07 * br)]: s += a * np.sin(2 * np.pi * fq * h * tt * (1 + .0004 * h)) * np.exp(-tt * (1.1 + .9 * h))
    return lp(s * np.minimum(1, tt / .012) * vel, 2600 * br + 400)
hz = lambda m: 440 * 2 ** ((m - 69) / 12)
mus = np.zeros(N)
def mn(m, st, v=.5, d=4.5, br=1.0):
    s = note(hz(m), d, v, br); i = int(st * SR); j = min(N, i + len(s))
    if 0 <= i < N: mus[i:j] += s[:j - i]
# problem: sparse minor
for k, m in enumerate([62, 57, 65, 64, 62, 60, 57]):
    st = 0.2 + k * 1.15
    if st < B_fix - .3: mn(m, st, .5)
mn(38, 0.2, .35, 8, .6)
# fix: brighter pulse in F major-ish
beat = 60 / 96 / 2; prog = [(53, 57, 60), (48, 55, 64), (50, 57, 62), (46, 53, 62)]; k = B_fix
while k < B_end - .1:
    step = int(round((k - B_fix) / beat)); ch = prog[(step // 16) % 4]
    mn(ch[1 + step % 2] + 12, k, .2, 1.3, .9)
    if step % 16 == 0: mn(ch[0] - 12, k, .45, 6, .6); mn(ch[2] + 12, k + beat * 2, .32, 4, 1.05)
    if step % 8 == 4: mn(ch[2] + 24, k, .16, 2, 1.1)
    k += beat
# cta: resolve
for i, m in enumerate((41, 57, 65, 69, 72)): mn(m, B_end + .05 + i * .05, .5, 7, 1.05)
mn(77, B_end + 1.8, .3, 4, 1.1)
music = mus / np.max(np.abs(mus))
music *= np.minimum(1, t / .6) * np.where(t > DUR - 1.2, np.clip((DUR - t) / 1.2, 0, 1), 1)
place(music, 0, -15)
br_ = np.cumsum(rng.standard_normal(N)); br_ -= lp(br_, 8); room = lp(br_ / np.max(np.abs(br_)), 500) * (t < B_end)
place(room / np.max(np.abs(room)), 0, -38)
def burst(d, lo, hi, dec):
    n = int(d * SR); x = bp(rng.standard_normal(n), lo, hi) * np.exp(-np.arange(n) / SR * dec); return x / np.max(np.abs(x))
def chime(fs, d=1.0, dec=3):
    n = int(d * SR); tt = np.arange(n) / SR; return sum(np.sin(2 * np.pi * f * tt) for f in fs) / len(fs) * np.exp(-tt * dec) * env(n, .005, .05)
pop = lambda: chime([880, 1320], .25, 14)
place(burst(.8, 300, 4000, 3) * env(int(.8 * SR), .1, .3), 0.0, -30)              # hook whoosh
place(burst(.25, 80, 400, 12), Ls[1], -26)                                       # problem thump
for i in range(2, 6):                                                            # scene / UI pops
    place(burst(.5, 600, 5000, 4) * env(int(.5 * SR), .15, .3), mid(i - 1, i) - .2, -34, .2)
    for k2 in (.3, 1.2, 2.2): place(pop(), Ls[i] + k2, -31, (k2 - 1) / 3)
place(chime([1047, 1319, 1568], 1.8, 2.2), B_end + .05, -27)                     # end card
place(chime([1568, 2093], .6, 6), B_end + .65, -32); place(chime([1319], .5, 8), B_end + 1.05, -34)
mix = mix / np.max(np.abs(mix)) * db(-2)
with wave.open(sys.argv[1], 'wb') as w: w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((np.clip(mix, -1, 1) * 32767).astype(np.int16).tobytes())

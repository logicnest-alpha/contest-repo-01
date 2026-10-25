import json, re
R = json.load(open('reels.json'))
def words(cap):
    out, em = [], False
    for tok in re.split(r'(<em>|</em>)', cap):
        if tok == '<em>': em = True; continue
        if tok == '</em>': em = False; continue
        for w in tok.split(): out.append((w, em))
    return out
def html(ws):
    s, cur = '', False
    for i, (w, em) in enumerate(ws):
        if em and not cur: s += ('' if i == 0 else ' ') + '<em>' + w; cur = True; continue
        sp = '' if (i == 0 or w[0] in ',.?!;:') else ' '
        if not em and cur: s += '</em>' + sp + w; cur = False; continue
        s += sp + w
    return s + ('</em>' if cur else '')
tpl = open('template.html').read()
for rid, r in R.items():
    tm = json.load(open(f'{rid}_vo.wav.json'))
    cues = []
    for ln, src in zip(tm['lines'], r['lines']):
        chunks = [words(p) for p in src[2].split('|')]
        tot = sum(len(' '.join(x for x, _ in c)) for c in chunks); t = ln['start']; dur = ln['end'] - ln['start']
        for c in chunks:
            d = dur * len(' '.join(x for x, _ in c)) / tot; cues.append([round(t, 3), round(t + d, 3), html(c)]); t += d
    for i in range(len(cues) - 1):
        if cues[i + 1][0] - cues[i][1] < 0.35: cues[i][1] = cues[i + 1][0]
        else: cues[i][1] += 0.2
    cues[-1][1] += 0.8
    s = tpl.replace('__REEL__', json.dumps(rid)).replace('__TIMING__', json.dumps(tm)).replace('__CUES__', json.dumps(cues, ensure_ascii=False)).replace('__TITLE__', json.dumps(r['title']))
    open(f'{rid}.html', 'w').write(s)
print('built', list(R))

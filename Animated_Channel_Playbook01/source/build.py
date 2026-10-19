import json, re
tm = json.load(open('vo.wav.json'))
for ln, src in zip(tm['lines'], json.load(open('lines.json'))): ln['cap'] = src[2]
def words(cap):
    out, em = [], False
    for tok in re.split(r'(<em>|</em>)', cap):
        if tok == '<em>': em = True; continue
        if tok == '</em>': em = False; continue
        for w in tok.split():
            out.append((w, em))
    return out
def html(ws):
    s, cur = '', False
    for i, (w, em) in enumerate(ws):
        if em and not cur: s += ('' if i == 0 else ' ') + '<em>' + w; cur = True; continue
        if not em and cur: s += '</em> ' + w; cur = False; continue
        s += ('' if i == 0 else ' ') + w
    return s + ('</em>' if cur else '')
cues = []
for ln in tm['lines']:
    ws = words(ln['cap']); chunks, cur = [], []
    if '|' in ln['cap']:
        chunks = [words(p) for p in ln['cap'].split('|')]
        ws = []
    for w in ws:
        if cur and len(' '.join(x for x, _ in cur + [w])) > 26: chunks.append(cur); cur = []
        cur.append(w)
        if w[0].endswith(('.', '?', ',')) and len(' '.join(x for x, _ in cur)) > 12: chunks.append(cur); cur = []
    if cur: chunks.append(cur)
    total_chars = sum(len(' '.join(x for x, _ in c)) for c in chunks)
    t, dur = ln['start'], ln['end'] - ln['start']
    for c in chunks:
        d = dur * len(' '.join(x for x, _ in c)) / total_chars
        cues.append([round(t, 3), round(t + d, 3), html(c)]); t += d
for i in range(len(cues) - 1):
    if cues[i + 1][0] - cues[i][1] < 0.35: cues[i][1] = cues[i + 1][0]
    else: cues[i][1] += 0.2
cues[-1][1] += 0.6
s = open('template.html').read().replace('__TIMING__', json.dumps(tm)).replace('__CUES__', json.dumps(cues, ensure_ascii=False))
open('pb01.html', 'w').write(s)
print(len(cues), 'cues'); [print(c) for c in cues[:6]]

// ---------- shared panel frame (dark laptop UI) ----------
function screen(inner, glowOp = 0.18) {
  return `
  <rect width="90" height="160" fill="#070B14"/>
  <ellipse cx="45" cy="54" rx="48" ry="46" fill="#5B7BA6" opacity="${glowOp}" filter="url(#bl8)"/>
  <path d="M5 10 L85 9 L86 95 L4 96 Z" fill="#2E333C"/>
  <path d="M7 12 L83 11 L84 93 L6 94 Z" fill="#0E182B"/>
  <path d="M7 12 L83 11 L83.2 16 L7 17 Z" fill="#14213A"/>
  <circle cx="10.5" cy="14.2" r="0.8" fill="#3E5070"/><circle cx="13.2" cy="14.2" r="0.8" fill="#3E5070"/><circle cx="15.9" cy="14.2" r="0.8" fill="#3E5070"/>
  ${inner}
  <path d="M0 98 L90 97 L90 160 L0 160 Z" fill="#0A0E16"/>
  <path d="M2 97 L88 96" stroke="#3B414C" stroke-width="1.2"/>`;
}
const head = (txt) => `<text x="12" y="23.5" ${MONO} font-size="2.5" letter-spacing="0.5" fill="#8E9AB0">${txt}</text>
  <path d="M12 25.9 L78 25.7" stroke="#24314A" stroke-width="0.3"/>`;
function chip(cx, y, w, txt, k, opts = {}) {
  const fill = opts.amber ? '#E8A04F' : (opts.paper ? '#E9E3D6' : '#1A2438');
  const col = opts.amber ? '#1A1208' : (opts.paper ? '#1A1D24' : '#9DA8BB');
  const strike = opts.strike || 0;
  return `<g opacity="${k.toFixed(3)}">
    <rect x="${cx - w / 2}" y="${y - 3.4}" width="${w}" height="5.6" rx="2.8" fill="${fill}" ${opts.amber || opts.paper ? '' : 'stroke="#3E5070" stroke-width="0.3"'}/>
    <text x="${cx}" y="${y + 0.4}" text-anchor="middle" ${F} font-weight="${opts.amber ? 800 : 700}" font-size="${opts.fs || 2.6}" fill="${col}">${txt}</text>
    ${strike > 0 ? `<path d="M${cx - w / 2 + 2} ${y - 0.5} L${(cx - w / 2 + 2 + (w - 4) * strike).toFixed(2)} ${y - 0.5}" stroke="#B5643A" stroke-width="0.6"/>` : ''}</g>`;
}

// ---------- HOOK: posts float away, conversations appear ----------
function cHook(t) {
  const br = -0.3 * Math.sin(Math.PI * clamp((t - 0.5) / 2.4));
  let posts = '';
  for (let i = 0; i < 7; i++) {
    const t0 = 0.2 + i * 0.55, k = seg(t, t0, t0 + 2.6);
    if (k <= 0 || k >= 1) continue;
    const u = ease(k), x = 61 + (R(i) - 0.5) * 34 * u, y = lerp(78, 14, u), o = Math.min(1, k * 5) * (1 - ease(seg(k, 0.6, 1)));
    posts += `<g transform="translate(${x.toFixed(2)} ${y.toFixed(2)}) scale(${lerp(0.7, 0.5, u).toFixed(3)})" opacity="${(o * 0.9).toFixed(3)}">
      <rect x="-4.5" y="-5.5" width="9" height="11" rx="0.8" fill="#1C2C47" stroke="#3E5070" stroke-width="0.3"/>
      <rect x="-3.5" y="-4.5" width="7" height="5" fill="#2B3A55"/>
      <path d="M-3.5 2 H2.5 M-3.5 3.6 H1" stroke="#5E6B82" stroke-width="0.5"/>
      <path d="M2.6 3.2 c0.3-0.7 1.3-0.6 1.2 0.2 c-0.1 0.6-1.2 1.2-1.2 1.2 c0 0-1.1-0.6-1.2-1.2 c-0.1-0.8 0.9-0.9 1.2-0.2 Z" fill="#5E6B82"/></g>`;
  }
  const b1 = rv(t, L(1) + 0.1), b2 = rv(t, L(1) + 0.7);
  return `
  <defs><linearGradient id="gh" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#05080F"/><stop offset="1" stop-color="#0F1726"/></linearGradient></defs>
  <rect width="90" height="160" fill="url(#gh)"/>
  <rect y="112" width="90" height="48" fill="#0B1220"/>
  <rect x="10" y="40" width="20" height="30" fill="#1B2840"/>
  <rect x="12" y="42" width="7" height="13" fill="#5B7BA6" opacity="0.4"/><rect x="21" y="42" width="7" height="13" fill="#5B7BA6" opacity="0.3"/>
  <path d="M20 40 V70 M10 56 H30" stroke="#090E19" stroke-width="1.2"/>
  <polygon points="12,70 30,70 66,122 26,122" fill="#7F9CC4" opacity="0.08" filter="url(#bl2)"/>
  <ellipse cx="61" cy="80" rx="16" ry="10" fill="#A9C3E0" opacity="0.2" filter="url(#bl4)"/>
  <rect x="40" y="86" width="40" height="2.4" fill="#2E251C"/>
  <rect x="42" y="88.4" width="1.4" height="24" fill="#221B15"/><rect x="76.6" y="88.4" width="1.4" height="24" fill="#221B15"/>
  <path d="M54 85.6 L68 85.6 L67 76.6 L55 76.6 Z" fill="#A9C3E0" opacity="0.85"/>
  <rect x="53" y="85.4" width="16" height="1.2" fill="#3B414C"/>
  <rect x="43" y="96" width="14" height="1.8" fill="#1B1F26"/>
  <rect x="44" y="97.8" width="0.9" height="14" fill="#1B1F26"/><rect x="55" y="97.8" width="0.9" height="14" fill="#1B1F26"/>
  <g transform="translate(0 ${br.toFixed(3)})">
    <path d="M43.4 78.6 Q50 74 56.6 78.6 L57.6 96.6 L42.4 96.6 Z" fill="#191C23"/>
    <path d="M45.4 77 Q50 74.4 54.6 77 Q52.2 79.6 50 79.6 Q47.8 79.6 45.4 77 Z" fill="#22262E"/>
    <ellipse cx="50" cy="72" rx="4.1" ry="4.6" fill="#141519"/>
    <path d="M46 70.6 L45 67.8 L47.3 69.1 L47.5 66.6 L49.2 68.5 L50.4 66.2 L51.5 68.5 L53.6 67.2 L53.1 69.6 L54.8 69.8 L54 71.2 Z" fill="#141519"/>
    <path d="M54 70 Q54.8 73 53.6 75.8" stroke="#A9C3E0" stroke-width="0.35" fill="none" opacity="0.8"/>
  </g>
  ${posts}
  <g ${up(b1)}><rect x="18" y="50" width="26" height="7" rx="3.5" fill="#E9E3D6"/><path d="M38 56.6 L41 60 L41.5 56.6 Z" fill="#E9E3D6"/>
    <text x="31" y="54.6" text-anchor="middle" ${F} font-weight="700" font-size="2.5" fill="#1A1D24">hey, quick question</text></g>
  <g ${up(b2)}><rect x="56" y="40" width="24" height="7" rx="3.5" fill="#E8A04F"/><path d="M60 46.6 L58 50 L63 46.6 Z" fill="#E8A04F"/>
    <text x="68" y="44.6" text-anchor="middle" ${F} font-weight="800" font-size="2.5" fill="#1A1208">tell me more</text></g>
  ${dust(12, 4, 14, 66, 50, 50, t, '#C9D8EE', 0.45, 0.2)}`;
}

// ---------- STEP 1: niche target ----------
function cNiche(t) {
  const a = L(2), r1 = rv(t, a + 0.2), r2 = rv(t, a + 1.3), r3 = rv(t, a + 2.4);
  const c0 = rv(t, L(3)), s0 = rv(t, L(3) + 1.0, 0.35), c1 = rv(t, L(3) + 1.4);
  return screen(`${head('STEP 1 · ONE CUSTOMER, ONE PROBLEM')}
    <g opacity="${r1.toFixed(3)}"><circle cx="45" cy="50" r="${(22 + 6 * (1 - r1)).toFixed(2)}" fill="#141F35" stroke="#3E5070" stroke-width="0.4"/>
      <text x="45" y="31.6" text-anchor="middle" ${F} font-weight="600" font-size="2.4" fill="#8E9AB0">everyone</text></g>
    <g opacity="${r2.toFixed(3)}"><circle cx="45" cy="50" r="${(14 + 4 * (1 - r2)).toFixed(2)}" fill="#1D2B47" stroke="#5B7BA6" stroke-width="0.4"/>
      <text x="45" y="39.4" text-anchor="middle" ${F} font-weight="700" font-size="2.6" fill="#C9D6EA">dentists</text></g>
    <g opacity="${r3.toFixed(3)}"><circle cx="45" cy="50" r="${(7.5 + 3 * (1 - r3)).toFixed(2)}" fill="#E8A04F"/>
      <circle cx="45" cy="50" r="10" fill="#E8A04F" opacity="0.25" filter="url(#bl1)"/>
      <text x="45" y="49.4" text-anchor="middle" ${F} font-weight="800" font-size="2.2" fill="#1A1208">empty</text>
      <text x="45" y="52.2" text-anchor="middle" ${F} font-weight="800" font-size="2.2" fill="#1A1208">slots</text></g>
    ${chip(45, 80, 40, '“I build websites”', c0, { strike: s0 })}
    ${chip(45, 88, 60, '“I help dentists fill empty slots”', c1, { amber: true })}`);
}

// ---------- STEP 2: 100 people + network ----------
function cList(t) {
  const a = L(4), d = LE(4) - a, cnt = Math.round(100 * ease(seg(t, a + 0.6, LE(4) + 0.4)));
  const labels = ['friends', 'family', 'classmates', 'seniors', 'teachers', 'old contacts'];
  let lines = '', nodes = '', kids = '';
  labels.forEach((lb, i) => {
    const ang = -Math.PI / 2 + i * Math.PI / 3, x = 45 + Math.cos(ang) * 17, y = 52 + Math.sin(ang) * 15;
    const k = rv(t, L(5) + 0.1 + i * 0.25);
    lines += `<path d="M45 52 L${x.toFixed(2)} ${y.toFixed(2)}" stroke="#3E5070" stroke-width="0.4" opacity="${k.toFixed(3)}"/>`;
    nodes += `<g opacity="${k.toFixed(3)}"><circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="2.6" fill="#24314A" stroke="#5B7BA6" stroke-width="0.4"/>
      <text x="${x.toFixed(2)}" y="${(y + (Math.sin(ang) >= 0 ? 6 : -3.8)).toFixed(2)}" text-anchor="middle" ${F} font-weight="600" font-size="2.2" fill="#B9C2D2">${lb}</text></g>`;
    [-1, 1].forEach((sgn, j) => {
      const a2 = ang + sgn * 0.33, x2 = 45 + Math.cos(a2) * 29, y2 = 52 + Math.sin(a2) * 25;
      const k2 = rv(t, LE(5) - 1.6 + i * 0.12 + j * 0.06);
      kids += `<g opacity="${k2.toFixed(3)}"><path d="M${x.toFixed(2)} ${y.toFixed(2)} L${x2.toFixed(2)} ${y2.toFixed(2)}" stroke="#E8A04F" stroke-width="0.35" stroke-dasharray="1 0.7"/>
        <circle cx="${x2.toFixed(2)}" cy="${y2.toFixed(2)}" r="1.4" fill="#E8A04F"/></g>`;
    });
  });
  const ask = rv(t, LE(5) - 0.6);
  return screen(`${head('STEP 2 · 100 PEOPLE WITH THE PROBLEM')}
    <text x="78" y="23.6" text-anchor="end" ${F} font-weight="800" font-size="3.4" fill="#E8A04F">${String(cnt).padStart(3, '0')}<tspan font-size="2.4" fill="#8E9AB0"> / 100</tspan></text>
    ${kids}${lines}
    <circle cx="45" cy="52" r="3.6" fill="#5B7BA6"/><text x="45" y="53" text-anchor="middle" ${F} font-weight="800" font-size="2.2" fill="#0B1220">YOU</text>
    ${nodes}
    ${chip(45, 88, 56, 'Ask: “who do you know who…?”', ask, { paper: true })}`);
}

// ---------- STEP 3: show, don't pitch ----------
function cValue(t) {
  const m = rv(t, L(6) - 0.1), c0 = rv(t, L(6) + 0.3), s0 = rv(t, L(6) + 1.0, 0.35), c1 = rv(t, L(6) + 1.3);
  const f1 = rv(t, L(7) + 0.9), f2 = rv(t, L(7) + 1.9);
  const sec = Math.round(120 * seg(t, L(7), LE(7) + 0.3)), tm = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
  const rec = (Math.floor(t * 2) % 2 === 0) ? 1 : 0.35;
  return screen(`${head('STEP 3 · SHOW, DON’T PITCH')}
    <g opacity="${m.toFixed(3)}">
      <circle cx="64" cy="22.4" r="0.9" fill="#E06A4A" opacity="${rec}"/>
      <text x="66" y="23.4" ${F} font-weight="700" font-size="2.3" fill="#E9E3D6">REC ${tm}</text>
      <rect x="12" y="29" width="66" height="40" rx="1" fill="#E9E3D6"/>
      <rect x="12" y="29" width="66" height="5" rx="1" fill="#D6CFBF"/>
      <circle cx="15" cy="31.5" r="0.7" fill="#A8A08E"/><rect x="50" y="30.8" width="24" height="1.4" rx="0.7" fill="#B9B19E"/>
      <rect x="16" y="38" width="30" height="3" fill="#2A2420"/><rect x="16" y="43" width="38" height="1.5" fill="#8A8378"/><rect x="16" y="46" width="32" height="1.5" fill="#8A8378"/>
      <rect x="16" y="51" width="14" height="4" rx="2" fill="#5B7BA6"/>
      <rect x="56" y="37" width="18" height="18" fill="#C9C1AE"/>
      <rect x="16" y="59" width="58" height="6" fill="#DDD5C4"/>
      <circle cx="72" cy="63" r="6" fill="#1A1D24" stroke="#E9E3D6" stroke-width="0.6"/>
      <ellipse cx="72" cy="62" rx="2.2" ry="2.5" fill="#5E4A42"/><path d="M69.6 61 L70.2 59 L71.4 59.8 L72.4 58.6 L73.6 59.8 L74.6 59.4 L74.4 61 Q72 59.6 69.6 61 Z" fill="#141519"/>
      <path d="M68 68.6 Q72 64.6 76 68.6" fill="#1A1D24" stroke="#2A2E36" stroke-width="0.3"/>
    </g>
    <g opacity="${f1.toFixed(3)}"><ellipse cx="23" cy="53" rx="9.5" ry="4.6" fill="none" stroke="#E8A04F" stroke-width="0.6" stroke-dasharray="1.4 0.8"/>
      ${chip(23, 61.6, 10, 'fix 1', 1, { amber: true, fs: 2.3 })}</g>
    <g opacity="${f2.toFixed(3)}"><ellipse cx="45" cy="62" rx="31" ry="4.6" fill="none" stroke="#E8A04F" stroke-width="0.6" stroke-dasharray="1.4 0.8"/>
      ${chip(45, 71, 10, 'fix 2', 1, { amber: true, fs: 2.3 })}</g>
    ${chip(45, 80, 36, '40-slide pitch deck', c0, { strike: s0 })}
    ${chip(45, 88, 44, '2-min video · 2 real fixes', c1, { amber: true })}`);
}

// ---------- STEP 4: the call ----------
function cCall(t) {
  const d = LE(9) - L(9), qs = [['What is this costing you?', 0], ['What have you tried?', 0.42], ['What happens if nothing changes?', 0.66]];
  let b = '';
  qs.forEach(([q, f], i) => {
    const k = rv(t, L(9) + d * f - 0.1), y = 40 + i * 14.5, w = q.length * 1.42 + 6;
    const typing = rv(t, L(9) + d * f + 0.7) * (0.5 + 0.5 * Math.sin(t * 9));
    b += `<g ${up(k)}><rect x="10" y="${y - 4}" width="${w.toFixed(1)}" height="6.6" rx="3.3" fill="#E9E3D6"/>
      <text x="13" y="${y + 0.5}" ${F} font-weight="700" font-size="2.7" fill="#1A1D24">${q}</text></g>
      <g opacity="${(k * rv(t, L(9) + d * f + 0.6)).toFixed(3)}"><rect x="64" y="${y + 3.6}" width="14" height="5.4" rx="2.7" fill="#24314A"/>
      ${[0, 1, 2].map((j) => `<circle cx="${68 + j * 3}" cy="${y + 6.3}" r="0.7" fill="#9DA8BB" opacity="${(0.4 + 0.6 * ((Math.floor(t * 4) + j) % 3 === 0 ? 1 : 0)).toFixed(2)}"/>`).join('')}</g>`;
  });
  const bar = rv(t, L(8) + 1.0, 0.8);
  return screen(`${head('STEP 4 · ASK MORE THAN YOU TALK')}
    <g opacity="${rv(t, L(8) + 0.6).toFixed(3)}">
      <rect x="12" y="28" width="66" height="3" rx="1.5" fill="#1A2438"/>
      <rect x="12" y="28" width="${(46.2 * bar).toFixed(2)}" height="3" rx="1.5" fill="#E8A04F"/>
      <text x="12" y="34.6" ${F} font-weight="700" font-size="2.3" fill="#E8A04F">them 70%</text>
      <text x="78" y="34.6" text-anchor="end" ${F} font-weight="700" font-size="2.3" fill="#8E9AB0">you 30%</text>
    </g>
    ${b}`);
}

// ---------- STEP 5: small paid pilot ----------
function cOffer(t) {
  const d = LE(10) - L(10), card = rv(t, L(10) + 0.2, 0.6);
  const rows = [['Outcome', 'one clear result', 0.45], ['Price', 'one fixed price', 0.66], ['Timeline', '2 weeks', 0.86]];
  let r = '';
  rows.forEach(([k, v, f], i) => {
    const kk = rv(t, L(10) + d * f - 0.15), y = 38 + i * 9;
    r += `<g ${up(kk, 1.5)}><text x="18" y="${y}" ${F} font-weight="600" font-size="2.6" fill="#7A746A">${k}</text>
      <text x="38" y="${y}" ${F} font-weight="800" font-size="3.2" fill="#1A1D24">${v}</text>
      <path d="M18 ${y + 2.6} L72 ${y + 2.6}" stroke="#D8D0C0" stroke-width="0.3"/></g>`;
  });
  const ch1 = rv(t, L(11)), ch2 = rv(t, L(11) + 0.9);
  return `
  <rect width="90" height="160" fill="#0A101C"/>
  <ellipse cx="45" cy="48" rx="44" ry="40" fill="#A9C3E0" opacity="0.10" filter="url(#bl8)"/>
  <g ${up(card, 4)}>
    <rect x="12" y="15" width="66" height="54" rx="2" fill="#000" opacity="0.4" filter="url(#bl1)"/>
    <rect x="12" y="14" width="66" height="54" rx="2" fill="#ECE6DA"/>
    <text x="18" y="22" ${MONO} font-size="2.4" letter-spacing="0.5" fill="#7A746A">STEP 5 · PROPOSAL</text>
    <text x="18" y="29" ${F} font-weight="800" font-size="4.4" fill="#1A1D24">Paid pilot</text>
    <rect x="58" y="24.6" width="14" height="5" rx="2.5" fill="#1A1D24"/><text x="65" y="28" text-anchor="middle" ${F} font-weight="700" font-size="2.3" fill="#F5F3EE">small</text>
    ${r}
    <text x="18" y="65" ${F} font-weight="600" font-size="2.4" fill="#7A746A">Start: this week</text>
  </g>
  ${chip(45, 79, 38, 'Low risk for them', ch1, { paper: true })}
  ${chip(45, 87.5, 34, 'Proof for you', ch2, { amber: true })}`;
}

// ---------- the loop ----------
function cLoop(t) {
  const cx = 45, cy = 50, r = 21;
  const N = [['Conversation', -90, 0], ['Paid pilot', 0, 0], ['Deliver', 90, L(12)], ['Testimonial', 180, L(12) + 1.3]];
  let nodes = '';
  N.forEach(([lb, deg, ta], i) => {
    const a = deg * Math.PI / 180, x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
    const k = ta === 0 ? 0.9 : rv(t, ta);
    const w = lb.length * 1.45 + 5;
    nodes += `<g opacity="${k.toFixed(3)}"><rect x="${(x - w / 2).toFixed(2)}" y="${(y - 3.2).toFixed(2)}" width="${w.toFixed(1)}" height="6.4" rx="3.2" fill="${i >= 2 ? '#E9E3D6' : '#1D2B47'}" stroke="#5B7BA6" stroke-width="${i >= 2 ? 0 : 0.35}"/>
      <text x="${x.toFixed(2)}" y="${(y + 0.9).toFixed(2)}" text-anchor="middle" ${F} font-weight="800" font-size="2.6" fill="${i >= 2 ? '#1A1D24' : '#C9D6EA'}">${lb}</text></g>`;
  });
  const ref = rv(t, L(12) + 2.6);
  const spin = ease(seg(t, L(12) - 0.4, L(12) + 0.6)), ang = -90 + ((t - L(12)) * 70) % 360;
  const dx = cx + Math.cos(ang * Math.PI / 180) * r, dy = cy + Math.sin(ang * Math.PI / 180) * r;
  const tens = rv(t, L(13) + 0.6);
  let dots = '';
  for (let i = 0; i < 10; i++) { const k = rv(t, L(13) + 0.9 + i * 0.13, 0.2); dots += `<circle cx="${23 + i * 4.9}" cy="91" r="1.3" fill="${k > 0.5 ? '#E8A04F' : '#24314A'}"/>`; }
  return `
  <rect width="90" height="160" fill="#0A101C"/>
  <ellipse cx="45" cy="52" rx="44" ry="40" fill="#5B7BA6" opacity="0.12" filter="url(#bl8)"/>
  <text x="12" y="17" ${MONO} font-size="2.5" letter-spacing="0.5" fill="#8E9AB0">THE LOOP</text>
  <path d="M12 19.4 L78 19.2" stroke="#24314A" stroke-width="0.3"/>
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#3E5070" stroke-width="0.5" stroke-dasharray="1.6 1.2"/>
  <circle cx="${dx.toFixed(2)}" cy="${dy.toFixed(2)}" r="1.4" fill="#E8A04F" opacity="${spin.toFixed(3)}"/>
  <circle cx="${dx.toFixed(2)}" cy="${dy.toFixed(2)}" r="3" fill="#E8A04F" opacity="${(0.3 * spin).toFixed(3)}" filter="url(#bl1)"/>
  ${nodes}
  <g opacity="${ref.toFixed(3)}"><path d="M28 47 Q30 34 38 30.6" stroke="#E8A04F" stroke-width="0.5" fill="none" stroke-dasharray="1 0.7"/>
    ${chip(45, 50, 30, '+ “who else?”', 1, { amber: true, fs: 2.4 })}</g>
  <g opacity="${tens.toFixed(3)}"><text x="45" y="84.6" text-anchor="middle" ${F} font-weight="800" font-size="3.4" fill="#F5F3EE">10 conversations / day</text>${dots}</g>`;
}

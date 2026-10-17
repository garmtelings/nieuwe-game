// =============================================================
//  De plattegrond: maakt elke keer een nieuwe map met kamers en gangen.
//  Tegels: 0 = muur, 1 = kamer, 2 = gang, 3 = deuropening
// =============================================================

function randInt(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }

function schud(lijst) {
  const l = lijst.slice();
  for (let i = l.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [l[i], l[j]] = [l[j], l[i]];
  }
  return l;
}

class MinHeap {
  constructor() { this.k = []; this.v = []; }
  get size() { return this.k.length; }
  push(key, val) {
    const k = this.k, v = this.v;
    let i = k.length; k.push(key); v.push(val);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= k[i]) break;
      [k[p], k[i]] = [k[i], k[p]]; [v[p], v[i]] = [v[i], v[p]];
      i = p;
    }
  }
  pop() {
    const k = this.k, v = this.v;
    const top = v[0], lk = k.pop(), lv = v.pop();
    if (k.length) {
      k[0] = lk; v[0] = lv;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < k.length && k[l] < k[m]) m = l;
        if (r < k.length && k[r] < k[m]) m = r;
        if (m === i) break;
        [k[m], k[i]] = [k[i], k[m]]; [v[m], v[i]] = [v[i], v[m]];
        i = m;
      }
    }
    return top;
  }
}

function maakKaart(cfg) {
  for (let poging = 0; poging < 50; poging++) {
    const k = probeerKaart(cfg);
    if (k) return k;
  }
  throw new Error('Kon geen map maken');
}

function probeerKaart(cfg) {
  const n = cfg.aantalKamers;
  const W = Math.max(36, Math.ceil(Math.sqrt(n) * 10)), H = W;
  const N = W * H;
  const type = new Uint8Array(N);
  const owner = new Int16Array(N).fill(-1);
  const ringVan = new Int16Array(N).fill(-1);
  const hoek = new Uint8Array(N);
  const idx = (x, y) => y * W + x;

  // --- Kamers neerzetten ---
  const kamers = [];
  for (let t = 0; t < 6000 && kamers.length < n; t++) {
    const w = randInt(3, 6), h = randInt(3, 6);
    const x = randInt(2, W - w - 2), y = randInt(2, H - h - 2);
    let past = true;
    for (const r of kamers) {
      if (x - 3 < r.x + r.w && x + w + 3 > r.x && y - 3 < r.y + r.h && y + h + 3 > r.y) { past = false; break; }
    }
    if (!past) continue;
    const id = kamers.length;
    const tegels = [];
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) {
      type[idx(xx, yy)] = 1; owner[idx(xx, yy)] = id; tegels.push(idx(xx, yy));
    }
    for (let yy = y - 1; yy <= y + h; yy++) for (let xx = x - 1; xx <= x + w; xx++) {
      if (xx >= x && xx < x + w && yy >= y && yy < y + h) continue;
      ringVan[idx(xx, yy)] = id;
      if ((xx === x - 1 || xx === x + w) && (yy === y - 1 || yy === y + h)) hoek[idx(xx, yy)] = 1;
    }
    kamers.push({
      id, x, y, w, h, tegels,
      cx: x + Math.floor(w / 2), cy: y + Math.floor(h / 2),
      heeftDeur: Math.random() < cfg.kansKamerMetDeur,
      deuropeningen: [],
    });
  }
  if (kamers.length < Math.max(2, cfg.aantalSleutels + cfg.aantalScherven)) return null;

  // --- Welke kamers verbinden we? (kortste netwerk + een paar extra rondjes) ---
  const afstand = (a, b) => Math.hypot(a.cx - b.cx, a.cy - b.cy);
  const verbindingen = [];
  const inBoom = [0], rest = new Set(kamers.map(k => k.id).slice(1));
  while (rest.size) {
    let beste = null, besteD = Infinity;
    for (const a of inBoom) for (const b of rest) {
      const d = afstand(kamers[a], kamers[b]);
      if (d < besteD) { besteD = d; beste = [a, b]; }
    }
    verbindingen.push(beste); inBoom.push(beste[1]); rest.delete(beste[1]);
  }
  const heeft = (a, b) => verbindingen.some(([p, q]) => (p === a && q === b) || (p === b && q === a));
  for (const k of kamers) {
    if (Math.random() > 0.25) continue;
    const buren = kamers.filter(o => o !== k && !heeft(k.id, o.id))
      .sort((p, q) => afstand(k, p) - afstand(k, q));
    if (buren.length) verbindingen.push([k.id, buren[0].id]);
  }

  // --- Gangen graven (kortste weg met zo min mogelijk bochten) ---
  const DX = [1, -1, 0, 0], DY = [0, 0, 1, -1];
  function kosten(i, a, b) {
    const x = i % W, y = (i / W) | 0;
    if (x <= 0 || y <= 0 || x >= W - 1 || y >= H - 1) return Infinity;
    const t = type[i];
    if (t === 1 || t === 3) return (owner[i] === a || owner[i] === b) ? 1 : Infinity;
    if (t === 2) return 0.6;
    if (hoek[i]) return Infinity;
    if (ringVan[i] >= 0) return (ringVan[i] === a || ringVan[i] === b) ? 8 : Infinity;
    return 1;
  }
  function zoekGang(a, b) {
    const start = idx(kamers[a].cx, kamers[a].cy), doel = idx(kamers[b].cx, kamers[b].cy);
    const dist = new Float64Array(N * 4).fill(Infinity);
    const vorige = new Int32Array(N * 4).fill(-1);
    const heap = new MinHeap();
    for (let d = 0; d < 4; d++) { dist[start * 4 + d] = 0; heap.push(0, start * 4 + d); }
    while (heap.size) {
      const s = heap.pop();
      const i = s >> 2, dir = s & 3;
      if (i === doel) {
        const pad = [];
        for (let c = s; c !== -1; c = vorige[c]) pad.push(c >> 2);
        return pad.reverse();
      }
      const x = i % W, y = (i / W) | 0;
      for (let d = 0; d < 4; d++) {
        const nx = x + DX[d], ny = y + DY[d];
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const ni = idx(nx, ny);
        const c = kosten(ni, a, b);
        if (c === Infinity) continue;
        const nd = dist[s] + c + (d !== dir ? 2 : 0);
        const ns = ni * 4 + d;
        if (nd < dist[ns]) { dist[ns] = nd; vorige[ns] = s; heap.push(nd, ns); }
      }
    }
    return null;
  }

  const gangen = [];
  for (const [a, b] of verbindingen) {
    const pad = zoekGang(a, b);
    if (!pad) continue;
    const nieuw = [];
    for (const i of pad) {
      if (type[i] !== 0) continue;
      if (ringVan[i] >= 0) {
        type[i] = 3; owner[i] = ringVan[i];
        kamers[ringVan[i]].deuropeningen.push(i);
      } else {
        type[i] = 2; nieuw.push(i);
      }
    }
    if (nieuw.length >= 2) gangen.push(nieuw);
  }

  // --- Check: kun je overal komen? ---
  const gezien = new Uint8Array(N);
  const rij = [idx(kamers[0].cx, kamers[0].cy)];
  gezien[rij[0]] = 1;
  while (rij.length) {
    const i = rij.pop(), x = i % W, y = (i / W) | 0;
    for (let d = 0; d < 4; d++) {
      const ni = idx(x + DX[d], y + DY[d]);
      if (!gezien[ni] && type[ni] !== 0) { gezien[ni] = 1; rij.push(ni); }
    }
  }
  if (!kamers.every(k => gezien[idx(k.cx, k.cy)])) return null;

  return { W, H, type, owner, kamers, gangen };
}

// =============================================================
//  Het spel zelf (3D, first-person). Getallen staan in config.js
// =============================================================
(function () {
  const CFG = INSTELLINGEN;
  const VERSIE = 3;   // zie je dit nummer op het startscherm, dan heb je de nieuwste versie
  const T = 3;          // grootte van één tegel in meters
  const MUUR_H = 3;     // hoogte van muren
  const OOG = 1.6;      // ooghoogte van de speler
  const SPELER_R = 0.35, ZOMBIE_R = 0.35;

  let kaart, W, H;
  let scene, camera, renderer, flitsLicht, wapenModel;
  let deuren = [], deurOp, items = [], zombies = [];
  let speler, staat = 'start', geenLock = false, hadLock = false, bezocht, minimapAan = CFG.minimap, minimapCd = 0;
  const toetsen = {};
  // mobiel: aanraakbesturing
  let touchModus = matchMedia('(pointer: coarse)').matches;
  const joy = { x: 0, y: 0, id: null, cx: 0, cy: 0 }, kijk = { id: null, x: 0, y: 0 };
  let vuurIngedrukt = false;
  const $ = id => document.getElementById(id);

  // ---------- hulpjes ----------
  const idx = (x, y) => y * W + x;
  const tegel = p => Math.floor(p / T);
  const midden = t => t * T + T / 2;

  function deurDicht(d) { return d.open < 0.8; }

  function loopbaarIdx(i) {
    if (kaart.type[i] === 0) return false;
    const d = deurOp[i];
    return !(d >= 0 && deurDicht(deuren[d]));
  }
  function loopbaar(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= W || ty >= H) return false;
    return loopbaarIdx(idx(tx, ty));
  }

  // botst een cirkel (x, z, r) tegen een muur of dichte deur?
  function botst(x, z, r) {
    const x0 = tegel(x - r), x1 = tegel(x + r), z0 = tegel(z - r), z1 = tegel(z + r);
    for (let ty = z0; ty <= z1; ty++) for (let tx = x0; tx <= x1; tx++) {
      if (tx < 0 || ty < 0 || tx >= W || ty >= H) return true;
      const i = idx(tx, ty);
      let ax, az, bx, bz;
      if (kaart.type[i] === 0) { ax = tx * T; az = ty * T; bx = ax + T; bz = az + T; }
      else if (deurOp[i] >= 0 && deurDicht(deuren[deurOp[i]])) {
        const d = deuren[deurOp[i]];
        if (d.spanX) { ax = tx * T; bx = ax + T; az = d.cz - 0.15; bz = d.cz + 0.15; }
        else { az = ty * T; bz = az + T; ax = d.cx - 0.15; bx = d.cx + 0.15; }
      } else continue;
      const px = Math.max(ax, Math.min(x, bx)), pz = Math.max(az, Math.min(z, bz));
      if ((x - px) ** 2 + (z - pz) ** 2 < r * r) return true;
    }
    return false;
  }

  function beweeg(o, dx, dz, r) {
    if (!botst(o.x + dx, o.z, r)) o.x += dx;
    if (!botst(o.x, o.z + dz, r)) o.z += dz;
  }

  // gaat een dichte deur tussen a en b door?
  function doorDeur(d, ax, az, bx, bz) {
    return d.spanX ? Math.sign(az - d.cz) !== Math.sign(bz - d.cz)
                   : Math.sign(ax - d.cx) !== Math.sign(bx - d.cx);
  }

  // kan a b zien?
  function zicht(ax, az, bx, bz) {
    const dx = bx - ax, dz = bz - az;
    const stappen = Math.ceil(Math.hypot(dx, dz) / 0.25);
    for (let s = 1; s < stappen; s++) {
      const tx = tegel(ax + dx * s / stappen), ty = tegel(az + dz * s / stappen);
      const i = idx(tx, ty);
      if (kaart.type[i] === 0) return false;
      const d = deurOp[i];
      if (d >= 0 && deurDicht(deuren[d]) && doorDeur(deuren[d], ax, az, bx, bz)) return false;
    }
    return true;
  }

  // kortste route over de tegels (zombies)
  function zoekPad(van, naar) {
    if (van === naar) return [];
    const vorige = new Int32Array(W * H).fill(-1);
    vorige[van] = van;
    const rij = [van];
    for (let k = 0; k < rij.length; k++) {
      const c = rij[k], x = c % W, y = (c / W) | 0;
      const buren = [c + 1, c - 1, c + W, c - W];
      if (x === W - 1) buren[0] = -1;
      if (x === 0) buren[1] = -1;
      for (const n of buren) {
        if (n < 0 || n >= W * H || vorige[n] !== -1 || !loopbaarIdx(n)) continue;
        vorige[n] = c;
        if (n === naar) {
          const pad = [];
          for (let p = n; p !== van; p = vorige[p]) pad.push(p);
          return pad.reverse();
        }
        rij.push(n);
      }
    }
    return null;
  }

  function tegelsInBuurt(start, diepte) {
    const gezien = new Map([[start, 0]]), rij = [start], uit = [];
    for (let k = 0; k < rij.length; k++) {
      const c = rij[k], d = gezien.get(c);
      uit.push(c);
      if (d >= diepte) continue;
      for (const n of [c + 1, c - 1, c + W, c - W]) {
        if (n < 0 || n >= W * H || gezien.has(n) || !loopbaarIdx(n)) continue;
        gezien.set(n, d + 1); rij.push(n);
      }
    }
    return uit;
  }

  // ---------- geluid (zelf gemaakt met WebAudio) ----------
  let ac, ruisBuf, stilAudio;
  function audio() {
    if (!ac) {
      // iPhone: ook geluid als de telefoon op 'stil' staat (anders hoor je niks)
      try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { /* oud toestel */ }
      ac = new (window.AudioContext || window.webkitAudioContext)();
      ruisBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
      const d = ruisBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    return ac;
  }

  // Telefoons zetten geluid soms op 'pauze' (bij de start, na een ander app of een telefoontje).
  // Bij elke aanraking zetten we het weer aan.
  function ontgrendelAudio() {
    const a = audio();
    if (a.state !== 'running' && !document.hidden) a.resume().catch?.(() => {});
    // oudere iPhones: een stil geluidje afspelen zorgt dat de 'stil'-knop het spel niet dempt
    if (!navigator.audioSession && !stilAudio && /iPhone|iPad|iPod/.test(navigator.userAgent)) {
      const n = 4410, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
      const tekst = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
      tekst(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); tekst(8, 'WAVEfmt ');
      v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
      v.setUint32(24, 44100, true); v.setUint32(28, 88200, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
      tekst(36, 'data'); v.setUint32(40, n * 2, true);
      stilAudio = new Audio(URL.createObjectURL(new Blob([buf], { type: 'audio/wav' })));
      stilAudio.loop = true;
      stilAudio.play().catch(() => { stilAudio = null; });
    }
  }

  function geluid(soort, afstand = 0) {
    try {
      const a = audio(), t = a.currentTime;
      const vol = Math.max(0, 1 - afstand / 25);
      if (vol <= 0) return;
      const g = a.createGain(); g.connect(a.destination);
      const ruis = (dur, freq, v) => {
        const s = a.createBufferSource(); s.buffer = ruisBuf;
        const f = a.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq;
        s.connect(f); f.connect(g);
        g.gain.setValueAtTime(v * vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
        s.start(t); s.stop(t + dur);
      };
      const toon = (vorm, f0, f1, dur, v, start = 0) => {
        const o = a.createOscillator(); o.type = vorm;
        o.frequency.setValueAtTime(f0, t + start); o.frequency.exponentialRampToValueAtTime(f1, t + start + dur);
        const og = a.createGain(); og.connect(g); o.connect(og);
        og.gain.setValueAtTime(v * vol, t + start); og.gain.exponentialRampToValueAtTime(0.001, t + start + dur);
        o.start(t + start); o.stop(t + start + dur);
      };
      switch (soort) {
        case 'schot': ruis(0.18, 2200, 0.6); toon('square', 180, 60, 0.08, 0.2); break;
        case 'herlaad': toon('square', 900, 700, 0.04, 0.12); toon('square', 600, 500, 0.05, 0.12, 0.35); break;
        case 'pak': toon('sine', 660, 1320, 0.18, 0.25); break;
        case 'au': toon('sawtooth', 160, 60, 0.3, 0.25); break;
        case 'raak': toon('square', 140, 70, 0.1, 0.18); break;
        case 'grom': toon('sawtooth', 95, 55, 0.8, 0.12); toon('sawtooth', 70, 50, 0.9, 0.1, 0.05); break;
        case 'deur': ruis(0.45, 350, 0.35); break;
        case 'leeg': toon('square', 1200, 1000, 0.03, 0.08); break;
        case 'win': [523, 659, 784, 1047].forEach((f, k) => toon('triangle', f, f, 0.3, 0.2, k * 0.15)); break;
      }
    } catch (e) { /* geen geluid, geen probleem */ }
  }

  // ---------- achtergrondmuziek ----------
  // Rustige piano met veel galm en stiltes ertussen. De muziek wordt tijdens het spelen
  // steeds opnieuw verzonnen, dus het klinkt nooit precies hetzelfde.
  const opslag = {
    lees(k, std) { try { const v = localStorage.getItem('nieuweGame.' + k); return v === null ? std : JSON.parse(v); } catch (e) { return std; } },
    schrijf(k, v) { try { localStorage.setItem('nieuweGame.' + k, JSON.stringify(v)); } catch (e) { /* niet erg */ } },
  };
  let muziekAan = opslag.lees('muziek', CFG.muziekAan);
  let muziekVolume = opslag.lees('muziekVolume', CFG.muziekVolume);
  let muziekBus = null, muziekVolgende = 0, muziekTimer = null, akkoordNr = 0;

  const AKKOORDEN = [
    [48, 55, 64, 71], // Cmaj7
    [45, 52, 60, 67], // Am7
    [41, 48, 57, 64], // Fmaj7
    [43, 50, 59, 62], // G
    [40, 47, 55, 62], // Em7
  ];
  const TOONLADDER = [0, 2, 4, 7, 9, 11];

  function muziekKlaar() {
    const a = audio();
    if (!muziekBus) {
      muziekBus = a.createGain(); muziekBus.gain.value = 0;
      const filter = a.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 2800;
      const len = a.sampleRate * 3.5, buf = a.createBuffer(2, len, a.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const d = buf.getChannelData(ch);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
      }
      const galm = a.createConvolver(); galm.buffer = buf;
      const nat = a.createGain(); nat.gain.value = 0.45;
      muziekBus.connect(filter); filter.connect(a.destination);
      filter.connect(galm); galm.connect(nat); nat.connect(a.destination);
    }
    return a;
  }

  function pianoNoot(a, midi, t, sterkte, duur) {
    const f = 440 * Math.pow(2, (midi - 69) / 12);
    [[1, 1], [2, 0.35], [3, 0.12], [4, 0.06]].forEach(([h, amp], k) => {
      const o = a.createOscillator(); o.type = 'sine';
      o.frequency.value = f * h; o.detune.value = (Math.random() - 0.5) * 6;
      const g = a.createGain(), d = duur / (1 + k * 0.8);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(sterkte * amp * 3, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(g); g.connect(muziekBus);
      o.start(t); o.stop(t + d + 0.05);
    });
  }

  function speelFrase(a, t) {
    akkoordNr = (akkoordNr + 1 + (Math.random() < 0.3 ? 1 : 0)) % AKKOORDEN.length;
    const ak = AKKOORDEN[akkoordNr], tel = 0.6 + Math.random() * 0.25;
    pianoNoot(a, ak[0], t, 0.09, 7);
    ak.slice(1).forEach((m, k) => pianoNoot(a, m, t + 0.15 * (k + 1), 0.05, 6));
    const akkoordTonen = ak.map(m => m % 12);
    let tijd = t + tel * 2, vorige = 72;
    const aantal = 3 + Math.floor(Math.random() * 5);
    for (let n = 0; n < aantal; n++) {
      if (Math.random() < 0.2) { tijd += tel; continue; }
      const kies = [];
      for (const oct of [60, 72, 84]) for (const s of TOONLADDER) {
        const m = oct + s;
        if (m < 62 || m > 86 || m === vorige || Math.abs(m - vorige) > 7) continue;
        kies.push(m);
        if (akkoordTonen.includes(m % 12)) kies.push(m);
      }
      vorige = kies[Math.floor(Math.random() * kies.length)];
      pianoNoot(a, vorige, tijd, 0.06 + Math.random() * 0.03, 4);
      tijd += tel * (Math.random() < 0.6 ? 1 : 2);
    }
    return tijd - t + tel * 2;
  }

  function muziekLus() {
    clearTimeout(muziekTimer);
    if (!muziekAan || !ac) return;
    if (muziekVolgende < ac.currentTime + 0.5) {
      muziekVolgende = Math.max(muziekVolgende, ac.currentTime + 0.2);
      const lengte = speelFrase(ac, muziekVolgende);
      // soms een lange stilte, net als in Minecraft
      muziekVolgende += lengte + (Math.random() < 0.35 ? 5 + Math.random() * 10 : 0.8);
    }
    muziekTimer = setTimeout(muziekLus, 300);
  }

  function zetMuziek(aan) {
    muziekAan = aan; opslag.schrijf('muziek', aan);
    if (!ac) return;
    muziekKlaar();
    muziekBus.gain.cancelScheduledValues(ac.currentTime);
    muziekBus.gain.setTargetAtTime(aan ? muziekVolume : 0, ac.currentTime, 0.3);
    if (aan) muziekLus(); else clearTimeout(muziekTimer);
  }

  function zetMuziekVolume(v) {
    muziekVolume = v; opslag.schrijf('muziekVolume', v);
    if (muziekBus && muziekAan) muziekBus.gain.setTargetAtTime(v, ac.currentTime, 0.1);
  }

  function wisselMuziek() {
    zetMuziek(!muziekAan);
    bericht(muziekAan ? 'Muziek aan' : 'Muziek uit', 1);
  }

  // ---------- 3D-modellen ----------
  function ruisTextuur() {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'), img = g.createImageData(64, 64);
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
      let v = 190 + Math.random() * 65;
      if (x < 2 || y < 2) v *= 0.75;
      const p = (y * 64 + x) * 4;
      img.data[p] = img.data[p + 1] = img.data[p + 2] = v; img.data[p + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.magFilter = THREE.NearestFilter;
    return t;
  }

  function pistoolModel(soort) {
    const goed = soort === 'goed';
    const m = new THREE.MeshLambertMaterial({ color: goed ? 0xe0b030 : 0x60666e, emissive: goed ? 0x442800 : 0x111111 });
    const m2 = new THREE.MeshLambertMaterial({ color: goed ? 0xb02020 : 0x2a2a2a });
    const g = new THREE.Group();
    const loop = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.34), m); g.add(loop);
    const greep = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.2, 0.09), m2);
    greep.position.set(0, -0.12, 0.1); greep.rotation.x = 0.25; g.add(greep);
    if (goed) {
      const vizier = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.04, 0.2), m2);
      vizier.position.set(0, 0.07, -0.02); g.add(vizier);
    }
    return g;
  }

  function itemModel(soort) {
    if (soort === 'sleutel') {
      const m = new THREE.MeshLambertMaterial({ color: 0xffcc33, emissive: 0x664400 });
      const g = new THREE.Group();
      const oog = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.04, 8, 16), m); oog.position.x = -0.2; g.add(oog);
      const as = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.06, 0.06), m); as.position.x = 0.08; g.add(as);
      for (const x of [0.16, 0.22]) {
        const tand = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.1, 0.06), m); tand.position.set(x, -0.07, 0); g.add(tand);
      }
      return g;
    }
    if (soort === 'scherf') {
      const m = new THREE.MeshLambertMaterial({ color: 0x77e8ff, emissive: 0x1199bb, transparent: true, opacity: 0.9 });
      const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.22), m); s.scale.y = 1.7;
      return s;
    }
    const p = pistoolModel(soort); p.scale.setScalar(1.6);
    return p;
  }

  function zombieModel() {
    const huid = new THREE.MeshLambertMaterial({ color: 0x6f8f4e });
    const shirt = new THREE.MeshLambertMaterial({ color: 0x4a3f5c });
    const broek = new THREE.MeshLambertMaterial({ color: 0x2e2e3a });
    const oogM = new THREE.MeshBasicMaterial({ color: 0xff2200 });
    const g = new THREE.Group(); g.rotation.order = 'YXZ';
    const box = (w, h, d, m) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    const been = x => { const p = new THREE.Group(); p.position.set(x, 0.85, 0); const b = box(0.22, 0.85, 0.22, broek); b.position.y = -0.425; p.add(b); g.add(p); return p; };
    const arm = x => { const p = new THREE.Group(); p.position.set(x, 1.5, 0); const b = box(0.17, 0.7, 0.17, huid); b.position.y = -0.35; p.add(b); p.rotation.x = -Math.PI / 2; g.add(p); return p; };
    const beenL = been(-0.13), beenR = been(0.13);
    const romp = box(0.6, 0.7, 0.32, shirt); romp.position.y = 1.2; g.add(romp);
    const hoofd = box(0.38, 0.38, 0.38, huid); hoofd.position.y = 1.75; hoofd.rotation.z = 0.15; g.add(hoofd);
    for (const x of [-0.09, 0.09]) { const o = box(0.08, 0.05, 0.02, oogM); o.position.set(x, 1.78, 0.2); g.add(o); }
    const armL = arm(-0.39), armR = arm(0.39);
    return { groep: g, armL, armR, beenL, beenR, mats: [huid, shirt, broek] };
  }

  // ---------- wereld bouwen ----------
  function bouwWereld() {
    if (scene) scene.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose?.(); });
    kaart = maakKaart(CFG); W = kaart.W; H = kaart.H;
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050608);
    scene.fog = new THREE.Fog(0x050608, 5, 30);

    scene.add(new THREE.AmbientLight(0xffffff, 0.22));
    scene.add(new THREE.HemisphereLight(0x8899aa, 0x221a10, 0.35));

    camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.05, 100);
    camera.rotation.order = 'YXZ';
    scene.add(camera);
    const zaklamp = new THREE.SpotLight(0xfff2d0, 1.7, 30, 0.55, 0.5, 1.2);
    zaklamp.position.set(0.2, -0.1, 0);
    zaklamp.target.position.set(0, 0, -1);
    camera.add(zaklamp, zaklamp.target);
    flitsLicht = new THREE.PointLight(0xffcc66, 0, 10);
    flitsLicht.position.set(0.2, -0.1, -0.6);
    camera.add(flitsLicht);

    // vloer en muren
    const tex = ruisTextuur();
    const vloerTegels = [], muurTegels = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = idx(x, y);
      if (kaart.type[i] !== 0) { vloerTegels.push(i); continue; }
      let naastVloer = false;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < W && ny < H && kaart.type[idx(nx, ny)] !== 0) naastVloer = true;
      }
      if (naastVloer) muurTegels.push(i);
    }
    const m4 = new THREE.Matrix4(), kleur = new THREE.Color();
    const vloerGeo = new THREE.PlaneGeometry(T, T); vloerGeo.rotateX(-Math.PI / 2);
    const vloer = new THREE.InstancedMesh(vloerGeo, new THREE.MeshLambertMaterial({ map: tex }), vloerTegels.length);
    const kamerKleuren = kaart.kamers.map(() => new THREE.Color().setHSL(0.05 + Math.random() * 0.1, 0.25, 0.42 + Math.random() * 0.1));
    vloerTegels.forEach((i, k) => {
      m4.makeTranslation(midden(i % W), 0, midden((i / W) | 0));
      vloer.setMatrixAt(k, m4);
      vloer.setColorAt(k, kaart.type[i] === 1 ? kamerKleuren[kaart.owner[i]] : kleur.setHex(0x3c4048));
    });
    scene.add(vloer);

    const muren = new THREE.InstancedMesh(new THREE.BoxGeometry(T, MUUR_H, T), new THREE.MeshLambertMaterial({ map: tex }), muurTegels.length);
    muurTegels.forEach((i, k) => {
      const x = i % W, y = (i / W) | 0;
      m4.makeTranslation(midden(x), MUUR_H / 2, midden(y));
      muren.setMatrixAt(k, m4);
      let bijKamer = false;
      for (const n of [i + 1, i - 1, i + W, i - W]) if (kaart.type[n] === 1) bijKamer = true;
      muren.setColorAt(k, kleur.setHex(bijKamer ? 0x8a7560 : 0x5a5f66));
    });
    scene.add(muren);

    const plafond = new THREE.Mesh(new THREE.PlaneGeometry(W * T, H * T), new THREE.MeshLambertMaterial({ color: 0x1c1c22 }));
    plafond.rotation.x = Math.PI / 2; plafond.position.set(W * T / 2, MUUR_H, H * T / 2);
    scene.add(plafond);

    // deuren
    deuren = []; deurOp = new Int16Array(W * H).fill(-1);
    const deurMat = new THREE.MeshLambertMaterial({ color: 0x7a4a26, map: tex });
    for (const k of kaart.kamers) {
      if (!k.heeftDeur) continue;
      for (const i of k.deuropeningen) {
        const x = i % W, y = (i / W) | 0;
        const spanX = kaart.type[i - W] === 1 || kaart.type[i + W] === 1;
        const mesh = new THREE.Mesh(spanX ? new THREE.BoxGeometry(T, MUUR_H, 0.2) : new THREE.BoxGeometry(0.2, MUUR_H, T), deurMat);
        const d = { i, cx: midden(x), cz: midden(y), spanX, open: 0, doel: 0, mesh };
        mesh.position.set(d.cx, MUUR_H / 2, d.cz);
        scene.add(mesh);
        deurOp[i] = deuren.length; deuren.push(d);
      }
    }

    // spullen in de kamers
    items = [];
    const bezet = new Set();
    const plekInKamer = k => {
      const vrij = k.tegels.filter(t => !bezet.has(t));
      const t = vrij.length ? vrij[Math.floor(Math.random() * vrij.length)] : k.tegels[0];
      bezet.add(t);
      return { x: midden(t % W) + (Math.random() - 0.5) * 1.2, z: midden((t / W) | 0) + (Math.random() - 0.5) * 1.2 };
    };
    const legNeer = (soort, p) => {
      const mesh = itemModel(soort);
      mesh.position.set(p.x, 1, p.z);
      scene.add(mesh);
      items.push({ soort, x: p.x, z: p.z, mesh, fase: Math.random() * 6 });
    };
    const geschud = schud(kaart.kamers);
    geschud.slice(0, CFG.aantalSleutels).forEach(k => legNeer('sleutel', plekInKamer(k)));
    geschud.slice(CFG.aantalSleutels, CFG.aantalSleutels + CFG.aantalScherven).forEach(k => legNeer('scherf', plekInKamer(k)));
    for (const k of kaart.kamers) {
      if (Math.random() < CFG.kansNormaalPistool) legNeer('normaal', plekInKamer(k));
      if (Math.random() < CFG.kansGoedPistool) legNeer('goed', plekInKamer(k));
    }

    // zombies
    zombies = [];
    const nieuweZombie = t => {
      const m = zombieModel();
      const z = {
        x: midden(t % W), z: midden((t / W) | 0), thuis: t, hp: CFG.zombieLeven,
        ...m, pad: null, padCd: 0, wacht: Math.random() * 2, zichtCd: Math.random() * 0.2,
        jaagt: false, ziet: false, vergeet: 0, slagCd: 0, flits: 0, fase: Math.random() * 6, dood: false, valt: 0,
      };
      m.groep.position.set(z.x, 0, z.z);
      m.groep.rotation.y = Math.random() * Math.PI * 2;
      scene.add(m.groep);
      zombies.push(z);
    };
    schud(kaart.kamers).slice(0, Math.round(kaart.kamers.length * CFG.kansZombieInKamer))
      .forEach(k => { const t = k.tegels.filter(t => !bezet.has(t)); nieuweZombie(t.length ? t[0] : k.tegels[0]); });
    schud(kaart.gangen).slice(0, Math.round(kaart.gangen.length * CFG.kansZombieInGang))
      .forEach(g => nieuweZombie(g[Math.floor(g.length / 2)]));

    // startplek: een gang zo ver mogelijk van zombies
    let kandidaten = [];
    for (let i = 0; i < W * H; i++) if (kaart.type[i] === 2) {
      let min = Infinity;
      for (const z of zombies) min = Math.min(min, Math.hypot(midden(i % W) - z.x, midden((i / W) | 0) - z.z));
      kandidaten.push([min, i]);
    }
    if (!kandidaten.length) kandidaten = kaart.kamers[0].tegels.map(i => [0, i]);
    kandidaten.sort((a, b) => b[0] - a[0]);
    const start = kandidaten[Math.floor(Math.random() * Math.min(8, kandidaten.length))][1];
    const sx = start % W, sy = (start / W) | 0;
    let yaw = 0;
    if (loopbaar(sx + 1, sy)) yaw = -Math.PI / 2; else if (loopbaar(sx - 1, sy)) yaw = Math.PI / 2;
    else if (loopbaar(sx, sy + 1)) yaw = Math.PI;

    speler = {
      x: midden(sx), z: midden(sy), yaw, pitch: 0, hp: 100, revives: CFG.aantalRevives,
      pistool: null, kogels: 0, herladen: 0, vuurCd: 0, terugslag: 0,
      sleutels: 0, scherven: 0, onkwetsbaar: 0, bob: 0, tijd: 0, berichtCd: 0,
    };

    wapenModel = null;
    bezocht = new Uint8Array(W * H);
  }

  function zetWapenModel() {
    if (wapenModel) camera.remove(wapenModel);
    wapenModel = null;
    if (!speler.pistool) return;
    wapenModel = pistoolModel(speler.pistool);
    wapenModel.position.set(0.22, -0.2, -0.45);
    camera.add(wapenModel);
  }

  // ---------- speler ----------
  function bericht(tekst, sec = 2) {
    const b = $('bericht');
    b.textContent = tekst; b.style.opacity = 1;
    clearTimeout(bericht.t);
    bericht.t = setTimeout(() => (b.style.opacity = 0), sec * 1000);
  }

  function raakSpeler(schade) {
    if (speler.onkwetsbaar > 0) return;
    speler.hp = Math.max(0, speler.hp - schade);
    geluid('au');
    const p = $('pijn'); p.style.transition = 'none'; p.style.opacity = 0.6;
    requestAnimationFrame(() => { p.style.transition = 'opacity 0.6s'; p.style.opacity = 0; });
    if (speler.hp <= 0) doodGegaan();
  }

  function schiet() {
    if (!speler.pistool) {
      if (speler.berichtCd <= 0) { bericht('Je hebt nog geen pistool! Zoek er een in de kamers.'); speler.berichtCd = 1.5; }
      return;
    }
    if (speler.herladen > 0 || speler.vuurCd > 0) return;
    if (speler.kogels <= 0) { herlaad(); return; }
    speler.kogels--; speler.vuurCd = 0.28; speler.terugslag = 1;
    geluid('schot');
    flitsLicht.intensity = 3;

    const o = camera.getWorldPosition(new THREE.Vector3());
    const d = camera.getWorldDirection(new THREE.Vector3());
    // hoe ver tot een muur of dichte deur?
    let muurT = 60;
    for (let t = 0.1; t < 60; t += 0.1) {
      const px = o.x + d.x * t, py = o.y + d.y * t, pz = o.z + d.z * t;
      if (py < 0 || py > MUUR_H) { muurT = t; break; }
      const tx = tegel(px), ty = tegel(pz);
      if (tx < 0 || ty < 0 || tx >= W || ty >= H) { muurT = t; break; }
      const i = idx(tx, ty);
      if (kaart.type[i] === 0) { muurT = t; break; }
      const di = deurOp[i];
      if (di >= 0 && deurDicht(deuren[di]) && doorDeur(deuren[di], o.x, o.z, px, pz)) { muurT = t; break; }
    }
    // welke zombie raken we het eerst?
    let raak = null, raakT = muurT;
    const a = d.x * d.x + d.z * d.z;
    if (a > 1e-6) for (const z of zombies) {
      if (z.dood) continue;
      const fx = o.x - z.x, fz = o.z - z.z;
      const b = 2 * (fx * d.x + fz * d.z), c = fx * fx + fz * fz - 0.4 * 0.4;
      const disc = b * b - 4 * a * c;
      if (disc < 0) continue;
      const t = (-b - Math.sqrt(disc)) / (2 * a);
      const y = o.y + d.y * t;
      if (t > 0 && t < raakT && y > 0 && y < 2) { raak = z; raakT = t; }
    }
    if (raak) {
      raak.hp -= speler.pistool === 'goed' ? CFG.schadeGoed : CFG.schadeNormaal;
      raak.flits = 0.12; raak.jaagt = true; raak.vergeet = 5; raak.doel = { x: speler.x, z: speler.z };
      geluid('raak');
      beweeg(raak, d.x * 0.25, d.z * 0.25, ZOMBIE_R);
      if (raak.hp <= 0) { raak.dood = true; raak.weg = 3; }
    }
    if (speler.kogels <= 0) herlaad();
  }

  function herlaad() {
    if (!speler.pistool || speler.herladen > 0 || speler.kogels >= CFG.kogelsPerMagazijn) return;
    speler.herladen = CFG.herlaadTijd;
    geluid('herlaad');
  }

  function wisselDeur() {
    let beste = null, besteD = 2.6;
    for (const d of deuren) {
      const a = Math.hypot(d.cx - speler.x, d.cz - speler.z);
      if (a < besteD) { besteD = a; beste = d; }
    }
    if (!beste) { bericht('Hier is geen deur.', 1); return; }
    if (beste.doel === 1) {
      // dichtdoen mag alleen als er niemand in de deur staat
      const inWeg = o => Math.abs(beste.spanX ? o.z - beste.cz : o.x - beste.cx) < 0.55 &&
                         Math.abs(beste.spanX ? o.x - beste.cx : o.z - beste.cz) < T / 2 + 0.3;
      if (inWeg(speler) || zombies.some(z => !z.dood && inWeg(z))) { bericht('Er staat iets in de weg!', 1); return; }
      beste.doel = 0;
    } else beste.doel = 1;
    geluid('deur');
  }

  function pakOp() {
    for (let k = items.length - 1; k >= 0; k--) {
      const it = items[k];
      if (Math.hypot(it.x - speler.x, it.z - speler.z) > 1.1) continue;
      if (it.soort === 'sleutel' || it.soort === 'scherf') {
        if (it.soort === 'sleutel') speler.sleutels++; else speler.scherven++;
        bericht(it.soort === 'sleutel' ? 'Sleutel gevonden!' : 'Scherf gevonden!');
      } else {
        if (speler.pistool === it.soort || speler.pistool === 'goed') continue;
        if (speler.pistool === 'normaal') {
          // "dan valt de normale automatisch uit je handen"
          const mesh = itemModel('normaal');
          scene.add(mesh);
          items.push({ soort: 'normaal', x: speler.x, z: speler.z, mesh, fase: 0 });
        }
        speler.pistool = it.soort; speler.kogels = CFG.kogelsPerMagazijn; speler.herladen = 0;
        zetWapenModel();
        bericht(it.soort === 'goed' ? 'Goed pistool! (40% damage)' : 'Normaal pistool! (20% damage)');
      }
      geluid('pak');
      scene.remove(it.mesh);
      items.splice(items.indexOf(it), 1);
      if (speler.sleutels >= CFG.aantalSleutels && speler.scherven >= CFG.aantalScherven) gewonnen();
      return;
    }
  }

  function updateSpeler(dt) {
    let vx = 0, vz = 0;
    if (toetsen.KeyW || toetsen.ArrowUp) vz -= 1;
    if (toetsen.KeyS || toetsen.ArrowDown) vz += 1;
    if (toetsen.KeyA || toetsen.ArrowLeft) vx -= 1;
    if (toetsen.KeyD || toetsen.ArrowRight) vx += 1;
    vx += joy.x; vz += joy.y;
    const len = Math.hypot(vx, vz);
    if (len > 0.05) {
      if (len > 1) { vx /= len; vz /= len; }
      const s = Math.sin(speler.yaw), c = Math.cos(speler.yaw), v = CFG.spelerSnelheid * dt;
      beweeg(speler, (vx * c + vz * s) * v, (-vx * s + vz * c) * v, SPELER_R);
      speler.bob += dt * 9 * Math.min(1, len);
    }
    speler.vuurCd -= dt; speler.berichtCd -= dt; speler.onkwetsbaar -= dt; speler.tijd += dt;
    if (speler.herladen > 0) {
      speler.herladen -= dt;
      if (speler.herladen <= 0) { speler.herladen = 0; speler.kogels = CFG.kogelsPerMagazijn; }
    }
    speler.terugslag = Math.max(0, speler.terugslag - dt * 8);
    flitsLicht.intensity = Math.max(0, flitsLicht.intensity - dt * 30);
    pakOp();
    if (vuurIngedrukt) schiet();

    camera.position.set(speler.x, OOG + Math.sin(speler.bob) * 0.05, speler.z);
    camera.rotation.set(speler.pitch, speler.yaw, 0);
    if (wapenModel) {
      const h = speler.herladen > 0 ? Math.sin((speler.herladen / CFG.herlaadTijd) * Math.PI) : 0;
      wapenModel.position.set(0.22, -0.2 - h * 0.15 + Math.sin(speler.bob * 0.5) * 0.008, -0.45 + speler.terugslag * 0.06);
      wapenModel.rotation.x = speler.terugslag * 0.3 - h * 0.9;
    }
  }

  // ---------- zombies ----------
  function updateZombies(dt) {
    for (let k = zombies.length - 1; k >= 0; k--) {
      const z = zombies[k];
      if (z.dood) {
        z.valt = Math.min(1, z.valt + dt * 2.5);
        z.groep.rotation.x = -z.valt * Math.PI / 2;
        z.weg -= dt;
        if (z.weg <= 0) { scene.remove(z.groep); zombies.splice(k, 1); }
        continue;
      }
      z.slagCd -= dt; z.flits -= dt;
      for (const m of z.mats) m.emissive.setHex(z.flits > 0 ? 0x880000 : 0x000000);

      const dx = speler.x - z.x, dz = speler.z - z.z, dist = Math.hypot(dx, dz);
      z.zichtCd -= dt;
      if (z.zichtCd <= 0) {
        z.zichtCd = 0.2;
        z.ziet = dist < CFG.zombieZietAfstand && zicht(z.x, z.z, speler.x, speler.z);
        if (z.ziet) {
          if (!z.jaagt) geluid('grom', dist);
          z.jaagt = true; z.vergeet = 4; z.doel = { x: speler.x, z: speler.z };
        }
      }
      if (z.jaagt && !z.ziet) {
        z.vergeet -= dt;
        if (z.vergeet <= 0) { z.jaagt = false; z.pad = null; }
      }

      let doelX = null, doelZ = null, snel = CFG.zombieSnelheid;
      const mijnTegel = idx(tegel(z.x), tegel(z.z));
      if (z.jaagt) {
        if (z.ziet && dist < 0.95) { /* staat al naast je */ }
        else if (z.ziet && dist < 4) { doelX = speler.x; doelZ = speler.z; }
        else {
          z.padCd -= dt;
          if (z.padCd <= 0 || !z.pad) { z.padCd = 0.5; z.pad = zoekPad(mijnTegel, idx(tegel(z.doel.x), tegel(z.doel.z))); }
          if (z.pad && z.pad.length) {
            const t = z.pad[0]; doelX = midden(t % W); doelZ = midden((t / W) | 0);
            if (Math.hypot(doelX - z.x, doelZ - z.z) < 0.3) z.pad.shift();
          } else if (Math.hypot(z.doel.x - z.x, z.doel.z - z.z) > 0.5) { doelX = z.doel.x; doelZ = z.doel.z; }
          else if (!z.ziet) { z.jaagt = false; z.pad = null; }
        }
      } else {
        snel *= 0.35;
        if (!z.pad || !z.pad.length) {
          z.wacht -= dt;
          if (z.wacht <= 0) {
            const opties = tegelsInBuurt(z.thuis, 4);
            z.pad = zoekPad(mijnTegel, opties[Math.floor(Math.random() * opties.length)]);
            z.wacht = 1 + Math.random() * 3;
          }
        } else {
          const t = z.pad[0]; doelX = midden(t % W); doelZ = midden((t / W) | 0);
          if (Math.hypot(doelX - z.x, doelZ - z.z) < 0.3) z.pad.shift();
          if (!loopbaarIdx(t)) z.pad = null; // deur ging dicht
        }
      }

      if (doelX !== null) {
        const mx = doelX - z.x, mz = doelZ - z.z, ml = Math.hypot(mx, mz);
        if (ml > 0.01) {
          const stap = Math.min(ml, snel * dt);
          beweeg(z, mx / ml * stap, mz / ml * stap, ZOMBIE_R);
          z.groep.rotation.y = Math.atan2(mx, mz);
          z.fase += dt * snel * 3;
        }
      }
      if (z.ziet && dist < 2) z.groep.rotation.y = Math.atan2(dx, dz);

      // niet in elkaar lopen
      for (const o of zombies) {
        if (o === z || o.dood) continue;
        const ox = z.x - o.x, oz = z.z - o.z, od = Math.hypot(ox, oz);
        if (od > 0.01 && od < 0.75) beweeg(z, ox / od * (0.75 - od) * 0.5, oz / od * (0.75 - od) * 0.5, ZOMBIE_R);
      }
      // niet in de speler lopen
      if (dist < 0.8 && dist > 0.01) beweeg(z, -dx / dist * (0.8 - dist), -dz / dist * (0.8 - dist), ZOMBIE_R);

      if (z.ziet && dist < 1.2 && z.slagCd <= 0 && staat === 'spelen') {
        z.slagCd = CFG.zombieSlagTijd;
        z.armL.rotation.x = z.armR.rotation.x = -Math.PI / 2 - 0.6;
        raakSpeler(CFG.zombieSchade);
      }

      // loopanimatie
      const zwaai = Math.sin(z.fase) * 0.5;
      z.beenL.rotation.x = zwaai; z.beenR.rotation.x = -zwaai;
      z.armL.rotation.x += (-Math.PI / 2 + zwaai * 0.3 - z.armL.rotation.x) * Math.min(1, dt * 6);
      z.armR.rotation.x += (-Math.PI / 2 - zwaai * 0.3 - z.armR.rotation.x) * Math.min(1, dt * 6);
      z.groep.position.set(z.x, 0, z.z);
    }
  }

  function updateWereld(dt) {
    for (const d of deuren) {
      d.open += Math.sign(d.doel - d.open) * Math.min(Math.abs(d.doel - d.open), dt * 2.5);
      d.mesh.position.y = MUUR_H / 2 + d.open * MUUR_H * 0.97;
    }
    for (const it of items) {
      it.fase += dt;
      it.mesh.rotation.y += dt * 1.5;
      it.mesh.position.set(it.x, 1 + Math.sin(it.fase * 2) * 0.1, it.z);
    }
  }

  // ---------- scherm (HUD + kaartje) ----------
  function updateHud() {
    $('nSleutels').textContent = speler.sleutels;
    $('nScherven').textContent = speler.scherven;
    $('totSleutels').textContent = CFG.aantalSleutels;
    $('totScherven').textContent = CFG.aantalScherven;
    $('levenVul').style.width = speler.hp + '%';
    $('levenVul').style.background = speler.hp > 50 ? '#4caf50' : speler.hp > 25 ? '#ffb300' : '#e53935';
    $('levenTekst').textContent = Math.ceil(speler.hp) + '%';
    $('revives').textContent = speler.revives > 0 ? `Revive: ${speler.revives}x` : '';
    let w = 'Geen pistool';
    if (speler.pistool) {
      const naam = speler.pistool === 'goed' ? 'Goed pistool' : 'Normaal pistool';
      w = speler.herladen > 0 ? `${naam} – herladen...` : `${naam}  ${speler.kogels}/${CFG.kogelsPerMagazijn}`;
    }
    $('wapen').textContent = w;
  }

  function updateMinimap(dt) {
    const c = $('minimap');
    c.style.display = minimapAan ? 'block' : 'none';
    const tx = tegel(speler.x), ty = tegel(speler.z), i = idx(tx, ty);
    for (let y = ty - 2; y <= ty + 2; y++) for (let x = tx - 2; x <= tx + 2; x++)
      if (x >= 0 && y >= 0 && x < W && y < H) bezocht[idx(x, y)] = 1;
    if (kaart.type[i] === 1) {
      const k = kaart.kamers[kaart.owner[i]];
      for (let y = k.y - 1; y <= k.y + k.h; y++) for (let x = k.x - 1; x <= k.x + k.w; x++) bezocht[idx(x, y)] = 1;
    }
    minimapCd -= dt;
    if (!minimapAan || minimapCd > 0) return;
    minimapCd = 0.15;
    const g = c.getContext('2d'), s = c.width / W;
    g.clearRect(0, 0, c.width, c.height);
    g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(0, 0, c.width, c.height);
    for (let j = 0; j < W * H; j++) {
      if (!bezocht[j] || kaart.type[j] === 0) continue;
      const d = deurOp[j];
      g.fillStyle = d >= 0 ? (deurDicht(deuren[d]) ? '#b0602a' : '#6b4a30') : kaart.type[j] === 1 ? '#9c8a6e' : '#5f6670';
      g.fillRect((j % W) * s, ((j / W) | 0) * s, s + 0.5, s + 0.5);
    }
    const px = speler.x / T * s, pz = speler.z / T * s;
    g.save(); g.translate(px, pz); g.rotate(-speler.yaw);
    g.fillStyle = '#ff4444';
    g.beginPath(); g.moveTo(0, -5); g.lineTo(3.5, 4); g.lineTo(-3.5, 4); g.closePath(); g.fill();
    g.restore();
  }

  // ---------- schermen (start, pauze, dood, gewonnen) ----------
  function toonScherm(html, metInstellingen = false) {
    const o = $('overlay');
    const inst = metInstellingen ? `
      <div class="instellingen">
        <h2>⚙️ Instellingen</h2>
        <label>🎵 Muziek <button id="knopMuziek" class="schakel"></button></label>
        <label>Volume <input id="muziekVol" type="range" min="0" max="1" step="0.05" value="${muziekVolume}"></label>
      </div>` : '';
    o.innerHTML = `<div class="paneel">${html}${inst}</div>`;
    o.style.display = 'flex';
    $('hud').style.display = staat === 'start' ? 'none' : 'block';
    if (metInstellingen) {
      const knop = $('knopMuziek');
      const toon = () => { knop.textContent = muziekAan ? 'Aan' : 'Uit'; knop.classList.toggle('uit', !muziekAan); };
      toon();
      knop.onclick = () => { audio(); zetMuziek(!muziekAan); toon(); };
      $('muziekVol').oninput = e => zetMuziekVolume(parseFloat(e.target.value));
    }
  }
  function verbergScherm() { $('overlay').style.display = 'none'; $('hud').style.display = 'block'; }

  const UITLEG_TOUCH = `
    <div class="uitleg">
      <p>Er lopen zombies rond in de kamers en gangen. Zoek <b>${CFG.aantalSleutels} sleutels</b> en <b>${CFG.aantalScherven} scherven</b> om te winnen.
      Zoek ook een pistool om jezelf te verdedigen!</p>
      <table>
        <tr><td>links duimen</td><td>lopen</td></tr>
        <tr><td>rechts vegen</td><td>rondkijken</td></tr>
        <tr><td>🔫</td><td>schieten (vasthouden)</td></tr>
        <tr><td>↻</td><td>herladen</td></tr>
        <tr><td>🚪</td><td>deur open / dicht</td></tr>
        <tr><td>🎵</td><td>muziek aan / uit</td></tr>
      </table>
    </div>`;
  const UITLEG_PC = `
    <div class="uitleg">
      <p>Er lopen zombies rond in de kamers en gangen. Zoek <b>${CFG.aantalSleutels} sleutels</b> en <b>${CFG.aantalScherven} scherven</b> om te winnen.
      Zoek ook een pistool om jezelf te verdedigen!</p>
      <table>
        <tr><td><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></td><td>lopen</td></tr>
        <tr><td>muis</td><td>rondkijken</td></tr>
        <tr><td>klik</td><td>schieten</td></tr>
        <tr><td><kbd>R</kbd></td><td>herladen</td></tr>
        <tr><td><kbd>E</kbd></td><td>deur open / dicht</td></tr>
        <tr><td><kbd>M</kbd></td><td>kaartje aan / uit</td></tr>
        <tr><td><kbd>N</kbd></td><td>muziek aan / uit</td></tr>
        <tr><td><kbd>Esc</kbd></td><td>pauze</td></tr>
      </table>
    </div>`;
  const uitleg = () => touchModus ? UITLEG_TOUCH : UITLEG_PC;

  function startScherm() {
    staat = 'start';
    toonScherm(`<h1>Nieuwe Game</h1><p class="sub">ontworpen door Mats · versie ${VERSIE}</p>${uitleg()}
      <button id="knopStart">Spelen</button>`, true);
    $('knopStart').onclick = () => {
      if (touchModus) {
        const el = document.documentElement;
        try { (el.requestFullscreen || el.webkitRequestFullscreen)?.call(el)?.catch?.(() => {}); } catch (e) {}
        try { screen.orientation?.lock?.('landscape')?.catch?.(() => {}); } catch (e) {}
      }
      bouwWereld(); updateHud(); vergrendel();
    };
  }

  function vergrendel() {
    ontgrendelAudio();
    zetMuziek(muziekAan);
    if (touchModus || geenLock) { staat = 'spelen'; verbergScherm(); return; }
    try {
      const p = renderer.domElement.requestPointerLock();
      if (p && p.catch) p.catch(() => lockMislukt());
    } catch (e) { lockMislukt(); }
  }
  function lockMislukt() {
    if (document.pointerLockElement) return;
    if (hadLock) { // Chrome wil na Esc even wachten
      const k = document.querySelector('#overlay button');
      if (k) { k.textContent = 'Nog een keer klikken...'; }
      return;
    }
    geenLock = true; staat = 'spelen'; verbergScherm();
    bericht('Muis vastzetten lukt hier niet: houd de muisknop ingedrukt en sleep om rond te kijken.', 5);
  }

  function pauze() {
    staat = 'pauze';
    loslaten();
    toonScherm(`<h1>Pauze</h1>${uitleg()}<button id="knopVerder">Verder spelen</button>`, true);
    $('knopVerder').onclick = vergrendel;
  }

  function doodGegaan() {
    staat = 'dood';
    if (document.pointerLockElement) document.exitPointerLock();
    if (speler.revives > 0) {
      toonScherm(`<h1>Je bent 100% op!</h1><p>Je kunt nog <b>${speler.revives}x</b> reviven.</p>
        <button id="knopRevive">Revive!</button>`);
      $('knopRevive').onclick = () => {
        speler.revives--; speler.hp = 100; speler.onkwetsbaar = 3;
        bericht('Je leeft weer! Je bent 3 seconden onkwetsbaar.', 3);
        vergrendel();
      };
    } else {
      toonScherm(`<h1>Game over</h1><p>Je had ${speler.sleutels}/${CFG.aantalSleutels} sleutels en ${speler.scherven}/${CFG.aantalScherven} scherven.</p>
        <button id="knopOpnieuw">Opnieuw</button>`);
      $('knopOpnieuw').onclick = () => { bouwWereld(); updateHud(); vergrendel(); };
    }
  }

  function gewonnen() {
    staat = 'gewonnen';
    geluid('win');
    if (document.pointerLockElement) document.exitPointerLock();
    const m = Math.floor(speler.tijd / 60), s = Math.floor(speler.tijd % 60);
    toonScherm(`<h1>Gewonnen!</h1><p>Je hebt alle sleutels en scherven gevonden in <b>${m}:${String(s).padStart(2, '0')}</b>.</p>
      <p class="sub">(Er is niet eens een uitgang!)</p><button id="knopOpnieuw">Nog een keer</button>`);
    $('knopOpnieuw').onclick = () => { bouwWereld(); updateHud(); vergrendel(); };
  }

  // ---------- aanraakbesturing (mobiel) ----------
  function loslaten() {
    joy.x = joy.y = 0; joy.id = kijk.id = null; vuurIngedrukt = false;
    $('stick').style.display = 'none';
    $('tVuur').classList.remove('in');
  }

  function zetTouchModus() {
    if (touchModus) document.body.classList.add('touch');
  }

  function koppelTouch() {
    const knop = (id, actie) => {
      $(id).addEventListener('touchstart', e => { e.preventDefault(); e.stopPropagation(); if (staat === 'spelen') actie(); }, { passive: false });
    };
    knop('tHerlaad', herlaad);
    knop('tDeur', wisselDeur);
    knop('tKaart', () => { minimapAan = !minimapAan; minimapCd = 0; });
    knop('tPauze', pauze);
    knop('tMuziek', wisselMuziek);
    // vuurknop: vasthouden = schieten, en slepen = ook rondkijken
    $('tVuur').addEventListener('touchstart', e => {
      e.preventDefault(); e.stopPropagation();
      if (staat !== 'spelen') return;
      vuurIngedrukt = true; $('tVuur').classList.add('in');
      const t = e.changedTouches[0];
      if (kijk.id === null) { kijk.id = t.identifier; kijk.x = t.clientX; kijk.y = t.clientY; }
    }, { passive: false });

    document.addEventListener('touchstart', e => {
      if (!touchModus) { touchModus = true; zetTouchModus(); }
      if (staat !== 'spelen') return;
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (t.clientX < innerWidth * 0.45 && joy.id === null) {
          joy.id = t.identifier; joy.cx = t.clientX; joy.cy = t.clientY;
          const st = $('stick'); st.style.display = 'block';
          st.style.left = t.clientX + 'px'; st.style.top = t.clientY + 'px';
          $('stickKnop').style.transform = 'translate(-50%, -50%)';
        } else if (kijk.id === null) {
          kijk.id = t.identifier; kijk.x = t.clientX; kijk.y = t.clientY;
        }
      }
    }, { passive: false });

    document.addEventListener('touchmove', e => {
      if (staat !== 'spelen') return;
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (t.identifier === joy.id) {
          let dx = t.clientX - joy.cx, dy = t.clientY - joy.cy;
          const r = 55, l = Math.hypot(dx, dy);
          if (l > r) { dx *= r / l; dy *= r / l; }
          joy.x = dx / r; joy.y = dy / r;
          $('stickKnop').style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
        } else if (t.identifier === kijk.id) {
          const g = CFG.muisGevoeligheid * 2.2;
          speler.yaw -= (t.clientX - kijk.x) * g;
          speler.pitch = Math.max(-1.45, Math.min(1.45, speler.pitch - (t.clientY - kijk.y) * g));
          kijk.x = t.clientX; kijk.y = t.clientY;
        }
      }
    }, { passive: false });

    const einde = e => {
      for (const t of e.changedTouches) {
        if (t.identifier === joy.id) { joy.id = null; joy.x = joy.y = 0; $('stick').style.display = 'none'; }
        if (t.identifier === kijk.id) {
          kijk.id = null;
          if (vuurIngedrukt) { vuurIngedrukt = false; $('tVuur').classList.remove('in'); }
        }
      }
    };
    document.addEventListener('touchend', einde);
    document.addEventListener('touchcancel', einde);
  }

  // ---------- invoer ----------
  function koppelInvoer() {
    addEventListener('keydown', e => {
      toetsen[e.code] = true;
      if (staat !== 'spelen') return;
      if (e.code === 'KeyE') wisselDeur();
      if (e.code === 'KeyR') herlaad();
      if (e.code === 'KeyM') { minimapAan = !minimapAan; minimapCd = 0; }
      if (e.code === 'KeyN') wisselMuziek();
      if (geenLock && (e.code === 'Escape' || e.code === 'KeyP')) pauze();
    });
    addEventListener('keyup', e => { toetsen[e.code] = false; });
    addEventListener('blur', () => { for (const k in toetsen) toetsen[k] = false; });
    addEventListener('mousemove', e => {
      if (staat !== 'spelen') return;
      if (!document.pointerLockElement && !(geenLock && e.buttons)) return;
      speler.yaw -= e.movementX * CFG.muisGevoeligheid;
      speler.pitch = Math.max(-1.45, Math.min(1.45, speler.pitch - e.movementY * CFG.muisGevoeligheid));
    });
    addEventListener('mousedown', e => {
      if (staat === 'spelen' && e.button === 0 && (document.pointerLockElement || geenLock)) schiet();
    });
    document.addEventListener('pointerlockchange', () => {
      if (document.pointerLockElement === renderer.domElement) { hadLock = true; staat = 'spelen'; verbergScherm(); }
      else if (staat === 'spelen') pauze();
    });
    document.addEventListener('pointerlockerror', lockMislukt);
    // geluid aanzetten bij elke tik/klik (nodig op telefoons)
    for (const ev of ['touchend', 'click', 'keydown']) document.addEventListener(ev, ontgrendelAudio, { capture: true, passive: true });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && staat === 'spelen') pauze();
      if (ac) { if (document.hidden) ac.suspend(); else ac.resume(); }
    });
    addEventListener('resize', () => {
      renderer.setSize(innerWidth, innerHeight);
      if (camera) { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
    });
  }

  // ---------- de lus ----------
  const klok = new THREE.Clock();
  function lus() {
    requestAnimationFrame(lus);
    const dt = Math.min(klok.getDelta(), 0.05);
    if (!scene) return;
    if (staat === 'spelen') {
      updateSpeler(dt);
      updateZombies(dt);
      updateWereld(dt);
      updateMinimap(dt);
      updateHud();
    }
    renderer.render(scene, camera);
  }

  renderer = new THREE.WebGLRenderer({ antialias: !touchModus });
  renderer.setPixelRatio(Math.min(devicePixelRatio, touchModus ? 1.25 : 1.5));
  renderer.setSize(innerWidth, innerHeight);
  document.body.prepend(renderer.domElement);
  koppelInvoer();
  koppelTouch();
  zetTouchModus();
  bouwWereld();          // achtergrond voor het startscherm
  camera.position.set(speler.x, OOG, speler.z);
  camera.rotation.set(0, speler.yaw, 0);
  startScherm();
  lus();

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  // alleen voor testen: open index.html#debug
  if (location.hash === '#debug') window.__spel = {
    get speler() { return speler; }, get zombies() { return zombies; }, get items() { return items; },
    get staat() { return staat; }, get joy() { return joy; }, get muziek() { return { aan: muziekAan, volume: muziekVolume, bus: muziekBus && muziekBus.gain.value, ac: ac && ac.state }; }, get deuren() { return deuren; }, kaart: () => kaart, T, idx: (x, y) => idx(x, y),
  };
})();

/* Filamentbestand – statische WebApp.
 * Daten: data/filamente.enc.json (AES-256-GCM, Schlüssel per PBKDF2 aus dem Team-Passwort)
 * Team-Token: data/team.enc.json (gleicher Schlüssel) → automatisches Speichern über die GitHub-Contents-API
 * Sync: Änderungen werden als Operationen gesammelt und beim Speichern auf den neuesten Stand im Repo angewendet
 *       (dadurch werden gleichzeitige Änderungen mehrerer Personen zusammengeführt). Siehe docs/PLAN.md. */
(() => {
  'use strict';

  // ---------- Konfiguration ----------
  const CFG = (() => {
    const h = location.hostname, seg = location.pathname.split('/').filter(Boolean)[0];
    const pages = h.endsWith('.github.io');
    return {
      owner: pages ? h.split('.')[0] : 'cortress',
      repo: pages && seg ? seg : 'filamentbestand',
      branch: 'main',
      dataPath: 'data/filamente.enc.json',
      teamPath: 'data/team.enc.json',
      pollMs: 20000,
      iterations: 600000
    };
  })();
  const LS_CACHE = 'fb.cache.v2', LS_NAME = 'fb.name', LS_UI = 'fb.ui.v2';

  const STANDARD_TYPEN = {
    'PLA': 'PLA', 'PLA+': 'PLA+', 'PLA+ Matte': 'PLA+', 'PLA+ Silk': 'PLA+', 'PLA+ Metal': 'PLA+',
    'PLA+ Composite': 'PLA+', 'PLA+ StoneFill': 'PLA+', 'ecoPLA+': 'PLA+', 'PLA-CF': 'PLA-CF',
    'PETG': 'PETG', 'PETG-CF': 'PETG-CF', 'ABS': 'ABS', 'ABS+': 'ABS+', 'ASA': 'ASA', 'ASA+': 'ASA+',
    'TPU': 'TPU', 'TPU 95A': 'TPU', 'TPU 60A': 'TPU', 'TPU VarioShore': 'TPU',
    'PA (Nylon)': 'PA', 'PA-CF': 'PA-CF', 'PC': 'PC', 'PVA': 'PVA', 'HIPS': 'HIPS'
  };
  const RESIN_TYPEN = ['Standard', 'ABS-Like', 'Water-Washable', 'Tough', 'Flexible', '8K', 'Plant-Based', 'High-Temp', 'Clear', 'Dental', 'Castable', 'Engineering'];
  const FARBEN = {
    schwarz: '#141414', weiß: '#f2f2f2', weiss: '#f2f2f2', grau: '#8a8d93', silber: '#c7cbd1',
    orange: '#ff7a1a', rot: '#e53935', blau: '#1e6fe0', grün: '#2fa84f', gruen: '#2fa84f', gelb: '#f6d02f',
    bronze: '#b87333', stahl: '#6f7b85', stonefill: '#a39b8b', anthrazit: '#383e42', braun: '#7a4b2a',
    natur: '#e8dcc2', beige: '#d9c7a3', gold: '#d4af37', kupfer: '#c26a3a', lila: '#8e44ad', violett: '#8e44ad',
    pink: '#ff5fa2', rosa: '#f6a6c1', türkis: '#1abc9c', cyan: '#19c3e6', olive: '#7d7f3a', holz: '#a07850'
  };

  // ---------- Helfer ----------
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (n, d = 2) => Number(n || 0).toLocaleString('de-DE', { maximumFractionDigits: d });
  const num = v => { const n = parseFloat(String(v ?? '').replace(',', '.')); return isFinite(n) ? n : 0; };
  const uid = () => 'f' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const gesamt = f => num(f.rollen) * num(f.kgProRolle);
  const restKg = u => (num(u.rest) / 100) * num(u.kgProRolle);
  const isLow = f => num(f.mindestbestand) > 0 && num(f.rollen) <= num(f.mindestbestand);
  const label = f => [f.typ, f.farbe].filter(Boolean).join(' · ') + (f.hersteller ? ` (${f.hersteller})` : '');
  const clone = o => (typeof structuredClone === 'function' ? structuredClone(o) : JSON.parse(JSON.stringify(o)));
  const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* voll/privat */ } };
  const lsDel = k => { try { localStorage.removeItem(k); } catch { /* ignore */ } };
  const timeStr = d => d ? new Date(d).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : '–';

  // ---------- Krypto (WebCrypto, AES-256-GCM + PBKDF2-SHA256) ----------
  const te = new TextEncoder(), td = new TextDecoder();
  const b64 = buf => { const b = new Uint8Array(buf); let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(s); };
  const unb64 = s => Uint8Array.from(atob(String(s).replace(/\s/g, '')), c => c.charCodeAt(0));
  const Crypto = {
    newSalt: () => b64(crypto.getRandomValues(new Uint8Array(16))),
    async derive(password, salt, iterations = CFG.iterations) {
      const base = await crypto.subtle.importKey('raw', te.encode(password), 'PBKDF2', false, ['deriveKey']);
      return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: unb64(salt), iterations },
        base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    },
    async encrypt(key, salt, typ, obj) {
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: te.encode('filamentbestand:' + typ) }, key, te.encode(JSON.stringify(obj)));
      return { format: 'filamentbestand-enc', v: 1, typ, kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: CFG.iterations, salt }, iv: b64(iv), ct: b64(ct) };
    },
    async decrypt(key, env) {
      if (!env || env.format !== 'filamentbestand-enc') throw new Error('Unbekanntes Dateiformat');
      const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(env.iv), additionalData: te.encode('filamentbestand:' + env.typ) }, key, unb64(env.ct));
      return JSON.parse(td.decode(pt));
    }
  };

  // Schlüssel als nicht-exportierbarer CryptoKey in IndexedDB („angemeldet bleiben“)
  const KeyStore = {
    db: null,
    open() {
      if (this.db) return this.db;
      this.db = new Promise((res, rej) => {
        const r = indexedDB.open('filamentbestand', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('kv');
        r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
      });
      return this.db;
    },
    async tx(mode, fn) {
      try {
        const db = await this.open();
        return await new Promise((res, rej) => { const t = db.transaction('kv', mode); const r = fn(t.objectStore('kv')); t.oncomplete = () => res(r?.result); t.onerror = () => rej(t.error); });
      } catch { return undefined; }
    },
    get: k => KeyStore.tx('readonly', s => s.get(k)),
    set: (k, v) => KeyStore.tx('readwrite', s => s.put(v, k)),
    clear: () => KeyStore.tx('readwrite', s => s.clear())
  };

  // ---------- Zustand ----------
  let key = null, salt = null, team = { token: '' }, teamSha = null;
  let base = emptyData(), baseSha = null, etag = null, pending = [];
  let db = emptyData();
  let me = lsGet(LS_NAME, '');
  let ui = { q: '', gruppe: '', farbe: '', hersteller: '', knapp: false, sort: { key: 'gruppe', dir: 1 }, view: 'bestand', coll: 'filamente', ...lsGet(LS_UI, {}) };
  if (ui.coll !== 'resin') ui.coll = 'filamente';
  const isResin = () => ui.coll === 'resin';
  const items = () => db[ui.coll] || db.filamente;
  const U = (resin = isResin()) => resin
    ? { one: 'Flasche', many: 'Flaschen', je: 'je Flasche', what: 'Resin' }
    : { one: 'Rolle', many: 'Rollen', je: 'je Rolle', what: 'Filament' };
  const sync = { state: 'locked', last: null, msg: '', busy: false, again: false, timer: null, poll: null };
  let editingId = null;
  const selected = new Set();

  function emptyData() { return { version: 3, aktualisiert: null, typen: { ...STANDARD_TYPEN }, filamente: [], resin: [], inUse: [], drucker: [], verlauf: [] }; }

  function normalizeItem(f) {
    const typ = String(f.typ || '').trim();
    return {
      id: f.id || uid(), typ,
      gruppe: String(f.gruppe || '').trim() || STANDARD_TYPEN[typ] || typ,
      farbe: String(f.farbe || '').trim(), farbcode: f.farbcode || '',
      hersteller: String(f.hersteller || '').trim(),
      rollen: Math.max(0, Math.round(num(f.rollen))),
      kgProRolle: num(f.kgProRolle ?? f.kg ?? 1),
      durchmesser: num(f.durchmesser) || 1.75,
      mindestbestand: Math.max(0, Math.round(num(f.mindestbestand))),
      lagerort: String(f.lagerort || '').trim(), bemerkung: String(f.bemerkung || '').trim(),
      mhd: /^\d{4}-\d{2}$/.test(f.mhd || '') ? f.mhd : ''
    };
  }
  /** Geöffnete Rolle (im Drucker/AMS oder angebrochen im Regal). */
  function normalizeUse(u) {
    const typ = String(u.typ || '').trim();
    return {
      id: u.id || uid(), ref: u.ref || '', typ, gruppe: String(u.gruppe || '').trim() || STANDARD_TYPEN[typ] || typ,
      farbe: String(u.farbe || '').trim(), farbcode: u.farbcode || '', hersteller: String(u.hersteller || '').trim(),
      kgProRolle: num(u.kgProRolle) || 1, durchmesser: num(u.durchmesser) || 1.75,
      rest: Math.max(0, Math.min(100, Math.round(num(u.rest ?? 100)))),
      drucker: u.drucker || '', slot: u.drucker ? String(u.slot || '') : '', geoeffnet: u.geoeffnet || ''
    };
  }
  function normalizePrinter(p) {
    return { id: p.id || uid(), name: String(p.name || 'Drucker').trim().slice(0, 40), slots: Math.max(0, Math.min(16, Math.round(num(p.slots)))), ext: !!p.ext };
  }
  const NORM = { filamente: normalizeItem, resin: normalizeItem, inUse: normalizeUse };
  function normalize(d) {
    d = d && typeof d === 'object' ? d : {};
    const list = Array.isArray(d) ? d : (d.filamente || []);
    return {
      version: 3, aktualisiert: d.aktualisiert || null,
      typen: { ...STANDARD_TYPEN, ...(d.typen || {}) },
      verlauf: Array.isArray(d.verlauf) ? d.verlauf.slice(-1000) : [],
      filamente: list.map(normalizeItem),
      resin: (Array.isArray(d.resin) ? d.resin : []).map(normalizeItem),
      inUse: (Array.isArray(d.inUse) ? d.inUse : []).map(normalizeUse),
      drucker: (Array.isArray(d.drucker) ? d.drucker : []).map(normalizePrinter)
    };
  }

  // ---------- Operationen (Grundlage für Merge) ----------
  function applyOps(data, ops) {
    for (const o of ops) {
      const coll = NORM[o.coll] ? o.coll : 'filamente', L = data[coll], norm = NORM[coll];
      const i = o.id ? L.findIndex(f => f.id === o.id) : -1;
      switch (o.op) {
        case 'add': if (i < 0) L.push(norm(o.item)); break;
        case 'patch': if (i >= 0) L[i] = norm({ ...L[i], ...o.fields, id: o.id }); break;
        case 'delta': if (i >= 0) L[i].rollen = Math.max(0, L[i].rollen + o.d); break;
        case 'del': if (i >= 0) L.splice(i, 1); break;
        case 'typ': data.typen[o.typ] = o.gruppe; break;
        case 'regroup': data.typen[o.typ] = o.gruppe; data.filamente.forEach(f => { if (f.typ === o.typ) f.gruppe = o.gruppe; }); break;
        case 'replace': data[coll] = o.filamente.map(norm); if (coll === 'filamente') data.typen = { ...data.typen, ...(o.typen || {}) }; break;
        case 'drucker': data.drucker = (o.list || []).map(normalizePrinter); break;
      }
      if (o.log) data.verlauf.push(o.log);
      if (o.t && (!data.aktualisiert || o.t > data.aktualisiert)) data.aktualisiert = o.t;
    }
    if (data.verlauf.length > 1000) data.verlauf = data.verlauf.slice(-1000);
    return data;
  }

  function commit(op, text, kg = 0) { commitAll([[op, text, kg]]); }
  /** Mehrere Operationen auf einmal (Bulk-Aktionen, Foto-Import) – ein Render, ein Sync. */
  function commitAll(list) {
    if (!list.length) return;
    const t = new Date().toISOString();
    for (const [op, text, kg = 0] of list) {
      op.t = t;
      if (!op.coll && ['add', 'patch', 'delta', 'del', 'replace'].includes(op.op)) op.coll = ui.coll;
      if (text) op.log = { t, wer: me || '?', text, kg: Math.round(kg * 1000) / 1000 };
      if (text && op.coll === 'resin') op.log.coll = 'resin';
      pending.push(op);
    }
    recompute();
    saveCache();
    render();
    scheduleSync(700);
  }
  function recompute() { db = applyOps(clone(base), pending); }

  // ---------- Lokaler, verschlüsselter Cache ----------
  async function saveCache() {
    if (!key) return;
    try { lsSet(LS_CACHE, await Crypto.encrypt(key, salt, 'cache', { base, baseSha, pending })); } catch (e) { console.warn(e); }
  }
  async function loadCache() {
    const env = lsGet(LS_CACHE, null);
    if (!env || env.kdf?.salt !== salt) return null;
    try { return await Crypto.decrypt(key, env); } catch { return null; }
  }

  // ---------- GitHub-API ----------
  const ghUrl = p => `https://api.github.com/repos/${CFG.owner}/${CFG.repo}/contents/${p}`;
  const ghHeaders = (tok = team.token) => ({ Accept: 'application/vnd.github+json', Authorization: `Bearer ${tok}`, 'X-GitHub-Api-Version': '2022-11-28' });
  async function ghError(r) { const j = await r.json().catch(() => ({})); const e = new Error(`GitHub ${r.status}: ${j.message || r.statusText}`); e.status = r.status; return e; }

  async function ghGet(path, { tok, ifNoneMatch } = {}) {
    const h = ghHeaders(tok);
    if (ifNoneMatch) h['If-None-Match'] = ifNoneMatch;
    const r = await fetch(`${ghUrl(path)}?ref=${CFG.branch}`, { headers: h, cache: 'no-store' });
    if (r.status === 304) return { status: 304 };
    if (r.status === 404) return { status: 404 };
    if (!r.ok) throw await ghError(r);
    const j = await r.json();
    return { status: 200, sha: j.sha, etag: r.headers.get('ETag'), env: JSON.parse(td.decode(unb64(j.content))) };
  }
  async function ghPut(path, env, sha, message, tok) {
    const body = { message, branch: CFG.branch, content: b64(te.encode(JSON.stringify(env, null, 2) + '\n')) };
    if (sha) body.sha = sha;
    const r = await fetch(ghUrl(path), { method: 'PUT', headers: { ...ghHeaders(tok), 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (r.status === 409 || r.status === 422) return { conflict: true };
    if (!r.ok) throw await ghError(r);
    return { sha: (await r.json()).content.sha };
  }

  // ---------- Sync-Engine ----------
  function scheduleSync(ms = 0) { clearTimeout(sync.timer); sync.timer = setTimeout(runSync, ms); }

  async function runSync() {
    if (!key) return;
    if (sync.busy) { sync.again = true; return; }
    if (!team.token) { setCloud(pending.length ? 'pending' : 'readonly'); return; }
    if (!navigator.onLine) { setCloud('offline'); return; }
    sync.busy = true;
    setCloud('syncing');
    try {
      for (let attempt = 0; attempt < 5; attempt++) {
        const r = await ghGet(CFG.dataPath, { ifNoneMatch: etag });
        if (r.status === 200) {
          let remote;
          try { remote = normalize(await Crypto.decrypt(key, r.env)); }
          catch { return lockOut('Das Team-Passwort wurde geändert. Bitte mit dem neuen Passwort entsperren.'); }
          base = remote; baseSha = r.sha; etag = r.etag;
        } else if (r.status === 404) { baseSha = null; etag = null; }
        if (!pending.length) break;

        const sent = pending.slice();
        const next = applyOps(clone(base), sent);
        next.aktualisiert = new Date().toISOString();
        const env = await Crypto.encrypt(key, salt, 'data', next);
        const put = await ghPut(CFG.dataPath, env, baseSha, `Bestand aktualisiert${me ? ' – ' + me : ''}`);
        if (put.conflict) { etag = null; await new Promise(res => setTimeout(res, 300 + Math.random() * 700)); continue; }
        base = next; baseSha = put.sha; etag = null;
        pending = pending.slice(sent.length);
        if (!pending.length) break;
      }
      sync.last = new Date();
      recompute(); await saveCache(); render();
      setCloud(pending.length ? 'pending' : 'synced');
    } catch (e) {
      console.warn('Sync', e);
      if (e.status === 401 || e.status === 403) setCloud('error', 'Team-Token ungültig oder ohne Schreibrecht – bitte unter „Daten & Sync“ neu hinterlegen.');
      else if (!navigator.onLine || e instanceof TypeError) setCloud('offline');
      else setCloud('error', e.message);
    } finally {
      sync.busy = false;
      if (sync.again) { sync.again = false; scheduleSync(200); }
    }
  }

  function startPolling() {
    clearInterval(sync.poll);
    sync.poll = setInterval(() => { if (document.visibilityState === 'visible') runSync(); }, CFG.pollMs);
  }

  // ---------- Cloud-Symbol ----------
  const CLOUD_TEXT = {
    locked: ['gesperrt', 'Gesperrt – bitte entsperren'],
    syncing: ['Sync …', 'Synchronisiere mit dem Repository …'],
    synced: ['Aktuell', 'Alles gespeichert und aktuell'],
    pending: ['Ausstehend', 'Änderungen sind lokal gespeichert und werden übertragen'],
    offline: ['Offline', 'Offline – Änderungen werden verschlüsselt lokal gespeichert und später übertragen'],
    readonly: ['Nur lokal', 'Kein Team-Token hinterlegt – Änderungen bleiben auf diesem Gerät'],
    error: ['Fehler', 'Synchronisation fehlgeschlagen']
  };
  function setCloud(state, msg = '') {
    sync.state = state; sync.msg = msg;
    const el = $('#cloud'), [short, long] = CLOUD_TEXT[state];
    el.dataset.state = state;
    const extra = state === 'synced' && sync.last ? ` · zuletzt ${timeStr(sync.last)}`
      : state === 'pending' || state === 'offline' ? ` · ${pending.length} Änderung(en) ausstehend` : '';
    $('#cloudLabel').textContent = state === 'pending' || (state === 'offline' && pending.length) ? `${short} (${pending.length})` : short;
    el.title = (msg || long) + extra + (state !== 'locked' ? '\nKlicken zum Synchronisieren' : '');
    el.setAttribute('aria-label', 'Sync-Status: ' + (msg || long) + extra);
    renderSyncInfo();
  }

  // ---------- Entsperren / Sperren ----------
  async function fetchTeamEnv() {
    const r = await fetch(CFG.teamPath + '?t=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) throw new Error('team.enc.json nicht ladbar (HTTP ' + r.status + ')');
    return r.json();
  }

  async function unlockWith(k, teamEnv) {
    team = await Crypto.decrypt(k, teamEnv); // wirft bei falschem Passwort
    key = k; salt = teamEnv.kdf.salt;
    const cache = await loadCache();
    if (cache) { base = normalize(cache.base); baseSha = cache.baseSha; pending = cache.pending || []; }
    else {
      try {
        const r = await fetch(CFG.dataPath + '?t=' + Date.now(), { cache: 'no-store' });
        if (r.ok) base = normalize(await Crypto.decrypt(key, await r.json()));
      } catch (e) { console.warn('Startdaten', e); }
    }
    recompute();
    document.body.classList.add('unlocked');
    $('#lock').hidden = true;
    render();
    setCloud(team.token ? 'syncing' : (pending.length ? 'pending' : 'readonly'));
    runSync(); startPolling();
  }

  async function boot() {
    bind();
    switchView(ui.view || 'bestand', ui.coll);
    $('#lockName').value = me;
    let teamEnv;
    try { teamEnv = await fetchTeamEnv(); }
    catch (e) { showLock('Daten konnten nicht geladen werden: ' + e.message); return; }
    const stored = await KeyStore.get('key'), storedSalt = await KeyStore.get('salt');
    if (stored && storedSalt === teamEnv.kdf.salt && me) {
      try { await unlockWith(stored, teamEnv); return; } catch { /* Passwort geändert */ }
      showLock('Das Team-Passwort wurde geändert. Bitte neu entsperren.');
      return;
    }
    showLock();
  }

  function showLock(msg) {
    $('#lock').hidden = false;
    document.body.classList.remove('unlocked');
    if (msg) $('#lockMsg').textContent = msg;
    setTimeout(() => (me ? $('#lockPw') : $('#lockName')).focus(), 50);
  }

  async function lockOut(msg) {
    clearInterval(sync.poll);
    key = null; team = { token: '' }; base = emptyData(); pending = []; db = emptyData();
    await KeyStore.clear();
    setCloud('locked');
    render();
    showLock(msg);
  }

  async function onLockSubmit(e) {
    e.preventDefault();
    const f = e.target, btn = $('#lockBtn');
    $('#lockErr').textContent = '';
    btn.disabled = true; btn.textContent = 'Entschlüssele …';
    try {
      me = f.elements.name.value.trim(); lsSet(LS_NAME, me);
      const teamEnv = await fetchTeamEnv();
      const k = await Crypto.derive(f.elements.password.value, teamEnv.kdf.salt, teamEnv.kdf.iterations);
      try { await unlockWith(k, teamEnv); }
      catch { $('#lockErr').textContent = 'Falsches Passwort.'; return; }
      if (f.elements.remember.checked) { await KeyStore.set('key', k); await KeyStore.set('salt', teamEnv.kdf.salt); }
      f.elements.password.value = '';
      toast(`Hallo ${me}!`);
    } catch (err) { $('#lockErr').textContent = err.message; }
    finally { btn.disabled = false; btn.textContent = 'Entsperren'; }
  }

  // ---------- Admin: Token & Passwort ----------
  async function saveTeamToken(tok) {
    const t = await fetch(`https://api.github.com/repos/${CFG.owner}/${CFG.repo}`, { headers: ghHeaders(tok) });
    if (!t.ok) throw new Error('Token ungültig oder ohne Zugriff auf ' + CFG.owner + '/' + CFG.repo);
    const perm = (await t.json()).permissions;
    if (perm && !perm.push) throw new Error('Token hat kein Schreibrecht (Contents: Read and write).');
    await saveTeam({ token: tok }, tok);
  }
  /** Schreibt den (verschlüsselten) Team-Zugang mit geänderten Feldern ins Repo. */
  async function saveTeam(patch, tok = team.token) {
    if (!tok) throw new Error('Zuerst einen GitHub-Token hinterlegen.');
    const cur = await ghGet(CFG.teamPath, { tok });
    let remoteTeam = {};
    if (cur.env) { try { remoteTeam = await Crypto.decrypt(key, cur.env); } catch { /* neu */ } }
    const next = { ...remoteTeam, ...team, ...patch };
    Object.keys(next).forEach(k => { if (next[k] === null) delete next[k]; });
    const put = await ghPut(CFG.teamPath, await Crypto.encrypt(key, salt, 'team', next), cur.sha, 'Team-Zugang aktualisiert', tok);
    if (put.conflict) throw new Error('Konflikt beim Speichern – bitte erneut versuchen.');
    team = next; teamSha = put.sha;
  }

  async function changePassword(pw) {
    if (!team.token) throw new Error('Zuerst einen Team-Token hinterlegen.');
    await runSync();
    if (pending.length) throw new Error('Es gibt noch nicht übertragene Änderungen. Bitte erst synchronisieren.');
    const newSalt = Crypto.newSalt();
    const newKey = await Crypto.derive(pw, newSalt);
    const d = await ghGet(CFG.dataPath), t = await ghGet(CFG.teamPath);
    const putD = await ghPut(CFG.dataPath, await Crypto.encrypt(newKey, newSalt, 'data', base), d.sha, 'Neu verschlüsselt (Passwortwechsel)');
    if (putD.conflict) throw new Error('Konflikt – bitte erneut versuchen.');
    const putT = await ghPut(CFG.teamPath, await Crypto.encrypt(newKey, newSalt, 'team', team), t.sha, 'Neu verschlüsselt (Passwortwechsel)');
    if (putT.conflict) throw new Error('Konflikt beim Team-Zugang – bitte erneut versuchen.');
    key = newKey; salt = newSalt; baseSha = putD.sha; etag = null;
    if (await KeyStore.get('key')) { await KeyStore.set('key', key); await KeyStore.set('salt', salt); }
    await saveCache();
  }

  // ---------- Filter & Sortierung ----------
  function filtered() {
    const q = ui.q.trim().toLowerCase();
    const { key: k, dir } = ui.sort;
    return items()
      .filter(f => !ui.gruppe || f.gruppe === ui.gruppe)
      .filter(f => !ui.farbe || (f.farbe || '–') === ui.farbe)
      .filter(f => !ui.hersteller || (f.hersteller || '–') === ui.hersteller)
      .filter(f => !ui.knapp || isLow(f) || f.rollen === 0 || (isResin() && mhdState(f)))
      .filter(f => !q || [f.typ, f.gruppe, f.farbe, f.hersteller, f.bemerkung, f.lagerort].join(' ').toLowerCase().includes(q))
      .sort((a, b) => {
        const va = k === 'gesamt' ? gesamt(a) : a[k], vb = k === 'gesamt' ? gesamt(b) : b[k];
        let c = (typeof va === 'number' && typeof vb === 'number') ? va - vb
          : String(va || '￿').localeCompare(String(vb || '￿'), 'de', { sensitivity: 'base' });
        if (c === 0) c = String(a.typ + a.farbe).localeCompare(b.typ + b.farbe, 'de');
        return c * dir;
      });
  }
  /** MHD-Status (Resin): 'abgelaufen' | 'bald' (≤ 2 Monate) | '' */
  function mhdState(f) {
    if (!f.mhd) return '';
    const now = new Date(), cur = now.getFullYear() * 12 + now.getMonth(), [y, m] = f.mhd.split('-').map(Number), v = y * 12 + m - 1;
    return v < cur ? 'abgelaufen' : v - cur <= 2 ? 'bald' : '';
  }
  const mhdText = f => f.mhd ? f.mhd.split('-').reverse().join('/') : '–';
  const uniq = (field, list = items()) => [...new Set(list.map(f => f[field] || '–'))].sort((a, b) => a.localeCompare(b, 'de'));
  function groupBy(list, keyFn, valFn) {
    const m = new Map();
    list.forEach(f => { const k = keyFn(f); m.set(k, (m.get(k) || 0) + valFn(f)); });
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }

  // ---------- Rendering ----------
  function swatch(f) {
    const name = (f.farbe || '').toLowerCase();
    if (!f.farbe && !f.farbcode) return '<span class="swatch none" title="keine Farbe angegeben"></span>';
    if (name === 'transparent' && !f.farbcode) return '<span class="swatch transparent"></span>';
    const c = f.farbcode || FARBEN[name] || FARBEN[name.split(/\s+/)[0]] || null;
    return c ? `<span class="swatch" style="background:${esc(c)}"></span>` : '<span class="swatch none"></span>';
  }
  const kpiHtml = items => items.map(([l, v, unit, cls]) => `<div class="kpi ${cls || ''}"><div class="label">${l}</div><div class="value">${v}${unit ? `<small>${unit}</small>` : ''}</div></div>`).join('');

  function render() {
    renderFilters(); renderTable(); renderGrouped(); renderStats(); renderMap(); InUse.render(); renderSyncInfo();
    $('#subline').textContent = db.aktualisiert
      ? `Stand: ${new Date(db.aktualisiert).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' })}`
      : 'Lager für unsere 3D-Drucker';
    lsSet(LS_UI, ui);
  }

  function renderFilters() {
    const setOpts = (sel, values, allLabel, cur) => {
      sel.innerHTML = `<option value="">${allLabel}</option>` + values.map(v => `<option${v === cur ? ' selected' : ''}>${esc(v)}</option>`).join('');
      if (cur && !values.includes(cur)) { sel.value = ''; return ''; }
      return cur;
    };
    ui.gruppe = setOpts($('#fGruppe'), uniq('gruppe'), isResin() ? 'Alle Typen' : 'Alle Sorten', ui.gruppe);
    ui.farbe = setOpts($('#fFarbe'), uniq('farbe'), 'Alle Farben', ui.farbe);
    ui.hersteller = setOpts($('#fHersteller'), uniq('hersteller'), 'Alle Hersteller', ui.hersteller);
    $('#fKnapp').checked = ui.knapp;
    if (document.activeElement !== $('#q')) $('#q').value = ui.q;
    const sm = $('#fSortMobile'), sv = `${ui.sort.key}:${ui.sort.dir}`;
    sm.value = [...sm.options].some(o => o.value === sv) ? sv : 'gruppe:1';
    const counts = groupBy(items(), f => f.gruppe, f => f.rollen).sort((a, b) => a[0].localeCompare(b[0], 'de'));
    $('#gruppenChips').innerHTML =
      `<button class="chip${!ui.gruppe ? ' active' : ''}" data-g="">Alle<b>${fmt(items().reduce((s, f) => s + f.rollen, 0), 0)}</b></button>` +
      counts.map(([g, n]) => `<button class="chip${g === ui.gruppe ? ' active' : ''}" data-g="${esc(g)}">${esc(g)}<b>${fmt(n, 0)}</b></button>`).join('');
  }

  function renderTable() {
    const list = filtered();
    $$('#tbl th[data-sort]').forEach(th => {
      th.classList.toggle('sorted', th.dataset.sort === ui.sort.key);
      th.classList.toggle('desc', th.dataset.sort === ui.sort.key && ui.sort.dir < 0);
      th.setAttribute('aria-sort', th.dataset.sort === ui.sort.key ? (ui.sort.dir > 0 ? 'ascending' : 'descending') : 'none');
    });
    $('#tbody').innerHTML = list.map(f => `
      <tr data-id="${esc(f.id)}" class="${isLow(f) ? 'low' : ''} ${f.rollen === 0 ? 'zero' : ''} ${selected.has(f.id) ? 'selected' : ''}">
        <td class="sel"><input type="checkbox" class="rowsel" aria-label="${esc(label(f))} auswählen"${selected.has(f.id) ? ' checked' : ''}></td>
        <td class="first">${swatch(f)}<span class="fname">${esc(f.farbe || '–')}</span>${isLow(f) ? '<span class="warnmark" title="Mindestbestand erreicht">⚠ knapp</span>' : ''}${isResin() && mhdState(f) ? `<span class="warnmark ${mhdState(f) === 'abgelaufen' ? 'bad' : ''}">⚠ MHD ${mhdState(f)}</span>` : ''}<span class="m-typ">${esc(f.typ)}</span></td>
        <td data-l="Typ" class="col-typ">${esc(f.typ)}</td>
        <td data-l="Sorte" class="col-sorte"><span class="badge">${esc(f.gruppe)}</span></td>
        <td data-l="Hersteller">${esc(f.hersteller || '–')}</td>
        <td data-l="${U().many}" class="num col-rollen"><span class="stepper"><button data-act="dec" aria-label="Eine ${U().one} verbraucht">−</button><span>${f.rollen}</span><button data-act="inc" aria-label="Eine ${U().one} hinzugefügt">+</button></span></td>
        <td data-l="kg/Rolle" class="num">${fmt(f.kgProRolle)}</td>
        <td data-l="Gesamt" class="num"><b>${fmt(gesamt(f))} kg</b></td>
        <td data-l="MHD" class="col-mhd ${mhdState(f)}">${mhdText(f)}</td>
        <td data-l="Lagerort" class="col-lager">${esc(f.lagerort || '–')}</td>
        <td data-l="Bemerkung" class="bem col-bem">${esc(f.bemerkung || '')}${f.durchmesser && f.durchmesser !== 1.75 ? ` <span class="badge">${fmt(f.durchmesser)} mm</span>` : ''}</td>
        <td class="actions">${isResin() ? '' : `<button class="iconbtn" data-act="use" aria-label="Rolle öffnen / einlegen" title="Rolle öffnen – in Verwendung nehmen"${f.rollen ? '' : ' disabled'}>⏏</button>`}<button class="iconbtn" data-act="edit" aria-label="Bearbeiten" title="Bearbeiten">✎</button><button class="iconbtn" data-act="dup" aria-label="Duplizieren" title="Duplizieren">⧉</button><button class="iconbtn del" data-act="del" aria-label="Löschen" title="Löschen">🗑</button></td>
      </tr>`).join('');
    $('#empty').hidden = list.length > 0;
    const sumR = list.reduce((s, f) => s + f.rollen, 0), sumKg = list.reduce((s, f) => s + gesamt(f), 0);
    const nAll = items().length;
    $('#tfoot').innerHTML = list.length ? `<tr><td class="hide-m"></td><td colspan="${isResin() ? 3 : 4}">${list.length} Einträge${list.length !== nAll ? ` (von ${nAll})` : ''}</td><td class="num">${fmt(sumR, 0)} ${U().many}</td><td class="hide-m"></td><td class="num">${fmt(sumKg)} kg</td><td colspan="${isResin() ? 4 : 3}" class="hide-m"></td></tr>` : '';
    const allSel = $('#selAll'), nSel = list.filter(f => selected.has(f.id)).length;
    allSel.checked = list.length > 0 && nSel === list.length;
    allSel.indeterminate = nSel > 0 && nSel < list.length;
    renderBulk();
    const all = items(), low = all.filter(isLow).length;
    const kpis = [
      [U().many, fmt(all.reduce((s, f) => s + f.rollen, 0), 0)],
      [isResin() ? 'Menge' : 'Gewicht', fmt(all.reduce((s, f) => s + gesamt(f), 0), 1), isResin() ? 'kg/L' : 'kg'],
      [isResin() ? 'Typen' : 'Sorten', uniq('gruppe').length],
      ['Hersteller', uniq('hersteller').filter(h => h !== '–').length],
      ['Knapp / leer', `${low} / ${all.filter(f => f.rollen === 0).length}`, '', low ? 'warn' : '']
    ];
    if (isResin()) { const ab = all.filter(f => mhdState(f)).length; kpis.push(['MHD-Warnung', ab, '', ab ? 'warn' : '']); }
    else { const iu = db.inUse; kpis.splice(2, 0, ['In Verwendung', iu.length, `· ${fmt(iu.reduce((s, u) => s + restKg(u), 0), 1)} kg`]); }
    $('#kpiBestand').innerHTML = kpiHtml(kpis);
  }

  function renderBulk() {
    const ids = new Set(items().map(f => f.id));
    [...selected].forEach(id => { if (!ids.has(id)) selected.delete(id); });
    $('#bulkbar').hidden = selected.size === 0;
    $('#bulkCount').textContent = selected.size;
    document.body.classList.toggle('has-sel', selected.size > 0);
  }

  function bulkAction(act) {
    const sel = items().filter(f => selected.has(f.id));
    if (act === 'clear') { selected.clear(); renderTable(); return; }
    if (!sel.length) return;
    if (act === 'inc' || act === 'dec') {
      const d = act === 'inc' ? 1 : -1;
      const ops = sel.filter(f => f.rollen + d >= 0).map(f => [{ op: 'delta', id: f.id, d }, `${d > 0 ? '+1 ' + U().one : '−1 ' + U().one + ' (verbraucht)'}: ${label(f)}`, d * f.kgProRolle]);
      commitAll(ops);
      toast(`${ops.length} Einträge: ${d > 0 ? '+1' : '−1'} ${U().one}.`);
    }
    if (act === 'del') {
      if (!confirm(`${sel.length} Einträge wirklich löschen?\n\n${sel.slice(0, 8).map(label).join('\n')}${sel.length > 8 ? '\n…' : ''}`)) return;
      const copies = sel.map(clone);
      commitAll(sel.map(f => [{ op: 'del', id: f.id }, `Gelöscht: ${label(f)}`, -gesamt(f)]));
      selected.clear(); renderTable();
      toast(`${copies.length} Einträge gelöscht.`, false, () => commitAll(copies.map(c => [{ op: 'add', id: c.id, item: c }, `Wiederhergestellt: ${label(c)}`, gesamt(c)])));
    }
  }

  function renderGrouped() {
    const groups = new Map();
    db.filamente.forEach(f => {
      if (!groups.has(f.gruppe)) groups.set(f.gruppe, new Map());
      const g = groups.get(f.gruppe), k = f.farbe || '–';
      const e = g.get(k) || { rollen: 0, kg: 0, farbcode: f.farbcode };
      e.rollen += f.rollen; e.kg += gesamt(f); g.set(k, e);
    });
    $('#groupGrid').innerHTML = [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0], 'de')).map(([g, farben]) => {
      const tot = [...farben.values()].reduce((s, e) => ({ r: s.r + e.rollen, kg: s.kg + e.kg }), { r: 0, kg: 0 });
      return `<div class="card group-card"><h3>${esc(g)} <span class="tot">${fmt(tot.r, 0)} Rollen · ${fmt(tot.kg, 1)} kg</span></h3>` +
        [...farben.entries()].sort((a, b) => b[1].rollen - a[1].rollen).map(([farbe, e]) =>
          `<button class="group-row" data-g="${esc(g)}" data-f="${esc(farbe)}"><span>${swatch(farbe === '–' ? {} : { farbe, farbcode: e.farbcode })}${esc(farbe)}</span><span class="r">${fmt(e.rollen, 0)}<small>${fmt(e.kg, 1)} kg</small></span></button>`
        ).join('') + '</div>';
    }).join('') || '<p class="hint">Noch keine Filamente erfasst.</p>';
  }

  function bars(el, entries, { unit = '', withSwatch = false, dec = 0 } = {}) {
    const max = Math.max(1, ...entries.map(e => e[1]));
    el.innerHTML = entries.map(([k, v]) => `<div class="bar"><span class="name" title="${esc(k)}">${withSwatch ? swatch({ farbe: k === '–' ? '' : k }) : ''}${esc(k)}</span><span class="track"><span class="fill" style="width:${(v / max) * 100}%"></span></span><span class="v">${fmt(v, dec)}${unit}</span></div>`).join('') || '<p class="hint">Keine Daten</p>';
  }

  function renderStats() {
    const all = db.filamente;
    const totR = all.reduce((s, f) => s + f.rollen, 0), totKg = all.reduce((s, f) => s + gesamt(f), 0);
    const since = new Date(Date.now() - 30 * 864e5).toISOString();
    const filLog = db.verlauf.filter(v => v.coll !== 'resin');
    const recent = db.verlauf.filter(v => v.t >= since);
    const used30 = filLog.filter(v => v.t >= since && v.kg < 0).reduce((s, v) => s - v.kg, 0);
    const iu = db.inUse, iuKg = iu.reduce((s, u) => s + restKg(u), 0);
    $('#kpiStats').innerHTML = kpiHtml([
      ['Rollen (Lager)', fmt(totR, 0)], ['Gewicht (Lager)', fmt(totKg, 1), 'kg'],
      ['In Verwendung', iu.length, `· ${fmt(iuKg, 1)} kg`],
      ['Ø kg/Rolle', fmt(totR ? totKg / totR : 0)], ['Verbrauch 30 T.', fmt(used30, 1), 'kg'],
      ['Knapp', all.filter(isLow).length, '', all.some(isLow) ? 'warn' : '']
    ]);
    $('#chInUse').innerHTML = iu.length ? [...iu].sort((a, b) => a.rest - b.rest).map(u => `<div class="bar"><span class="name" title="${esc(label(u))}">${swatch(u)}${esc(u.typ)}</span><span class="track"><span class="fill ${u.rest <= 15 ? 'lowfill' : ''}" style="width:${u.rest}%"></span></span><span class="v">${u.rest} %</span></div>`).join('') : '<p class="hint">Keine geöffneten Rollen.</p>';
    bars($('#chGruppeKg'), groupBy(all, f => f.gruppe, gesamt), { dec: 1 });
    bars($('#chGruppeRollen'), groupBy(all, f => f.gruppe, f => f.rollen));
    bars($('#chFarbe'), groupBy(all, f => f.farbe || '–', f => f.rollen), { withSwatch: true });
    bars($('#chHersteller'), groupBy(all, f => f.hersteller || '–', f => f.rollen));
    bars($('#chGroesse'), groupBy(all, f => fmt(f.kgProRolle) + ' kg', f => f.rollen), { unit: '×' });
    bars($('#chPersonen'), groupBy(recent, v => v.wer || '?', () => 1));

    const low = [...all.filter(f => isLow(f) || f.rollen === 0), ...db.resin.filter(f => isLow(f) || f.rollen === 0).map(f => ({ ...f, resin: true }))];
    $('#lowList').innerHTML = low.length
      ? low.map(f => `<div class="lowitem"><span>${swatch(f)}${f.resin ? '<span class="badge">Resin</span> ' : ''}${esc(label(f))}</span><span class="r">${f.rollen} / min ${f.mindestbestand}</span></div>`).join('')
      : '<p class="hint">Alles im grünen Bereich. Mindestbestände lassen sich pro Filament im Bearbeiten-Dialog festlegen.</p>';

    const weeks = [], now = new Date(); now.setHours(0, 0, 0, 0);
    const monday = new Date(now); monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    for (let i = 11; i >= 0; i--) { const s = new Date(monday); s.setDate(monday.getDate() - i * 7); weeks.push({ s, e: new Date(s.getTime() + 7 * 864e5), in: 0, out: 0 }); }
    filLog.forEach(v => { const t = new Date(v.t); const w = weeks.find(w => t >= w.s && t < w.e); if (w) { if (v.kg > 0) w.in += v.kg; else w.out -= v.kg; } });
    const wmax = Math.max(1, ...weeks.map(w => w.in + w.out));
    $('#chVerlauf').innerHTML = `<div class="weekchart">${weeks.map(w => `<div class="wk" title="Woche ab ${w.s.toLocaleDateString('de-DE')}: +${fmt(w.in, 1)} kg / −${fmt(w.out, 1)} kg"><div class="stack"><div class="in" style="height:${w.in / wmax * 100}%"></div><div class="out" style="height:${w.out / wmax * 100}%"></div></div><label>${w.s.getDate()}.${w.s.getMonth() + 1}.</label></div>`).join('')}</div>
      <div class="legend"><span><i style="background:var(--accent)"></i>Verbrauch</span><span><i style="background:var(--ok)"></i>Zugang</span></div>`;

    $('#logList').innerHTML = db.verlauf.slice(-80).reverse().map(v =>
      `<li><time>${new Date(v.t).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })}</time><span><b class="who">${esc(v.wer || '?')}</b> ${esc(v.text)}${v.kg ? ` <span class="${v.kg > 0 ? 'plus' : 'minus'}">${v.kg > 0 ? '+' : '−'}${fmt(Math.abs(v.kg))} kg</span>` : ''}</span></li>`
    ).join('') || '<li><span class="muted">Noch keine Änderungen protokolliert.</span></li>';

    // Resin
    const rs = db.resin, rFl = rs.reduce((s, f) => s + f.rollen, 0), rKg = rs.reduce((s, f) => s + gesamt(f), 0);
    const rWarn = rs.filter(f => mhdState(f) && f.rollen > 0);
    const rUsed = db.verlauf.filter(v => v.coll === 'resin' && v.t >= since && v.kg < 0).reduce((s, v) => s - v.kg, 0);
    $('#kpiResin').innerHTML = kpiHtml([
      ['Flaschen', fmt(rFl, 0)], ['Menge', fmt(rKg, 1), 'kg/L'], ['Typen', new Set(rs.map(f => f.typ)).size],
      ['Verbrauch 30 T.', fmt(rUsed, 1), 'kg/L'], ['MHD-Warnung', rWarn.length, '', rWarn.length ? 'warn' : '']
    ]);
    bars($('#chResinTyp'), groupBy(rs, f => f.typ, gesamt), { dec: 1 });
    bars($('#chResinFarbe'), groupBy(rs, f => f.farbe || '–', f => f.rollen), { withSwatch: true });
    const mh = rs.filter(f => f.mhd && f.rollen > 0).sort((a, b) => a.mhd.localeCompare(b.mhd));
    $('#resinMhd').innerHTML = mh.length
      ? mh.slice(0, 12).map(f => `<div class="lowitem"><span>${swatch(f)}${esc(label(f))}</span><span class="r ${mhdState(f) || 'ok'}">${mhdText(f)}${mhdState(f) ? ' · ' + mhdState(f) : ''}</span></div>`).join('')
      : '<p class="hint">Noch kein MHD erfasst. Das Datum lässt sich pro Resin im Bearbeiten-Dialog eintragen.</p>';
  }

  function renderMap() {
    const types = new Map(Object.entries(db.typen));
    db.filamente.forEach(f => { if (!types.has(f.typ)) types.set(f.typ, f.gruppe); });
    const groups = [...new Set([...types.values()])].sort((a, b) => a.localeCompare(b, 'de'));
    $('#mapList').innerHTML = [...types.entries()].sort((a, b) => a[0].localeCompare(b[0], 'de')).map(([t, g]) =>
      `<label class="m"><span>${esc(t)}</span><select data-typ="${esc(t)}">${groups.map(x => `<option${x === g ? ' selected' : ''}>${esc(x)}</option>`).join('')}</select></label>`
    ).join('');
  }

  function renderSyncInfo() {
    const el = $('#syncInfo'); if (!el) return;
    $('#aiState').textContent = team.anthropicKey ? '✔ KI-Erkennung ist aktiv.' : 'KI-Erkennung ist nicht eingerichtet – es wird die lokale Texterkennung verwendet.';
    $('#btnAiRemove').hidden = !team.anthropicKey;
    const [, long] = CLOUD_TEXT[sync.state] || ['', ''];
    el.innerHTML = `
      <dt>Status</dt><dd><span class="dot ${sync.state}"></span>${esc(sync.msg || long)}</dd>
      <dt>Angemeldet als</dt><dd>${esc(me || '–')}</dd>
      <dt>Letzter Abgleich</dt><dd>${sync.last ? sync.last.toLocaleString('de-DE') : '–'}</dd>
      <dt>Ausstehend</dt><dd>${pending.length} Änderung(en)</dd>
      <dt>Repository</dt><dd><code>${esc(CFG.owner)}/${esc(CFG.repo)}</code> · <code>${esc(CFG.dataPath)}</code></dd>
      <dt>Team-Token</dt><dd>${team.token ? 'hinterlegt (verschlüsselt)' : '<span class="warn">nicht hinterlegt</span>'}</dd>
      <dt>KI-Erkennung</dt><dd>${team.anthropicKey ? 'aktiv (Claude)' : 'aus – lokale Texterkennung'}</dd>
      <dt>Verschlüsselung</dt><dd>AES-256-GCM · PBKDF2-SHA256 (${fmt(CFG.iterations, 0)} Iterationen)</dd>`;
  }

  // ---------- Dialog ----------
  function comboOptions(field) {
    const sortDe = a => a.filter(x => x && x !== '–').sort((x, y) => x.localeCompare(y, 'de'));
    if (field === 'typ' && isResin()) return sortDe([...new Set([...RESIN_TYPEN, ...uniq('typ')])]);
    if (field === 'typ') return sortDe([...new Set([...Object.keys(db.typen), ...uniq('typ')])]);
    if (field === 'gruppe') return sortDe([...new Set([...Object.values(db.typen), ...uniq('gruppe')])]);
    if (field === 'farbe') return sortDe([...new Set([...uniq('farbe'), 'Schwarz', 'Weiß', 'Grau', 'Rot', 'Blau', 'Grün', 'Gelb', 'Orange', 'Transparent', 'Natur'])]);
    return sortDe(uniq(field));
  }
  function buildCombo(el, value) {
    const field = el.dataset.field, opts = comboOptions(field);
    const known = !value || opts.includes(value), optional = field === 'farbe' || field === 'hersteller';
    el.innerHTML = `<select name="${field}__sel">
        ${optional ? '<option value="">– keine Angabe –</option>' : ''}
        ${opts.map(o => `<option${o === value ? ' selected' : ''}>${esc(o)}</option>`).join('')}
        <option value="__new"${known ? '' : ' selected'}>➕ Neu …</option>
      </select>
      <input name="${field}__new" placeholder="Neu eingeben" value="${known ? '' : esc(value)}" ${known ? 'hidden' : ''} autocomplete="off">`;
    const sel = el.querySelector('select'), inp = el.querySelector('input');
    sel.addEventListener('change', () => {
      inp.hidden = sel.value !== '__new';
      if (!inp.hidden) inp.focus();
      if (field === 'typ' && sel.value !== '__new' && !isResin()) suggestGroup(sel.value);
      if (field === 'farbe') suggestColor(sel.value);
    });
    inp.addEventListener('change', () => { if (field === 'typ') suggestGroup(inp.value.trim()); if (field === 'farbe') suggestColor(inp.value.trim()); });
  }
  function comboValue(form, field) { const s = form.elements[field + '__sel'].value; return (s === '__new' ? form.elements[field + '__new'].value : s).trim(); }
  function suggestGroup(typ) { if (isResin()) return; buildCombo($('#itemForm .combo[data-field=gruppe]'), db.typen[typ] || db.filamente.find(f => f.typ === typ)?.gruppe || typ); }
  function suggestColor(farbe) { const c = FARBEN[(farbe || '').toLowerCase()]; if (c) $('#itemForm').elements.farbcode.value = c; }

  function openDialog(f) {
    editingId = f?.id || null;
    const form = $('#itemForm');
    const v = f || (isResin()
      ? { typ: 'Standard', gruppe: 'Standard', farbe: '', hersteller: '', rollen: 1, kgProRolle: 1, durchmesser: 0, mindestbestand: 0, lagerort: '', bemerkung: '', mhd: '' }
      : { typ: 'PLA+', gruppe: 'PLA+', farbe: '', hersteller: '', rollen: 1, kgProRolle: 1, durchmesser: 1.75, mindestbestand: 0, lagerort: '', bemerkung: '' });
    $('#dlgTitle').textContent = `${U().what} ${editingId ? 'bearbeiten' : 'hinzufügen'}`;
    form.elements.mhd.value = v.mhd || '';
    $$('#itemForm .combo').forEach(el => buildCombo(el, v[el.dataset.field]));
    form.elements.farbcode.value = v.farbcode || FARBEN[(v.farbe || '').toLowerCase()] || '#888888';
    form.dataset.farbcodeOrig = form.elements.farbcode.value;
    ['rollen', 'kgProRolle', 'mindestbestand', 'lagerort', 'bemerkung'].forEach(k => { form.elements[k].value = v[k] ?? ''; });
    form.elements.durchmesser.value = String(v.durchmesser || 1.75);
    $('#lagerList').innerHTML = uniq('lagerort').filter(x => x !== '–').map(x => `<option value="${esc(x)}">`).join('');
    $('#dlg').showModal();
  }

  function saveDialog() {
    const form = $('#itemForm');
    const farbe = comboValue(form, 'farbe'), autoColor = FARBEN[farbe.toLowerCase()], picked = form.elements.farbcode.value;
    const item = {
      typ: comboValue(form, 'typ'), gruppe: comboValue(form, 'gruppe'), farbe,
      farbcode: picked !== '#888888' && picked !== autoColor && (picked !== form.dataset.farbcodeOrig || !autoColor) ? picked : '',
      hersteller: comboValue(form, 'hersteller'),
      rollen: Math.max(0, Math.round(num(form.elements.rollen.value))),
      kgProRolle: num(form.elements.kgProRolle.value),
      durchmesser: num(form.elements.durchmesser.value),
      mindestbestand: Math.max(0, Math.round(num(form.elements.mindestbestand.value))),
      lagerort: form.elements.lagerort.value.trim(), bemerkung: form.elements.bemerkung.value.trim(),
      mhd: isResin() ? form.elements.mhd.value : ''
    };
    if (!item.typ) { toast('Bitte einen Typ angeben.', true); return false; }
    if (isResin()) { item.gruppe = item.typ; item.durchmesser = 0; }
    if (!item.gruppe) item.gruppe = item.typ;
    if (!isResin() && !db.typen[item.typ]) commit({ op: 'typ', typ: item.typ, gruppe: item.gruppe });
    const u = U();

    if (editingId) {
      const f = items().find(x => x.id === editingId);
      const fields = {};
      Object.keys(item).forEach(k => { if (item[k] !== f[k]) fields[k] = item[k]; });
      if (!Object.keys(fields).length) return true;
      // Rollenänderung als Delta, damit parallele +/- anderer Personen nicht verloren gehen
      if ('rollen' in fields) { const d = fields.rollen - f.rollen; delete fields.rollen; if (Object.keys(fields).length) commit({ op: 'patch', id: f.id, fields }); commit({ op: 'delta', id: f.id, d }, `Bearbeitet: ${label({ ...f, ...item })} (${u.many} ${d > 0 ? '+' : ''}${d})`, d * item.kgProRolle); }
      else commit({ op: 'patch', id: f.id, fields }, `Bearbeitet: ${label({ ...f, ...item })}`, item.kgProRolle !== f.kgProRolle ? f.rollen * (item.kgProRolle - f.kgProRolle) : 0);
    } else {
      const same = items().find(x => x.typ === item.typ && x.farbe === item.farbe && x.hersteller === item.hersteller && x.kgProRolle === item.kgProRolle && x.durchmesser === item.durchmesser);
      if (same && confirm(`„${label(same)}“ mit ${fmt(same.kgProRolle)} kg ${u.je} gibt es schon.\nOK = ${item.rollen} ${u.many} dort hinzufügen\nAbbrechen = als eigenen Eintrag anlegen`)) {
        commit({ op: 'delta', id: same.id, d: item.rollen }, `+${item.rollen} ${u.many}: ${label(same)}`, item.rollen * item.kgProRolle);
      } else {
        const f = { id: uid(), ...item };
        commit({ op: 'add', id: f.id, item: f }, `Neu${isResin() ? ' (Resin)' : ''}: ${label(f)} – ${f.rollen} ${u.many}`, gesamt(f));
      }
    }
    toast('Gespeichert.');
    return true;
  }

  // ---------- Aktionen ----------
  function changeRollen(id, d) {
    const f = items().find(x => x.id === id), u = U();
    if (!f || f.rollen + d < 0) return;
    commit({ op: 'delta', id, d }, `${d > 0 ? '+1 ' + u.one : '−1 ' + u.one + ' (verbraucht)'}: ${label(f)}`, d * f.kgProRolle);
    if (navigator.vibrate) navigator.vibrate(12);
    const nf = items().find(x => x.id === id);
    if (nf && isLow(nf)) toast(`⚠ ${label(nf)}: nur noch ${nf.rollen} ${u.many} – Mindestbestand ${nf.mindestbestand}.`);
  }
  function removeItem(id) {
    const f = items().find(x => x.id === id); if (!f) return;
    const copy = clone(f);
    commit({ op: 'del', id }, `Gelöscht: ${label(f)}`, -gesamt(f));
    toast(`„${label(copy)}“ gelöscht.`, false, () => commit({ op: 'add', id: copy.id, item: copy }, `Wiederhergestellt: ${label(copy)}`, gesamt(copy)));
  }
  function switchView(v, coll) {
    ui.view = v;
    if (v === 'bestand' && coll && coll !== ui.coll) {
      ui.coll = coll; selected.clear();
      Object.assign(ui, { q: '', gruppe: '', farbe: '', hersteller: '', knapp: false });
      $('#q').value = '';
      if (key) render();
    }
    applyCollLabels();
    $$('.tab').forEach(t => { const on = t.dataset.view === v && (v !== 'bestand' || t.dataset.coll === ui.coll); t.classList.toggle('active', on); t.setAttribute('aria-selected', on); });
    $$('.view').forEach(s => s.classList.toggle('active', s.id === 'view-' + v));
    lsSet(LS_UI, ui);
    window.scrollTo({ top: 0 });
  }

  function applyCollLabels() {
    const r = isResin();
    document.body.classList.toggle('coll-resin', r);
    const L = { rollen: r ? 'Flaschen' : 'Rollen', kgkurz: r ? 'kg/Fl.' : 'kg/Rolle', kglang: r ? 'Inhalt je Flasche (kg bzw. L)' : 'kg je Rolle', mind: `Mindestbestand (${r ? 'Flaschen' : 'Rollen'})` };
    $$('[data-lbl]').forEach(el => { el.textContent = L[el.dataset.lbl]; });
    $('#btnAdd').textContent = r ? '+ Resin' : '+ Filament';
    $('#q').placeholder = `Suchen (Typ, Farbe, Hersteller …) in ${r ? 'Resin' : 'Filament'}`;
  }

  // ---------- Import / Export ----------
  const CSV_COLS = [['typ', 'Typ'], ['gruppe', 'Sorte'], ['farbe', 'Farbe'], ['farbcode', 'Farbcode'], ['hersteller', 'Hersteller'], ['rollen', 'Rollen'], ['kgProRolle', 'kg je Rolle'], ['gesamt', 'Gesamt kg'], ['durchmesser', 'Durchmesser mm'], ['mindestbestand', 'Mindestbestand'], ['lagerort', 'Lagerort'], ['bemerkung', 'Bemerkung'], ['mhd', 'MHD']];
  function download(name, content, type) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([content], { type })); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  function exportCsv() {
    const q = v => { const s = typeof v === 'number' ? String(v).replace('.', ',') : String(v ?? ''); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const rows = [CSV_COLS.map(c => c[1]).join(';'), ...filtered().map(f => CSV_COLS.map(([k]) => q(k === 'gesamt' ? gesamt(f) : f[k])).join(';'))];
    download(`${isResin() ? 'resinbestand' : 'filamentbestand'}-${new Date().toISOString().slice(0, 10)}.csv`, '﻿' + rows.join('\r\n'), 'text/csv;charset=utf-8');
  }
  function exportJson() { download(`filamentbestand-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(db, null, 2), 'application/json'); }
  function parseCsv(text) {
    text = text.replace(/^﻿/, '');
    const first = text.split('\n')[0];
    const sep = (first.match(/;/g) || []).length >= (first.match(/,/g) || []).length ? ';' : ',';
    const rows = []; let row = [], cur = '', inQ = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQ) { if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') inQ = false; else cur += c; }
      else if (c === '"') inQ = true;
      else if (c === sep) { row.push(cur); cur = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
      else cur += c;
    }
    if (cur || row.length) { row.push(cur); rows.push(row); }
    const head = rows.shift().map(h => h.trim().toLowerCase());
    const alias = { 'typ laut liste': 'typ', 'typ (gruppe)': 'gruppe', 'kg/rolle': 'kgProRolle' };
    CSV_COLS.forEach(([k, l]) => { alias[l.toLowerCase()] = k; alias[k.toLowerCase()] = k; });
    const keys = head.map(h => alias[h] || null);
    return rows.filter(r => r.some(c => c.trim())).map(r => {
      const o = {}; keys.forEach((k, i) => { if (k && k !== 'gesamt') o[k] = (r[i] ?? '').trim(); }); return o;
    }).filter(o => o.typ);
  }
  async function importFile(file) {
    const text = await file.text();
    let incoming;
    try { incoming = file.name.toLowerCase().endsWith('.json') ? normalize(JSON.parse(text)) : normalize({ filamente: parseCsv(text) }); }
    catch (e) { toast('Datei konnte nicht gelesen werden: ' + e.message, true); return; }
    if (!incoming.filamente.length) { toast('Keine Filamente in der Datei gefunden.', true); return; }
    const replace = confirm(`${incoming.filamente.length} Einträge gefunden.\n\nOK = aktuellen Bestand ERSETZEN\nAbbrechen = zum Bestand HINZUFÜGEN`);
    if (replace) commit({ op: 'replace', filamente: incoming.filamente, typen: incoming.typen }, `Import: ${incoming.filamente.length} Einträge (ersetzt)`);
    else incoming.filamente.forEach((f, i, a) => { const n = { ...f, id: uid() }; commit({ op: 'add', id: n.id, item: n }, i === a.length - 1 ? `Import: ${a.length} Einträge hinzugefügt` : '', 0); });
    toast('Import abgeschlossen.');
  }

  // ---------- Toast ----------
  let toastTimer;
  function toast(msg, err = false, undo = null) {
    const t = $('#toast');
    t.innerHTML = esc(msg) + (undo ? '<button>Rückgängig</button>' : '');
    t.className = 'toast show' + (err ? ' err' : '');
    if (undo) t.querySelector('button').onclick = () => { undo(); t.className = 'toast'; };
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.className = 'toast'; }, undo ? 6000 : err ? 5000 : 3000);
  }

  // ---------- Events ----------
  function bind() {
    $('#lockForm').addEventListener('submit', onLockSubmit);
    $$('.tab').forEach(t => t.addEventListener('click', () => switchView(t.dataset.view, t.dataset.coll)));
    let qt; $('#q').addEventListener('input', e => { clearTimeout(qt); qt = setTimeout(() => { ui.q = e.target.value; renderTable(); lsSet(LS_UI, ui); }, 120); });
    $('#fGruppe').addEventListener('change', e => { ui.gruppe = e.target.value; render(); });
    $('#fFarbe').addEventListener('change', e => { ui.farbe = e.target.value; render(); });
    $('#fHersteller').addEventListener('change', e => { ui.hersteller = e.target.value; render(); });
    $('#fKnapp').addEventListener('change', e => { ui.knapp = e.target.checked; render(); });
    $('#fSortMobile').addEventListener('change', e => { const [k, d] = e.target.value.split(':'); ui.sort = { key: k, dir: +d }; render(); });
    $('#btnReset').addEventListener('click', () => { Object.assign(ui, { q: '', gruppe: '', farbe: '', hersteller: '', knapp: false }); $('#q').value = ''; render(); });
    $('#gruppenChips').addEventListener('click', e => { const c = e.target.closest('.chip'); if (c) { ui.gruppe = c.dataset.g; render(); } });
    $$('#tbl th[data-sort]').forEach(th => th.addEventListener('click', () => {
      const k = th.dataset.sort;
      ui.sort = ui.sort.key === k ? { key: k, dir: -ui.sort.dir } : { key: k, dir: ['rollen', 'kgProRolle', 'gesamt'].includes(k) ? -1 : 1 };
      render();
    }));
    $('#tbody').addEventListener('click', e => {
      const b = e.target.closest('button[data-act]'); if (!b) return;
      const id = b.closest('tr').dataset.id, f = items().find(x => x.id === id);
      switch (b.dataset.act) {
        case 'use': Use.openLoad({ src: 'f:' + id }); break;
        case 'inc': changeRollen(id, 1); break;
        case 'dec': changeRollen(id, -1); break;
        case 'edit': openDialog(f); break;
        case 'dup': openDialog({ ...f, id: null, rollen: 1 }); break;
        case 'del': if (confirm(`„${label(f)}“ wirklich löschen?`)) removeItem(id); break;
      }
    });
    $('#tbody').addEventListener('dblclick', e => { const tr = e.target.closest('tr'); if (tr && !e.target.closest('button')) openDialog(items().find(x => x.id === tr.dataset.id)); });
    $('#btnAdd').addEventListener('click', () => openDialog(null));
    $('#tbody').addEventListener('change', e => {
      const cb = e.target.closest('.rowsel'); if (!cb) return;
      const id = cb.closest('tr').dataset.id;
      cb.checked ? selected.add(id) : selected.delete(id);
      cb.closest('tr').classList.toggle('selected', cb.checked);
      renderTable();
    });
    $('#selAll').addEventListener('change', e => { filtered().forEach(f => e.target.checked ? selected.add(f.id) : selected.delete(f.id)); renderTable(); });
    $('#bulkbar').addEventListener('click', e => { const b = e.target.closest('[data-bulk]'); if (b) bulkAction(b.dataset.bulk); });
    Scan.bind(); InUse.bind(); Use.bind(); Printers.bind();
    $('#aiForm').addEventListener('submit', async e => {
      e.preventDefault();
      const k = e.target.elements.key.value.trim(), btn = e.submitter;
      if (!/^sk-ant-/.test(k)) return toast('Das sieht nicht wie ein Claude-API-Key aus (beginnt mit sk-ant-).', true);
      btn.disabled = true;
      try { await saveTeam({ anthropicKey: k }); e.target.reset(); toast('KI-Erkennung aktiviert (Key verschlüsselt hinterlegt).'); }
      catch (err) { toast(err.message, true); }
      finally { btn.disabled = false; renderSyncInfo(); }
    });
    $('#btnAiRemove').addEventListener('click', async () => {
      if (!confirm('KI-Erkennung deaktivieren und Key aus dem Repo entfernen?')) return;
      try { await saveTeam({ anthropicKey: null }); toast('KI-Key entfernt.'); } catch (err) { toast(err.message, true); }
      renderSyncInfo();
    });
    $('#fab').addEventListener('click', () => openDialog(null));
    $('#itemForm').addEventListener('submit', e => { if (e.submitter?.value === 'ok' && !saveDialog()) e.preventDefault(); });
    $('#dlg').addEventListener('click', e => { if (e.target === $('#dlg')) $('#dlg').close(); });
    $('#groupGrid').addEventListener('click', e => {
      const r = e.target.closest('.group-row'); if (!r) return;
      Object.assign(ui, { gruppe: r.dataset.g, farbe: r.dataset.f, hersteller: '', q: '', knapp: false });
      switchView('bestand'); render();
    });
    $('#mapList').addEventListener('change', e => {
      const s = e.target.closest('select[data-typ]'); if (!s) return;
      const typ = s.dataset.typ, n = db.filamente.filter(f => f.typ === typ && f.gruppe !== s.value).length;
      if (n && confirm(`${n} vorhandene Einträge vom Typ „${typ}“ auch der Sorte „${s.value}“ zuordnen?`)) commit({ op: 'regroup', typ, gruppe: s.value }, `Sorte von „${typ}“ → ${s.value}`);
      else commit({ op: 'typ', typ, gruppe: s.value });
    });

    $('#cloud').addEventListener('click', () => {
      if (!key) return showLock();
      toast($('#cloud').title.split('\n')[0]);
      runSync();
    });
    $('#btnSyncNow').addEventListener('click', () => runSync());
    $('#btnLock').addEventListener('click', async () => {
      if (pending.length && !confirm(`${pending.length} Änderung(en) sind noch nicht übertragen und gehen beim Abmelden verloren. Trotzdem abmelden?`)) return;
      lsDel(LS_CACHE); await lockOut('Abgemeldet.');
    });
    $('#btnRename').addEventListener('click', () => {
      const n = prompt('Dein Name (erscheint im Verlauf):', me);
      if (n && n.trim()) { me = n.trim().slice(0, 40); lsSet(LS_NAME, me); renderSyncInfo(); toast('Name gespeichert.'); }
    });
    $('#tokenForm').addEventListener('submit', async e => {
      e.preventDefault();
      const btn = e.submitter; btn.disabled = true;
      try { await saveTeamToken(e.target.elements.token.value.trim()); e.target.reset(); toast('Team-Token verschlüsselt im Repository hinterlegt.'); runSync(); }
      catch (err) { toast(err.message, true); }
      finally { btn.disabled = false; renderSyncInfo(); }
    });
    $('#pwForm').addEventListener('submit', async e => {
      e.preventDefault();
      const f = e.target, btn = e.submitter;
      if (f.elements.pw1.value !== f.elements.pw2.value) return toast('Passwörter stimmen nicht überein.', true);
      if (!confirm('Alle Geräte müssen sich danach mit dem neuen Passwort anmelden. Fortfahren?')) return;
      btn.disabled = true; setCloud('syncing');
      try { await changePassword(f.elements.pw1.value); f.reset(); setCloud('synced'); toast('Passwort geändert, Daten neu verschlüsselt.'); }
      catch (err) { setCloud('error', err.message); toast(err.message, true); }
      finally { btn.disabled = false; }
    });
    $('#btnExportCsv').addEventListener('click', exportCsv);
    $('#btnExportJson').addEventListener('click', exportJson);
    $('#fileImport').addEventListener('change', e => { if (e.target.files[0]) importFile(e.target.files[0]); e.target.value = ''; });

    window.addEventListener('online', () => runSync());
    window.addEventListener('offline', () => key && setCloud('offline'));
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && key) runSync(); });
    document.addEventListener('keydown', e => {
      if (!key || e.target.matches('input, select, textarea') || $('#dlg').open || $('#scanDlg').open || $('#useDlg').open || $('#printerDlg').open || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'n' || e.key === 'N') { e.preventDefault(); openDialog(null); }
      if (e.key === 'f' || e.key === 'F') { e.preventDefault(); Scan.open(); }
      if (e.key === 'Escape' && selected.size) { selected.clear(); renderTable(); }
      if (e.key === '/') { e.preventDefault(); switchView('bestand'); $('#q').focus(); }
    });
    setInterval(() => { if (sync.state === 'synced') setCloud('synced'); }, 60000);
  }

  // ---------- Foto-Erfassung (Lieferschein / Etikett) ----------
  const Scan = {
    rows: [], raw: [], busy: false,
    mode: () => $('input[name=scanMode]:checked').value,
    engine: () => (team.anthropicKey && $('input[name=engine]:checked').value === 'ai' ? 'ai' : 'local'),
    open() {
      if (!key) return;
      if (isResin()) switchView('bestand', 'filamente');
      $('#engineSeg').hidden = !team.anthropicKey;
      if (team.anthropicKey) $('input[name=engine][value=ai]').checked = true;
      this.step(1);
      $('#scanDlg').showModal();
    },
    step(n) {
      $('#scanStep1').hidden = n !== 1; $('#scanStep2').hidden = n !== 2;
      $('#scanProgress').hidden = true; $('#scanRawText').hidden = true;
      if (n === 1) { this.rows = []; this.raw = []; $('#scanThumbs').innerHTML = ''; }
    },
    progress(text, p) {
      const el = $('#scanProgress'); el.hidden = false;
      el.querySelector('.bar-in').style.width = Math.round((p || 0) * 100) + '%';
      el.querySelector('span').textContent = text;
    },
    async handle(files) {
      if (!files.length || this.busy) return;
      this.busy = true;
      const mode = this.mode(), engine = this.engine();
      const found = [];
      try {
        for (let i = 0; i < files.length; i++) {
          const f = files[i], pre = files.length > 1 ? `Bild ${i + 1}/${files.length}: ` : '';
          $('#scanThumbs').insertAdjacentHTML('beforeend', `<img src="${URL.createObjectURL(f)}" alt="Foto ${i + 1}">`);
          if (engine === 'ai') {
            this.progress(pre + 'KI wertet das Foto aus …', 0.5);
            found.push(...await FBRecognize.claude(f, team.anthropicKey, mode));
            this.raw.push(`[Bild ${i + 1}] per KI ausgewertet`);
          } else {
            const text = await FBRecognize.ocr(f, (t, p) => this.progress(pre + t + ' …', p));
            this.raw.push(`[Bild ${i + 1}]\n${text}`);
            found.push(...FBRecognize.parseText(text, mode));
          }
        }
      } catch (e) {
        toast(e.message, true);
        if (engine === 'ai' && !found.length) { this.busy = false; this.progress('Fehler: ' + e.message, 0); return; }
      } finally { this.busy = false; }
      // gleiche Positionen zusammenfassen
      const merged = [];
      for (const c of found) {
        const k = [c.typ, c.farbe, c.hersteller, c.kgProRolle].join('|').toLowerCase();
        const m = merged.find(x => x.k === k);
        if (m) m.rollen += c.rollen; else merged.push({ ...c, k });
      }
      this.rows = merged.map(c => this.complete(c));
      if (!this.rows.length) this.rows.push(this.complete({ rollen: 1 }));
      $('#scanInfo').textContent = found.length
        ? `${this.rows.length} Position(en) erkannt (${engine === 'ai' ? 'KI' : 'lokale Texterkennung'}). Bitte prüfen und bei Bedarf korrigieren.`
        : 'Keine Filament-Position sicher erkannt – bitte manuell ergänzen oder ein schärferes Foto verwenden.';
      this.step(2); this.renderList();
    },
    /** Ergänzt fehlende Angaben und ordnet einem vorhandenen Eintrag zu. */
    complete(c) {
      const typ = this.matchName(c.typ || '', comboOptions('typ')) || c.typ || '';
      const r = {
        use: true, typ, farbe: this.matchName(c.farbe || '', comboOptions('farbe')) || c.farbe || '',
        hersteller: this.matchName(c.hersteller || '', comboOptions('hersteller')) || c.hersteller || '',
        rollen: Math.max(1, Math.round(c.rollen || 1)), kgProRolle: c.kgProRolle || 1,
        durchmesser: c.durchmesser || 1.75, quelle: c.quelle || ''
      };
      return r;
    },
    matchName: (v, list) => list.find(x => x.toLowerCase() === String(v).toLowerCase()),
    existing(r) {
      const lc = s => String(s || '').toLowerCase();
      return db.filamente.find(f => lc(f.typ) === lc(r.typ) && lc(f.farbe) === lc(r.farbe) && lc(f.hersteller) === lc(r.hersteller) && Math.abs(f.kgProRolle - r.kgProRolle) < 0.01);
    },
    renderList() {
      $('#dlTyp').innerHTML = comboOptions('typ').map(x => `<option value="${esc(x)}">`).join('');
      $('#dlFarbe').innerHTML = comboOptions('farbe').map(x => `<option value="${esc(x)}">`).join('');
      $('#dlHersteller').innerHTML = comboOptions('hersteller').map(x => `<option value="${esc(x)}">`).join('');
      $('#scanList').innerHTML = this.rows.map((r, i) => {
        const ex = this.existing(r);
        return `<div class="scan-row${r.use ? '' : ' off'}" data-i="${i}">
          <label class="use"><input type="checkbox" data-f="use"${r.use ? ' checked' : ''} aria-label="Übernehmen"></label>
          <div class="scan-fields">
            <label>Typ<input data-f="typ" list="dlTyp" value="${esc(r.typ)}" autocomplete="off"></label>
            <label>Farbe<input data-f="farbe" list="dlFarbe" value="${esc(r.farbe)}" autocomplete="off"></label>
            <label>Hersteller<input data-f="hersteller" list="dlHersteller" value="${esc(r.hersteller)}" autocomplete="off"></label>
            <label class="n">Rollen<input data-f="rollen" type="number" min="1" step="1" inputmode="numeric" value="${r.rollen}"></label>
            <label class="n">kg/Rolle<input data-f="kgProRolle" type="number" min="0.05" step="0.05" inputmode="decimal" value="${r.kgProRolle}"></label>
          </div>
          <div class="scan-meta">${swatch({ farbe: r.farbe })}<span class="${ex ? 'match' : 'new'}">${ex ? `→ zu vorhandenem Eintrag (${ex.rollen} Rollen) addieren` : '→ neuer Eintrag'}</span>
            ${r.quelle ? `<small title="${esc(r.quelle)}">„${esc(r.quelle.slice(0, 70))}${r.quelle.length > 70 ? '…' : ''}“</small>` : ''}
            <button class="iconbtn del" data-del="${i}" aria-label="Zeile entfernen">🗑</button></div>
        </div>`;
      }).join('');
      const n = this.rows.filter(r => r.use && r.typ).length;
      $('#scanApply').textContent = `${n} Position(en) übernehmen`;
      $('#scanApply').disabled = n === 0;
      $('#scanRawText').textContent = this.raw.join('\n\n');
    },
    apply() {
      const ops = [], used = this.rows.filter(r => r.use && r.typ);
      const src = this.mode() === 'etikett' ? 'Etikett' : 'Lieferschein';
      for (const r of used) {
        const ex = this.existing(r);
        if (ex) { ops.push([{ op: 'delta', coll: 'filamente', id: ex.id, d: r.rollen }, `Foto-Import (${src}): +${r.rollen} Rolle(n) ${label(ex)}`, r.rollen * ex.kgProRolle]); continue; }
        const gruppe = db.typen[r.typ] || STANDARD_TYPEN[r.typ] || r.typ.replace(/\s+(Matte|Silk|Metal|StoneFill|Composite|\d{2}A|VarioShore)$/i, '');
        if (!db.typen[r.typ]) ops.push([{ op: 'typ', typ: r.typ, gruppe }]);
        const item = { id: uid(), typ: r.typ, gruppe, farbe: r.farbe, farbcode: '', hersteller: r.hersteller, rollen: r.rollen, kgProRolle: r.kgProRolle, durchmesser: r.durchmesser, mindestbestand: 0, lagerort: '', bemerkung: '' };
        ops.push([{ op: 'add', coll: 'filamente', id: item.id, item }, `Foto-Import (${src}): Neu ${label(item)} – ${r.rollen} Rolle(n)`, r.rollen * r.kgProRolle]);
      }
      commitAll(ops);
      $('#scanDlg').close();
      toast(`${used.length} Position(en) übernommen.`);
    },
    bind() {
      $('#btnScan').addEventListener('click', () => this.open());
      $('#fabScan').addEventListener('click', () => this.open());
      $('#scanClose').addEventListener('click', () => $('#scanDlg').close());
      $('#scanBack').addEventListener('click', () => this.step(1));
      for (const id of ['#scanCam', '#scanFiles']) $(id).addEventListener('change', e => { const fs = [...e.target.files]; e.target.value = ''; this.handle(fs); });
      $('#scanList').addEventListener('input', e => {
        const inp = e.target.closest('[data-f]'); if (!inp) return;
        const r = this.rows[+inp.closest('.scan-row').dataset.i], f = inp.dataset.f;
        r[f] = f === 'use' ? inp.checked : (f === 'rollen' || f === 'kgProRolle') ? num(inp.value) : inp.value.trim();
        if (f === 'use' || e.type === 'change') this.renderList();
      });
      $('#scanList').addEventListener('change', e => { if (e.target.closest('[data-f]')) this.renderList(); });
      $('#scanList').addEventListener('click', e => { const b = e.target.closest('[data-del]'); if (b) { this.rows.splice(+b.dataset.del, 1); this.renderList(); } });
      $('#scanAddRow').addEventListener('click', () => { this.rows.push(this.complete({ rollen: 1 })); this.renderList(); });
      $('#scanRaw').addEventListener('click', () => { $('#scanRawText').hidden = !$('#scanRawText').hidden; });
      $('#scanApply').addEventListener('click', () => this.apply());
    }
  };

  // ---------- In Verwendung (geöffnete Rollen, AMS / Drucker) ----------
  /** Platzbezeichnungen eines Druckers: AMS-Plätze A1–A4, B1–B4 … bzw. „Spule“, plus „Ext“. */
  function slotsOf(p) {
    const out = [];
    for (let i = 0; i < p.slots; i++) out.push(p.slots === 1 ? 'Spule' : `${String.fromCharCode(65 + Math.floor(i / 4))}${(i % 4) + 1}`);
    if (p.ext) out.push('Ext');
    return out;
  }
  const printerName = id => db.drucker.find(p => p.id === id)?.name || '';
  const placeText = u => u.drucker ? `${printerName(u.drucker) || 'Drucker'} · ${u.slot}` : 'Regal (angebrochen)';
  const useLabel = u => `${label(u)}`;

  const InUse = {
    render() {
      const iu = db.inUse, free = db.drucker.reduce((n, p) => n + slotsOf(p).filter(s => !iu.some(u => u.drucker === p.id && u.slot === s)).length, 0);
      const low = iu.filter(u => u.rest <= 15).length;
      $('#kpiInUse').innerHTML = kpiHtml([
        ['Geöffnete Rollen', iu.length], ['Rest gesamt', fmt(iu.reduce((s, u) => s + restKg(u), 0), 1), 'kg'],
        ['Im Drucker', iu.filter(u => u.drucker).length], ['Freie Plätze', free],
        ['Fast leer (≤ 15 %)', low, '', low ? 'warn' : '']
      ]);
      $('#printerGrid').innerHTML = db.drucker.length ? db.drucker.map(p => {
        const slots = slotsOf(p);
        return `<div class="card printer"><h3>${esc(p.name)} <span class="unit">${p.slots ? `${p.slots} AMS-Plätze` : 'ohne AMS'}${p.ext ? ' + extern' : ''}</span></h3>
          <div class="slots">${slots.map(sl => {
            const u = iu.find(x => x.drucker === p.id && x.slot === sl);
            if (!u) return `<button class="slot empty" data-p="${esc(p.id)}" data-s="${esc(sl)}"><span class="sl">${esc(sl)}</span><span class="plus">+</span><span class="t">frei</span></button>`;
            return `<button class="slot ${u.rest <= 15 ? 'low' : ''}" data-u="${esc(u.id)}" title="${esc(useLabel(u))} – ${u.rest} %">
              <span class="sl">${esc(sl)}</span>${swatch(u).replace('class="swatch', 'class="swatch big')}
              <span class="t">${esc(u.typ)}</span><span class="h">${esc(u.farbe || '')}${u.hersteller ? ' · ' + esc(u.hersteller) : ''}</span>
              <span class="restbar"><span style="width:${u.rest}%"></span></span><span class="pct">${u.rest} % · ${fmt(restKg(u) * 1000, 0)} g</span></button>`;
          }).join('')}</div></div>`;
      }).join('') : `<div class="card empty-printers"><p>Noch keine Drucker angelegt.</p><button class="btn primary" data-act="printers">Drucker anlegen</button></div>`;
      const shelf = iu.filter(u => !u.drucker);
      $('#shelfCount').textContent = shelf.length ? `${shelf.length} Rolle(n) · ${fmt(shelf.reduce((s, u) => s + restKg(u), 0), 1)} kg` : '';
      $('#shelfList').innerHTML = shelf.length ? shelf.map(u => `<button class="shelf-item" data-u="${esc(u.id)}">${swatch(u)}<span class="t">${esc(useLabel(u))}</span><span class="restbar"><span style="width:${u.rest}%"></span></span><span class="pct">${u.rest} %</span></button>`).join('')
        : '<p class="hint">Keine angebrochenen Rollen außerhalb der Drucker.</p>';
    },
    bind() {
      $('#printerGrid').addEventListener('click', e => {
        const b = e.target.closest('button'); if (!b) return;
        if (b.dataset.act === 'printers') return Printers.open();
        if (b.dataset.u) return Use.openEdit(b.dataset.u);
        if (b.dataset.p) return Use.openLoad({ place: `${b.dataset.p}|${b.dataset.s}` });
      });
      $('#shelfList').addEventListener('click', e => { const b = e.target.closest('[data-u]'); if (b) Use.openEdit(b.dataset.u); });
      $('#btnUseNew').addEventListener('click', () => Use.openLoad({}));
      $('#btnPrinters').addEventListener('click', () => Printers.open());
    }
  };

  const Use = {
    mode: 'load', editId: null,
    placeOptions(currentId) {
      const opts = [`<option value="">Regal – nicht im Drucker</option>`];
      for (const p of db.drucker) {
        opts.push(`<optgroup label="${esc(p.name)}">` + slotsOf(p).map(sl => {
          const occ = db.inUse.find(u => u.drucker === p.id && u.slot === sl && u.id !== currentId);
          return `<option value="${esc(p.id)}|${esc(sl)}">${esc(p.name)} · ${esc(sl)}${occ ? ` (belegt: ${esc(occ.typ)} ${esc(occ.farbe)} → kommt ins Regal)` : ' (frei)'}</option>`;
        }).join('') + '</optgroup>');
      }
      return opts.join('');
    },
    openLoad({ src = '', place = '' }) {
      if (!key) return;
      this.mode = 'load'; this.editId = null;
      const shelf = db.inUse.filter(u => !u.drucker), stock = db.filamente.filter(f => f.rollen > 0).sort((a, b) => label(a).localeCompare(label(b), 'de'));
      if (!shelf.length && !stock.length) return toast('Keine Rollen im Lager vorhanden.', true);
      $('#useTitle').textContent = 'Rolle einlegen / öffnen';
      $('#useHead').innerHTML = '';
      $('#useSrcWrap').hidden = false; $('#useSrc').required = true;
      $('#useSrc').innerHTML = (shelf.length ? `<optgroup label="Angebrochen (Regal)">${shelf.map(u => `<option value="u:${esc(u.id)}">${esc(useLabel(u))} – ${u.rest} %</option>`).join('')}</optgroup>` : '')
        + `<optgroup label="Neue Rolle aus dem Lager öffnen">${stock.map(f => `<option value="f:${esc(f.id)}">${esc(label(f))} · ${fmt(f.kgProRolle)} kg (${f.rollen} im Lager)</option>`).join('')}</optgroup>`;
      if (src) $('#useSrc').value = src;
      $('#usePlace').innerHTML = this.placeOptions(null);
      $('#usePlace').value = place || (db.drucker.length ? this.firstFree() : '');
      this.syncRest(); $('#useExtra').hidden = true;
      $('#useDlg').showModal();
    },
    firstFree() {
      for (const p of db.drucker) for (const sl of slotsOf(p)) if (!db.inUse.some(u => u.drucker === p.id && u.slot === sl)) return `${p.id}|${sl}`;
      return '';
    },
    openEdit(id) {
      const u = db.inUse.find(x => x.id === id); if (!u) return;
      this.mode = 'edit'; this.editId = id;
      $('#useTitle').textContent = 'Geöffnete Rolle';
      $('#useHead').innerHTML = `${swatch(u)}<b>${esc(useLabel(u))}</b><small>${esc(placeText(u))}${u.geoeffnet ? ' · geöffnet ' + new Date(u.geoeffnet).toLocaleDateString('de-DE') : ''}</small>`;
      $('#useSrcWrap').hidden = true; $('#useSrc').required = false; $('#useSrc').innerHTML = '';
      $('#usePlace').innerHTML = this.placeOptions(id);
      $('#usePlace').value = u.drucker ? `${u.drucker}|${u.slot}` : '';
      $('#useRest').value = u.rest; this.syncRest();
      $('#useExtra').hidden = false;
      $('#useBack').hidden = !(u.rest === 100 && db.filamente.some(f => f.id === u.ref));
      $('#useDlg').showModal();
    },
    srcItem() {
      if (this.mode === 'edit') return db.inUse.find(x => x.id === this.editId);
      const v = $('#useSrc').value || '';
      return v.startsWith('u:') ? db.inUse.find(x => x.id === v.slice(2)) : db.filamente.find(x => x.id === v.slice(2));
    },
    syncRest() {
      if (this.mode === 'load') {
        const v = $('#useSrc').value || '';
        if (v.startsWith('f:')) $('#useRest').value = 100;
        else if (v.startsWith('u:')) $('#useRest').value = db.inUse.find(x => x.id === v.slice(2))?.rest ?? 100;
      }
      const it = this.srcItem(), r = +$('#useRest').value;
      $('#useRestOut').textContent = r;
      $('#useRestKg').textContent = it ? `${fmt(r / 100 * it.kgProRolle * 1000, 0)} g von ${fmt(it.kgProRolle * 1000, 0)} g` : '';
    },
    /** Belegten Platz freimachen (Rolle ins Regal) */
    evictOps(pid, sl, exceptId) {
      const occ = db.inUse.find(u => u.drucker === pid && u.slot === sl && u.id !== exceptId);
      return occ ? [[{ op: 'patch', coll: 'inUse', id: occ.id, fields: { drucker: '', slot: '' } }, `Ins Regal: ${useLabel(occ)} (von ${placeText(occ)})`, 0]] : [];
    },
    save() {
      const [pid = '', sl = ''] = ($('#usePlace').value || '').split('|');
      const rest = +$('#useRest').value, ops = [];
      const where = pid ? `${printerName(pid)} · ${sl}` : 'Regal';
      if (this.mode === 'load') {
        const v = $('#useSrc').value || '';
        if (v.startsWith('f:')) {
          const f = db.filamente.find(x => x.id === v.slice(2)); if (!f || f.rollen < 1) return toast('Diese Rolle ist nicht mehr im Lager.', true);
          if (pid) ops.push(...this.evictOps(pid, sl));
          const nu = normalizeUse({ ref: f.id, typ: f.typ, gruppe: f.gruppe, farbe: f.farbe, farbcode: f.farbcode, hersteller: f.hersteller, kgProRolle: f.kgProRolle, durchmesser: f.durchmesser, rest, drucker: pid, slot: sl, geoeffnet: new Date().toISOString() });
          ops.push([{ op: 'delta', coll: 'filamente', id: f.id, d: -1 }]);
          ops.push([{ op: 'add', coll: 'inUse', id: nu.id, item: nu }, `Geöffnet: ${label(f)} → ${where}`, 0]);
        } else if (v.startsWith('u:')) {
          const u = db.inUse.find(x => x.id === v.slice(2)); if (!u) return;
          if (pid) ops.push(...this.evictOps(pid, sl, u.id));
          ops.push([{ op: 'patch', coll: 'inUse', id: u.id, fields: { drucker: pid, slot: sl, rest } }, `Eingelegt: ${useLabel(u)} → ${where}`, rest < u.rest ? -(u.rest - rest) / 100 * u.kgProRolle : 0]);
        }
      } else {
        const u = db.inUse.find(x => x.id === this.editId); if (!u) return;
        const moved = (u.drucker || '') !== pid || (u.slot || '') !== sl, fields = {};
        if (moved) { if (pid) ops.push(...this.evictOps(pid, sl, u.id)); fields.drucker = pid; fields.slot = sl; }
        if (rest !== u.rest) fields.rest = rest;
        if (!Object.keys(fields).length) return;
        const txt = [rest !== u.rest ? `Rest ${u.rest} % → ${rest} %` : '', moved ? `→ ${where}` : ''].filter(Boolean).join(', ');
        ops.push([{ op: 'patch', coll: 'inUse', id: u.id, fields }, `${useLabel(u)}: ${txt}`, rest < u.rest ? -(u.rest - rest) / 100 * u.kgProRolle : 0]);
      }
      commitAll(ops);
      toast('Gespeichert.');
    },
    empty() {
      const u = db.inUse.find(x => x.id === this.editId); if (!u) return;
      if (!confirm(`„${useLabel(u)}“ ist leer und wird entfernt?`)) return;
      const copy = clone(u);
      commit({ op: 'del', coll: 'inUse', id: u.id }, `Leer & entsorgt: ${useLabel(u)} (${placeText(u)})`, -restKg(u));
      $('#useDlg').close();
      toast('Rolle entfernt.', false, () => commit({ op: 'add', coll: 'inUse', id: copy.id, item: copy }, `Wiederhergestellt: ${useLabel(copy)}`, restKg(copy)));
    },
    back() {
      const u = db.inUse.find(x => x.id === this.editId); if (!u) return;
      commitAll([[{ op: 'del', coll: 'inUse', id: u.id }], [{ op: 'delta', coll: 'filamente', id: u.ref, d: 1 }, `Ungeöffnet zurück ins Lager: ${useLabel(u)}`, 0]]);
      $('#useDlg').close(); toast('Zurück im Lager.');
    },
    bind() {
      $('#useSrc').addEventListener('change', () => this.syncRest());
      $('#useRest').addEventListener('input', () => this.syncRest());
      $('#useQuick').addEventListener('click', e => { const b = e.target.closest('[data-r]'); if (b) { $('#useRest').value = b.dataset.r; this.syncRest(); } });
      $('#useForm').addEventListener('submit', e => { if (e.submitter?.value === 'ok') this.save(); });
      $('#useEmpty').addEventListener('click', () => this.empty());
      $('#useBack').addEventListener('click', () => this.back());
      $('#useDlg').addEventListener('click', e => { if (e.target === $('#useDlg')) $('#useDlg').close(); });
    }
  };

  const Printers = {
    rows: [],
    open() {
      this.rows = db.drucker.length ? clone(db.drucker) : [normalizePrinter({ name: 'Drucker 1', slots: 4, ext: true })];
      this.render(); $('#printerDlg').showModal();
    },
    render() {
      $('#printerRows').innerHTML = this.rows.map((p, i) => `<div class="prow" data-i="${i}">
        <label>Name<input data-f="name" value="${esc(p.name)}" maxlength="40" required></label>
        <label class="n">AMS-Plätze<input data-f="slots" type="number" min="0" max="16" step="1" inputmode="numeric" value="${p.slots}"></label>
        <label class="toggle"><input type="checkbox" data-f="ext"${p.ext ? ' checked' : ''}> <span>Ext.</span></label>
        <button type="button" class="iconbtn del" data-del="${i}" aria-label="Drucker entfernen">🗑</button></div>`).join('') || '<p class="hint">Keine Drucker.</p>';
    },
    save() {
      const list = this.rows.map(normalizePrinter).filter(p => p.name);
      const ops = [[{ op: 'drucker', list }, `Drucker aktualisiert (${list.map(p => p.name).join(', ') || 'keine'})`, 0]];
      // Rollen in entfernten Druckern / weggefallenen Plätzen ins Regal
      for (const u of db.inUse.filter(u => u.drucker)) {
        const p = list.find(x => x.id === u.drucker);
        if (!p || !slotsOf(p).includes(u.slot)) ops.push([{ op: 'patch', coll: 'inUse', id: u.id, fields: { drucker: '', slot: '' } }, `Ins Regal: ${useLabel(u)} (Platz entfällt)`, 0]);
      }
      commitAll(ops); toast('Drucker gespeichert.');
    },
    bind() {
      $('#printerRows').addEventListener('input', e => {
        const inp = e.target.closest('[data-f]'); if (!inp) return;
        const r = this.rows[+inp.closest('.prow').dataset.i];
        r[inp.dataset.f] = inp.type === 'checkbox' ? inp.checked : inp.type === 'number' ? num(inp.value) : inp.value;
      });
      $('#printerRows').addEventListener('click', e => { const b = e.target.closest('[data-del]'); if (b) { this.rows.splice(+b.dataset.del, 1); this.render(); } });
      $('#printerAdd').addEventListener('click', () => { this.rows.push(normalizePrinter({ name: `Drucker ${this.rows.length + 1}`, slots: 4, ext: false })); this.render(); });
      $('#printerForm').addEventListener('submit', e => { if (e.submitter?.value === 'ok') this.save(); });
    }
  };

  // Für Tests/Diagnose
  window.__fb = { get state() { return { pending: pending.length, sync: sync.state, items: db.filamente.length, resin: db.resin.length, inUse: db.inUse.length, drucker: db.drucker.length, baseSha }; }, get db() { return db; }, runSync };
  boot();
})();

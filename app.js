/* Filamentbestand – statische WebApp, Daten in data/filamente.json (optional per GitHub-API synchronisiert) */
(() => {
  'use strict';

  const LS_DATA = 'filamentbestand.data.v1';
  const LS_SYNC = 'filamentbestand.sync.v1';
  const LS_UI = 'filamentbestand.ui.v1';
  const DATA_URL = 'data/filamente.json';

  const STANDARD_TYPEN = {
    'PLA': 'PLA', 'PLA+': 'PLA+', 'PLA+ Matte': 'PLA+', 'PLA+ Silk': 'PLA+', 'PLA+ Metal': 'PLA+',
    'PLA+ Composite': 'PLA+', 'PLA+ StoneFill': 'PLA+', 'ecoPLA+': 'PLA+', 'PLA-CF': 'PLA-CF',
    'PETG': 'PETG', 'PETG-CF': 'PETG-CF', 'ABS': 'ABS', 'ABS+': 'ABS+', 'ASA': 'ASA', 'ASA+': 'ASA+',
    'TPU': 'TPU', 'TPU 95A': 'TPU', 'TPU 60A': 'TPU', 'TPU VarioShore': 'TPU',
    'PA (Nylon)': 'PA', 'PA-CF': 'PA-CF', 'PC': 'PC', 'PVA': 'PVA', 'HIPS': 'HIPS'
  };
  const FARBEN = {
    schwarz: '#141414', weiß: '#f2f2f2', weiss: '#f2f2f2', grau: '#8a8d93', silber: '#c7cbd1',
    orange: '#ff7a1a', rot: '#e53935', blau: '#1e6fe0', grün: '#2fa84f', gruen: '#2fa84f', gelb: '#f6d02f',
    bronze: '#b87333', stahl: '#6f7b85', stonefill: '#a39b8b', anthrazit: '#383e42', braun: '#7a4b2a',
    natur: '#e8dcc2', beige: '#d9c7a3', gold: '#d4af37', kupfer: '#c26a3a', lila: '#8e44ad', violett: '#8e44ad',
    pink: '#ff5fa2', rosa: '#f6a6c1', türkis: '#1abc9c', cyan: '#19c3e6', olive: '#7d7f3a', holz: '#a07850'
  };

  // ---------- State ----------
  let db = { version: 1, aktualisiert: null, typen: {}, filamente: [], verlauf: [] };
  let ui = { q: '', gruppe: '', farbe: '', hersteller: '', knapp: false, sort: { key: 'gruppe', dir: 1 }, view: 'bestand' };
  let sync = { owner: '', repo: '', branch: 'main', path: DATA_URL, token: '', auto: false, sha: null };
  let editingId = null;
  let pushTimer = null;

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (n, d = 2) => Number(n || 0).toLocaleString('de-DE', { maximumFractionDigits: d });
  const num = v => { const n = parseFloat(String(v ?? '').replace(',', '.')); return isFinite(n) ? n : 0; };
  const uid = () => 'f' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const gesamt = f => num(f.rollen) * num(f.kgProRolle);
  const isLow = f => num(f.mindestbestand) > 0 && num(f.rollen) <= num(f.mindestbestand);
  const label = f => [f.typ, f.farbe].filter(Boolean).join(' · ') + (f.hersteller ? ` (${f.hersteller})` : '');
  const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } };

  // ---------- Daten laden / speichern ----------
  function normalize(data) {
    const d = data && typeof data === 'object' ? data : {};
    const list = Array.isArray(d) ? d : (d.filamente || []);
    return {
      version: 1,
      aktualisiert: d.aktualisiert || null,
      typen: { ...STANDARD_TYPEN, ...(d.typen || {}) },
      verlauf: Array.isArray(d.verlauf) ? d.verlauf.slice(-500) : [],
      filamente: list.map(f => ({
        id: f.id || uid(),
        typ: String(f.typ || '').trim(),
        gruppe: String(f.gruppe || '').trim() || STANDARD_TYPEN[String(f.typ || '').trim()] || String(f.typ || '').trim(),
        farbe: String(f.farbe || '').trim(),
        farbcode: f.farbcode || '',
        hersteller: String(f.hersteller || '').trim(),
        rollen: Math.max(0, Math.round(num(f.rollen))),
        kgProRolle: num(f.kgProRolle ?? f.kg ?? 1),
        durchmesser: num(f.durchmesser) || 1.75,
        mindestbestand: Math.max(0, Math.round(num(f.mindestbestand))),
        lagerort: String(f.lagerort || '').trim(),
        bemerkung: String(f.bemerkung || '').trim()
      }))
    };
  }

  async function fetchRepoFile() {
    const r = await fetch(DATA_URL + '?t=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return normalize(await r.json());
  }

  async function init() {
    sync = { ...sync, ...lsGet(LS_SYNC, {}) };
    ui = { ...ui, ...lsGet(LS_UI, {}) };
    guessRepo();
    const local = lsGet(LS_DATA, null);
    let remote = null;
    try { remote = await fetchRepoFile(); } catch (e) { console.warn('Repo-Datei nicht ladbar', e); }

    if (local && (!remote || (local.aktualisiert || '') >= (remote.aktualisiert || ''))) {
      db = normalize(local);
    } else if (remote) {
      db = remote;
      if (local) toast('Neuerer Stand aus dem Repository geladen.');
    } else {
      db = normalize({});
      toast('Keine Daten gefunden – starte mit leerem Bestand.', true);
    }
    saveLocal(false);
    bind();
    fillSyncForm();
    switchView(ui.view || 'bestand');
    render();
    setSyncState(sync.token ? 'GitHub bereit' : 'lokal', sync.token ? 'ok' : '');
  }

  function guessRepo() {
    const h = location.hostname;
    if (!sync.owner && h.endsWith('.github.io')) sync.owner = h.split('.')[0];
    if (!sync.repo && h.endsWith('.github.io')) sync.repo = location.pathname.split('/').filter(Boolean)[0] || '';
    if (!sync.repo) sync.repo = 'filamentbestand';
  }

  function saveLocal(touch = true) {
    if (touch) db.aktualisiert = new Date().toISOString();
    lsSet(LS_DATA, db);
    if (touch && sync.auto && sync.token) {
      clearTimeout(pushTimer);
      setSyncState('Änderung …', 'busy');
      pushTimer = setTimeout(() => push(true), 1500);
    } else if (touch) {
      setSyncState(sync.token ? 'nicht synchronisiert' : 'lokal gespeichert', sync.token ? 'busy' : '');
    }
  }

  function log(text, deltaKg = 0) {
    db.verlauf.push({ t: new Date().toISOString(), text, kg: Math.round(deltaKg * 1000) / 1000 });
    if (db.verlauf.length > 500) db.verlauf = db.verlauf.slice(-500);
  }

  // ---------- GitHub Sync ----------
  const ghUrl = () => `https://api.github.com/repos/${encodeURIComponent(sync.owner)}/${encodeURIComponent(sync.repo)}/contents/${sync.path.split('/').map(encodeURIComponent).join('/')}`;
  const ghHeaders = () => ({ 'Accept': 'application/vnd.github+json', 'Authorization': `Bearer ${sync.token}`, 'X-GitHub-Api-Version': '2022-11-28' });
  const b64enc = s => { const bytes = new TextEncoder().encode(s); let bin = ''; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(bin); };
  const b64dec = s => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/\n/g, '')), c => c.charCodeAt(0)));

  async function ghGet() {
    const r = await fetch(`${ghUrl()}?ref=${encodeURIComponent(sync.branch)}&t=${Date.now()}`, { headers: ghHeaders(), cache: 'no-store' });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`GitHub ${r.status}: ${(await r.json().catch(() => ({}))).message || r.statusText}`);
    const j = await r.json();
    return { sha: j.sha, data: normalize(JSON.parse(b64dec(j.content))) };
  }

  async function pull() {
    if (!checkSync()) return;
    setSyncState('lade …', 'busy');
    try {
      const res = await ghGet();
      if (!res) throw new Error('Datei im Repository nicht gefunden');
      db = res.data; sync.sha = res.sha; lsSet(LS_SYNC, sync);
      saveLocal(false); render();
      setSyncState('synchronisiert', 'ok'); toast('Bestand von GitHub geladen.');
    } catch (e) { setSyncState('Fehler', 'err'); toast(e.message, true); }
  }

  async function push(silent = false) {
    if (!checkSync()) return;
    setSyncState('speichere …', 'busy');
    try {
      const remote = await ghGet();
      if (remote && remote.data.aktualisiert && db.aktualisiert && remote.data.aktualisiert > db.aktualisiert && remote.sha !== sync.sha) {
        if (!confirm('Im Repository liegt ein neuerer Stand (von jemand anderem gespeichert).\n\nOK = trotzdem überschreiben\nAbbrechen = nichts tun (danach „Von GitHub laden“)')) {
          setSyncState('Konflikt', 'err'); return;
        }
      }
      const body = {
        message: `Filamentbestand aktualisiert (${new Date().toLocaleString('de-DE')})`,
        content: b64enc(JSON.stringify(db, null, 2) + '\n'),
        branch: sync.branch
      };
      if (remote) body.sha = remote.sha;
      const r = await fetch(ghUrl(), { method: 'PUT', headers: { ...ghHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!r.ok) throw new Error(`GitHub ${r.status}: ${(await r.json().catch(() => ({}))).message || r.statusText}`);
      sync.sha = (await r.json()).content.sha; lsSet(LS_SYNC, sync);
      setSyncState('synchronisiert', 'ok');
      if (!silent) toast('Nach GitHub gespeichert.');
    } catch (e) { setSyncState('Fehler', 'err'); toast(e.message, true); }
  }

  function checkSync() {
    if (!sync.owner || !sync.repo || !sync.branch || !sync.path || !sync.token) {
      toast('Bitte zuerst GitHub-Einstellungen inkl. Token ausfüllen.', true);
      switchView('einstellungen');
      return false;
    }
    return true;
  }

  function setSyncState(text, cls) {
    const el = $('#syncState');
    el.textContent = text; el.className = 'sync-state ' + (cls || '');
  }

  function fillSyncForm() {
    const f = $('#syncForm');
    ['owner', 'repo', 'branch', 'path', 'token'].forEach(k => { f.elements[k].value = sync[k] || ''; });
    f.elements.auto.checked = !!sync.auto;
  }

  // ---------- Filter & Sortierung ----------
  function filtered() {
    const q = ui.q.trim().toLowerCase();
    const { key, dir } = ui.sort;
    return db.filamente
      .filter(f => !ui.gruppe || f.gruppe === ui.gruppe)
      .filter(f => !ui.farbe || (f.farbe || '–') === ui.farbe)
      .filter(f => !ui.hersteller || (f.hersteller || '–') === ui.hersteller)
      .filter(f => !ui.knapp || isLow(f) || f.rollen === 0)
      .filter(f => !q || [f.typ, f.gruppe, f.farbe, f.hersteller, f.bemerkung, f.lagerort].join(' ').toLowerCase().includes(q))
      .sort((a, b) => {
        const va = key === 'gesamt' ? gesamt(a) : a[key], vb = key === 'gesamt' ? gesamt(b) : b[key];
        let c = (typeof va === 'number' && typeof vb === 'number') ? va - vb
          : String(va || '￿').localeCompare(String(vb || '￿'), 'de', { sensitivity: 'base' });
        if (c === 0) c = String(a.typ + a.farbe).localeCompare(b.typ + b.farbe, 'de');
        return c * dir;
      });
  }

  const uniq = (field, list = db.filamente) => [...new Set(list.map(f => f[field] || '–'))].sort((a, b) => a.localeCompare(b, 'de'));

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

  function kpiHtml(items) {
    return items.map(([l, v, unit, cls]) => `<div class="kpi ${cls || ''}"><div class="label">${l}</div><div class="value">${v}${unit ? `<small>${unit}</small>` : ''}</div></div>`).join('');
  }

  function render() {
    renderFilters();
    renderTable();
    renderGrouped();
    renderStats();
    renderMap();
    $('#subline').textContent = db.aktualisiert
      ? `Stand: ${new Date(db.aktualisiert).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' })}`
      : 'Lager für unsere 3D-Drucker';
    lsSet(LS_UI, { ...ui });
  }

  function renderFilters() {
    const setOpts = (sel, values, allLabel, cur) => {
      sel.innerHTML = `<option value="">${allLabel}</option>` + values.map(v => `<option${v === cur ? ' selected' : ''}>${esc(v)}</option>`).join('');
      if (cur && !values.includes(cur)) { sel.value = ''; return ''; }
      return cur;
    };
    ui.gruppe = setOpts($('#fGruppe'), uniq('gruppe'), 'Alle Sorten', ui.gruppe);
    ui.farbe = setOpts($('#fFarbe'), uniq('farbe'), 'Alle Farben', ui.farbe);
    ui.hersteller = setOpts($('#fHersteller'), uniq('hersteller'), 'Alle Hersteller', ui.hersteller);
    $('#fKnapp').checked = ui.knapp;
    $('#q').value = ui.q;

    const counts = groupBy(db.filamente, f => f.gruppe, f => f.rollen);
    $('#gruppenChips').innerHTML =
      `<button class="chip${!ui.gruppe ? ' active' : ''}" data-g="">Alle<b>${fmt(db.filamente.reduce((s, f) => s + f.rollen, 0), 0)}</b></button>` +
      counts.sort((a, b) => a[0].localeCompare(b[0], 'de')).map(([g, n]) => `<button class="chip${g === ui.gruppe ? ' active' : ''}" data-g="${esc(g)}">${esc(g)}<b>${fmt(n, 0)}</b></button>`).join('');
  }

  function renderTable() {
    const list = filtered();
    $$('#tbl th[data-sort]').forEach(th => {
      th.classList.toggle('sorted', th.dataset.sort === ui.sort.key);
      th.classList.toggle('desc', th.dataset.sort === ui.sort.key && ui.sort.dir < 0);
    });
    $('#tbody').innerHTML = list.map(f => `
      <tr data-id="${esc(f.id)}" class="${isLow(f) ? 'low' : ''} ${f.rollen === 0 ? 'zero' : ''}">
        <td class="first">${swatch(f)}${esc(f.farbe || '–')}${isLow(f) ? '<span class="warnmark" title="Mindestbestand erreicht">⚠ knapp</span>' : ''}</td>
        <td data-l="Typ">${esc(f.typ)}</td>
        <td data-l="Sorte"><span class="badge">${esc(f.gruppe)}</span></td>
        <td data-l="Hersteller">${esc(f.hersteller || '–')}</td>
        <td data-l="Rollen" class="num"><span class="stepper"><button data-act="dec" title="Rolle verbraucht">−</button><span>${f.rollen}</span><button data-act="inc" title="Rolle hinzugefügt">+</button></span></td>
        <td data-l="kg/Rolle" class="num">${fmt(f.kgProRolle)}</td>
        <td data-l="Gesamt" class="num"><b>${fmt(gesamt(f))}</b></td>
        <td data-l="Lagerort">${esc(f.lagerort || '–')}</td>
        <td data-l="Bemerkung" class="bem">${esc(f.bemerkung || '')}${f.durchmesser && f.durchmesser !== 1.75 ? ` <span class="badge">${fmt(f.durchmesser)} mm</span>` : ''}</td>
        <td class="actions"><button class="iconbtn" data-act="edit" title="Bearbeiten">✎</button><button class="iconbtn" data-act="dup" title="Duplizieren">⧉</button><button class="iconbtn del" data-act="del" title="Löschen">🗑</button></td>
      </tr>`).join('');
    $('#empty').hidden = list.length > 0;
    const sumR = list.reduce((s, f) => s + f.rollen, 0), sumKg = list.reduce((s, f) => s + gesamt(f), 0);
    $('#tfoot').innerHTML = list.length ? `<tr><td colspan="4">${list.length} Einträge${list.length !== db.filamente.length ? ` (gefiltert von ${db.filamente.length})` : ''}</td><td class="num">${fmt(sumR, 0)} Rollen</td><td></td><td class="num">${fmt(sumKg)} kg</td><td colspan="3"></td></tr>` : '';

    const all = db.filamente;
    const low = all.filter(isLow).length;
    $('#kpiBestand').innerHTML = kpiHtml([
      ['Rollen gesamt', fmt(all.reduce((s, f) => s + f.rollen, 0), 0)],
      ['Gewicht gesamt', fmt(all.reduce((s, f) => s + gesamt(f), 0), 1), 'kg'],
      ['Sorten', uniq('gruppe').length],
      ['Hersteller', uniq('hersteller').filter(h => h !== '–').length],
      ['Knapp / leer', `${low} / ${all.filter(f => f.rollen === 0).length}`, '', low ? 'warn' : '']
    ]);
  }

  function renderGrouped() {
    const groups = new Map();
    db.filamente.forEach(f => {
      if (!groups.has(f.gruppe)) groups.set(f.gruppe, new Map());
      const g = groups.get(f.gruppe), k = f.farbe || '–';
      const e = g.get(k) || { rollen: 0, kg: 0, sample: f };
      e.rollen += f.rollen; e.kg += gesamt(f); g.set(k, e);
    });
    $('#groupGrid').innerHTML = [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0], 'de')).map(([g, farben]) => {
      const tot = [...farben.values()].reduce((s, e) => ({ r: s.r + e.rollen, kg: s.kg + e.kg }), { r: 0, kg: 0 });
      return `<div class="card group-card"><h3>${esc(g)} <span class="tot">${fmt(tot.r, 0)} Rollen · ${fmt(tot.kg, 1)} kg</span></h3>` +
        [...farben.entries()].sort((a, b) => b[1].rollen - a[1].rollen).map(([farbe, e]) =>
          `<div class="group-row" data-g="${esc(g)}" data-f="${esc(farbe)}"><span>${swatch(e.sample.farbe ? { farbe, farbcode: e.sample.farbcode } : {})}${esc(farbe)}</span><span class="r">${fmt(e.rollen, 0)}<small>${fmt(e.kg, 1)} kg</small></span></div>`
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
    const since = Date.now() - 30 * 864e5;
    const used30 = db.verlauf.filter(v => new Date(v.t) >= since && v.kg < 0).reduce((s, v) => s - v.kg, 0);
    $('#kpiStats').innerHTML = kpiHtml([
      ['Rollen', fmt(totR, 0)], ['Gewicht', fmt(totKg, 1), 'kg'],
      ['Ø kg je Rolle', fmt(totR ? totKg / totR : 0)],
      ['Einträge', all.length], ['Verbrauch 30 Tage', fmt(used30, 1), 'kg'],
      ['Knapp', all.filter(isLow).length, '', all.some(isLow) ? 'warn' : '']
    ]);
    bars($('#chGruppeKg'), groupBy(all, f => f.gruppe, gesamt), { dec: 1 });
    bars($('#chGruppeRollen'), groupBy(all, f => f.gruppe, f => f.rollen));
    bars($('#chFarbe'), groupBy(all, f => f.farbe || '–', f => f.rollen), { withSwatch: true });
    bars($('#chHersteller'), groupBy(all, f => f.hersteller || '–', f => f.rollen));
    bars($('#chGroesse'), groupBy(all, f => fmt(f.kgProRolle) + ' kg', f => f.rollen), { unit: '×' });

    const low = all.filter(f => isLow(f) || f.rollen === 0);
    $('#lowList').innerHTML = low.length
      ? low.map(f => `<div class="lowitem"><span>${swatch(f)}${esc(label(f))}</span><span class="r">${f.rollen} / min ${f.mindestbestand}</span></div>`).join('')
      : '<p class="hint">Alles im grünen Bereich. Mindestbestände lassen sich pro Filament im Bearbeiten-Dialog festlegen.</p>';

    // Wochenchart
    const weeks = [];
    const now = new Date(); now.setHours(0, 0, 0, 0);
    const monday = new Date(now); monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    for (let i = 11; i >= 0; i--) { const s = new Date(monday); s.setDate(monday.getDate() - i * 7); weeks.push({ s, e: new Date(s.getTime() + 7 * 864e5), in: 0, out: 0 }); }
    db.verlauf.forEach(v => { const t = new Date(v.t); const w = weeks.find(w => t >= w.s && t < w.e); if (w) { if (v.kg > 0) w.in += v.kg; else w.out -= v.kg; } });
    const wmax = Math.max(1, ...weeks.map(w => w.in + w.out));
    $('#chVerlauf').innerHTML = `<div class="weekchart">${weeks.map(w => `<div class="wk" title="KW ab ${w.s.toLocaleDateString('de-DE')}: +${fmt(w.in, 1)} kg / −${fmt(w.out, 1)} kg"><div class="stack"><div class="in" style="height:${w.in / wmax * 100}%"></div><div class="out" style="height:${w.out / wmax * 100}%"></div></div><label>${w.s.getDate()}.${w.s.getMonth() + 1}.</label></div>`).join('')}</div>
      <div class="legend"><span><i style="background:var(--accent)"></i>Verbrauch</span><span><i style="background:var(--ok)"></i>Zugang</span></div>`;

    $('#logList').innerHTML = db.verlauf.slice(-60).reverse().map(v =>
      `<li><time>${new Date(v.t).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })}</time><span>${esc(v.text)}${v.kg ? ` <span class="${v.kg > 0 ? 'plus' : 'minus'}">${v.kg > 0 ? '+' : '−'}${fmt(Math.abs(v.kg))} kg</span>` : ''}</span></li>`
    ).join('') || '<li><span class="muted">Noch keine Änderungen protokolliert.</span></li>';
  }

  function renderMap() {
    const types = new Map(Object.entries(db.typen));
    db.filamente.forEach(f => { if (!types.has(f.typ)) types.set(f.typ, f.gruppe); });
    const groups = [...new Set([...types.values()])].sort((a, b) => a.localeCompare(b, 'de'));
    $('#mapList').innerHTML = [...types.entries()].sort((a, b) => a[0].localeCompare(b[0], 'de')).map(([t, g]) =>
      `<div class="m"><span>${esc(t)}</span><select data-typ="${esc(t)}">${groups.map(x => `<option${x === g ? ' selected' : ''}>${esc(x)}</option>`).join('')}</select></div>`
    ).join('');
  }

  // ---------- Dialog ----------
  function comboOptions(field) {
    if (field === 'typ') return [...new Set([...Object.keys(db.typen), ...uniq('typ')])].filter(x => x && x !== '–').sort((a, b) => a.localeCompare(b, 'de'));
    if (field === 'gruppe') return [...new Set([...Object.values(db.typen), ...uniq('gruppe')])].filter(x => x && x !== '–').sort((a, b) => a.localeCompare(b, 'de'));
    if (field === 'farbe') return [...new Set([...uniq('farbe'), ...['Schwarz', 'Weiß', 'Grau', 'Rot', 'Blau', 'Grün', 'Gelb', 'Orange', 'Transparent', 'Natur']])].filter(x => x !== '–').sort((a, b) => a.localeCompare(b, 'de'));
    return uniq(field).filter(x => x !== '–');
  }

  function buildCombo(el, value) {
    const field = el.dataset.field;
    const opts = comboOptions(field);
    const known = !value || opts.includes(value);
    const optional = field === 'farbe' || field === 'hersteller';
    el.innerHTML = `<select name="${field}__sel">
        ${optional ? '<option value="">– keine Angabe –</option>' : ''}
        ${opts.map(o => `<option${o === value ? ' selected' : ''}>${esc(o)}</option>`).join('')}
        <option value="__new"${known ? '' : ' selected'}>➕ Neu …</option>
      </select>
      <input name="${field}__new" placeholder="Neu eingeben" value="${known ? '' : esc(value)}" ${known ? 'hidden' : ''}>`;
    const sel = el.querySelector('select'), inp = el.querySelector('input');
    if (!optional && !value && opts.length) sel.selectedIndex = 0;
    sel.addEventListener('change', () => {
      inp.hidden = sel.value !== '__new';
      if (!inp.hidden) inp.focus();
      if (field === 'typ' && sel.value !== '__new') suggestGroup(sel.value);
      if (field === 'farbe') suggestColor(sel.value);
    });
    inp.addEventListener('change', () => {
      if (field === 'typ') suggestGroup(inp.value.trim());
      if (field === 'farbe') suggestColor(inp.value.trim());
    });
  }
  function comboValue(form, field) {
    const s = form.elements[field + '__sel'].value;
    return (s === '__new' ? form.elements[field + '__new'].value : s).trim();
  }
  function suggestGroup(typ) {
    const g = db.typen[typ] || db.filamente.find(f => f.typ === typ)?.gruppe;
    const el = $('#itemForm .combo[data-field=gruppe]');
    buildCombo(el, g || typ);
  }
  function suggestColor(farbe) {
    const c = FARBEN[(farbe || '').toLowerCase()];
    if (c) $('#itemForm').elements.farbcode.value = c;
  }

  function openDialog(f) {
    editingId = f?.id || null;
    const form = $('#itemForm');
    const v = f || { typ: 'PLA+', gruppe: 'PLA+', farbe: '', hersteller: '', rollen: 1, kgProRolle: 1, durchmesser: 1.75, mindestbestand: 0, lagerort: '', bemerkung: '' };
    $('#dlgTitle').textContent = editingId ? 'Filament bearbeiten' : 'Filament hinzufügen';
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
    const farbe = comboValue(form, 'farbe');
    const autoColor = FARBEN[farbe.toLowerCase()];
    const pickedColor = form.elements.farbcode.value;
    const item = {
      typ: comboValue(form, 'typ'),
      gruppe: comboValue(form, 'gruppe'),
      farbe,
      farbcode: (pickedColor !== form.dataset.farbcodeOrig || !autoColor) && pickedColor !== '#888888' && pickedColor !== autoColor ? pickedColor : '',
      hersteller: comboValue(form, 'hersteller'),
      rollen: Math.max(0, Math.round(num(form.elements.rollen.value))),
      kgProRolle: num(form.elements.kgProRolle.value),
      durchmesser: num(form.elements.durchmesser.value),
      mindestbestand: Math.max(0, Math.round(num(form.elements.mindestbestand.value))),
      lagerort: form.elements.lagerort.value.trim(),
      bemerkung: form.elements.bemerkung.value.trim()
    };
    if (!item.typ) { toast('Bitte einen Typ angeben.', true); return false; }
    if (!item.gruppe) item.gruppe = item.typ;
    if (!db.typen[item.typ]) db.typen[item.typ] = item.gruppe;

    if (editingId) {
      const f = db.filamente.find(x => x.id === editingId);
      const delta = gesamt(item) - gesamt(f);
      Object.assign(f, item);
      log(`Bearbeitet: ${label(f)}`, delta);
    } else {
      const same = db.filamente.find(x => x.typ === item.typ && x.farbe === item.farbe && x.hersteller === item.hersteller && x.kgProRolle === item.kgProRolle && x.durchmesser === item.durchmesser);
      if (same && confirm(`„${label(same)}“ mit ${fmt(same.kgProRolle)} kg/Rolle gibt es schon.\nOK = ${item.rollen} Rolle(n) dort hinzufügen\nAbbrechen = als eigenen Eintrag anlegen`)) {
        same.rollen += item.rollen;
        log(`+${item.rollen} Rolle(n): ${label(same)}`, item.rollen * item.kgProRolle);
      } else {
        const f = { id: uid(), ...item };
        db.filamente.push(f);
        log(`Neu: ${label(f)} – ${f.rollen} Rolle(n)`, gesamt(f));
      }
    }
    saveLocal(); render();
    toast('Gespeichert.');
    return true;
  }

  // ---------- Aktionen ----------
  function changeRollen(id, d) {
    const f = db.filamente.find(x => x.id === id);
    if (!f || f.rollen + d < 0) return;
    f.rollen += d;
    log(`${d > 0 ? '+1 Rolle' : '−1 Rolle (verbraucht)'}: ${label(f)}`, d * f.kgProRolle);
    saveLocal(); render();
    if (isLow(f)) toast(`⚠ ${label(f)}: nur noch ${f.rollen} Rolle(n) – Mindestbestand ${f.mindestbestand}.`);
  }

  function removeItem(id) {
    const i = db.filamente.findIndex(x => x.id === id);
    if (i < 0) return;
    const [f] = db.filamente.splice(i, 1);
    log(`Gelöscht: ${label(f)}`, -gesamt(f));
    saveLocal(); render();
    toast(`„${label(f)}“ gelöscht.`, false, () => {
      db.filamente.splice(i, 0, f); log(`Wiederhergestellt: ${label(f)}`, gesamt(f)); saveLocal(); render();
    });
  }

  function switchView(v) {
    ui.view = v;
    $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.view === v));
    $$('.view').forEach(s => s.classList.toggle('active', s.id === 'view-' + v));
    lsSet(LS_UI, ui);
  }

  // ---------- Import / Export ----------
  const CSV_COLS = [['typ', 'Typ'], ['gruppe', 'Sorte'], ['farbe', 'Farbe'], ['farbcode', 'Farbcode'], ['hersteller', 'Hersteller'], ['rollen', 'Rollen'], ['kgProRolle', 'kg je Rolle'], ['gesamt', 'Gesamt kg'], ['durchmesser', 'Durchmesser mm'], ['mindestbestand', 'Mindestbestand'], ['lagerort', 'Lagerort'], ['bemerkung', 'Bemerkung']];

  function download(name, content, type) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([content], { type }));
    a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  function exportCsv() {
    const q = v => { const s = typeof v === 'number' ? String(v).replace('.', ',') : String(v ?? ''); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const rows = [CSV_COLS.map(c => c[1]).join(';'), ...filtered().map(f => CSV_COLS.map(([k]) => q(k === 'gesamt' ? gesamt(f) : f[k])).join(';'))];
    download(`filamentbestand-${new Date().toISOString().slice(0, 10)}.csv`, '﻿' + rows.join('\r\n'), 'text/csv;charset=utf-8');
  }
  function exportJson() {
    download(`filamentbestand-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(db, null, 2), 'application/json');
  }
  function parseCsv(text) {
    text = text.replace(/^﻿/, '');
    const sep = (text.split('\n')[0].match(/;/g) || []).length >= (text.split('\n')[0].match(/,/g) || []).length ? ';' : ',';
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
    const alias = { 'typ laut liste': 'typ', 'typ (gruppe)': 'gruppe', 'sorte': 'gruppe', 'gruppe': 'gruppe', 'kg je rolle': 'kgProRolle', 'kg/rolle': 'kgProRolle', 'durchmesser mm': 'durchmesser' };
    CSV_COLS.forEach(([k, l]) => { alias[l.toLowerCase()] = k; alias[k.toLowerCase()] = k; });
    const keys = head.map(h => alias[h] || null);
    return rows.filter(r => r.some(c => c.trim())).map(r => {
      const o = {}; keys.forEach((k, i) => { if (k && k !== 'gesamt') o[k] = (r[i] ?? '').trim(); });
      return o;
    }).filter(o => o.typ);
  }
  async function importFile(file) {
    const text = await file.text();
    let incoming;
    try {
      incoming = file.name.toLowerCase().endsWith('.json') ? normalize(JSON.parse(text)) : normalize({ filamente: parseCsv(text) });
    } catch (e) { toast('Datei konnte nicht gelesen werden: ' + e.message, true); return; }
    if (!incoming.filamente.length) { toast('Keine Filamente in der Datei gefunden.', true); return; }
    const replace = confirm(`${incoming.filamente.length} Einträge gefunden.\n\nOK = aktuellen Bestand ERSETZEN\nAbbrechen = zum Bestand HINZUFÜGEN`);
    if (replace) { db.filamente = incoming.filamente; db.typen = { ...db.typen, ...incoming.typen }; }
    else db.filamente.push(...incoming.filamente.map(f => ({ ...f, id: uid() })));
    log(`Import: ${incoming.filamente.length} Einträge (${replace ? 'ersetzt' : 'hinzugefügt'})`);
    saveLocal(); render(); toast('Import abgeschlossen.');
  }

  // ---------- Toast ----------
  let toastTimer;
  function toast(msg, err = false, undo = null) {
    const t = $('#toast');
    t.innerHTML = esc(msg) + (undo ? '<button>Rückgängig</button>' : '');
    t.className = 'toast show' + (err ? ' err' : '');
    if (undo) t.querySelector('button').onclick = () => { undo(); t.className = 'toast'; };
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.className = 'toast'; }, undo ? 6000 : 3200);
  }

  // ---------- Events ----------
  function bind() {
    $$('.tab').forEach(t => t.addEventListener('click', () => switchView(t.dataset.view)));
    let qt; $('#q').addEventListener('input', e => { clearTimeout(qt); qt = setTimeout(() => { ui.q = e.target.value; renderTable(); lsSet(LS_UI, ui); }, 120); });
    $('#fGruppe').addEventListener('change', e => { ui.gruppe = e.target.value; render(); });
    $('#fFarbe').addEventListener('change', e => { ui.farbe = e.target.value; render(); });
    $('#fHersteller').addEventListener('change', e => { ui.hersteller = e.target.value; render(); });
    $('#fKnapp').addEventListener('change', e => { ui.knapp = e.target.checked; render(); });
    $('#btnReset').addEventListener('click', () => { Object.assign(ui, { q: '', gruppe: '', farbe: '', hersteller: '', knapp: false }); render(); });
    $('#gruppenChips').addEventListener('click', e => { const c = e.target.closest('.chip'); if (c) { ui.gruppe = c.dataset.g; render(); } });
    $$('#tbl th[data-sort]').forEach(th => th.addEventListener('click', () => {
      const k = th.dataset.sort;
      ui.sort = ui.sort.key === k ? { key: k, dir: -ui.sort.dir } : { key: k, dir: ['rollen', 'kgProRolle', 'gesamt'].includes(k) ? -1 : 1 };
      renderTable(); lsSet(LS_UI, ui);
    }));
    $('#tbody').addEventListener('click', e => {
      const b = e.target.closest('button[data-act]'); if (!b) return;
      const id = b.closest('tr').dataset.id, f = db.filamente.find(x => x.id === id);
      switch (b.dataset.act) {
        case 'inc': changeRollen(id, 1); break;
        case 'dec': changeRollen(id, -1); break;
        case 'edit': openDialog(f); break;
        case 'dup': openDialog({ ...f, id: null, rollen: 1 }); break;
        case 'del': if (confirm(`„${label(f)}“ wirklich löschen?`)) removeItem(id); break;
      }
    });
    $('#tbody').addEventListener('dblclick', e => { const tr = e.target.closest('tr'); if (tr && !e.target.closest('button')) openDialog(db.filamente.find(x => x.id === tr.dataset.id)); });
    $('#btnAdd').addEventListener('click', () => openDialog(null));
    $('#itemForm').addEventListener('submit', e => {
      if (e.submitter?.value === 'ok') { if (!saveDialog()) e.preventDefault(); }
    });
    $('#groupGrid').addEventListener('click', e => {
      const r = e.target.closest('.group-row'); if (!r) return;
      Object.assign(ui, { gruppe: r.dataset.g, farbe: r.dataset.f, hersteller: '', q: '', knapp: false });
      switchView('bestand'); render();
    });
    $('#mapList').addEventListener('change', e => {
      const s = e.target.closest('select[data-typ]'); if (!s) return;
      const typ = s.dataset.typ; db.typen[typ] = s.value;
      const n = db.filamente.filter(f => f.typ === typ && f.gruppe !== s.value).length;
      if (n && confirm(`${n} vorhandene Einträge vom Typ „${typ}“ auch der Sorte „${s.value}“ zuordnen?`)) db.filamente.forEach(f => { if (f.typ === typ) f.gruppe = s.value; });
      saveLocal(); render();
    });

    $('#syncForm').addEventListener('submit', e => {
      e.preventDefault();
      const f = e.target;
      ['owner', 'repo', 'branch', 'path', 'token'].forEach(k => { sync[k] = f.elements[k].value.trim(); });
      sync.auto = f.elements.auto.checked;
      lsSet(LS_SYNC, sync);
      setSyncState(sync.token ? 'GitHub bereit' : 'lokal', sync.token ? 'ok' : '');
      toast('Einstellungen gespeichert.');
    });
    $('#btnPull').addEventListener('click', pull);
    $('#btnPush').addEventListener('click', () => push(false));
    $('#btnExportCsv').addEventListener('click', exportCsv);
    $('#btnExportJson').addEventListener('click', exportJson);
    $('#fileImport').addEventListener('change', e => { if (e.target.files[0]) importFile(e.target.files[0]); e.target.value = ''; });
    $('#btnResetData').addEventListener('click', async () => {
      if (!confirm('Lokale Daten verwerfen und Stand aus dem Repository laden?')) return;
      try { db = await fetchRepoFile(); saveLocal(false); render(); toast('Stand aus dem Repository geladen.'); }
      catch (e) { toast('Laden fehlgeschlagen: ' + e.message, true); }
    });

    document.addEventListener('keydown', e => {
      if (e.target.matches('input, select, textarea') || $('#dlg').open) return;
      if (e.key === 'n') { e.preventDefault(); openDialog(null); }
      if (e.key === '/') { e.preventDefault(); switchView('bestand'); $('#q').focus(); }
    });
  }

  init();
})();

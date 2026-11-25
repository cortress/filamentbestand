/* Filament-Erkennung aus Fotos (Lieferschein / Rollen-Etikett).
 * - parseText(): Heuristik, die OCR-Text in Filament-Positionen zerlegt (läuft auch in Node für Tests)
 * - ocr(): lokale Texterkennung mit Tesseract.js (wird erst bei Bedarf vom CDN geladen)
 * - claude(): optionale KI-Erkennung über die Claude-API (Bild → strukturierte Positionen)
 */
(function (root) {
  'use strict';

  const HERSTELLER = [
    [/\be[\s-]?sun\b/i, 'eSun'], [/\bbambu(\s*lab)?\b/i, 'Bambu Lab'], [/\bpolymaker\b|\bpoly(lite|terra)\b/i, 'Polymaker'],
    [/\bprusament\b|\bprusa\b/i, 'Prusament'], [/\bsunlu\b/i, 'Sunlu'], [/\boverture\b/i, 'Overture'], [/\belegoo\b/i, 'Elegoo'],
    [/\bcreality\b|\bhyper\s*pla\b/i, 'Creality'], [/\banycubic\b/i, 'Anycubic'], [/\bgeeetech\b/i, 'Geeetech'], [/\bextrudr\b/i, 'Extrudr'],
    [/\bfiberlogy\b/i, 'Fiberlogy'], [/\bcolou?r\s*fabb\b/i, 'colorFabb'], [/\bform\s*futura\b/i, 'FormFutura'], [/\bfilaflex\b|\brecreus\b/i, 'Filaflex'],
    [/\b3d\s*jake\b/i, '3DJake'], [/\bdas\s*filament\b/i, 'Das Filament'], [/\bthe\s*filament\b/i, 'The Filament'], [/\bspectrum\b/i, 'Spectrum'],
    [/\bproto[\s-]*pasta\b/i, 'Proto-pasta'], [/\bazure\s*film\b/i, 'AzureFilm'], [/\beryone\b/i, 'Eryone'], [/\bjayo\b/i, 'Jayo'],
    [/\bkingroon\b/i, 'Kingroon'], [/\bfillamentum\b/i, 'Fillamentum'], [/\badd[\s:]*north\b/i, 'add:north'], [/\bsakata\b/i, 'Sakata'],
    [/\bhatchbox\b/i, 'Hatchbox'], [/\binland\b/i, 'Inland'], [/\bamazon\s*basics\b/i, 'Amazon Basics'], [/\bkexcelled\b/i, 'Kexcelled'],
    [/\btinmorry\b/i, 'Tinmorry'], [/\braise\s*3d\b/i, 'Raise3D'], [/\bultimaker\b/i, 'Ultimaker'], [/\bqidi\b/i, 'Qidi'],
    [/\bsnapmaker\b/i, 'Snapmaker'], [/\bflashforge\b/i, 'Flashforge'], [/\bnanovia\b/i, 'Nanovia'], [/\bcopymaster\b/i, 'Copymaster'],
    [/\bgiantarm\b/i, 'Giantarm'], [/\bziro\b/i, 'Ziro'], [/\bttyt3d\b/i, 'TTYT3D'], [/\bisanmate\b/i, 'iSANMATE'], [/\bvoxelab\b/i, 'Voxelab']
  ];

  const FARBEN = [
    [/\bschwarz\b|\bblack\b|\bnoir\b|\bnero\b/i, 'Schwarz'], [/\bwei(ß|ss)(?![a-zäöüß])|\bwhite\b|\bblanc\b|\bbianco\b/i, 'Weiß'],
    [/\banthrazit\b|\bcharcoal\b/i, 'Anthrazit'], [/\bgrau\b|\bgr[ae]y\b|\bgris\b/i, 'Grau'], [/\bsilber\b|\bsilver\b/i, 'Silber'],
    [/\btransparent\b|\bclear\b|\bklar\b/i, 'Transparent'], [/\bnatur(al|e)?\b/i, 'Natur'], [/\borange\b/i, 'Orange'],
    [/\brot\b|\bred\b|\brouge\b/i, 'Rot'], [/\bblau\b|\bblue\b|\bbleu\b/i, 'Blau'], [/\bgr(ü|ue)n(?![a-zäöüß])|\bgreen\b|\bvert\b/i, 'Grün'],
    [/\bgelb\b|\byellow\b|\bjaune\b/i, 'Gelb'], [/\bgold\b/i, 'Gold'], [/\bbronze\b/i, 'Bronze'], [/\bkupfer\b|\bcopper\b/i, 'Kupfer'],
    [/\bbraun\b|\bbrown\b/i, 'Braun'], [/\blila\b|\bviolett?\b|\bpurple\b/i, 'Lila'], [/\bpink\b|\brosa\b/i, 'Pink'],
    [/\bt(ü|ue)rkis(?![a-zäöüß])|\bturquoise\b|\bteal\b/i, 'Türkis'], [/\bbeige\b/i, 'Beige'], [/\bolive\b/i, 'Olive']
  ];

  function detectTyp(s) {
    const t = s.replace(/[|]/g, ' ');
    if (/PETG[\s-]*CF/i.test(t)) return 'PETG-CF';
    if (/\bPA\d*[\s-]*CF\b|nylon[\s-]*CF/i.test(t)) return 'PA-CF';
    if (/PLA[\s-]*(\+|plus|pro)?[\s-]*CF\b|PLA.{0,12}carbon/i.test(t)) return 'PLA-CF';
    if (/\bASA\s*(\+|plus|pro)/i.test(t)) return 'ASA+';
    if (/\bASA\b/i.test(t)) return 'ASA';
    if (/\bABS\s*(\+|plus|pro)/i.test(t)) return 'ABS+';
    if (/\bABS\b/i.test(t)) return 'ABS';
    if (/\bPET[\s-]?G\b/i.test(t)) return 'PETG';
    if (/(\b|e)TPU\b|\bTPE\b|vario\s*shore|filaflex/i.test(t)) {
      const h = t.match(/\b(\d{2})\s?A\b/);
      if (/vario\s*shore/i.test(t)) return 'TPU VarioShore';
      return h ? `TPU ${h[1]}A` : 'TPU';
    }
    if (/\bPVA\b/i.test(t)) return 'PVA';
    if (/\bHIPS\b/i.test(t)) return 'HIPS';
    if (/\bPA\d*\b|\bnylon\b/i.test(t)) return 'PA (Nylon)';
    if (/\bPC\b|polycarbonat/i.test(t)) return 'PC';
    if (/PLA/i.test(t)) {
      if (/eco\s*PLA/i.test(t)) return 'ecoPLA+';
      const plus = /PLA\s*(\+|plus|pro)|PLA\+/i.test(t) ? 'PLA+' : 'PLA';
      if (/\bsilk\b|seide/i.test(t)) return plus + ' Silk';
      if (/\bmatte?\b|\bmatt\b/i.test(t)) return plus + ' Matte';
      if (/\bmetal(l|lic)?\b/i.test(t)) return plus + ' Metal';
      if (/stone\s*fill/i.test(t)) return plus + ' StoneFill';
      return plus;
    }
    return '';
  }

  function first(list, s) {
    let best = null;
    for (const [re, name] of list) { const m = re.exec(s); if (m && (!best || m.index < best.i)) best = { i: m.index, name }; }
    return best ? best.name : '';
  }

  function detectKg(s) {
    const re = /(\d+(?:[.,]\d+)?)\s*(kg|g)\b/gi; let m;
    while ((m = re.exec(s))) {
      const v = parseFloat(m[1].replace(',', '.')), kg = m[2].toLowerCase() === 'kg' ? v : v / 1000;
      if (kg >= 0.1 && kg <= 10) return Math.round(kg * 1000) / 1000;
    }
    return 0;
  }
  function detectDurchmesser(s) {
    const m = s.match(/\b(1[.,]75|2[.,]85|3[.,]00?)\s*mm/i) || s.match(/[øØ]\s*(1[.,]75|2[.,]85)/);
    return m ? parseFloat(m[1].replace(',', '.')) : 0;
  }
  function detectMenge(line, hasPosCol = false) {
    let m = line.match(/(?:^|\s)(\d{1,3})\s*(?:x|×|stk\.?|stück|st\.|pcs?|pieces?|rollen?|spulen?)(?=\s|$|\b)/i)
      || line.match(/\b(?:menge|anzahl|qty|quantity)\s*[:.]?\s*(\d{1,3})\b/i);
    if (m) return +m[1];
    // „… 3   19,99   59,97“ → ganze Zahl direkt vor Preisangaben
    m = line.match(/\s(\d{1,2})\s+\d{1,4}[.,]\d{2}(\s|€|$)/);
    if (m) return +m[1];
    // Zeile beginnt mit kleiner Zahl gefolgt von Text (z. B. „2 eSun PLA+ …“), aber nicht „1.75“
    if (!hasPosCol) {
      m = line.match(/^\s*(\d{1,2})\s+(?![.,]\d)[A-Za-zÄÖÜäöü]/);
      if (m && +m[1] > 0 && +m[1] < 50) return +m[1];
    }
    return 1;
  }

  function candidate(text, menge) {
    return {
      typ: detectTyp(text), farbe: first(FARBEN, text), hersteller: first(HERSTELLER, text),
      rollen: menge, kgProRolle: detectKg(text), durchmesser: detectDurchmesser(text), quelle: text.trim().slice(0, 200)
    };
  }

  /** Zerlegt OCR-Text. mode: 'etikett' (eine Rolle pro Bild) oder 'lieferschein' (mehrere Positionen). */
  function parseText(text, mode) {
    const clean = String(text || '').replace(/\r/g, '');
    if (mode === 'etikett') {
      const c = candidate(clean.replace(/\n+/g, ' '), 1);
      c.quelle = clean.trim().slice(0, 300);
      return c.typ || c.hersteller ? [c] : [];
    }
    const docHersteller = (() => { const found = new Set(); HERSTELLER.forEach(([re, n]) => { if (re.test(clean)) found.add(n); }); return found.size === 1 ? [...found][0] : ''; })();
    const hasPosCol = /\bpos(\.|ition)?\b/i.test(clean);
    const lines = clean.split('\n').map(l => l.trim()).filter(Boolean);
    const out = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!detectTyp(line)) continue;
      // Folgezeile anhängen, wenn sie Farbe/Gewicht enthält, aber keinen eigenen Typ (umgebrochene Positionen)
      let ctx = line;
      const next = lines[i + 1];
      if (next && !detectTyp(next) && (first(FARBEN, next) || detectKg(next))) ctx += ' ' + next;
      const c = candidate(ctx, detectMenge(line, hasPosCol));
      if (!c.hersteller) c.hersteller = docHersteller;
      out.push(c);
    }
    return out;
  }

  // ---------- Bildaufbereitung ----------
  async function loadImage(file) {
    if (typeof createImageBitmap === 'function') {
      try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch { /* Fallback */ }
    }
    return new Promise((res, rej) => { const img = new Image(); img.onload = () => res(img); img.onerror = rej; img.src = URL.createObjectURL(file); });
  }
  /** Skaliert auf max. Kantenlänge, optional Graustufen + Kontrast (hilft Tesseract). */
  async function prepare(file, max = 1600, enhance = false) {
    const img = await loadImage(file);
    const w0 = img.width, h0 = img.height, f = Math.min(1, max / Math.max(w0, h0));
    const c = document.createElement('canvas'); c.width = Math.round(w0 * f); c.height = Math.round(h0 * f);
    const g = c.getContext('2d'); g.drawImage(img, 0, 0, c.width, c.height);
    if (enhance) {
      const d = g.getImageData(0, 0, c.width, c.height), p = d.data;
      for (let i = 0; i < p.length; i += 4) {
        const y = 0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2];
        const v = Math.max(0, Math.min(255, (y - 128) * 1.5 + 128));
        p[i] = p[i + 1] = p[i + 2] = v;
      }
      g.putImageData(d, 0, 0);
    }
    return c;
  }

  // ---------- Lokale OCR (Tesseract.js) ----------
  const TESS_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
  let workerP = null;
  function loadScript(src) {
    return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('Texterkennung konnte nicht geladen werden (offline?)')); document.head.appendChild(s); });
  }
  async function getWorker(onProgress) {
    if (!workerP) {
      workerP = (async () => {
        if (!root.Tesseract) await loadScript(TESS_URL);
        return root.Tesseract.createWorker('deu+eng', 1, { logger: m => onProgress && onProgress(m) });
      })().catch(e => { workerP = null; throw e; });
    }
    return workerP;
  }
  async function ocr(file, onProgress) {
    const worker = await getWorker(m => {
      if (!onProgress) return;
      const label = { 'loading tesseract core': 'Lade Texterkennung', 'loading language traineddata': 'Lade Sprachdaten', 'initializing api': 'Initialisiere', 'recognizing text': 'Erkenne Text' }[m.status] || m.status;
      onProgress(label, m.progress || 0);
    });
    const canvas = await prepare(file, 2000, true);
    const { data } = await worker.recognize(canvas);
    return data.text || '';
  }

  // ---------- KI-Erkennung (Claude-API, Vision + strukturierte Ausgabe) ----------
  const ITEM_SCHEMA = {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            typ: { type: 'string', description: 'Materialtyp wie auf dem Etikett, z. B. "PLA+", "PLA+ Matte", "PLA+ Silk", "PETG", "ABS+", "ASA", "TPU 95A", "PLA-CF", "PVA"' },
            farbe: { type: 'string', description: 'Farbe auf Deutsch, z. B. Schwarz, Weiß, Grau, Rot, Transparent; leer wenn unbekannt' },
            hersteller: { type: 'string', description: 'Marke/Hersteller, z. B. eSun, Bambu Lab, Polymaker; leer wenn unbekannt' },
            rollen: { type: 'integer', description: 'Anzahl Rollen dieser Position (Menge)' },
            kgProRolle: { type: 'number', description: 'Nettogewicht je Rolle in kg, z. B. 1 oder 0.75; 0 wenn unbekannt' },
            durchmesser: { type: 'number', description: 'Filamentdurchmesser in mm (1.75 oder 2.85); 0 wenn unbekannt' }
          },
          required: ['typ', 'farbe', 'hersteller', 'rollen', 'kgProRolle', 'durchmesser'],
          additionalProperties: false
        }
      }
    },
    required: ['items'],
    additionalProperties: false
  };

  async function claude(file, apiKey, mode) {
    const canvas = await prepare(file, 1568, false);
    const data = canvas.toDataURL('image/jpeg', 0.85).split(',')[1];
    const anweisung = mode === 'etikett'
      ? 'Das Foto zeigt das Etikett einer 3D-Drucker-Filamentrolle (oder mehrere Rollen). Gib für jede erkennbare Rolle eine Position zurück, rollen = 1 pro Rolle (gleiche Rollen zusammenfassen).'
      : 'Das Foto zeigt einen Lieferschein oder eine Rechnung über 3D-Drucker-Filament. Gib jede Filament-Position mit ihrer Menge (Anzahl Rollen) zurück. Versandkosten, Zubehör und andere Artikel ignorieren.';
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'server-side-fallback-2026-07-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: 'claude-opus-5-5',
        max_tokens: 16000,
        output_config: { effort: 'low', format: { type: 'json_schema', schema: ITEM_SCHEMA } },
        fallbacks: 'default',
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data } },
            { type: 'text', text: anweisung + ' Lies Typ, Farbe, Hersteller, Gewicht je Rolle und Durchmesser so genau wie möglich ab. Unbekannte Textfelder leer lassen, unbekannte Zahlen 0.' }
          ]
        }]
      })
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`KI-Erkennung fehlgeschlagen (${r.status}): ${j.error?.message || r.statusText}`);
    if (j.stop_reason === 'refusal') throw new Error('Die KI hat die Anfrage abgelehnt.');
    if (j.stop_reason === 'max_tokens') throw new Error('KI-Antwort abgeschnitten – bitte erneut versuchen.');
    const text = (j.content || []).find(b => b.type === 'text')?.text || '{"items":[]}';
    return JSON.parse(text).items.map(i => ({ ...i, rollen: Math.max(1, i.rollen || 1), quelle: 'KI-Erkennung' }));
  }

  const api = { parseText, detectTyp, detectKg, detectMenge, ocr, claude, prepare };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FBRecognize = api;
})(typeof window !== 'undefined' ? window : globalThis);

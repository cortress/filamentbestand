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
    [/\bt(ü|ue)rkis(?![a-zäöüß])|\bturquoise\b|\bteal\b|\baqua\b/i, 'Türkis'], [/\bcyan\b/i, 'Cyan'], [/\bbeige\b|\bdesert\s*tan\b|\bivory\b|\belfenbein\b/i, 'Beige'], [/\bolive\b/i, 'Olive'],
    // Hersteller-Farbnamen (z. B. Bambu Lab, Polymaker, Prusament)
    [/\bnavy\b|\bmarine\b|\bcobalt\b|\bsapphire\b|\bdunkelblau\b|\bhellblau\b|\bsky\s*blue\b/i, 'Blau'],
    [/\bmaroon\b|\bscarlet\b|\bcrimson\b|\bbordeaux\b|\bburgund(er|y)\b|\bweinrot\b/i, 'Rot'],
    [/\bmagenta\b|\bsakura\b|\bfuchsia\b/i, 'Pink'], [/\blilac\b|\blavender\b|\blavendel\b|\bviolet\b/i, 'Lila'],
    [/\blemon\b|\bsunflower\b/i, 'Gelb'], [/\blime\b|\bmint\b|\bforest\b|\bmistletoe\b|\bjade\s*green\b/i, 'Grün'],
    [/\bcocoa\b|\blatte\b|\bchocolate\b/i, 'Braun'], [/\bholz\b|\bwood\b|\bwalnut\b/i, 'Holz'], [/\bterracotta\b|\bmandarin\b|\bpumpkin\b/i, 'Orange'],
    [/\bash\b|\bnardo\b|\bslate\b|\bstone\s*gr[ae]y\b|\bhellgrau\b|\bdunkelgrau\b/i, 'Grau'], [/\bchampagne\b/i, 'Gold']
  ];
  // Zusätzliche Namen aus dem eigenen Bestand (setVocab)
  let EXTRA_H = [], EXTRA_F = [];

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

  const allH = () => EXTRA_H.length ? HERSTELLER.concat(EXTRA_H) : HERSTELLER;
  const allF = () => EXTRA_F.length ? FARBEN.concat(EXTRA_F) : FARBEN;
  const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  /** Eigene Hersteller-/Farbnamen aus dem Bestand mit erkennen lassen. */
  function setVocab({ hersteller = [], farben = [] } = {}) {
    const mk = (names, list) => names.filter(n => n && n.length >= 3 && !list.some(([re]) => re.test(n)))
      .map(n => [new RegExp('(^|[^a-zäöüß0-9])' + escRe(n).replace(/\s+/g, '[\\s-]*') + '(?![a-zäöüß])', 'i'), n]);
    EXTRA_H = mk(hersteller, HERSTELLER); EXTRA_F = mk(farben, FARBEN);
    VOCAB_EXTRA = new Set(hersteller.concat(farben).flatMap(n => String(n).toUpperCase().split(/[^A-ZÄÖÜß0-9]+/)).filter(w => w.length >= 4 && !/\d/.test(w)));
  }

  function candidate(text, menge) {
    return {
      typ: detectTyp(text), farbe: first(allF(), text), hersteller: first(allH(), text),
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
    const docHersteller = (() => { const found = new Set(); allH().forEach(([re, n]) => { if (re.test(clean)) found.add(n); }); return found.size === 1 ? [...found][0] : ''; })();
    const hasPosCol = /\bpos(\.|ition)?\b/i.test(clean);
    const lines = clean.split('\n').map(l => l.trim()).filter(Boolean);
    const out = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!detectTyp(line)) continue;
      // Folgezeile anhängen, wenn sie Farbe/Gewicht enthält, aber keinen eigenen Typ (umgebrochene Positionen)
      let ctx = line;
      const next = lines[i + 1];
      if (next && !detectTyp(next) && (first(allF(), next) || detectKg(next))) ctx += ' ' + next;
      const c = candidate(ctx, detectMenge(line, hasPosCol));
      if (!c.hersteller) c.hersteller = docHersteller;
      out.push(c);
    }
    return out;
  }

  // ---------- OCR-Fehlerkorrektur ----------
  // Typische Verwechslungen der Texterkennung (z. B. PETC → PETG, P1A → PLA, 8LAU → BLAU)
  const VOCAB = ['PLA', 'PETG', 'ABS', 'ASA', 'TPU', 'TPE', 'PVA', 'HIPS', 'NYLON', 'SILK', 'MATTE', 'CARBON', 'FILAMENT', 'DIAMETER',
    'WEIGHT', 'DURCHMESSER', 'GEWICHT', 'NETTO', 'COLOR', 'COLOUR', 'FARBE', 'ROLLE', 'SPULE',
    'ESUN', 'BAMBU', 'POLYMAKER', 'POLYLITE', 'POLYTERRA', 'PRUSAMENT', 'PRUSA', 'SUNLU', 'OVERTURE', 'ELEGOO', 'CREALITY', 'ANYCUBIC',
    'GEEETECH', 'EXTRUDR', 'FIBERLOGY', 'COLORFABB', 'FILAFLEX', 'FILLAMENTUM', 'KINGROON', 'ERYONE', 'HATCHBOX', 'SNAPMAKER',
    'FLASHFORGE', 'ULTIMAKER', 'NANOVIA', 'AZUREFILM', 'SPECTRUM', 'FORMFUTURA', 'JAYO', 'QIDI',
    'SCHWARZ', 'BLACK', 'WEISS', 'WHITE', 'GRAU', 'GREY', 'GRAY', 'SILBER', 'SILVER', 'TRANSPARENT', 'CLEAR', 'NATUR', 'NATURAL',
    'ORANGE', 'BLAU', 'BLUE', 'GRÜN', 'GREEN', 'GELB', 'YELLOW', 'GOLD', 'BRONZE', 'KUPFER', 'COPPER', 'BRAUN', 'BROWN', 'LILA',
    'PURPLE', 'VIOLETT', 'PINK', 'ROSA', 'TÜRKIS', 'BEIGE', 'OLIVE', 'ANTHRAZIT', 'CHARCOAL', 'ROT', 'RED'];
  const VOCAB_SET = new Set(VOCAB);
  let VOCAB_EXTRA = new Set();
  const SIM = new Set(['O0', 'Q0', 'D0', 'OQ', 'OD', 'I1', 'L1', 'IL', 'S5', 'B8', 'Z2', 'G6', 'CG', 'UV', 'EF', 'A4', 'T7', 'ÜU', 'ÖO', 'ÄA', 'KX', 'HN']);
  const subCost = (a, b) => a === b ? 0 : (SIM.has(a + b) || SIM.has(b + a)) ? 0.4 : 1;
  function wdist(a, b) {
    let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i];
      for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + subCost(a[i - 1], b[j - 1]));
      prev = cur;
    }
    return prev[b.length];
  }
  function fixToken(tok) {
    if (tok.length < 3 || /^\d+$/.test(tok)) return tok;
    const U = tok.toUpperCase();
    if (VOCAB_SET.has(U) || VOCAB_EXTRA.has(U)) return tok;
    // kurze Wörter nur bei optisch ähnlichen Zeichen korrigieren, lange auch bei einem fehlenden/zusätzlichen Zeichen
    const lim = U.length <= 4 ? 0.4 : U.length <= 7 ? 0.8 : 1.4, lenTol = U.length >= 8 ? 1 : 0;
    let best = null, bd = Infinity, tie = false;
    for (const v of [...VOCAB, ...VOCAB_EXTRA]) {
      if (Math.abs(v.length - U.length) > lenTol) continue;
      const d = wdist(U, v);
      if (d < bd) { bd = d; best = v; tie = false; } else if (d === bd && v !== best) tie = true;
    }
    if (!best || bd > lim + 1e-9 || tie) return tok;
    return tok === tok.toLowerCase() && !/\d/.test(tok) ? best.toLowerCase() : best;
  }
  const toDigits = n => n.replace(/[Oo]/g, '0').replace(/[lI|]/g, '1').replace(/S/g, '5');
  /** Korrigiert OCR-Text: Wörter gegen Fachbegriffe, Marken, Farben; Gewichte und Durchmesser. */
  function fixOcr(text) {
    return String(text || '')
      .replace(/[A-Za-zÄÖÜäöüß0-9]+/g, fixToken)
      .replace(/(^|[^\w.,])([0-9OoIlS|]{1,4}(?:[.,][0-9OoIlS]{1,3})?)\s*([kK][gGqQ9])(?![a-zA-Z])/g,
        (m, pre, n, u) => (/\d/.test(n) || /^[lI|]$/.test(n)) ? pre + toDigits(n) + ' kg' : m)
      .replace(/\b([1lI|])\s?[.,]\s?([7T])\s?([5S])\s*(mm|rnm|nm)\b/g, '1.75 mm')
      .replace(/\b2\s?[.,]\s?8\s?([5S])\s*(mm|rnm|nm)\b/g, '2.85 mm')
      .replace(/(\d)\s*rnm\b/g, '$1 mm')
      .replace(/\b(\d)([0-9Oo]{2,3})\s*g\b/g, (m, a, b) => a + b.replace(/[Oo]/g, '0') + ' g');
  }
  function textScore(text, mode) {
    const c = parseText(text, mode);
    return c.reduce((s, x) => s + (x.typ ? 2 : 0) + (x.farbe ? 1 : 0) + (x.hersteller ? 1 : 0) + (x.kgProRolle ? 1 : 0), 0);
  }

  // ---------- Bildaufbereitung ----------
  async function loadImage(file) {
    if (typeof createImageBitmap === 'function') {
      try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch { /* Fallback */ }
    }
    return new Promise((res, rej) => { const img = new Image(); img.onload = () => res(img); img.onerror = rej; img.src = URL.createObjectURL(file); });
  }
  /** Zeichnet das Bild auf eine Leinwand mit der gewünschten längsten Kante (kleine Bilder werden bis 2× vergrößert). */
  function toCanvas(img, target, maxUp = 2) {
    const w0 = img.width, h0 = img.height, f = Math.min(maxUp, target / Math.max(w0, h0));
    const c = document.createElement('canvas'); c.width = Math.round(w0 * f); c.height = Math.round(h0 * f);
    const g = c.getContext('2d', { willReadFrequently: true }); g.imageSmoothingQuality = 'high'; g.drawImage(img, 0, 0, c.width, c.height);
    return c;
  }
  /** Graustufen mit automatischer Kontrastspreizung (2 %/98 %-Perzentil). */
  function grayStretch(src) {
    const c = document.createElement('canvas'); c.width = src.width; c.height = src.height;
    const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(src, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height), p = d.data, n = p.length / 4, hist = new Uint32Array(256), gray = new Uint8ClampedArray(n);
    for (let i = 0; i < n; i++) { const y = (0.299 * p[i * 4] + 0.587 * p[i * 4 + 1] + 0.114 * p[i * 4 + 2]) | 0; gray[i] = y; hist[y]++; }
    let lo = 0, hi = 255, acc = 0;
    for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc > n * 0.02) { lo = v; break; } }
    acc = 0; for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc > n * 0.02) { hi = v; break; } }
    const k = hi > lo + 10 ? 255 / (hi - lo) : 1;
    for (let i = 0; i < n; i++) { const v = (gray[i] - lo) * k; gray[i] = v; p[i * 4] = p[i * 4 + 1] = p[i * 4 + 2] = gray[i]; }
    g.putImageData(d, 0, 0);
    return { canvas: c, gray };
  }
  /** Adaptive Schwellwert-Binarisierung (Bradley) – gleicht Schatten/ungleichmäßiges Licht aus,
   *  helle Schrift auf dunklem Grund wird automatisch invertiert. */
  function binarize({ canvas: src, gray }) {
    const w = src.width, h = src.height, s = Math.max(15, Math.round(Math.max(w, h) / 40)) | 1, r = s >> 1, t = 0.15;
    const I = new Float64Array((w + 1) * (h + 1));
    for (let y = 0; y < h; y++) { let row = 0; for (let x = 0; x < w; x++) { row += gray[y * w + x]; I[(y + 1) * (w + 1) + x + 1] = I[y * (w + 1) + x + 1] + row; } }
    const out = new Uint8ClampedArray(w * h); let dark = 0;
    for (let y = 0; y < h; y++) {
      const y0 = Math.max(0, y - r), y1 = Math.min(h - 1, y + r);
      for (let x = 0; x < w; x++) {
        const x0 = Math.max(0, x - r), x1 = Math.min(w - 1, x + r), cnt = (x1 - x0 + 1) * (y1 - y0 + 1);
        const sum = I[(y1 + 1) * (w + 1) + x1 + 1] - I[y0 * (w + 1) + x1 + 1] - I[(y1 + 1) * (w + 1) + x0] + I[y0 * (w + 1) + x0];
        const black = gray[y * w + x] * cnt <= sum * (1 - t);
        out[y * w + x] = black ? 0 : 255; if (black) dark++;
      }
    }
    const inv = dark > w * h * 0.5;
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d'), d = g.createImageData(w, h), p = d.data;
    for (let i = 0; i < w * h; i++) { const v = inv ? 255 - out[i] : out[i]; p[i * 4] = p[i * 4 + 1] = p[i * 4 + 2] = v; p[i * 4 + 3] = 255; }
    g.putImageData(d, 0, 0);
    return c;
  }
  function rotate(src, deg) {
    if (!deg) return src;
    const c = document.createElement('canvas'), q = deg % 180 !== 0;
    c.width = q ? src.height : src.width; c.height = q ? src.width : src.height;
    const g = c.getContext('2d'); g.translate(c.width / 2, c.height / 2); g.rotate(deg * Math.PI / 180); g.drawImage(src, -src.width / 2, -src.height / 2);
    return c;
  }
  /** Skaliert auf max. Kantenlänge, optional Graustufen + Kontrast (für die KI-Erkennung ohne Verbesserung). */
  async function prepare(file, max = 1600, enhance = false) {
    const c = toCanvas(await loadImage(file), max, 1);
    return enhance ? grayStretch(c).canvas : c;
  }

  // ---------- Lokale OCR (Tesseract.js) ----------
  const TESS_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
  let workerP = null, progressCb = null;
  function loadScript(src, what = 'Texterkennung') {
    return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error(what + ' konnte nicht geladen werden (offline?)')); document.head.appendChild(s); });
  }
  async function getWorker() {
    if (!workerP) {
      workerP = (async () => {
        if (!root.Tesseract) await loadScript(TESS_URL);
        return root.Tesseract.createWorker('deu+eng', 1, { logger: m => progressCb && progressCb(m) });
      })().catch(e => { workerP = null; throw e; });
    }
    return workerP;
  }
  /** Mehrstufige Erkennung: Graustufen → Schwarz-Weiß (andere Segmentierung) → gedrehte Varianten,
   *  bis Typ und Merkmale sicher gefunden sind. Gibt den besten (korrigierten) Text zurück. */
  async function ocr(file, onProgress, mode = 'lieferschein') {
    const LABEL = { 'loading tesseract core': 'Lade Texterkennung', 'loading language traineddata': 'Lade Sprachdaten', 'initializing api': 'Initialisiere', 'recognizing text': 'Erkenne Text' };
    let stage = '';
    progressCb = m => onProgress && onProgress((stage ? stage + ': ' : '') + (LABEL[m.status] || m.status), m.progress || 0);
    const worker = await getWorker();
    const base = toCanvas(await loadImage(file), 2200), gs = grayStretch(base);
    let bin = null; const binC = () => bin || (bin = binarize(gs));
    const etikett = mode === 'etikett';
    const passes = [
      ['Durchgang 1', () => gs.canvas, 0, etikett ? '11' : '3'],
      ['Durchgang 2 (Schwarz-Weiß)', binC, 0, etikett ? '3' : '6'],
      ['Gedreht 90°', binC, 90, etikett ? '11' : '3'],
      ['Gedreht 270°', binC, 270, etikett ? '11' : '3'],
      ['Gedreht 180°', binC, 180, etikett ? '11' : '3']
    ];
    const res = [];
    for (const [name, img, deg, psm] of passes) {
      // Drehungen nur, wenn bisher gar nichts Brauchbares gefunden wurde
      if (deg && res.some(r => r.score >= 2)) break;
      stage = name;
      await worker.setParameters({ tessedit_pageseg_mode: psm, preserve_interword_spaces: '1' });
      const { data } = await worker.recognize(rotate(img(), deg));
      const text = fixOcr(data.text || '');
      res.push({ text, conf: data.confidence || 0, score: textScore(text, mode) + (data.confidence || 0) / 100 });
      const c = parseText(text, mode);
      const good = c.length && (data.confidence || 0) >= 55 && (etikett
        ? c[0].typ && c[0].farbe && c[0].hersteller && c[0].kgProRolle   // Etikett: alles gefunden?
        : c.every(x => x.typ && (x.farbe || x.hersteller)));
      if (good) break;
    }
    progressCb = null;
    res.sort((a, b) => b.score - a.score);
    // Etikett: Ergebnisse mehrerer Durchgänge ergänzen sich (z. B. Marke im einen, Farbe im anderen)
    if (etikett) return res.filter((r, i) => i === 0 || r.score >= 1).map(r => r.text).join('\n');
    return res[0]?.text || '';
  }

  // ---------- Barcodes / QR-Codes ----------
  const ZX_URL = 'https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/umd/index.min.js';
  /** Liest Barcodes/QR-Codes aus dem Foto: nativ (BarcodeDetector, Android/Chrome) oder mit ZXing. */
  async function codes(file) {
    const img = await loadImage(file), out = [], add = (format, raw) => {
      raw = String(raw || '').trim();
      if (raw.length >= 6 && !out.some(o => o.raw === raw)) out.push({ format: String(format).toLowerCase(), raw: raw.slice(0, 300) });
    };
    if ('BarcodeDetector' in root) {
      try {
        const sup = await root.BarcodeDetector.getSupportedFormats();
        const want = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code', 'data_matrix'].filter(f => sup.includes(f));
        if (want.length) (await new root.BarcodeDetector({ formats: want }).detect(toCanvas(img, 2000, 1))).forEach(b => add(b.format, b.rawValue));
        if (out.length) return out;
      } catch { /* Fallback ZXing */ }
    }
    try {
      if (!root.ZXing) await loadScript(ZX_URL, 'Barcode-Erkennung');
      const Z = root.ZXing, F = Z.BarcodeFormat;
      const hints = new Map([[Z.DecodeHintType.TRY_HARDER, true],
        [Z.DecodeHintType.POSSIBLE_FORMATS, [F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E, F.CODE_128, F.CODE_39, F.QR_CODE, F.DATA_MATRIX]]]);
      const reader = new Z.MultiFormatReader(); reader.setHints(hints);
      for (const size of [1200, 2000]) {
        try {
          const src = new Z.HTMLCanvasElementLuminanceSource(toCanvas(img, size, 1));
          const r = reader.decodeWithState(new Z.BinaryBitmap(new Z.HybridBinarizer(src)));
          add(F[r.getBarcodeFormat()], r.getText()); break;
        } catch { /* kein Code in dieser Größe */ }
      }
    } catch { /* Barcode-Erkennung ist optional */ }
    return out;
  }
  /** Wertet den Inhalt eines QR-Codes aus (Klartext oder Produkt-URL). */
  function parseCode(raw) {
    const t = String(raw || '').replace(/^https?:\/\/(www\.)?/i, ' ').replace(/[-_/?=&.+%]+/g, ' ');
    return /\D/.test(raw) ? parseText(t, 'etikett')[0] || null : null;
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

  const api = { parseText, detectTyp, detectKg, detectMenge, fixOcr, setVocab, ocr, codes, parseCode, claude, prepare };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FBRecognize = api;
})(typeof window !== 'undefined' ? window : globalThis);

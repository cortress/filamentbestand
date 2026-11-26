# Filamentbestand – Projektplan

Stand: 25.11.2026 · Repository: `cortress/filamentbestand` · Hosting: GitHub Pages

## 1. Ziel

Eine im Browser laufende WebApp, mit der das Team den Filamentbestand für die 3D-Drucker erfasst, pflegt und auswertet.
Grundlage war die Excel-Liste `Filamentbestand.xlsx` (31 Positionen, 64 Rollen, 85,75 kg).

## 2. Anforderungen

| # | Anforderung | Umsetzung |
|---|---|---|
| A1 | WebApp, über Git gehostet | Statische Seite (HTML/CSS/JS, kein Build) auf GitHub Pages, direkt aus Branch `main` (Root) |
| A2 | Basis: Excel-Liste | Alle 31 Positionen inkl. Gruppierung (ecoPLA+/PLA+-Varianten → PLA+, TPU-Härten/VarioShore → TPU) übernommen |
| A3 | Dark Mode | Durchgängig dunkles Farbschema, `color-scheme: dark`, dunkle Scrollbars, Theme-Color |
| A4 | Auswählbare Filamentsorten | Auswahllisten für Typ, Sorte, Farbe, Hersteller (jeweils mit „Neu …“), Sorte wird aus Typ vorgeschlagen, Sorten-Zuordnung pflegbar |
| A5 | Sortierungen | Klick auf jede Spalte (auf-/absteigend), auf dem Handy Sortier-Auswahl |
| A6 | Statistiken | Kennzahlen, kg/Rollen je Sorte, Rollen je Farbe/Hersteller/Rollengröße, knapper Bestand, Verbrauch & Zugänge (12 Wochen), Änderungen je Person, Verlauf |
| A7 | Auf `main`, online | `main` ist Standardbranch, Pages veröffentlicht `main` bei jedem Push automatisch |
| A8 | Plan im Repo | Dieses Dokument |
| A9 | Änderungen einzelner Personen automatisch speichern | Jede Änderung wird sofort lokal gesichert und automatisch ins Repo übertragen; Name der Person im Verlauf; Merge gleichzeitiger Änderungen |
| A10 | Cloud-Symbol für Sync-Status | Cloud-Button oben rechts mit Zuständen *Aktuell*, *Sync …*, *Ausstehend (n)*, *Offline*, *Nur lokal*, *Fehler*, *gesperrt* |
| A11 | Gespeicherte Stände verschlüsselt | AES-256-GCM, Schlüssel aus Team-Passwort (PBKDF2-SHA256, 600 000 Iterationen); im Repo und im Browser kein Klartext |
| A12 | Optimiert für Windows-PC, Android, iPhone | Responsive Layout, PWA-Manifest, Safe-Areas, Touch-Ziele, iOS-Zoom-Schutz, Windows-Scrollbars/Fonts |
| A13 | Auswahl per Kästchen, Bulk-Löschen | Checkbox je Zeile/Karte + „alle sichtbaren“, Aktionsleiste: Löschen (mit Rückgängig), −1/+1 Rolle |
| A15 | Resin für Resindrucker, eigener Bereich | Tab „Resin“: Flaschen, Inhalt je Flasche (kg/L), Resin-Typen, MHD mit Warnung, eigene Statistik |
| A16 | „In Verwendung“ für geöffnete FDM-Rollen (AMS/Drucker) | Tab „In Verwendung“: Drucker mit AMS-Plätzen, Rollen öffnen/einlegen, Restmenge in %, Regal für angebrochene Rollen |
| A17 | Bestellungen vermerken, „Erhalten“ bucht automatisch ins Inventar | Tab „Bestellungen“: Lieferant, Nr., Datum, Liefertermin, Positionen (Filament/Resin, Menge, Preis); Erhalten je Position oder komplett → Lager +Menge bzw. neuer Eintrag |
| A14 | Hinzufügen per Foto (Lieferschein / Etikett) mit Texterkennung | Kamera oder Bildauswahl → lokale OCR (Tesseract.js) bzw. optional KI (Claude) → Prüfliste → Übernahme (vorhandene Einträge werden aufgestockt) |

## 3. Architektur

```
Browser (Windows / Android / iPhone)
 ├─ index.html, styles.css, app.js      ← von GitHub Pages ausgeliefert
 ├─ data/team.enc.json                  ← von Pages: Salt + verschlüsselter Team-Token
 ├─ IndexedDB: nicht-exportierbarer AES-Schlüssel („angemeldet bleiben“)
 ├─ localStorage: verschlüsselter Cache (Basisstand + ausstehende Änderungen), Name, UI-Einstellungen
 └─ GitHub Contents-API (api.github.com) ↔ data/filamente.enc.json auf main
```

- **Kein Server, kein Build.** Alles läuft im Browser; GitHub ist Hosting und Datenspeicher.
- **Pages-Deployment:** *Deploy from a branch* (`main`, Root). GitHub veröffentlicht jeden Push automatisch (`.nojekyll` verhindert Jekyll-Verarbeitung).
  Auch Bestands-Commits lösen ein kurzes Redeployment aus – unschädlich, denn die App liest den aktuellen Stand ohnehin live über die API.

### Dateien

| Datei | Zweck |
|---|---|
| `index.html` | Oberfläche (Sperrbildschirm, Ansichten, Dialog) |
| `styles.css` | Dark-Mode-Design, Responsive-/Geräte-Optimierungen |
| `app.js` | Logik: Krypto, Sync-Engine, Rendering, Auswahl/Bulk, Foto-Import, Import/Export |
| `recognize.js` | Foto-Erkennung: Tesseract-OCR, Text-Parser (Typ, Farbe, Hersteller, Menge, Gewicht), optionale Claude-Vision |
| `data/filamente.enc.json` | Verschlüsselter Bestand inkl. Verlauf |
| `data/team.enc.json` | Verschlüsselter Team-Zugang (GitHub-Token) + Salt |
| `tools/crypt.mjs` | Node-Werkzeug: Initialisieren, Entschlüsseln (Backup), Verschlüsseln |
| `manifest.webmanifest`, `icons/` | Installierbare App (PWA) für Android/iOS/Windows |

## 4. Datenmodell (entschlüsselt)

```json
{
  "version": 3,
  "aktualisiert": "ISO-Zeitstempel",
  "typen": { "PLA+ Matte": "PLA+", "TPU 95A": "TPU" },
  "filamente": [{
    "id": "f001", "typ": "ASA+", "gruppe": "ASA+", "farbe": "Schwarz", "farbcode": "",
    "hersteller": "eSun", "artnr": "ESUN-ASA-BK-1KG", "rollen": 4, "kgProRolle": 1, "durchmesser": 1.75,
    "mindestbestand": 0, "lagerort": "", "bemerkung": ""
  }],
  "resin": [{ "id": "…", "typ": "ABS-Like", "farbe": "Grau", "hersteller": "Elegoo", "rollen": 3, "kgProRolle": 1, "mhd": "2027-06" }],
  "inUse": [{ "id": "…", "ref": "f001", "typ": "PLA+", "farbe": "Weiß", "kgProRolle": 1, "rest": 40, "drucker": "<id>", "slot": "A2", "geoeffnet": "ISO" }],
  "drucker": [{ "id": "…", "name": "X1C Links", "slots": 4, "ext": true }],
  "bestellungen": [{ "id": "…", "bid": "…", "kat": "filamente", "typ": "PLA+", "farbe": "Schwarz", "hersteller": "eSun", "menge": 4, "kgProRolle": 1, "preis": 79.96, "lieferant": "3DJake", "bestellnr": "A-1001", "bestellt": "2026-11-25", "erwartet": "2026-11-28", "status": "offen" }],
  "codes": { "6970294470015": { "typ": "PLA+", "farbe": "Schwarz", "hersteller": "eSun", "kgProRolle": 1, "durchmesser": 1.75 } },
  "verlauf": [{ "t": "ISO", "wer": "Anna", "text": "−1 Rolle (verbraucht): PLA+ · Weiß (eSun)", "kg": -3 }]
}
```

Verschlüsselte Hülle (`*.enc.json`):

```json
{ "format": "filamentbestand-enc", "v": 1, "typ": "data|team|cache",
  "kdf": { "name": "PBKDF2", "hash": "SHA-256", "iterations": 600000, "salt": "<base64>" },
  "iv": "<base64, 12 Byte>", "ct": "<base64, AES-GCM-Chiffrat inkl. Tag>" }
```

`typ` wird als *Additional Authenticated Data* mitgeprüft, damit Dateien nicht vertauscht werden können.

## 5. Sicherheit / Verschlüsselung

- **Algorithmus:** AES-256-GCM (WebCrypto), zufälliger 96-Bit-IV pro Speichervorgang.
- **Schlüsselableitung:** PBKDF2-SHA256, 600 000 Iterationen, 128-Bit-Salt (ein Salt pro Passwort-Generation).
- **Im Repository:** nur Chiffrate. Commit-Meldungen enthalten keine Bestandsdetails (nur „Bestand aktualisiert – Name“).
- **Im Browser:** Schlüssel als *nicht exportierbarer* `CryptoKey` in IndexedDB (nur wenn „angemeldet bleiben“ aktiv);
  Cache in localStorage ebenfalls verschlüsselt. Ohne gespeicherten Schlüssel ist nach dem Schließen nichts lesbar.
- **Team-Token:** Fine-grained PAT, nur dieses Repo, nur *Contents: Read and write*; mit dem Team-Passwort verschlüsselt in
  `data/team.enc.json`. Wer das Passwort kennt, kann speichern – ohne eigenen GitHub-Account.
- **Passwortwechsel:** In der App (Daten & Sync) → neues Salt, Bestand und Team-Datei werden neu verschlüsselt.
  Alle Geräte werden beim nächsten Abgleich abgemeldet und müssen das neue Passwort eingeben.
- **Grenzen (bewusst akzeptiert):**
  - GitHub Pages ist öffentlich: App-Code und Chiffrate sind abrufbar. Schutz hängt an der Passwortstärke
    (Offline-Brute-Force gegen PBKDF2) → langes Passwort verwenden (≥ 4 Wörter oder ≥ 16 zufällige Zeichen).
  - Ältere Stände in der Git-Historie bleiben mit dem jeweils damals gültigen Passwort entschlüsselbar.
  - Exporte (CSV/JSON) sind bewusst unverschlüsselt (für Excel).
  - Der Klartext-Stand aus der ersten Entwicklungsversion ist **nicht** in der Historie von `main` enthalten.

## 6. Synchronisation (Mehrbenutzer)

Änderungen werden als **Operationen** erfasst, nicht als ganzer Stand:

| Operation | Bedeutung |
|---|---|
| `delta` | Rollen ± n (Verbrauch/Zugang, auch Rollenänderung im Dialog) |
| `add` / `del` | Eintrag anlegen / löschen (Rückgängig = erneutes `add`) |
| `patch` | Geänderte Felder eines Eintrags |
| `typ` / `regroup` | Sorten-Zuordnung |
| `replace` | Import mit Ersetzen |

Ablauf (`runSync` in `app.js`):

1. Aktion → Operation in die Warteschlange, sofort angewendet und **verschlüsselt lokal gespeichert**; Sync nach 0,7 s.
2. Neuesten Stand per API holen (`If-None-Match`/ETag → 304 kostet kein Rate-Limit).
3. Warteschlange auf den neuesten Stand anwenden, verschlüsseln, per `PUT` mit `sha` speichern.
4. Hat zwischenzeitlich jemand anderes gespeichert (409/422), werden Schritt 2–3 automatisch wiederholt (bis 5×, mit Zufallspause).
   → Gleichzeitige Änderungen gehen nicht verloren (z. B. A −2 und B +1 auf dieselbe Rolle → −1).
5. Abgleich zusätzlich alle 20 s (nur bei sichtbarem Tab), beim Zurückkehren in den Tab und bei Wiederherstellung der Verbindung.
6. Offline: Änderungen bleiben verschlüsselt lokal und werden automatisch nachgereicht.

Cloud-Symbol-Zustände:

| Zustand | Anzeige | Bedeutung |
|---|---|---|
| `synced` | grüne Wolke mit Haken „Aktuell“ | alles übertragen, Stand aktuell (Tooltip: Uhrzeit des letzten Abgleichs) |
| `syncing` | orange, drehende Pfeile | Abgleich läuft |
| `pending` | gelb, Pfeil nach oben „Ausstehend (n)“ | lokale Änderungen noch nicht übertragen |
| `offline` | grau, durchgestrichen | keine Verbindung, Änderungen werden nachgereicht |
| `readonly` | grau „Nur lokal“ | noch kein Team-Token hinterlegt |
| `error` | rot „Fehler“ | z. B. Token ungültig (Tooltip/Daten & Sync zeigt Details) |

Klick auf die Wolke startet sofort einen Abgleich.

## 7. Auswahl & Foto-Erfassung

**Auswahl / Bulk:** Kästchen vor jeder Zeile (Handy: auf jeder Karte), Kopf-Kästchen wählt alle *gefilterten* Einträge.
Sobald etwas ausgewählt ist, erscheint die Aktionsleiste: **−1 Rolle**, **+1 Rolle**, **Löschen** (Sicherheitsabfrage + „Rückgängig“), **✕** hebt die
Auswahl auf (auch `Esc`). Bulk-Aktionen werden als mehrere Operationen in einem Schritt gespeichert und synchronisiert.

**Foto-Erfassung** (Button „📷 Aus Foto“, Handy: Kamera-Button über dem „+“, Taste `F`):

1. Art wählen: *Lieferschein* (mehrere Positionen, Menge je Zeile) oder *Etikett* (eine Rolle je Foto, mehrere Fotos möglich).
2. Foto aufnehmen (öffnet direkt die Rückkamera) oder Bilder wählen.
3. Erkennung:
   - **Barcode/QR-Code (nur Etikett):** Zuerst wird nach EAN/UPC/Code-128/QR/DataMatrix gesucht (nativer `BarcodeDetector` auf
     Android/Chrome, sonst ZXing 0.21.3 von jsDelivr). Ist der Code bekannt (`codes` im Datenmodell), steht der Artikel **sofort** fest –
     ohne Texterkennung. Unbekannte Codes werden beim Übernehmen mit den geprüften Angaben **gemerkt** (Op `code`, synchronisiert für das
     ganze Team); Korrekturen in der Prüfliste aktualisieren den Eintrag. Inhalt von QR-Codes (Klartext/Produkt-URL) ergänzt fehlende Angaben.
   - **Lokal (Standard):** Tesseract.js (Deutsch + Englisch) läuft im Browser, mehrstufig ohne KI:
     1. Bild auf ~2200 px skalieren (kleine Fotos bis 2× vergrößern), Graustufen mit automatischer Kontrastspreizung (2/98-%-Perzentil).
     2. Durchgang 1: Graustufen, Seitensegmentierung *Auto* (Lieferschein) bzw. *verstreuter Text* (Etikett).
     3. Fehlen Angaben: Durchgang 2 mit adaptiver Schwarz-Weiß-Umwandlung (Bradley, gleicht Schatten/ungleiches Licht aus,
        helle Schrift auf dunklem Grund wird invertiert) und anderer Segmentierung (Lieferschein: Block).
     4. Wurde gar nichts gefunden: gedrehte Varianten 90°/270°/180° (Etiketten auf runden Spulen werden oft quer fotografiert).
     5. Bestes Ergebnis nach Treffern (Typ, Farbe, Hersteller, Gewicht) + Erkennungssicherheit; bei Etiketten ergänzen sich die Durchgänge.
     6. **Fehlerkorrektur** vor dem Auswerten: Wörter werden mit einem gewichteten Editierabstand gegen Materialien, Marken, Farben und die
        eigenen Hersteller/Farben aus dem Bestand abgeglichen (optisch ähnliche Zeichen wie 0/O, 1/l/I, 5/S, 8/B, C/G zählen weniger;
        kurze Wörter werden nur bei solchen Verwechslungen korrigiert, z. B. `PETC`→`PETG`, `P1A`→`PLA`, `8LAU`→`BLAU`).
        Gewichte/Durchmesser: `lkg`/`1 kq`→`1 kg`, `1O00g`→`1000 g`, `1.7S rnm`→`1.75 mm`.
     Die Erkennungsdateien (~10 MB) werden beim ersten Mal von jsDelivr geladen und danach vom Browser zwischengespeichert. Fotos verlassen das Gerät nicht.
   - **KI (optional):** Ist unter *Daten & Sync* ein Claude-API-Key hinterlegt (verschlüsselt in `team.enc.json`), wird das Foto an die
     Claude-API (`claude-opus-5-5`, strukturierte JSON-Ausgabe) gesendet. Deutlich robuster bei schiefen Fotos, Tabellen und Handschrift.
4. **Prüfliste:** Jede erkannte Position ist editierbar (Typ/Farbe/Hersteller mit Vorschlagslisten, Rollen, kg/Rolle) und zeigt an, ob sie
   **zu einem vorhandenen Eintrag addiert** (gleicher Typ, Farbe, Hersteller, kg/Rolle) oder **neu angelegt** wird. Zeilen abwählen/löschen/ergänzen,
   erkannten Rohtext einblenden.
5. *Übernehmen* bucht alles in einem Schritt; im Verlauf steht „Foto-Import (Lieferschein/Etikett)“ mit Namen.

Parser-Heuristik (`recognize.js`): erkennt ~45 Hersteller, Materialtypen inkl. Varianten (PLA+/Matte/Silk/Metal, PETG-CF, PLA-CF, TPU 95A, …),
Farben auf Deutsch/Englisch/Französisch inkl. Hersteller-Farbnamen (z. B. Charcoal, Ash Grey, Navy, Sakura, Terracotta), eigene
Hersteller-/Farbnamen aus dem Bestand, Gewicht (g/kg), Durchmesser, Mengen („3 Stk“, „2x“, „Menge: 2“, Menge vor Preisspalten); Positionsnummern
werden nicht als Menge gewertet.

## 8. Resin

Eigener Tab mit derselben Tabelle wie Filament (Suche, Filter, Sortierung, Auswahl/Bulk, ±), aber:
- Einheit **Flaschen**, Menge **je Flasche in kg bzw. L**; Typen: Standard, ABS-Like, Water-Washable, Tough, Flexible, 8K, Plant-Based, High-Temp, Clear, Dental, Castable, Engineering (+ eigene).
- **MHD** (Monat/Jahr) je Eintrag: ≤ 2 Monate → gelb „bald“, überschritten → rot „abgelaufen“; „Nur knapp“ zeigt auch MHD-Warnungen.
- Statistik-Abschnitt „Resin“: Flaschen, Menge, Verbrauch 30 Tage, MHD-Warnungen, Menge je Typ, Flaschen je Farbe, Haltbarkeitsliste.
- Resin-Buchungen werden im Verlauf markiert und nicht in die Filament-Verbrauchsstatistik gerechnet. Foto-Erfassung ist nur für Filament.

## 9. In Verwendung (geöffnete Rollen)

- **Drucker verwalten:** Name, Anzahl AMS-Plätze (4 je AMS → A1–A4, B1–B4 …; 1 = „Spule“; 0 = ohne AMS) und externe Spule („Ext“).
- **Rolle öffnen:** In der Filament-Tabelle ⏏ oder im Tab „In Verwendung“ auf einen freien Platz / „+ Rolle einlegen“.
  Neue Rolle → Lagerbestand −1 (kein Verbrauch), geöffnete Rolle mit 100 % wird dem Platz zugeordnet. Ist der Platz belegt, wandert die bisherige Rolle ins Regal.
- **Restmenge:** Platz antippen → Schieberegler bzw. 100/75/50/25/10 %. Eine Verringerung wird als **Verbrauch** gebucht (z. B. 3-kg-Rolle 100 → 25 % = 2,25 kg).
- **Verschieben:** anderer Drucker/Platz oder **Regal** („Angebrochen, nicht im Drucker“).
- **Leer – entfernen:** bucht die Restmenge als Verbrauch (mit Rückgängig). **Ungeöffnet zurück ins Lager:** bei 100 % → Lagerbestand +1.
- KPIs: geöffnete Rollen, Rest gesamt, im Drucker, freie Plätze, fast leer (≤ 15 %); der Filament-Tab zeigt zusätzlich „In Verwendung“.
- Datenmodell: `inUse[]` (Typ, Farbe, Hersteller, kg/Rolle, `rest` %, `drucker`, `slot`, `geoeffnet`, `ref` → Lagereintrag) und `drucker[]`; alle Änderungen als Operationen mit Merge.

## 10. Bestellungen

- **Erfassen:** „+ Bestellung“ oder direkt aus dem Bestand: 🛒 je Zeile bzw. Mehrfachauswahl → „🛒 Bestellen“ (vorbefüllt; Menge = bis über den Mindestbestand).
  Kopf: Lieferant/Shop, Bestell-Nr., bestellt am, Lieferung erwartet, Bemerkung. Positionen: Art (Filament/Resin), Typ, Farbe, Hersteller, Menge, kg je Rolle/Flasche, Preis (optional).
  Jede Position zeigt schon beim Erfassen, ob sie bei Erhalt **zu einem vorhandenen Lagereintrag addiert** oder **neu angelegt** wird.
- **Übersicht:** Karten je Bestellung mit Status *offen / teilweise erhalten / erhalten / storniert*, überfällige Liefertermine rot. Filter Offen/Erhalten/Alle, Suche.
  Zähler am Tab (offene Bestellungen); im Bestand steht an passenden Zeilen „📦 +n bestellt“ und die KPI „Bestellt“.
- **Wareneingang:** „✓ Erhalten“ je Position oder „✓ Alles erhalten“ → Lagerbestand +Menge (gleicher Typ, Farbe, Hersteller, Inhalt, bei Filament Durchmesser) bzw. neuer Eintrag
  (Filament-Sorte wird aus dem Typ abgeleitet). Verlauf: „Bestellung erhalten (Lieferant): +n …“ mit kg als Zugang. **Rückgängig** über die Meldung.
- **Bearbeiten/Stornieren** offener Bestellungen; erledigte Bestellungen können aus der Liste entfernt werden (Inventar bleibt unverändert).
- Datenmodell: `bestellungen[]` – eine Zeile je Position, Positionen einer Bestellung teilen `bid`; Status-/Mengenänderungen als Operationen (Merge-fähig).

### Einkaufsliste

Oben auf der Seite *Bestellungen* steht die **Einkaufsliste** – alles, was noch bestellt werden muss:

- Arten: **Filament**, **Resin** und **🔧 Zubehör** (Düsen, Druckplatten, IPA, PTFE-Schlauch, FEP-Folie, Werkzeug … – Vorschlagsliste,
  frei erweiterbar). Felder: Artikel/Typ, Farbe, Hersteller, Menge, Inhalt (kg), Notiz/Link; wer es eingetragen hat, wird gespeichert.
- Eintragen über das Formular (Enter genügt), aus dem Bestand per Mehrfachauswahl **📝 Einkaufsliste** oder mit
  **⚠ Knappe Bestände übernehmen** (alle Einträge unter Mindestbestand, die weder auf der Liste noch bestellt sind).
  Gleiche Artikel werden aufgestockt statt doppelt angelegt. Menge −/+, antippen = bearbeiten, 🗑 mit Rückgängig.
- **🛒 Alle/Ausgewählte bestellen** öffnet eine neue Bestellung mit diesen Positionen; **„… zu offener Bestellung“** hängt sie an eine
  bestehende offene Bestellung an. Im Bestelldialog fügt **📝 Aus Einkaufsliste** einzelne Einträge hinzu.
- Erst beim **Speichern** der Bestellung verschwinden die übernommenen Einträge von der Liste (Abbrechen ändert nichts).
- Zubehör-Positionen werden bei „✓ Erhalten“ nur abgehakt und im Verlauf vermerkt – sie werden nicht ins Lager gebucht.

Datenmodell: `einkauf: [{ id, kat: "filamente|resin|zubehoer", typ, farbe, hersteller, menge, kgProRolle, durchmesser, notiz, wer, t }]`,
Bestellpositionen haben zusätzlich `kat: "zubehoer"`. Operationen nutzen `coll: "einkauf"`.

### Artikelnummer (Art.-Nr.)

- Feld **Art.-Nr.** je Filament/Resin (Dialog „Bearbeiten“), eigene Spalte in der Liste (sortierbar, Handy: eigene Zeile auf der Karte),
  durchsuchbar, im CSV-Export/-Import enthalten. **Antippen kopiert** die Nummer in die Zwischenablage (zum Einfügen im Shop).
- Wird beim Nachbestellen (🛒, Mehrfachauswahl, Einkaufsliste) automatisch in die Bestellposition übernommen; Positionen und
  Einkaufsliste haben ebenfalls ein Art.-Nr.-Feld.
- Beim Wareneingang wird zuerst über die **Art.-Nr.** zugeordnet, dann über Typ/Farbe/Hersteller/Inhalt. Neu angelegte Einträge
  übernehmen die Nummer; bestehende Einträge ohne Nummer bekommen sie beim Erhalt ergänzt.
- **📋 Liste kopieren** in der Einkaufsliste kopiert „Menge× Artikel – Art.-Nr. …“ je Zeile (alle oder ausgewählte), z. B. für eine Bestell-E-Mail.

## 11. Geräte-Optimierung

**Windows-PC**
- Schrift *Segoe UI Variable*, dunkle Scrollbars (Chromium/Edge & Firefox), sichtbarer Tastaturfokus.
- Breakpoints für 1366/1280-px-Laptops und 125–150 % Skalierung (Spalten Bemerkung/Lagerort werden ausgeblendet, Tabs kompakt).
- Tastenkürzel: `N` neues Filament, `/` Suche; Doppelklick auf Zeile = bearbeiten. Als App installierbar (Edge/Chrome).

**Android**
- Navigation unten (Daumenbereich), schwebender „+“-Button, große Touch-Ziele (≥ 42 px), Karten statt Tabelle.
- PWA-Manifest mit Maskable-Icon → „Zum Startbildschirm hinzufügen“ startet als Vollbild-App; kurze Vibration bei ±.

**iPhone**
- `viewport-fit=cover` + Safe-Area-Abstände (Notch, Home-Indikator), Statusleiste `black-translucent`.
- Eingabefelder 16 px (verhindert Auto-Zoom in Safari), `100dvh` für Dialoge, Apple-Touch-Icon.
- Zum Home-Bildschirm hinzufügen: Teilen → „Zum Home-Bildschirm“.

Getestet (Playwright/Chromium): Desktop 1366×768 und 1400×1000, iPhone 13, Pixel 7 – ohne horizontales Scrollen.

## 12. Inbetriebnahme

1. **Pages:** *Settings → Pages → Source: Deploy from a branch → `main` / `(root)`* (eingerichtet).
2. Nach jedem Push ist die neue Version nach ca. 1 Minute online.
3. App öffnen: `https://cortress.github.io/filamentbestand/`, mit dem Initial-Passwort entsperren.
4. **Team-Token anlegen:** GitHub → *Settings → Developer settings → Fine-grained tokens* →
   Repository access: nur `cortress/filamentbestand` → Permissions: *Contents: Read and write* → Ablaufdatum setzen.
   In der App unter *Daten & Sync → Team-Zugang* einfügen. Ab jetzt speichern alle Geräte automatisch.
5. **Team-Passwort ändern** (Daten & Sync) und an das Team weitergeben.
6. Auf Handys/PC „Zum Startbildschirm hinzufügen“ bzw. „App installieren“.

## 13. Betrieb

- **Backup/Klartext-Export:** in der App *Export JSON/CSV* oder
  `node tools/crypt.mjs decrypt data/filamente.enc.json > backup.json` (fragt nach dem Passwort).
- **Token läuft ab:** Wolke wird rot → neuen Token unter *Team-Zugang* hinterlegen.
- **Gerät verloren:** Team-Passwort ändern (macht gespeicherte Schlüssel ungültig) und ggf. Token neu erstellen.
- **Rate-Limit:** 5 000 Anfragen/h pro Token; Abgleich alle 20 s mit ETag (304 zählt nicht) reicht für ein Team problemlos.

## 14. Tests

| Test | Ergebnis |
|---|---|
| Rendering, Filter, Sortierung, Anlegen, ±, Löschen/Rückgängig | ✔ |
| Falsches Passwort wird abgewiesen | ✔ |
| Token hinterlegen → `team.enc.json` enthält keinen Klartext | ✔ |
| Zwei Personen ändern gleichzeitig dieselbe Position (A −2, B +1) | ✔ korrekt zusammengeführt |
| Erzwungener Schreibkonflikt (paralleles PUT) | ✔ automatisch aufgelöst |
| Kein Klartext im Repo und im localStorage | ✔ |
| Offline-Änderung → nach Reconnect übertragen | ✔ |
| „Angemeldet bleiben“ nach Reload | ✔ |
| Layout iPhone 13 / Pixel 7 / 1366×768 ohne Überlauf | ✔ |
| Auswahl (einzeln / alle gefilterten), Bulk-Löschen + Rückgängig | ✔ Desktop & iPhone |
| Foto Lieferschein (3 Positionen, Mengen 3/2/1, Positionsnummern ignoriert) per lokaler OCR | ✔ |
| Foto Etikett (eSun PLA+ Weiß 1 kg) per lokaler OCR | ✔ |
| Zuordnung zu vorhandenem Eintrag vs. neuer Eintrag | ✔ |
| Erkennung ohne KI, alt → neu: Etikett 90° gedreht (nichts → vollständig), schattig/kontrastarm (ohne Gewicht → vollständig), klein + schräg (ohne Gewicht/Durchmesser → vollständig), hell auf dunkel | ✔ |
| EAN-13 auf Etikett: 1. Scan lernt Code, 2. Scan sofort „per Barcode erkannt“ (ohne OCR); QR-Code mit Produkt-URL → Sunlu PETG Rot | ✔ Desktop & iPhone (ZXing) |

| Resin anlegen (Typ, Farbe, Hersteller, Flaschen, MHD), MHD-Warnung „abgelaufen“ | ✔ Desktop & iPhone |
| Drucker anlegen (4 + Ext, 8 Plätze → 13 Plätze), Rolle öffnen (Lager 5 → 4), Platz belegen | ✔ |
| Rest 100 → 25 % bei 3-kg-Rolle bucht 2,25 kg Verbrauch; ins Regal; leer entfernen bucht Rest | ✔ |
| Mehrbenutzer-Merge und Konfliktauflösung mit erweitertem Datenmodell | ✔ |
| Bestellung aus Bestand (🛒) mit 3 Positionen (Filament vorhanden, Resin neu, Filament neu), Überfällig-Markierung, „+4 bestellt“ im Bestand | ✔ Desktop & iPhone |
| Erhalten einzeln (Lager 2 → 6) + Rückgängig, „Alles erhalten“ legt neue Einträge an, Mehrfach-Bestellung aus Auswahl | ✔ |
| Einkaufsliste: aus Bestand (2), Zubehör (Düse, IPA), Filament, Aufstocken gleicher Artikel, −/+, Bearbeiten, knappe Bestände übernehmen | ✔ Desktop & iPhone |
| Ausgewählte → neue Bestellung, Rest → offene Bestellung anhängen, Chip „Aus Einkaufsliste“; Liste wird beim Speichern geleert | ✔ |
| Erhalt: Filament ins Lager (neu/aufgestockt), Zubehör nur abgehakt, Verlauf | ✔ |
| Art.-Nr.: speichern, Spalte/Handy-Zeile, kopieren, Suche; Übernahme in Bestellung; Erhalt ordnet über Art.-Nr. zu (Typ abweichend benannt → richtiger Eintrag 4 → 5); Einkaufsliste kopieren | ✔ Desktop & iPhone |

Die KI-Erkennung wurde nicht live getestet (kein API-Key in der Testumgebung).

Die Tests liefen gegen eine simulierte GitHub-API; der erste echte Abgleich erfolgt nach Hinterlegen des Tokens.

## 15. Mögliche Erweiterungen

- Service Worker für vollständige Offline-Nutzung der App-Dateien.
- Restgewicht angebrochener Rollen (Waage/Prozent).
- Live-Kamera-Scan für Barcodes (Video statt Einzelfoto), Ausschnitt-Auswahl im Foto vor der Texterkennung.
- Bestellliste aus Mindestbeständen, Benachrichtigung bei Unterschreitung.
- QR-Etiketten pro Rolle zum schnellen Ausbuchen per Handy-Kamera.
- Mehrere Lager/Standorte, Preise & Lieferanten-Links.

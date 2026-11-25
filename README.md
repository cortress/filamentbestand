# Filamentbestand

Statische WebApp (Dark Mode) zur Erfassung des Filamentbestands für unsere 3D-Drucker.
Läuft ohne Build und ohne Server direkt auf **GitHub Pages**. Ausgangsbasis war die Excel-Liste `Filamentbestand.xlsx`
(31 Einträge, 64 Rollen, 85,75 kg) – sie steckt jetzt in [`data/filamente.json`](data/filamente.json).

## Funktionen

- **Bestand**: Tabelle mit Farbmuster, Sorte, Hersteller, Rollen (±-Buttons für Verbrauch/Zugang), kg je Rolle, Gesamt-kg, Lagerort, Bemerkung
- **Filter & Suche**: Volltextsuche, Sorte (auch per Chip), Farbe, Hersteller, „nur knapp“
- **Sortierung**: Klick auf jede Spaltenüberschrift (nochmal klicken = umkehren)
- **Anlegen/Bearbeiten**: Auswahllisten für Typ, Sorte, Farbe, Hersteller (inkl. „Neu …“), Sorte wird aus dem Typ vorgeschlagen,
  Farbcode, Durchmesser, Mindestbestand, Lagerort; Duplikat-Erkennung beim Anlegen; Löschen mit „Rückgängig“
- **Nach Typ & Farbe**: herstellerunabhängige Gruppierung wie in der Excel (Klick filtert die Tabelle)
- **Statistik**: Kennzahlen, kg/Rollen je Sorte, Rollen je Farbe/Hersteller/Rollengröße, knapper Bestand,
  Verbrauch & Zugänge der letzten 12 Wochen, Änderungsprotokoll
- **Daten & Sync**: Export CSV (Excel-kompatibel) / JSON, Import CSV/JSON, Sorten-Zuordnung pflegen, GitHub-Synchronisation
- Tastenkürzel: `n` = neues Filament, `/` = Suche

## Hosting (GitHub Pages)

1. Branch nach `main` mergen.
2. Im Repo: **Settings → Pages → Build and deployment → Source: „GitHub Actions“**.
3. Der Workflow `.github/workflows/pages.yml` deployed bei jedem Push auf `main`.
   Die App ist dann unter `https://<owner>.github.io/filamentbestand/` erreichbar.

> Hinweis: GitHub Pages ist bei privaten Repos nur mit kostenpflichtigem Plan verfügbar; die Seite selbst ist öffentlich lesbar.

## Gemeinsame Daten im Team

Jede Änderung wird sofort im Browser (localStorage) gespeichert. Damit alle denselben Stand sehen, schreibt die App
`data/filamente.json` über die GitHub-API direkt ins Repo:

1. GitHub → Settings → Developer settings → **Fine-grained tokens** → Token nur für dieses Repo mit
   **Contents: Read and write** erstellen.
2. In der App unter **Daten & Sync** Owner/Repo/Branch (`main`) eintragen, Token einfügen, optional
   „Änderungen automatisch speichern“ aktivieren.
3. „Nach GitHub speichern“ erzeugt einen Commit; Pages deployed neu, andere Geräte laden beim Öffnen den neueren Stand.

Der Token bleibt ausschließlich im jeweiligen Browser und wird nirgends sonst gespeichert.
Bei gleichzeitigen Änderungen warnt die App vor dem Überschreiben eines neueren Stands.

## Lokal starten

```bash
python3 -m http.server 8000
```

Dann <http://localhost:8000> öffnen.

## Datenformat

`data/filamente.json`:

```json
{
  "version": 1,
  "aktualisiert": "ISO-Zeitstempel",
  "typen": { "PLA+ Matte": "PLA+" },
  "filamente": [
    { "id": "f001", "typ": "ASA+", "gruppe": "ASA+", "farbe": "Schwarz", "farbcode": "", "hersteller": "eSun",
      "rollen": 4, "kgProRolle": 1, "durchmesser": 1.75, "mindestbestand": 0, "lagerort": "", "bemerkung": "" }
  ],
  "verlauf": [ { "t": "ISO-Zeitstempel", "text": "−1 Rolle (verbraucht): …", "kg": -1 } ]
}
```

# Filamentbestand

Dark-Mode-WebApp zur Erfassung des Filamentbestands unserer 3D-Drucker – gehostet auf **GitHub Pages**,
Daten **verschlüsselt** im Repository, **automatischer Sync** zwischen allen Geräten (Windows-PC, Android, iPhone).

➡ **App:** https://cortress.github.io/filamentbestand/
➡ **Vollständiger Plan, Architektur & Sicherheitskonzept:** [`docs/PLAN.md`](docs/PLAN.md)

## Funktionen

- Bestand mit Farbmuster, Sorte, Hersteller, Art.-Nr. (antippen = kopieren), Rollen (± für Verbrauch/Zugang), kg, Lagerort, Mindestbestand
- Suche, Filter (Sorte, Farbe, Hersteller, „nur knapp“), Sortierung nach jeder Spalte
- Auswahllisten für Typ/Sorte/Farbe/Hersteller, Sorte wird aus Typ vorgeschlagen
- Ansicht „Typ & Farbe“ (wie in der Excel), Statistiken, Verlauf mit Namen der Person
- Automatisches Speichern + Zusammenführen gleichzeitiger Änderungen, Offline-fähig
- ☁ Cloud-Symbol oben rechts: grün = alles aktuell, gelb = ausstehend, orange = synchronisiert gerade, rot = Fehler
- AES-256-GCM-Verschlüsselung (Team-Passwort), nichts im Klartext im Repo oder im Browser-Speicher
- Mehrfachauswahl per Kästchen: Löschen (mit Rückgängig), ±1 Rolle für alle ausgewählten
- 📷 Hinzufügen per Foto von Lieferschein oder Rollen-Etikett – lokale Texterkennung (mehrstufig: Kontrast, Schwarz-Weiß, Drehung, OCR-Fehlerkorrektur) oder optional KI (Claude), mit Prüfliste vor dem Übernehmen
- ▮▮ Barcode/QR-Code auf Etiketten: einmal bestätigt, wird dieselbe Rolle beim nächsten Scan sofort erkannt (fürs ganze Team)
- 🧪 **Resin** als eigener Bereich: Flaschen, Inhalt, Resin-Typen, Mindesthaltbarkeit mit Warnung, eigene Statistik
- 🖨 **In Verwendung**: Drucker mit AMS-Plätzen, geöffnete Rollen einlegen/verschieben (auch neue Rollen, die noch nicht im Bestand sind), Restmenge in %, Regal für angebrochene Rollen – Verbrauch wird automatisch gebucht
- 📦 **Bestellungen**: Bestellungen mit Positionen vermerken (auch direkt aus dem Bestand), Liefertermin/Überfällig, „✓ Erhalten“ bucht automatisch ins Inventar
- 📝 **Einkaufsliste**: Filament, Resin und Zubehör (Düsen, Druckplatten, IPA …) vormerken, knappe Bestände übernehmen, mit einem Klick in eine neue oder offene Bestellung übernehmen
- Installierbar als App (Startbildschirm), CSV/JSON-Export & -Import

## Einrichtung (einmalig)

1. *Settings → Pages → Source: Deploy from a branch → `main` / `(root)`* (bereits eingerichtet).
2. App öffnen, mit dem Team-Passwort entsperren.
3. Fine-grained Token (nur dieses Repo, *Contents: Read and write*) unter **Daten & Sync → Team-Zugang** hinterlegen.
4. Team-Passwort unter **Daten & Sync** ändern und im Team teilen.

## Lokal starten

```bash
python3 -m http.server 8000
```

## Backup entschlüsseln

```bash
node tools/crypt.mjs decrypt data/filamente.enc.json > backup.json
```

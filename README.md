# VehicleVault

VehicleVault is a lightweight offline-first vehicle maintenance tracker built as a static Progressive Web App.

**Live app:** https://lonesurvivor112.github.io/Vehicle-Maint-App/

## Features

- Vehicle list and active vehicle selector
- Maintenance history with mileage, cost/coverage tracking and future due reminders
- **Document scanning** — scan receipts and work orders with your phone camera and attach them to a maintenance entry (auto edge detection, perspective correction, "enhanced" scanner look, multi-page → one PDF)
- Mileage/date-based reminders that roll forward automatically when marked Done (repeat miles/months)
- Expense ledger
- Receipt/photo/document library linked to maintenance entries
- JSON export/import and CSV maintenance export for Excel
- **Cloud database in a private GitHub repo** with automatic sync across devices (same model as SnakApp)
- PWA install support on iPhone and desktop browsers, works offline

## Project Structure

```text
Vehicle-Maint-App/
├── index.html
├── styles.css
├── manifest.webmanifest
├── sw.js
├── icons/
│   ├── icon-192.png
│   └── icon-512.png
├── js/
│   ├── app.js
│   ├── storage.js
│   ├── github-sync.js
│   ├── vehicles.js
│   ├── maintenance.js
│   ├── reminders.js
│   ├── expenses.js
│   ├── documents.js
│   ├── scanner.js
│   ├── dashboard.js
│   └── export.js
└── starter-db/
    └── vehiclevault-db.json
```

## Run Locally

Because this uses JavaScript modules and a service worker, open it through a local web server instead of double-clicking `index.html`.

**Windows (easiest):** double-click `start.bat`. It serves the app and opens it in your browser automatically. Leave the black console window open while using the app.

**Any platform (manual):**

```bash
cd Vehicle-Maint-App
python -m http.server 8080
```

Then open:

```text
http://localhost:8080
```

## Hosting: public app + private database

Same setup as SnakApp — the app is public, your data is not.

1. **Host the app** — this repo (`Vehicle-Maint-App`) is served with GitHub Pages: Settings → Pages → Deploy from branch → `main` / root. It contains only code and an example starter DB, never your real data.
2. **Create the database repo** — a second, **private** repo (e.g. `vehiclevault-db`). It can start empty; the app creates `vehiclevault-db.json` on first sync. (Make sure it has at least one commit, e.g. tick "Add a README" when creating it.)
3. **Create a token** — GitHub → Settings → Developer settings → Personal access tokens → **Fine-grained tokens**. Repository access: **Only select repositories** → the private DB repo. Permissions: **Repository permissions → Contents: Read and write** (Metadata: Read is added automatically).
4. **Connect** — in the app open **GitHub Sync**, enter owner, private repo name and token, tap **Connect**. Repeat once on each device (PC, iPhone). The token is stored only in that device's browser.

Once connected:

- Every change uploads automatically ~1.5 seconds after you save it.
- Other devices pick changes up within a minute, or as soon as you reopen/switch back to the app.
- The newest copy wins (by the `updatedAt` stamp inside the database). **Sync Now** forces a round-trip.
- Connecting a new device that still has only the example data simply downloads your cloud database. If a device has its own newer changes, the app asks which copy to keep.
- If you are in the middle of filling a form, background downloads wait until you save, so nothing you type gets wiped.

## Scanning documents

In **Maintenance**, the form has a **Receipts & documents** section:

- **📷 Scan Document** opens the rear camera on iPhone/Android (a file picker on desktop). The app finds the page edges automatically; drag the four corners to adjust, rotate if needed, and pick a mode — **Enhanced** (white paper, dark text — best for receipts), **Grayscale** or **Color**.
- **＋ Add page** for multi-page invoices — all pages are saved as a single PDF.
- **📎 Attach File** adds an existing PDF or photo (photos are downscaled automatically).
- Attachments appear on the maintenance entry (tap to open) and in the **Documents** view, which can also scan and link documents to an entry after the fact.
- Deleting a maintenance entry deletes its attached documents.

A scanned page is typically **50–150 KB**, so hundreds of receipts fit comfortably.

## Backup and Restore

**The single JSON file is a complete backup — uploaded documents included.**

When you scan or attach a receipt, photo, or PDF (in **Maintenance** or **Documents**), the file is not stored separately on disk or in the cloud. It is read into memory, encoded as a base64 data URL, and saved inside the database record itself (the `dataUrl` field). That database — vehicles, maintenance, expenses, reminders, **and the embedded document files** — is what gets written when you use **Export → Full JSON** or **GitHub Sync → Save DB to GitHub**.

### What this means for you

- **One file holds everything.** There is no separate image folder to lose or forget. Back up the JSON and you have backed up your documents too.
- **Full restore from JSON alone.** On a fresh install (new browser, new phone, after a wipe), use **Export → Import JSON** or **GitHub Sync → Load DB from GitHub**. All records *and* the actual uploaded files come back, because the file bytes live inside the JSON.

### Size limits to respect

Because files are embedded as base64 (which is ~33% larger than the original), keep an eye on total size:

- **On-device storage** uses IndexedDB, which has room for hundreds of MB (older versions used localStorage, capped at ~5 MB; existing data migrates automatically on first launch).
- **GitHub sync** reads the file with the raw media type and writes it through the Contents API, which handles database files well beyond 1 MB. Keep the total under ~50 MB to stay comfortably within GitHub's limits — the **GitHub Sync** page shows the current database size.

**Recommendation:** use the built-in scanner (compressed ~50–150 KB per page) rather than attaching full-resolution camera photos or large PDFs, and keep cloud sync connected or export regularly so you always have an off-device copy.

## iPhone Installation

1. Open the GitHub Pages URL in Safari.
2. Tap Share.
3. Tap **Add to Home Screen**.
4. Launch VehicleVault from the icon.

## Notes

This app is intentionally local-first. Data is stored in the browser (IndexedDB) and, when connected, in your private GitHub repo. Receipt and image uploads are stored as base64 data URLs inside that same database. See **Backup and Restore** above for what the JSON file contains, how to restore it, and the storage limits to keep in mind.

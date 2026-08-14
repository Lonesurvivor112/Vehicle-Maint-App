# VehicleVault

VehicleVault is a lightweight offline-first vehicle maintenance tracker built as a static Progressive Web App.

## Features

- Vehicle list and active vehicle selector
- Maintenance history with mileage and future due reminders
- Mileage/date-based reminders
- Expense ledger
- Receipt/photo/document storage in browser localStorage
- JSON export/import
- CSV maintenance export for Excel
- Optional GitHub JSON cloud sync to a private repository
- PWA install support on iPhone and desktop browsers
- Offline service worker cache

## Project Structure

```text
vehiclevault/
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
cd vehiclevault
python -m http.server 8080
```

Then open:

```text
http://localhost:8080
```

## GitHub Pages Deployment

1. Create a GitHub repository named `vehiclevault`.
2. Upload all files in this folder.
3. Go to **Settings > Pages**.
4. Set source to your main branch root.
5. Open the GitHub Pages URL.

## GitHub Sync Setup

1. Create a separate private repository for your database, for example `vehiclevault-db`.
2. Create a fine-grained GitHub token with access only to that private repo.
3. In VehicleVault, open **GitHub Sync**.
4. Enter owner, repo, branch, path, and token.
5. Click **Save DB to GitHub**.

Recommended database path:

```text
vehiclevault-db.json
```

## iPhone Installation

1. Open the GitHub Pages URL in Safari.
2. Tap Share.
3. Tap **Add to Home Screen**.
4. Launch VehicleVault from the icon.

## Notes

This app is intentionally local-first. Data is stored in browser localStorage unless you export it or sync it to GitHub. Receipt and image uploads are stored as base64 data URLs, so very large files can increase browser storage usage quickly.

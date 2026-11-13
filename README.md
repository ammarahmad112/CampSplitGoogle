# Camp Split 🏕️

A responsive camping expense calculator for friends — with light/dark mode, expense category pie chart, receipt photo uploads to Google Drive, multi-device sync, PIN lock, short view-only links, and QR code sharing.

## Put it online with GitHub Pages

You can deploy this repository to GitHub Pages in **either** of two ways:

### Option 1: Deploy directly from branch (`main` / `(root)`)
1. Upload all repository files (including the `gh-pages` folder, `index.html`, `.nojekyll`, and `README.md`) to your GitHub repository.
2. Go to **Settings → Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**, pick the `main` branch and `/ (root)` folder, then click **Save**.
4. After a minute your app is live at `https://YOUR-USERNAME.github.io/YOUR-REPO-NAME/`.

### Option 2: Deploy with GitHub Actions
1. Go to **Settings → Pages** and set **Source** to **GitHub Actions**.
2. Push to `main` — the included `.github/workflows/deploy.yml` workflow builds `dist/` automatically and publishes it.

## Google Drive sync & receipt photos (optional)

Keeps your trip data and expense receipt photos in your own Google Drive folder so every connected device stays in sync.

1. In Google Drive, create a folder and copy its ID from the address bar (the text after `/folders/`).
2. Go to https://script.google.com, create a New project (or open your existing one), and paste the contents of `Code.gs`. Set `FOLDER_ID` and your secret `ADMIN_CODE` (12+ characters) at the top.
3. Choose **Deploy → New deployment** (or **Manage deployments → Edit → New version**) as type **Web app**, Execute as **Me**, Who has access **Anyone**.
4. Open **Drive Sync** in the app, paste the `/exec` URL and your access code, then press **Connect**. Use **Pair another device** to scan a QR code on a second phone, tablet, or laptop.

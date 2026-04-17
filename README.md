# Ghost Photo

Small PWA: pick a reference photo from the gallery, open the camera, and overlay that image (“ghost”) so you can line up a new shot with the old one.

## Requirements

- **Python 3** (stdlib HTTP server; no pip install)
- **[just](https://github.com/casey/just)** (optional; use for `just serve`)

## Local testing

From this directory:

```bash
just serve
```

Or without `just`:

```bash
python3 -m http.server 8765
```

Open **http://127.0.0.1:8765/** (default port). Use another port:

```bash
PORT=9000 just serve
```

## PWA and camera on a phone

- **Install / add to home screen:** needs a **secure context** (HTTPS, or `localhost` on the same machine). Opening the site over plain `http://<your-lan-ip>` from a phone often blocks camera access.
- For real-device testing over the network, serve behind HTTPS (e.g. static host, or a tunnel with TLS).

## Layout

| File | Role |
|------|------|
| `index.html` | UI |
| `styles.css` | Styles |
| `app.js` | Camera, file pick, overlay |
| `manifest.json` | PWA metadata |
| `sw.js` | Service worker (offline shell) |
| `icon-192.png`, `icon-512.png` | App icons |

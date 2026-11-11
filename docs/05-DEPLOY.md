# 05 · Deploy

## Local

```bash
npm start            # http://127.0.0.1:5173 (PORT=8080 npm start to change the port)
npm test
```

ES modules do not load from `file://`, so the game is always served over http. `scripts/serve.mjs`
is a zero-dependency static server that refuses paths outside the project and dotfiles.

## CI (`.github/workflows/ci.yml`)

On every push and pull request, on Node 20, 22 and 24:

1. `node --check` on every source and script file
2. `npm test`

## GitHub Pages (`.github/workflows/pages.yml`)

On every push to `main` (or by hand):

1. `npm test`; a red suite blocks the deploy
2. Copy only the static files (`index.html`, `styles.css`, `favicon.svg`, `src/`) into `_site/`
3. Upload and deploy with `actions/deploy-pages`

One-time setup: repository **Settings → Pages → Source: GitHub Actions**.

## Checklist before a release

- [ ] `npm test` green
- [ ] Play stage 1 to the boss on a desktop browser and on a phone in landscape
- [ ] Sound and music toggles work and are remembered after a reload
- [ ] `GOATCOUNTER_CODE` set (or deliberately left empty) in `src/ui/analytics.js`

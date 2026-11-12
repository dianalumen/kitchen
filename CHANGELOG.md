# Changelog

## M0 · Setup — 2026-11-12

- Initialised the git repository (default branch `main`) with the product, technical, design and planning docs and `tools/`.
- Added `.gitignore` (`config.js`, `*.backup`, `supabase/seed/*.sql`, `.DS_Store`).
- Added `config.example.js`; the real `config.js` is never committed.
- Added the GitHub Pages workflow (`.github/workflows/pages.yml`): writes `config.js` from the `SUPABASE_URL` / `SUPABASE_KEY` secrets and publishes an explicit list of files.
- Added a placeholder `index.html` that reports whether `config.js` was loaded.
- Added `README.md` with setup and local development instructions.

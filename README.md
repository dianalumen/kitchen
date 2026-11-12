# kitchen

A shared progressive web app for two people: a shopping list, a pantry and a recipe book that stay in sync in real time. It is plain HTML, CSS and JavaScript with no build step, backed by Supabase (Auth, Postgres with row-level security, Realtime, Storage) and hosted on GitHub Pages. The UI is in Polish; the code and docs are in English.

## Documentation

- [PRODUCT.md](PRODUCT.md) — what we build and why
- [TECH-GUIDELINES.md](TECH-GUIDELINES.md) — stack, database, auth, deploy, conventions
- [DESIGN.md](DESIGN.md) — visual direction
- [IMPLEMENTATION-PLAN.md](IMPLEMENTATION-PLAN.md) — milestones and status

## Setup

1. Create the GitHub repository `dianalumen/kitchen` (`config.js` is already in `.gitignore`).
2. Create a new Supabase project (separate from any other project).
3. In the Supabase SQL Editor, run `supabase/schema.sql` (added in milestone M1).
4. In GitHub, go to *Settings → Secrets and variables → Actions* and add `SUPABASE_URL` and `SUPABASE_KEY` (the publishable / anon key, never `service_role`).
5. In GitHub, go to *Settings → Pages* and set the source to **GitHub Actions**.
6. In Supabase, go to *Authentication → URL Configuration*: set the Site URL to `https://dianalumen.github.io/kitchen/` and add redirect URLs for it and for `http://localhost:8000/**`.
7. Push to `main`; the workflow deploys to <https://dianalumen.github.io/kitchen/>.
8. Sign up, create a household and send the code to the other person; they sign up and join with the code.

The Supabase URL and key are never committed: the deploy workflow writes `config.js` from the repository secrets.

## Local development

```bash
cp config.example.js config.js   # then fill in your Supabase URL and publishable key
python3 -m http.server 8000
```

Open <http://localhost:8000/>.

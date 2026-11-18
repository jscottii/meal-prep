# Meal Prep Shopper (app)

Svelte 5 + Vite installable web app, Supabase backend, free map services.

- `src/lib/db.svelte.js` – Supabase auth, data, live sync, all writes
- `src/lib/maps.js` – Nominatim (addresses), Overpass (store locations), OSRM (drive times, route line)
- `src/lib/optimizer.js`, `planner.js`, `receipts.js` – trip optimizer, weekly planner / Bare Minimum importer, receipt parser
- `supabase/schema.sql` – tables + row level security; `supabase/functions/proxy` – the one server function

Build: `npm install && npm run build` → `dist/` is published at the repo root for GitHub Pages.

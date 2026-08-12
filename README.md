# Family Tree

A modern, collaborative, photo-first family tree web app designed for GitHub Pages + Supabase.

The approved product/UI specification is in [`DESIGN.md`](./DESIGN.md), with the approved visual reference at [`docs/approved-ui.png`](./docs/approved-ui.png).

## Current status

The zero-build static app now runs exclusively against Supabase and includes:

- portrait family-member cards
- relationship connectors
- person selection + right details panel
- pan / zoom / fit / centre controls
- family / ancestors / descendants / list views
- search and focus
- persistent add-relative flow
- a UI-only root node for an empty tree
- passwordless Supabase email sign-in
- family-tree discovery and reliable first-tree creation
- Supabase-backed people and relationship writes
- private photo uploads with short-lived signed URLs
- live refresh when another editor changes a tree
- RLS, audit logging, storage policies and Realtime publication setup

## Run locally

Because the app uses ES modules, serve it over HTTP rather than opening `index.html` directly.

```bash
python3 -m http.server 8092
```

Then open `http://localhost:8092`.

## Supabase configuration

The app has no demo/local-data fallback. Every person, relationship, tree and
photo comes from Supabase. `src/config.js` must provide the project URL and a
browser-safe publishable key:

```js
export const config = {
  supabaseUrl: 'https://YOUR_PROJECT.supabase.co',
  supabaseAnonKey: 'sb_publishable_...',
  defaultTreeId: ''
};
```

Apply the SQL migrations in `supabase/migrations/` through the Supabase CLI
before using the app. They intentionally contain no family seed data, and local
Supabase seeding is disabled.

In Supabase Auth settings, add both the local URL and the deployed GitHub Pages
URL to the allowed redirect URLs. Email sign-in links return to the app URL that
requested them.

Signed-in members can choose any shared tree or create a new private tree. A
new tree contains no people; the canvas shows one UI-only root node that creates
the first persisted person. The selected tree is remembered in the URL and
browser storage. Leave `defaultTreeId` blank unless this deployment should
always prefer one specific tree.

Never put a Supabase service-role key in this repository or in browser code.
Only use a publishable key (or the legacy anon key) in `src/config.js`.

## GitHub Pages

A Pages workflow is included at `.github/workflows/pages.yml`. Once Pages is enabled for GitHub Actions, pushes to `main` deploy the static site.

## Architecture

- Frontend: HTML + CSS + native JavaScript modules
- Canvas: DOM portrait cards + SVG relationship paths
- Backend: Supabase Postgres/Auth/Storage/Realtime
- Hosting: GitHub Pages

See `DESIGN.md` for the full product, data, privacy and QoL specification.

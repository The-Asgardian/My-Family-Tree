# Family Tree

A modern, collaborative, photo-first family tree web app designed for GitHub Pages + Supabase.

The approved product/UI specification is in [`DESIGN.md`](./DESIGN.md), with the approved visual reference at [`docs/approved-ui.png`](./docs/approved-ui.png).

## Current status

The zero-build static app now includes the Phase 1 family-tree experience and
the core Phase 2 connected-mode path:

- portrait family-member cards
- relationship connectors
- person selection + right details panel
- pan / zoom / fit / centre controls
- family / ancestors / descendants / list views
- search and focus
- local add-relative flow
- demo data mode
- passwordless Supabase email sign-in
- family-tree discovery and creation
- Supabase-backed people and relationship writes
- private photo uploads with short-lived signed URLs
- live refresh when another editor changes a tree
- RLS, audit logging, storage policies and Realtime publication setup

## Run locally

Because the app uses ES modules, serve it over HTTP rather than opening `index.html` directly.

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

## Supabase configuration

The app runs in demo mode when Supabase is not configured.

Copy/edit `src/config.js` and provide:

```js
export const config = {
  supabaseUrl: 'https://YOUR_PROJECT.supabase.co',
  supabaseAnonKey: 'YOUR_PUBLISHABLE_OR_ANON_KEY',
  defaultTreeId: ''
};
```

Run `supabase/migrations/001_initial_schema.sql` in the Supabase SQL editor or through the Supabase CLI before enabling connected mode.

In Supabase Auth settings, add both the local URL and the deployed GitHub Pages
URL to the allowed redirect URLs. Email sign-in links return to the app URL that
requested them.

When connected mode starts, signed-in members can choose any tree shared with
them or create a new private tree. The selected tree is remembered in the URL
and browser storage. Leave `defaultTreeId` blank unless this deployment should
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

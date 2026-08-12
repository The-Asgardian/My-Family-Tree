# Private editor invitations

The published tree stays publicly viewable, but all database and photo writes
require an invited editor session. There is no sign-in screen or password.

## How it works

1. An existing editor creates a one-use link in the app. The first link can be
   created in the Supabase SQL editor.
2. The link contains a 256-bit random token after `#invite=`. URL fragments are
   not sent to GitHub Pages or in normal HTTP referrer headers.
3. The app silently calls Supabase anonymous sign-in, then claims the token with
   `claim_editor_invite`.
4. The database atomically marks the token used and adds that Auth user to the
   canonical tree as an editor. RLS then permits that user to add, edit, delete,
   and manage photos.
5. Supabase persists and refreshes the browser session. Clearing site data,
   signing out, or moving to another browser/device loses access; create a new
   invitation in that case.

The first browser to open and claim a link owns it. Send each link privately to
one intended person and never reuse it.

After the first editor claims access, the app can call the authenticated
`create_editor_invite` RPC. The database checks that the current user already
edits the canonical tree before returning a new link; no service-role key or
other server secret is used by the browser.

## Generate a link securely

Once a browser is already an editor, use the app's **Invite** button to create
and copy a one-use link without leaving the tree.

For the first editor only, in **Supabase Dashboard → SQL Editor**, run:

```sql
select * from private.create_editor_invite(interval '14 days');
```

Copy the returned `invite_url` and send it to one person. The raw token is
returned only by this call; the database stores its SHA-256 hash. Do not put the
link in source control, logs, issues, or group messages. The function accepts a
lifetime from 5 minutes to 90 days.

Anonymous sign-ins must be enabled in **Authentication → Providers → Anonymous**
when the migration is deployed. `supabase/config.toml` enables it for local
development, but hosted Auth settings are configured separately.

## Storage enforcement

The `family-photos` bucket accepts only `image/webp` and rejects objects above
2 MiB at the Storage API. Its read policies remain public for the one canonical
tree, while insert, update, and delete policies require editor membership.

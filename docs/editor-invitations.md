# Private family access

The published app is only a shell. Family data and private photos are returned
only to the owner or a device which has claimed a private family link.

## Roles

- **Owner** signs in with a private Supabase email/password account, can edit,
  and is the only person who can create family links.
- **Editor** claims a one-use link and can edit until the owner-selected expiry
  date. The expiry applies even after the link has been claimed.
- **Viewer** claims a one-use link and has permanent read-only access on that
  browser/device.

## How it works

1. The owner creates one-use links in the app.
2. The link contains a 256-bit random token after `#invite=`. URL fragments are
   not sent to GitHub Pages or in normal HTTP referrer headers.
3. The app silently calls Supabase anonymous sign-in, then claims the token with
   `claim_family_invite`.
4. The database atomically marks the token used and adds that Auth user to the
   canonical tree with the link's role. RLS checks the role and editor expiry
   on every read or write.
5. Supabase persists and refreshes the browser session. Clearing site data,
   signing out, or moving to another browser/device loses access; create a new
   invitation in that case.

The first browser to open and claim a link owns it. Send each link privately to
one intended person and never reuse it.

The app calls `create_family_invites`. The database requires the current user
to be the owner before returning any raw link; no service-role key or other
server secret is used by the browser.

## Configure the owner

1. In **Supabase Dashboard → Authentication → Users**, create the private owner
   email/password account. Do not expose a sign-up flow in the app.
2. In **SQL Editor**, assign that existing account:

```sql
select private.assign_family_owner('owner@example.com');
```

3. Open the app, choose **Settings → Owner sign in**, and use that account.

## Generate links securely

Use the owner's **Invite** button to create 1, 3, or 5 links. Choose temporary
Editor access or permanent Viewer access, copy each link separately, and send
it privately to one intended person.

For emergency editor access from **Supabase Dashboard → SQL Editor**, the older
admin-only helper remains available:

```sql
select * from private.create_editor_invite(interval '14 days');
```

Copy the returned `invite_url` and send it to one person. The raw token is
returned only by this call; the database stores its SHA-256 hash. Do not put the
link in source control, logs, issues, or group messages. The function accepts a
lifetime from 5 minutes to 90 days.

Anonymous sign-ins must be enabled in **Authentication → Sign In / Providers → Anonymous**
when the migration is deployed. `supabase/config.toml` enables it for local
development, but hosted Auth settings are configured separately.

## Storage enforcement

The `family-photos` bucket accepts only `image/webp` and rejects objects above
2 MiB at the Storage API. Reads require family membership; insert, update, and
delete policies require unexpired editor or owner access.

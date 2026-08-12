-- One-use, passwordless editor invitations for the canonical family tree.
-- Public visitors retain read-only access. Mutations require an authenticated
-- anonymous Supabase user whose invitation was claimed into tree_members.

create table private.editor_invitations (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid not null references public.trees(id) on delete cascade,
  token_hash bytea not null unique,
  expires_at timestamptz not null,
  claimed_by uuid references auth.users(id) on delete set null,
  claimed_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  constraint editor_invitations_canonical_tree check (
    tree_id = '7f73696e-676c-4574-7265-650000000001'::uuid
  ),
  constraint editor_invitations_claim_consistent check (
    (claimed_by is null and claimed_at is null)
    or (claimed_by is not null and claimed_at is not null)
  )
);

create index editor_invitations_tree_idx
  on private.editor_invitations(tree_id);

create index editor_invitations_claimed_by_idx
  on private.editor_invitations(claimed_by)
  where claimed_by is not null;

create index editor_invitations_expires_idx
  on private.editor_invitations(expires_at)
  where claimed_at is null;

alter table private.editor_invitations enable row level security;

comment on table private.editor_invitations is
  'One-use editor invitations. Only SHA-256 token hashes are stored.';

-- Preserve any previously-created editor invitation UUIDs, while replacing
-- their stored plaintext tokens with hashes. No client had a claim RPC before
-- this migration, but this also preserves a token if one was generated in SQL.
insert into private.editor_invitations (
  id,
  tree_id,
  token_hash,
  expires_at,
  claimed_by,
  claimed_at,
  created_by,
  created_at
)
select
  id,
  tree_id,
  extensions.digest(token::text, 'sha256'),
  expires_at,
  claimed_by,
  claimed_at,
  created_by,
  created_at
from public.invitations
where role = 'editor'
  and tree_id = '7f73696e-676c-4574-7265-650000000001'::uuid;

insert into public.tree_members (tree_id, user_id, role)
select tree_id, claimed_by, 'editor'
from private.editor_invitations
where claimed_by is not null
on conflict (tree_id, user_id) do update
set role = case
  when public.tree_members.role = 'owner' then 'owner'
  else 'editor'
end;

drop table public.invitations;

-- Run this function only from the Supabase SQL editor. It returns the complete
-- invitation URL once; the database stores only its hash.
create function private.create_editor_invite(
  valid_for interval default interval '14 days'
)
returns table(invite_url text, expires_at timestamptz)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  raw_token text;
  invite_expiry timestamptz;
begin
  if valid_for < interval '5 minutes' or valid_for > interval '90 days' then
    raise exception 'Invitation lifetime must be between 5 minutes and 90 days.';
  end if;

  raw_token := translate(
    rtrim(encode(extensions.gen_random_bytes(32), 'base64'), '='),
    '+/',
    '-_'
  );
  invite_expiry := now() + valid_for;

  insert into private.editor_invitations (tree_id, token_hash, expires_at)
  values (
    '7f73696e-676c-4574-7265-650000000001'::uuid,
    extensions.digest(raw_token, 'sha256'),
    invite_expiry
  );

  return query select
    'https://the-asgardian.github.io/My-Family-Tree/#invite=' || raw_token,
    invite_expiry;
end;
$$;

revoke all on function private.create_editor_invite(interval)
  from public, anon, authenticated, service_role;
grant execute on function private.create_editor_invite(interval) to postgres;

-- Existing editors can create a link from the app without any privileged API
-- key. Authorization is checked against tree_members inside this function.
create function public.create_editor_invite(valid_days integer default 14)
returns table(invite_url text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  canonical_tree constant uuid := '7f73696e-676c-4574-7265-650000000001'::uuid;
  caller_id uuid := (select auth.uid());
  raw_token text;
  invite_expiry timestamptz;
begin
  if caller_id is null or private.can_edit_tree(canonical_tree) is not true then
    raise exception using
      errcode = '42501',
      message = 'Editor access is required to create an invitation.';
  end if;

  if valid_days < 1 or valid_days > 90 then
    raise exception 'Invitation lifetime must be between 1 and 90 days.';
  end if;

  raw_token := translate(
    rtrim(encode(extensions.gen_random_bytes(32), 'base64'), '='),
    '+/',
    '-_'
  );
  invite_expiry := now() + make_interval(days => valid_days);

  insert into private.editor_invitations (
    tree_id,
    token_hash,
    expires_at,
    created_by
  )
  values (
    canonical_tree,
    extensions.digest(raw_token, 'sha256'),
    invite_expiry,
    caller_id
  );

  return query select
    'https://the-asgardian.github.io/My-Family-Tree/#invite=' || raw_token,
    invite_expiry;
end;
$$;

revoke all on function public.create_editor_invite(integer)
  from public, anon, authenticated, service_role;
grant execute on function public.create_editor_invite(integer) to authenticated;

comment on function public.create_editor_invite(integer) is
  'Creates a one-use editor link when the current Auth user already edits the canonical tree.';

-- This is the sole client-callable privilege escalation point. The row lock
-- makes concurrent claims atomic, auth.uid() binds the claim to the current
-- anonymous Auth user, and failures deliberately share one generic message.
create function public.claim_editor_invite(invite_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  claimant_id uuid := (select auth.uid());
  matched_invite private.editor_invitations%rowtype;
begin
  if claimant_id is null
    or coalesce((select (auth.jwt()->>'is_anonymous')::boolean), false) is not true then
    raise exception using
      errcode = '28000',
      message = 'An anonymous authenticated session is required to claim an invitation.';
  end if;

  if invite_token is null or char_length(invite_token) < 32 or char_length(invite_token) > 256 then
    raise exception using
      errcode = 'P0001',
      message = 'This invitation link is invalid, expired, or has already been used.';
  end if;

  select invitation.*
  into matched_invite
  from private.editor_invitations invitation
  where invitation.token_hash = extensions.digest(invite_token, 'sha256')
  for update;

  if not found
    or matched_invite.claimed_at is not null
    or matched_invite.expires_at <= now() then
    raise exception using
      errcode = 'P0001',
      message = 'This invitation link is invalid, expired, or has already been used.';
  end if;

  update private.editor_invitations
  set claimed_by = claimant_id,
      claimed_at = now()
  where id = matched_invite.id;

  insert into public.tree_members (tree_id, user_id, role)
  values (matched_invite.tree_id, claimant_id, 'editor')
  on conflict (tree_id, user_id) do update
  set role = case
    when public.tree_members.role = 'owner' then 'owner'
    else 'editor'
  end;

  return jsonb_build_object(
    'treeId', matched_invite.tree_id,
    'role', 'editor'
  );
end;
$$;

revoke all on function public.claim_editor_invite(text)
  from public, anon, authenticated, service_role;
grant execute on function public.claim_editor_invite(text) to authenticated;

comment on function public.claim_editor_invite(text) is
  'Atomically consumes a one-use invite token for the current anonymous Auth user.';

-- Visitors using the publishable key remain read-only.
drop policy if exists "public app creates canonical people" on public.people;
drop policy if exists "public app updates canonical people" on public.people;
drop policy if exists "public app deletes canonical people" on public.people;
drop policy if exists "public app creates canonical relationships" on public.relationships;
drop policy if exists "public app updates canonical relationships" on public.relationships;
drop policy if exists "public app deletes canonical relationships" on public.relationships;

revoke insert, update, delete on public.people from anon;
revoke insert, update, delete on public.relationships from anon;

drop policy if exists "public app uploads canonical photos" on storage.objects;
drop policy if exists "public app updates canonical photos" on storage.objects;
drop policy if exists "public app deletes canonical photos" on storage.objects;

-- An anonymous Auth session uses the authenticated database role. These
-- policies keep read-only viewing working before/without a successful claim.
create policy "authenticated app reads canonical tree"
on public.trees for select to authenticated
using (id = '7f73696e-676c-4574-7265-650000000001'::uuid);

create policy "authenticated app reads canonical people"
on public.people for select to authenticated
using (tree_id = '7f73696e-676c-4574-7265-650000000001'::uuid);

create policy "authenticated app reads canonical relationships"
on public.relationships for select to authenticated
using (tree_id = '7f73696e-676c-4574-7265-650000000001'::uuid);

create policy "authenticated app reads canonical photos"
on storage.objects for select to authenticated
using (
  bucket_id = 'family-photos'
  and (storage.foldername(name))[1] = '7f73696e-676c-4574-7265-650000000001'
);

-- Storage applies these restrictions before the object is accepted. The app
-- targets 1.5 MiB WebP output, leaving a small amount of transport headroom.
update storage.buckets
set public = false,
    file_size_limit = 2097152,
    allowed_mime_types = array['image/webp']::text[]
where id = 'family-photos';

create or replace function public.create_family_invites(
  invite_role text,
  valid_days integer default 14,
  invite_count integer default 1
)
returns table(invite_url text, role text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  canonical_tree uuid;
  raw_token text;
  invite_expiry timestamptz;
  item integer;
begin
  select tree.id into canonical_tree
  from public.trees tree
  where tree.singleton;

  if private.current_tree_role(canonical_tree) is distinct from 'owner' then
    raise exception using
      errcode = '42501',
      message = 'Owner access is required to create invitations.';
  end if;

  if invite_role not in ('editor', 'viewer') then
    raise exception 'Invitation role must be editor or viewer.';
  end if;

  if invite_count is null or invite_count < 1 or invite_count > 10 then
    raise exception 'Create between 1 and 10 links at a time.';
  end if;

  if invite_role = 'editor'
    and (valid_days is null or valid_days < 1 or valid_days > 90) then
    raise exception 'Editor access must last between 1 and 90 days.';
  end if;

  invite_expiry := case
    when invite_role = 'editor' then now() + make_interval(days => valid_days)
    else null
  end;

  for item in 1..invite_count loop
    raw_token := translate(
      rtrim(encode(extensions.gen_random_bytes(32), 'base64'), '='),
      '+/',
      '-_'
    );

    insert into private.editor_invitations (
      tree_id,
      token_hash,
      role,
      expires_at,
      created_by
    ) values (
      canonical_tree,
      extensions.digest(raw_token, 'sha256'),
      invite_role,
      invite_expiry,
      (select auth.uid())
    );

    invite_url := 'https://the-asgardian.github.io/My-Family-Tree/#invite=' || raw_token;
    role := invite_role;
    expires_at := invite_expiry;
    return next;
  end loop;
end;
$$;

revoke all on function public.create_family_invites(text, integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.create_family_invites(text, integer, integer) to authenticated;

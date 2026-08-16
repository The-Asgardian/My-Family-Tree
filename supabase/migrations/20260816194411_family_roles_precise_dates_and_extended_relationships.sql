-- Private family access, flexible historical dates, and family structures that
-- include explicit siblings and more than one spouse.

alter table public.people
  add column date_of_birth_precision text,
  add column date_of_death_precision text;

update public.people
set date_of_birth_precision = case when date_of_birth is null then 'unknown' else 'day' end,
    date_of_death_precision = case when date_of_death is null then 'unknown' else 'day' end;

alter table public.people
  alter column date_of_birth_precision set default 'unknown',
  alter column date_of_birth_precision set not null,
  alter column date_of_death_precision set default 'unknown',
  alter column date_of_death_precision set not null,
  add constraint people_birth_date_precision check (
    (date_of_birth_precision = 'unknown' and date_of_birth is null)
    or (date_of_birth_precision = 'year' and date_of_birth is not null and extract(month from date_of_birth) = 1 and extract(day from date_of_birth) = 1)
    or (date_of_birth_precision = 'month' and date_of_birth is not null and extract(day from date_of_birth) = 1)
    or (date_of_birth_precision = 'day' and date_of_birth is not null)
  ),
  add constraint people_death_date_precision check (
    (date_of_death_precision = 'unknown' and date_of_death is null)
    or (date_of_death_precision = 'year' and date_of_death is not null and extract(month from date_of_death) = 1 and extract(day from date_of_death) = 1)
    or (date_of_death_precision = 'month' and date_of_death is not null and extract(day from date_of_death) = 1)
    or (date_of_death_precision = 'day' and date_of_death is not null)
  );

comment on column public.people.date_of_birth_precision is
  'How much of date_of_birth is known: unknown, year, month, or day.';
comment on column public.people.date_of_death_precision is
  'How much of date_of_death is known: unknown, year, month, or day.';

alter table public.relationships
  drop constraint relationships_relationship_type_check,
  add constraint relationships_relationship_type_check
    check (relationship_type in ('parent_child', 'partner', 'sibling'));

create unique index sibling_active_unique
on public.relationships(
  tree_id,
  relationship_type,
  least(person_a_id, person_b_id),
  greatest(person_a_id, person_b_id)
)
where deleted_at is null and relationship_type = 'sibling';

create function private.validate_family_relationship()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  creates_ancestry_cycle boolean;
  people_are_ancestor_related boolean;
begin
  if new.deleted_at is not null then
    return new;
  end if;

  if new.relationship_type = 'parent_child' then
    with recursive descendants(person_id) as (
      select new.person_b_id
      union
      select relationship.person_b_id
      from public.relationships relationship
      join descendants on descendants.person_id = relationship.person_a_id
      where relationship.tree_id = new.tree_id
        and relationship.relationship_type = 'parent_child'
        and relationship.deleted_at is null
        and relationship.id <> new.id
    )
    select exists(select 1 from descendants where person_id = new.person_a_id)
    into creates_ancestry_cycle;

    if creates_ancestry_cycle then
      raise exception using
        errcode = '23514',
        message = 'This parent relationship would create a cycle in the family tree.';
    end if;
  elsif new.relationship_type in ('partner', 'sibling') then
    with recursive descendants(person_id) as (
      select relationship.person_b_id
      from public.relationships relationship
      where relationship.tree_id = new.tree_id
        and relationship.relationship_type = 'parent_child'
        and relationship.deleted_at is null
        and relationship.person_a_id in (new.person_a_id, new.person_b_id)
      union
      select relationship.person_b_id
      from public.relationships relationship
      join descendants on descendants.person_id = relationship.person_a_id
      where relationship.tree_id = new.tree_id
        and relationship.relationship_type = 'parent_child'
        and relationship.deleted_at is null
    )
    select exists(
      select 1 from descendants
      where person_id in (new.person_a_id, new.person_b_id)
    ) into people_are_ancestor_related;

    if people_are_ancestor_related then
      raise exception using
        errcode = '23514',
        message = 'Direct ancestors and descendants cannot be partners or siblings.';
    end if;
  end if;

  return new;
end;
$$;

create trigger validate_family_relationship_before_write
before insert or update of relationship_type, person_a_id, person_b_id, deleted_at
on public.relationships
for each row execute function private.validate_family_relationship();

alter table public.tree_members
  add column access_expires_at timestamptz;

comment on column public.tree_members.access_expires_at is
  'Null for permanent owner/viewer access; set for temporary editors.';

-- Existing device-bound editors are retained long enough for the owner account
-- to be configured and for replacement temporary links to be issued.
update public.tree_members membership
set access_expires_at = now() + interval '90 days'
where membership.role = 'editor'
  and membership.access_expires_at is null;

alter table private.editor_invitations
  add column role text not null default 'editor'
    check (role in ('editor', 'viewer')),
  alter column expires_at drop not null;

alter table private.editor_invitations
  add constraint editor_invitation_expiry_by_role check (
    (role = 'editor' and expires_at is not null)
    or (role = 'viewer' and expires_at is null)
  );

create or replace function private.current_tree_role(target_tree uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when exists (
      select 1
      from public.trees tree
      where tree.id = target_tree
        and tree.owner_id = (select auth.uid())
    ) then 'owner'
    else (
      select membership.role
      from public.tree_members membership
      where membership.tree_id = target_tree
        and membership.user_id = (select auth.uid())
        and (
          membership.role in ('owner', 'viewer')
          or membership.access_expires_at > now()
        )
    )
  end;
$$;

create or replace function public.current_family_access()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select jsonb_build_object(
        'role', private.current_tree_role(tree.id),
        'expiresAt', membership.access_expires_at,
        'isAnonymous', coalesce((select (auth.jwt()->>'is_anonymous')::boolean), false)
      )
      from public.trees tree
      left join public.tree_members membership
        on membership.tree_id = tree.id
       and membership.user_id = (select auth.uid())
      where tree.singleton
        and private.current_tree_role(tree.id) is not null
    ),
    jsonb_build_object('role', null, 'expiresAt', null, 'isAnonymous', false)
  );
$$;

revoke all on function public.current_family_access()
  from public, anon, authenticated, service_role;
grant execute on function public.current_family_access() to authenticated;

create function public.claim_family_invite(invite_token text)
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
      message = 'A private device session is required to claim this invitation.';
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
    or (matched_invite.expires_at is not null and matched_invite.expires_at <= now()) then
    raise exception using
      errcode = 'P0001',
      message = 'This invitation link is invalid, expired, or has already been used.';
  end if;

  update private.editor_invitations
  set claimed_by = claimant_id,
      claimed_at = now()
  where id = matched_invite.id;

  insert into public.tree_members (tree_id, user_id, role, access_expires_at)
  values (
    matched_invite.tree_id,
    claimant_id,
    matched_invite.role,
    case when matched_invite.role = 'editor' then matched_invite.expires_at else null end
  )
  on conflict (tree_id, user_id) do update
  set role = case
        when public.tree_members.role = 'owner' then 'owner'
        when excluded.role = 'editor' then 'editor'
        else public.tree_members.role
      end,
      access_expires_at = case
        when public.tree_members.role = 'owner' then null
        when excluded.role = 'editor' then excluded.access_expires_at
        else public.tree_members.access_expires_at
      end;

  return jsonb_build_object(
    'treeId', matched_invite.tree_id,
    'role', matched_invite.role,
    'expiresAt', case when matched_invite.role = 'editor' then matched_invite.expires_at else null end
  );
end;
$$;

revoke all on function public.claim_family_invite(text)
  from public, anon, authenticated, service_role;
grant execute on function public.claim_family_invite(text) to authenticated;

create or replace function public.claim_editor_invite(invite_token text)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select public.claim_family_invite(invite_token);
$$;

revoke all on function public.claim_editor_invite(text)
  from public, anon, authenticated, service_role;
grant execute on function public.claim_editor_invite(text) to authenticated;

create function public.create_family_invites(
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

-- The older editor-only RPC allowed editors to invite more editors. Access
-- management now belongs exclusively to the owner.
revoke all on function public.create_editor_invite(integer)
  from public, anon, authenticated, service_role;

-- Owner setup is intentionally SQL-editor-only. The account must first be
-- created in Supabase Authentication with a private password.
create function private.assign_family_owner(owner_email text)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  owner_user_id uuid;
  canonical_tree uuid;
begin
  select auth_user.id into owner_user_id
  from auth.users auth_user
  where lower(auth_user.email) = lower(btrim(owner_email))
    and auth_user.is_anonymous is false;

  if owner_user_id is null then
    raise exception 'No non-anonymous Auth user exists for that email.';
  end if;

  select tree.id into canonical_tree from public.trees tree where tree.singleton;

  update public.trees set owner_id = owner_user_id where id = canonical_tree;
  insert into public.tree_members (tree_id, user_id, role, access_expires_at)
  values (canonical_tree, owner_user_id, 'owner', null)
  on conflict (tree_id, user_id) do update
  set role = 'owner', access_expires_at = null;

  return owner_user_id;
end;
$$;

revoke all on function private.assign_family_owner(text)
  from public, anon, authenticated, service_role;
grant execute on function private.assign_family_owner(text) to postgres;

-- The family is private: only claimed members and the owner may read it.
drop policy if exists "public app reads canonical tree" on public.trees;
drop policy if exists "public app reads canonical people" on public.people;
drop policy if exists "public app reads canonical relationships" on public.relationships;
drop policy if exists "public app reads canonical photos" on storage.objects;
drop policy if exists "authenticated app reads canonical tree" on public.trees;
drop policy if exists "authenticated app reads canonical people" on public.people;
drop policy if exists "authenticated app reads canonical relationships" on public.relationships;
drop policy if exists "authenticated app reads canonical photos" on storage.objects;

revoke select on public.trees, public.people, public.relationships from anon;

-- Split the historical combined record without changing its descendants.
update public.people person
set full_name = 'Karam Singh Hayre',
    first_name = 'Karam',
    last_name = 'Hayre',
    gender = 'male',
    date_of_birth = date '1911-01-01',
    date_of_birth_precision = 'year',
    is_deceased = true
where person.tree_id = (select tree.id from public.trees tree where tree.singleton)
  and person.full_name = 'Karam/Darshan Singh Hayre';

update public.people person
set first_name = coalesce(person.first_name, 'Swarn'),
    last_name = coalesce(person.last_name, 'Hayre'),
    gender = coalesce(person.gender, 'female'),
    date_of_birth_precision = 'year'
where person.tree_id = (select tree.id from public.trees tree where tree.singleton)
  and person.full_name = 'Swarn Kaur Hayre'
  and person.date_of_birth = date '1917-01-01';

with family_tree as (
  select tree.id from public.trees tree where tree.singleton
), inserted_darshan as (
  insert into public.people (
    tree_id,
    full_name,
    first_name,
    last_name,
    gender,
    date_of_birth,
    date_of_birth_precision,
    is_deceased,
    about
  )
  select
    family_tree.id,
    'Darshan Singh Hayre',
    'Darshan',
    'Hayre',
    'male',
    date '1920-02-01',
    'day',
    false,
    'Brother of Karam Singh. Married Swarn Kaur after Karam passed away.'
  from family_tree
  where not exists (
    select 1 from public.people person
    where person.tree_id = family_tree.id
      and person.full_name = 'Darshan Singh Hayre'
  )
  returning id, tree_id
), darshan as (
  select id, tree_id from inserted_darshan
  union all
  select person.id, person.tree_id
  from public.people person
  join family_tree on family_tree.id = person.tree_id
  where person.full_name = 'Darshan Singh Hayre'
    and not exists (select 1 from inserted_darshan)
), named_people as (
  select
    family_tree.id as tree_id,
    karam.id as karam_id,
    swarn.id as swarn_id,
    darshan.id as darshan_id
  from family_tree
  join public.people karam
    on karam.tree_id = family_tree.id and karam.full_name = 'Karam Singh Hayre'
  join public.people swarn
    on swarn.tree_id = family_tree.id and swarn.full_name = 'Swarn Kaur Hayre'
  join darshan on darshan.tree_id = family_tree.id
)
insert into public.relationships (
  tree_id,
  relationship_type,
  person_a_id,
  person_b_id,
  metadata
)
select tree_id, 'sibling', karam_id, darshan_id, '{"relationship":"brothers"}'::jsonb
from named_people
union all
select tree_id, 'partner', swarn_id, darshan_id,
  '{"marriageOrder":2,"note":"Married after Karam Singh passed away"}'::jsonb
from named_people
on conflict do nothing;

update public.relationships relationship
set metadata = relationship.metadata || '{"marriageOrder":1}'::jsonb
where relationship.relationship_type = 'partner'
  and relationship.deleted_at is null
  and exists (
    select 1
    from public.people person_a
    join public.people person_b on person_b.id = relationship.person_b_id
    where person_a.id = relationship.person_a_id
      and array[person_a.full_name, person_b.full_name] @> array['Karam Singh Hayre', 'Swarn Kaur Hayre']
  );

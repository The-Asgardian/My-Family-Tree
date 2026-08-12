-- Backend-only family-tree schema. This migration intentionally creates no
-- tree, person, relationship, or profile seed rows.

create extension if not exists pgcrypto;
create schema if not exists private;

revoke all on schema private from public, anon, authenticated;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.trees (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  slug text unique,
  owner_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tree_members (
  tree_id uuid not null references public.trees(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','editor','viewer')),
  created_at timestamptz not null default now(),
  primary key (tree_id, user_id)
);

create table public.people (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid not null references public.trees(id) on delete cascade,
  full_name text not null check (char_length(full_name) between 1 and 180),
  preferred_name text,
  date_of_birth date,
  estimated_age smallint check (estimated_age between 0 and 130),
  is_deceased boolean not null default false,
  date_of_death date,
  birthplace text,
  about text,
  photo_path text,
  version integer not null default 1,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint people_tree_id_id_unique unique (tree_id, id),
  constraint death_not_before_birth check (date_of_death is null or date_of_birth is null or date_of_death >= date_of_birth)
);

create table public.relationships (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid not null references public.trees(id) on delete cascade,
  relationship_type text not null check (relationship_type in ('parent_child','partner')),
  person_a_id uuid not null,
  person_b_id uuid not null,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint relationships_person_a_tree_fkey foreign key (tree_id, person_a_id) references public.people(tree_id, id) on delete cascade,
  constraint relationships_person_b_tree_fkey foreign key (tree_id, person_b_id) references public.people(tree_id, id) on delete cascade,
  constraint different_people check (person_a_id <> person_b_id)
);

create unique index relationships_active_unique
on public.relationships(tree_id, relationship_type, least(person_a_id, person_b_id), greatest(person_a_id, person_b_id))
where deleted_at is null and relationship_type = 'partner';

create unique index parent_child_active_unique
on public.relationships(tree_id, relationship_type, person_a_id, person_b_id)
where deleted_at is null and relationship_type = 'parent_child';

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid not null references public.trees(id) on delete cascade,
  token uuid not null default gen_random_uuid() unique,
  role text not null check (role in ('editor','viewer')),
  invited_email text,
  expires_at timestamptz not null default (now() + interval '14 days'),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  claimed_by uuid references auth.users(id) on delete set null,
  claimed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.change_log (
  id bigint generated always as identity primary key,
  tree_id uuid not null references public.trees(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  entity_type text not null check (entity_type in ('person','relationship','tree','membership')),
  entity_id uuid,
  action text not null check (action in ('insert','update','delete','restore')),
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);

create index people_tree_idx on public.people(tree_id);
create index relationships_tree_idx on public.relationships(tree_id) where deleted_at is null;
create index change_log_tree_created_idx on public.change_log(tree_id, created_at desc);

create function private.current_tree_role(target_tree uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when exists (
      select 1 from public.trees t
      where t.id = target_tree and t.owner_id = (select auth.uid())
    ) then 'owner'
    else (
      select tm.role from public.tree_members tm
      where tm.tree_id = target_tree and tm.user_id = (select auth.uid())
    )
  end;
$$;

create function private.can_view_tree(target_tree uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.current_tree_role(target_tree) in ('owner','editor','viewer');
$$;

create function private.can_edit_tree(target_tree uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.current_tree_role(target_tree) in ('owner','editor');
$$;

create function private.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create function private.audit_family_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_tree uuid;
  target_id uuid;
begin
  target_tree := coalesce(new.tree_id, old.tree_id);
  target_id := coalesce(new.id, old.id);
  insert into public.change_log(tree_id, actor_id, entity_type, entity_id, action, before_data, after_data)
  values (
    target_tree,
    (select auth.uid()),
    case when tg_table_name = 'people' then 'person' else 'relationship' end,
    target_id,
    lower(tg_op),
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) else null end
  );
  return coalesce(new, old);
end;
$$;

create trigger profiles_updated_at before update on public.profiles
for each row execute function private.set_updated_at();

create trigger people_updated_at before update on public.people
for each row execute function private.set_updated_at();

create trigger trees_updated_at before update on public.trees
for each row execute function private.set_updated_at();

create trigger people_audit after insert or update or delete on public.people
for each row execute function private.audit_family_change();

create trigger relationships_audit after insert or update or delete on public.relationships
for each row execute function private.audit_family_change();

alter table public.profiles enable row level security;
alter table public.trees enable row level security;
alter table public.tree_members enable row level security;
alter table public.people enable row level security;
alter table public.relationships enable row level security;
alter table public.invitations enable row level security;
alter table public.change_log enable row level security;

create policy "profiles readable by authenticated users" on public.profiles for select to authenticated using (true);
create policy "users update own profile" on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy "users insert own profile" on public.profiles for insert to authenticated with check (id = (select auth.uid()));

create policy "members can read trees" on public.trees for select to authenticated using (private.can_view_tree(id));
create policy "users create owned trees" on public.trees for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "owners update trees" on public.trees for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "owners delete trees" on public.trees for delete to authenticated using (owner_id = (select auth.uid()));

create policy "members can read memberships" on public.tree_members for select to authenticated using (private.can_view_tree(tree_id));
create policy "owners manage memberships insert" on public.tree_members for insert to authenticated with check (private.current_tree_role(tree_id) = 'owner');
create policy "owners manage memberships update" on public.tree_members for update to authenticated using (private.current_tree_role(tree_id) = 'owner') with check (private.current_tree_role(tree_id) = 'owner');
create policy "owners manage memberships delete" on public.tree_members for delete to authenticated using (private.current_tree_role(tree_id) = 'owner');

create policy "members read people" on public.people for select to authenticated using (private.can_view_tree(tree_id));
create policy "editors insert people" on public.people for insert to authenticated with check (private.can_edit_tree(tree_id));
create policy "editors update people" on public.people for update to authenticated using (private.can_edit_tree(tree_id)) with check (private.can_edit_tree(tree_id));
create policy "editors delete people" on public.people for delete to authenticated using (private.can_edit_tree(tree_id));

create policy "members read relationships" on public.relationships for select to authenticated using (private.can_view_tree(tree_id));
create policy "editors insert relationships" on public.relationships for insert to authenticated with check (private.can_edit_tree(tree_id));
create policy "editors update relationships" on public.relationships for update to authenticated using (private.can_edit_tree(tree_id)) with check (private.can_edit_tree(tree_id));
create policy "editors delete relationships" on public.relationships for delete to authenticated using (private.can_edit_tree(tree_id));

create policy "owners read invitations" on public.invitations for select to authenticated using (private.current_tree_role(tree_id) = 'owner');
create policy "owners create invitations" on public.invitations for insert to authenticated with check (private.current_tree_role(tree_id) = 'owner');
create policy "owners update invitations" on public.invitations for update to authenticated using (private.current_tree_role(tree_id) = 'owner') with check (private.current_tree_role(tree_id) = 'owner');
create policy "owners delete invitations" on public.invitations for delete to authenticated using (private.current_tree_role(tree_id) = 'owner');

create policy "members read change log" on public.change_log for select to authenticated using (private.can_view_tree(tree_id));
-- No direct client write policy: audit rows are created only by the trigger.

revoke all on all functions in schema private from public, anon, authenticated;
grant usage on schema private to authenticated;
grant execute on function private.current_tree_role(uuid) to authenticated;
grant execute on function private.can_view_tree(uuid) to authenticated;
grant execute on function private.can_edit_tree(uuid) to authenticated;

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.trees to authenticated;
grant select, insert, update, delete on public.tree_members to authenticated;
grant select, insert, update, delete on public.people to authenticated;
grant select, insert, update, delete on public.relationships to authenticated;
grant select, insert, update, delete on public.invitations to authenticated;
grant select on public.change_log to authenticated;

alter publication supabase_realtime add table public.people, public.relationships;

insert into storage.buckets (id, name, public)
values ('family-photos', 'family-photos', false)
on conflict (id) do nothing;

create policy "members read family photos" on storage.objects for select to authenticated
using (
  bucket_id = 'family-photos'
  and private.can_view_tree(((storage.foldername(name))[1])::uuid)
);

create policy "editors upload family photos" on storage.objects for insert to authenticated
with check (
  bucket_id = 'family-photos'
  and private.can_edit_tree(((storage.foldername(name))[1])::uuid)
);

create policy "editors update family photos" on storage.objects for update to authenticated
using (
  bucket_id = 'family-photos'
  and private.can_edit_tree(((storage.foldername(name))[1])::uuid)
)
with check (
  bucket_id = 'family-photos'
  and private.can_edit_tree(((storage.foldername(name))[1])::uuid)
);

create policy "editors delete family photos" on storage.objects for delete to authenticated
using (
  bucket_id = 'family-photos'
  and private.can_edit_tree(((storage.foldername(name))[1])::uuid)
);

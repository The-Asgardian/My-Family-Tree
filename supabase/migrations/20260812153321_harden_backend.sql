-- Restrict the Supabase-managed RLS event trigger function when it exists.
-- The event trigger can still invoke it; browser roles cannot call it as RPC.
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    execute 'revoke all on function public.rls_auto_enable() from public, anon, authenticated';
  end if;
end;
$$;

-- Cover every foreign key used for ownership, cleanup and relationship checks.
create index trees_owner_idx on public.trees(owner_id);
create index tree_members_user_idx on public.tree_members(user_id);
create index people_created_by_idx on public.people(created_by) where created_by is not null;
create index people_updated_by_idx on public.people(updated_by) where updated_by is not null;
create index relationships_created_by_idx on public.relationships(created_by) where created_by is not null;
create index relationships_tree_person_a_idx on public.relationships(tree_id, person_a_id);
create index relationships_tree_person_b_idx on public.relationships(tree_id, person_b_id);
create index invitations_tree_idx on public.invitations(tree_id);
create index invitations_created_by_idx on public.invitations(created_by) where created_by is not null;
create index invitations_claimed_by_idx on public.invitations(claimed_by) where claimed_by is not null;
create index change_log_actor_idx on public.change_log(actor_id) where actor_id is not null;

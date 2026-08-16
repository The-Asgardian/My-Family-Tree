-- Remove the temporary member used to verify the real viewer/editor browser
-- flows. The token hash identifies only this test invitation.
do $$
declare
  probe_user_ids uuid[];
begin
  select array_agg(invitation.claimed_by)
  into probe_user_ids
  from private.editor_invitations invitation
  where invitation.token_hash = decode('fc94d10550fdf823f95da84dbf479b34dfb0fa3bdc38e197884bd345ce7829fb', 'hex')
    and invitation.claimed_by is not null;

  if coalesce(cardinality(probe_user_ids), 0) > 0 then
    delete from public.tree_members membership
    where membership.user_id = any(probe_user_ids);
  end if;

  delete from private.editor_invitations invitation
  where invitation.token_hash = decode('fc94d10550fdf823f95da84dbf479b34dfb0fa3bdc38e197884bd345ce7829fb', 'hex');

  if coalesce(cardinality(probe_user_ids), 0) > 0 then
    delete from auth.users auth_user
    where auth_user.id = any(probe_user_ids)
      and auth_user.is_anonymous is true
      and not exists (
        select 1 from public.tree_members membership
        where membership.user_id = auth_user.id
      )
      and not exists (
        select 1 from private.editor_invitations invitation
        where invitation.created_by = auth_user.id
           or invitation.claimed_by = auth_user.id
      );
  end if;
end;
$$;

create index if not exists editor_invitations_created_by_idx
  on private.editor_invitations(created_by)
  where created_by is not null;

-- Profiles are not used as a public family directory. Each signed-in account
-- may read only its own optional profile row.
drop policy if exists "profiles readable by authenticated users" on public.profiles;
create policy "users read own profile"
on public.profiles for select to authenticated
using (id = (select auth.uid()));

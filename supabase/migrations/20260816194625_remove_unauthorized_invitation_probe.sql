-- Remove the single unclaimed viewer invitation and anonymous Auth user made
-- while verifying the owner-only RPC guard. Legitimate viewers cannot match:
-- no owner existed yet, and claimed viewers have a tree membership.
do $$
declare
  probe_user_ids uuid[];
begin
  select array_agg(distinct auth_user.id)
  into probe_user_ids
  from auth.users auth_user
  join private.editor_invitations invitation
    on invitation.created_by = auth_user.id
  where auth_user.is_anonymous is true
    and invitation.role = 'viewer'
    and invitation.claimed_at is null
    and not exists (
      select 1 from public.tree_members membership
      where membership.user_id = auth_user.id
    );

  if coalesce(cardinality(probe_user_ids), 0) = 0 then
    return;
  end if;

  delete from private.editor_invitations invitation
  where invitation.created_by = any(probe_user_ids)
    and invitation.role = 'viewer'
    and invitation.claimed_at is null;

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
end;
$$;

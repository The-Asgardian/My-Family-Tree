-- Remove anonymous Auth sessions created by the final access-control probe.
-- Member and invitation identities are deliberately excluded.
delete from auth.users auth_user
where auth_user.is_anonymous is true
  and auth_user.created_at >= now() - interval '10 minutes'
  and not exists (
    select 1 from public.tree_members membership
    where membership.user_id = auth_user.id
  )
  and not exists (
    select 1 from private.editor_invitations invitation
    where invitation.created_by = auth_user.id
       or invitation.claimed_by = auth_user.id
  );

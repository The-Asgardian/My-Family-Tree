-- Temporarily exercise editor-only UI against real RLS. A following migration
-- removes this probe membership, invitation, and anonymous Auth user.
update public.tree_members membership
set role = 'editor',
    access_expires_at = now() + interval '30 minutes'
from private.editor_invitations invitation
where invitation.token_hash = decode('fc94d10550fdf823f95da84dbf479b34dfb0fa3bdc38e197884bd345ce7829fb', 'hex')
  and invitation.claimed_by = membership.user_id
  and invitation.tree_id = membership.tree_id;

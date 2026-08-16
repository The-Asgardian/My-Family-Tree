-- Short-lived migration probe used to exercise the real one-use viewer flow.
-- The raw token is never stored in the database or repository; the following
-- cleanup migration removes the claimed membership and Auth user.
insert into private.editor_invitations (tree_id, token_hash, role, expires_at)
select
  tree.id,
  decode('fc94d10550fdf823f95da84dbf479b34dfb0fa3bdc38e197884bd345ce7829fb', 'hex'),
  'viewer',
  null
from public.trees tree
where tree.singleton
on conflict (token_hash) do nothing;

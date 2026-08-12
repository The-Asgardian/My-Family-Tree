import { config } from '../config.js';
import { getSupabase } from '../lib/supabase.js';

async function editorMembership(supabase, userId) {
  if (!userId) return null;
  const { data, error } = await supabase
    .from('tree_members')
    .select('role')
    .eq('tree_id', config.defaultTreeId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data?.role === 'owner' || data?.role === 'editor' ? data.role : null;
}

export function invitationTokenFromUrl(address = window.location.href) {
  const url = new URL(address, window.location.href);
  return new URLSearchParams(url.hash.replace(/^#/, '')).get('invite')?.trim() || '';
}

export function clearInvitationFromAddress() {
  const url = new URL(window.location.href);
  const hash = new URLSearchParams(url.hash.replace(/^#/, ''));
  hash.delete('invite');
  url.hash = hash.toString();
  window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
}

export async function getEditorAccess() {
  const supabase = await getSupabase();
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error) throw error;
  const role = await editorMembership(supabase, session?.user?.id);
  return { isEditor: Boolean(role), role, session };
}

export async function claimEditorInvitation(inviteToken) {
  const token = inviteToken?.trim();
  if (!token) throw new Error('This invitation link is incomplete.');

  const supabase = await getSupabase();
  let { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;

  const existingRole = await editorMembership(supabase, session?.user?.id);
  if (existingRole) {
    return { isEditor: true, role: existingRole, alreadyEditor: true };
  }

  if (!session) {
    const { data, error } = await supabase.auth.signInAnonymously();
    if (error) throw error;
    session = data.session;
  }

  const { data, error } = await supabase.rpc('claim_editor_invite', {
    invite_token: token
  });
  if (error) throw error;

  return { isEditor: true, role: data?.role || 'editor', alreadyEditor: false };
}

export async function createEditorInvitation(validDays = 14) {
  const days = Number(validDays);
  if (!Number.isInteger(days) || days < 1 || days > 90) {
    throw new Error('Choose an invitation duration between 1 and 90 days.');
  }

  const supabase = await getSupabase();
  const { data, error } = await supabase.rpc('create_editor_invite', {
    valid_days: days
  });
  if (error) throw error;

  const invitation = Array.isArray(data) ? data[0] : data;
  if (!invitation?.invite_url) throw new Error('The invitation link could not be created.');
  return {
    inviteUrl: invitation.invite_url,
    expiresAt: invitation.expires_at
  };
}

export async function onEditorSessionChange(callback) {
  const supabase = await getSupabase();
  const { data } = supabase.auth.onAuthStateChange(() => callback());
  return () => data.subscription.unsubscribe();
}

import { config } from '../config.js';
import { getSupabase } from '../lib/supabase.js';

async function currentAccess(supabase) {
  const { data, error } = await supabase.rpc('current_family_access');
  if (error) throw error;
  return {
    role: data?.role || null,
    expiresAt: data?.expiresAt || null,
    isAnonymous: Boolean(data?.isAnonymous)
  };
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

export async function getFamilyAccess() {
  const supabase = await getSupabase();
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (!session) return { role: null, expiresAt: null, isAnonymous: false, session: null };
  return { ...(await currentAccess(supabase)), session };
}

export async function claimFamilyInvitation(inviteToken) {
  const token = inviteToken?.trim();
  if (!token) throw new Error('This invitation link is incomplete.');

  const supabase = await getSupabase();
  let { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;

  const existingAccess = session ? await currentAccess(supabase) : null;
  if (existingAccess?.role) {
    return { ...existingAccess, alreadyMember: true };
  }

  if (!session) {
    const { data, error } = await supabase.auth.signInAnonymously();
    if (error) throw error;
    session = data.session;
  }

  const { data, error } = await supabase.rpc('claim_family_invite', {
    invite_token: token
  });
  if (error) throw error;

  return { role: data?.role || null, expiresAt: data?.expiresAt || null, isAnonymous: true, alreadyMember: false };
}

export async function createFamilyInvitations(role, validDays = 14, count = 1) {
  const days = Number(validDays);
  const quantity = Number(count);
  if (role === 'editor' && (!Number.isInteger(days) || days < 1 || days > 90)) {
    throw new Error('Choose an invitation duration between 1 and 90 days.');
  }
  if (!['editor', 'viewer'].includes(role)) throw new Error('Choose Editor or Viewer access.');
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10) throw new Error('Create between 1 and 10 links.');

  const supabase = await getSupabase();
  const { data, error } = await supabase.rpc('create_family_invites', {
    invite_role: role,
    valid_days: days,
    invite_count: quantity
  });
  if (error) throw error;

  const invitations = Array.isArray(data) ? data : [data];
  if (!invitations.length || !invitations[0]?.invite_url) throw new Error('The invitation links could not be created.');
  return invitations.map(invitation => ({
    inviteUrl: invitation.invite_url,
    role: invitation.role,
    expiresAt: invitation.expires_at
  }));
}

export async function signInOwner(email, password) {
  const supabase = await getSupabase();
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw error;
  const access = await currentAccess(supabase);
  if (access.role !== 'owner') {
    await supabase.auth.signOut();
    throw new Error('This account is not the family tree owner.');
  }
  return access;
}

export async function signOutFamilyAccess() {
  const supabase = await getSupabase();
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function onFamilySessionChange(callback) {
  const supabase = await getSupabase();
  const { data } = supabase.auth.onAuthStateChange(() => callback());
  return () => data.subscription.unsubscribe();
}

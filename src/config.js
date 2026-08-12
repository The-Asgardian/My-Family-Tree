// GitHub Pages has no server-side environment variables. The Supabase anon/publishable
// key is intended for client use; security must be enforced by Row Level Security.
// The app intentionally has no local/demo data fallback. Both values are required.
export const config = {
  supabaseUrl: 'https://jxxpzjjkaevokyntlgmr.supabase.co',
  supabaseAnonKey: 'sb_publishable_JPDcJA3BYDy47UtTnh_j-g_1ZC-Wy6Y',
  defaultTreeId: ''
};

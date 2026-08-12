import { config } from '../config.js';

let clientPromise = null;

export function isSupabaseConfigured() {
  return Boolean(config.supabaseUrl && config.supabaseAnonKey);
}

export async function getSupabase() {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase is not configured. Add the project URL and publishable key in src/config.js.');
  }
  if (!clientPromise) {
    clientPromise = import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.3/+esm')
      .then(({ createClient }) => createClient(config.supabaseUrl, config.supabaseAnonKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
      }));
  }
  return clientPromise;
}

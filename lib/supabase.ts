import { createClient } from '@supabase/supabase-js'

// Server-side admin client
// Uses the service role key - bypasses RLS, never expose to the browser.
// Only import this in API routes (app/api/**).
export function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('Missing Supabase server env vars. Check NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.')
  }
  return createClient(url, key, { auth: { persistSession: false } })
}

// Browser / Realtime client
// Uses the anon key - subject to RLS policies, safe for the browser.
// Used only in client components for Realtime subscriptions.
let _client: ReturnType<typeof createClient> | null = null
export function getSupabaseClient() {
  if (_client) return _client
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) {
    throw new Error('Missing Supabase browser env vars. Check NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.')
  }
  _client = createClient(url, key)
  return _client
}

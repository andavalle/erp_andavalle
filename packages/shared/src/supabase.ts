import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export interface PublicSupabaseEnvironment {
  url: string
  publishableKey: string
}

export function readPublicSupabaseEnvironment(env: Record<string, string | boolean | undefined>): PublicSupabaseEnvironment | null {
  const url = env.VITE_SUPABASE_URL
  const publishableKey = env.VITE_SUPABASE_PUBLISHABLE_KEY
  if (typeof url !== 'string' || typeof publishableKey !== 'string' || !url || !publishableKey) return null
  return { url, publishableKey }
}

export function createBrowserSupabaseClient(environment: PublicSupabaseEnvironment): SupabaseClient {
  return createClient(environment.url, environment.publishableKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  })
}

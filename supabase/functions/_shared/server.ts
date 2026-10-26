import { createClient } from 'npm:@supabase/supabase-js@2.76.1'

export function corsHeaders(req: Request) {
  const origin = req.headers.get('origin') || ''
  const allowed = (Deno.env.get('ALLOWED_ORIGINS') || '').split(',').map(value => value.trim()).filter(Boolean)
  return {
    'access-control-allow-origin': allowed.includes(origin) ? origin : allowed[0] || 'null',
    'access-control-allow-headers': 'authorization, apikey, content-type',
    'access-control-allow-methods': 'POST, OPTIONS',
    'vary': 'Origin',
  }
}

export function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders(req), 'content-type': 'application/json; charset=utf-8' } })
}

export function getSecretKey() {
  const direct = Deno.env.get('SUPABASE_SECRET_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (direct) return direct
  const keys = Deno.env.get('SUPABASE_SECRET_KEYS')
  if (!keys) throw new Error('Supabase secret key is not configured')
  const parsed = JSON.parse(keys) as Record<string,string>
  if (!parsed.default) throw new Error('Default Supabase secret key is missing')
  return parsed.default
}

export function adminClient() {
  const url = Deno.env.get('SUPABASE_URL')
  if (!url) throw new Error('SUPABASE_URL is not configured')
  return createClient(url, getSecretKey(), { auth: { persistSession: false, autoRefreshToken: false } })
}

export function userClient(req: Request) {
  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_PUBLISHABLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY')
  if (!url || !key) throw new Error('Public Supabase environment is not configured')
  return createClient(url, key, { global: { headers: { Authorization: req.headers.get('authorization') || '' } }, auth: { persistSession: false } })
}

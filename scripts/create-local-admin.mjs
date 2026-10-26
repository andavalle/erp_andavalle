import { execFileSync } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'

const email = process.env.LOCAL_ADMIN_EMAIL || 'admin@andavalle.local'
const password = process.env.LOCAL_ADMIN_PASSWORD || 'AndavalleLocal#2026'

if (password.length < 12) throw new Error('LOCAL_ADMIN_PASSWORD debe tener al menos 12 caracteres')

const status = JSON.parse(execFileSync('npx', ['supabase', 'status', '--output', 'json'], { encoding: 'utf8' }))
const client = createClient(status.API_URL, status.SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const { data: listed, error: listError } = await client.auth.admin.listUsers({ page: 1, perPage: 1000 })
if (listError) throw listError

let user = listed.users.find((candidate) => candidate.email?.toLowerCase() === email.toLowerCase())
if (!user) {
  const { data, error } = await client.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: 'Administrador local' },
  })
  if (error) throw error
  user = data.user
}

const { data: organization, error: organizationError } = await client
  .from('organizations')
  .select('id')
  .eq('name', 'Andavalle')
  .single()
if (organizationError) throw organizationError

const { error: membershipError } = await client.from('organization_members').upsert({
  organization_id: organization.id,
  profile_id: user.id,
  active: true,
}, { onConflict: 'organization_id,profile_id' })
if (membershipError) throw membershipError

const { error: roleError } = await client.from('organization_member_roles').upsert({
  organization_id: organization.id,
  profile_id: user.id,
  role_code: 'admin',
}, { onConflict: 'organization_id,profile_id,role_code' })
if (roleError) throw roleError

const authenticated = createClient(status.API_URL, status.PUBLISHABLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})
const { error: signInError } = await authenticated.auth.signInWithPassword({ email, password })
if (signInError) throw signInError
const { count, error: accessError } = await authenticated
  .from('crm_leads')
  .select('id', { count: 'exact', head: true })
if (accessError) throw accessError

console.log(`Administrador local listo: ${email}`)
console.log(`Acceso RLS verificado: ${count ?? 0} oportunidades visibles`)

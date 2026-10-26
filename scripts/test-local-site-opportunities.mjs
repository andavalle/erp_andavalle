import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env=Object.fromEntries(readFileSync(new URL('../.env.localdb.local',import.meta.url),'utf8').split(/\r?\n/).filter(line=>line&&!line.startsWith('#')).map(line=>{const at=line.indexOf('=');return [line.slice(0,at),line.slice(at+1)]}))
const client=createClient(env.VITE_SUPABASE_URL,env.VITE_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false}})
const expect=(condition,message)=>{if(!condition)throw new Error(message)}

const login=await client.auth.signInWithPassword({email:'admin@andavalle.local',password:'AndavalleLocal#2026'})
if(login.error)throw login.error
const profileId=login.data.user.id
const membership=await client.from('organization_members').select('organization_id').eq('profile_id',profileId).eq('active',true).single()
if(membership.error)throw membership.error
const organizationId=membership.data.organization_id

const siteResult=await client.from('customer_sites').select('id,customer_id,name').eq('organization_id',organizationId).is('archived_at',null).limit(1).single()
if(siteResult.error)throw siteResult.error
const customerResult=await client.from('customers').select('legal_name,trade_name').eq('id',siteResult.data.customer_id).single()
if(customerResult.error)throw customerResult.error
const contactResult=await client.from('customer_contacts').select('name,phone,email').eq('customer_id',siteResult.data.customer_id).is('archived_at',null).limit(1).maybeSingle()
if(contactResult.error)throw contactResult.error
const sourceResult=await client.from('crm_sources').select('id').eq('organization_id',organizationId).eq('code','repeat_customer').single()
if(sourceResult.error)throw sourceResult.error

const created=await client.from('crm_leads').insert({
  organization_id:organizationId,
  name:contactResult.data?.name||'Contacto de prueba',
  company:customerResult.data.trade_name||customerResult.data.legal_name,
  phone:contactResult.data?.phone||null,
  email:contactResult.data?.email||null,
  need_summary:'Prueba automática de nueva oportunidad en una obra existente.',
  source_id:sourceResult.data.id,
  customer_id:siteResult.data.customer_id,
  site_id:siteResult.data.id,
  assigned_to:profileId,
  created_by:profileId,
  duplicate_override_reason:'Prueba automática local',
}).select('id,customer_id,site_id,status').single()
if(created.error)throw created.error
expect(created.data.customer_id===siteResult.data.customer_id&&created.data.site_id===siteResult.data.id,'La oportunidad no conservó la relación cliente-obra')

const [quotes,contracts]=await Promise.all([
  client.from('quotations').select('id').eq('organization_id',organizationId).eq('site_id',siteResult.data.id),
  client.from('contracts').select('id').eq('organization_id',organizationId).eq('site_id',siteResult.data.id),
])
if(quotes.error)throw quotes.error
if(contracts.error)throw contracts.error

const archived=await client.from('crm_leads').update({archived_at:new Date().toISOString()}).eq('id',created.data.id).select('id').single()
if(archived.error)throw archived.error
console.log(`Obra verificada: ${siteResult.data.name}; oportunidad vinculada y archivada; ${quotes.data.length} cotizaciones, ${contracts.data.length} contratos.`)

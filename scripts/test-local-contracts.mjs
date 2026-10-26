import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env=Object.fromEntries(readFileSync(new URL('../.env.localdb.local',import.meta.url),'utf8').split(/\r?\n/).filter(line=>line&&!line.startsWith('#')).map(line=>{const at=line.indexOf('=');return [line.slice(0,at),line.slice(at+1)]}))
const client=createClient(env.VITE_SUPABASE_URL,env.VITE_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false}})
const expect=(condition,message)=>{if(!condition)throw new Error(message)}
const date=(offset)=>{const value=new Date();value.setDate(value.getDate()+offset);return value.toISOString().slice(0,10)}

const login=await client.auth.signInWithPassword({email:'admin@andavalle.local',password:'AndavalleLocal#2026'})
if(login.error)throw login.error
const profileId=login.data.user.id
const membership=await client.from('organization_members').select('organization_id').eq('profile_id',profileId).eq('active',true).single()
if(membership.error)throw membership.error
const organizationId=membership.data.organization_id

const site=await client.from('customer_sites').select('id,customer_id').eq('organization_id',organizationId).is('archived_at',null).limit(1).single()
if(site.error)throw site.error
const product=await client.from('products').select('id,sku,description').eq('organization_id',organizationId).eq('item_type','inventory').eq('active',true).limit(1).single()
if(product.error)throw product.error

const operation=await client.from('rental_operations').insert({
  organization_id:organizationId,customer_id:site.data.customer_id,site_id:site.data.id,
  name:`Prueba automática de contratos ${Date.now()}`,created_by:profileId,
}).select('id,folio').single()
if(operation.error)throw operation.error

const created=await client.from('contracts').insert({
  organization_id:organizationId,customer_id:site.data.customer_id,site_id:site.data.id,
  contract_type:'rental',starts_on:date(0),ends_on:date(14),created_by:profileId,
  rental_operation_id:operation.data.id,notes:'Contrato generado por prueba automática local.',
}).select('id,folio,status').single()
if(created.error)throw created.error
expect(/^CTR-R-\d{4}-\d{6}$/.test(created.data.folio),'El folio contractual no cumple la nomenclatura')

const line=await client.from('contract_lines').insert({
  organization_id:organizationId,contract_id:created.data.id,line_no:1,product_id:product.data.id,
  quantity:10,unit_price:100,discount_percent:5,tax_rate:.16,starts_on:date(0),ends_on:date(14),
  billing_unit:'day',sku_snapshot:product.data.sku,description_snapshot:product.data.description,
}).select('id').single()
if(line.error)throw line.error

const edited=await client.rpc('update_contract_draft',{
  p_contract_id:created.data.id,p_starts_on:date(1),p_ends_on:date(15),
  p_notes:'Contrato editado por prueba automática local.',p_rental_operation_id:operation.data.id,
})
if(edited.error)throw edited.error
expect(edited.data.status==='draft'&&Number(edited.data.total)===1102,'No se editaron o calcularon correctamente los datos del borrador')

const submitted=await client.rpc('submit_contract',{p_contract_id:created.data.id})
if(submitted.error)throw submitted.error
expect(submitted.data.status==='pending_authorization','El contrato no quedó pendiente de autorización')

const blockedHeader=await client.from('contracts').update({notes:'Cambio directo no permitido'}).eq('id',created.data.id)
expect(Boolean(blockedHeader.error),'Fue posible editar directamente un contrato enviado')
const blockedLine=await client.from('contract_lines').update({quantity:11}).eq('id',line.data.id)
expect(Boolean(blockedLine.error),'Fue posible editar una partida después de enviar el contrato')

const returned=await client.rpc('return_contract_to_draft',{p_contract_id:created.data.id,p_reason:'Corrección solicitada por administración'})
if(returned.error)throw returned.error
expect(returned.data.status==='draft','El contrato no regresó a borrador')

const resubmitted=await client.rpc('submit_contract',{p_contract_id:created.data.id})
if(resubmitted.error)throw resubmitted.error
const blockedAuthorization=await client.rpc('authorize_contract',{p_contract_id:created.data.id,p_justification:null})
expect(Boolean(blockedAuthorization.error),'La autorización propia se permitió sin justificación')

const authorized=await client.rpc('authorize_contract',{
  p_contract_id:created.data.id,p_justification:'Contrato de prueba revisado y validado por administración',
})
if(authorized.error)throw authorized.error
expect(authorized.data.status==='authorized'&&authorized.data.authorized_by===profileId,'El contrato no quedó autorizado por administración')
expect(authorized.data.notes.includes('Autorización propia:'),'No se auditó la justificación de autorización propia')

console.log(`Contratos verificados: ${created.data.folio} · ${operation.data.folio} · edición, envío, devolución, inmutabilidad y autorización OK`)

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env=Object.fromEntries(readFileSync(new URL('../.env.localdb.local',import.meta.url),'utf8').split(/\r?\n/).filter(line=>line&&!line.startsWith('#')).map(line=>{const at=line.indexOf('=');return [line.slice(0,at),line.slice(at+1)]}))
const client=createClient(env.VITE_SUPABASE_URL,env.VITE_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false}})
const expect=(condition,message)=>{if(!condition)throw new Error(message)}

const login=await client.auth.signInWithPassword({email:'admin@andavalle.local',password:'AndavalleLocal#2026'});if(login.error)throw login.error
const profileId=login.data.user.id
const membership=await client.from('organization_members').select('organization_id').eq('profile_id',profileId).eq('active',true).single();if(membership.error)throw membership.error
const organizationId=membership.data.organization_id
const custodyResult=await client.from('contract_line_custody').select('contract_id,contract_line_id,in_custody').eq('organization_id',organizationId).gte('in_custody',2).order('in_custody',{ascending:false}).limit(1).single();if(custodyResult.error)throw custodyResult.error
const custody=Number(custodyResult.data.in_custody)
const contract=await client.from('contracts').select('id,status,contract_type').eq('id',custodyResult.data.contract_id).single();if(contract.error)throw contract.error
expect(contract.data.status==='active'&&contract.data.contract_type==='rental','El contrato con custodia no está activo como renta')

const excessive=await client.rpc('create_se_request',{p_contract_id:contract.data.id,p_notes:'Debe fallar',p_lines:[{contract_line_id:custodyResult.data.contract_line_id,quantity:custody+1}],p_scheduled_for:null,p_vehicle:null,p_operator_name:null})
expect(Boolean(excessive.error),'Fue posible solicitar más equipo del que existe en obra')

const created=await client.rpc('create_se_request',{p_contract_id:contract.data.id,p_notes:'Devolución parcial de prueba',p_lines:[{contract_line_id:custodyResult.data.contract_line_id,quantity:1}],p_scheduled_for:new Date(Date.now()+86400000).toISOString(),p_vehicle:'Unidad de recolección',p_operator_name:'Operador de entrada'})
if(created.error)throw created.error
expect(/^SE-\d{4}-\d{6}$/.test(created.data.folio),'El folio SE no cumple la nomenclatura')
const requested=Math.min(2,custody)
const updated=await client.rpc('update_se_request_draft',{p_request_id:created.data.id,p_notes:'Cantidad editada en prueba SE',p_lines:[{contract_line_id:custodyResult.data.contract_line_id,quantity:requested}],p_scheduled_for:null,p_vehicle:null,p_operator_name:null})
if(updated.error)throw updated.error
const requestLine=await client.from('operation_request_lines').select('id,quantity').eq('request_id',created.data.id).single();if(requestLine.error)throw requestLine.error
expect(Number(requestLine.data.quantity)===requested,'La edición de SE no actualizó la cantidad')

const overbook=await client.rpc('create_se_request',{p_contract_id:contract.data.id,p_notes:'Debe bloquear saldo duplicado',p_lines:[{contract_line_id:custodyResult.data.contract_line_id,quantity:custody-requested+.001}],p_scheduled_for:null,p_vehicle:null,p_operator_name:null})
expect(Boolean(overbook.error),'Fue posible programar dos veces el mismo saldo en obra')
const submitted=await client.rpc('submit_request',{p_request_id:created.data.id});if(submitted.error)throw submitted.error
const blockedLine=await client.from('operation_request_lines').update({quantity:1}).eq('id',requestLine.data.id)
expect(Boolean(blockedLine.error),'Fue posible modificar una SE enviada')
const authorized=await client.rpc('authorize_request',{p_request_id:created.data.id});if(authorized.error)throw authorized.error
expect(authorized.data.status==='authorized','La SE no quedó autorizada')
const reservations=await client.from('stock_reservations').select('id').eq('request_line_id',requestLine.data.id);if(reservations.error)throw reservations.error
expect(reservations.data.length===0,'La SE creó reservas de almacén indebidamente')

const cancelled=await client.rpc('cancel_request',{p_request_id:created.data.id,p_reason:'Cancelación controlada de la prueba de entrada'});if(cancelled.error)throw cancelled.error
const replacement=await client.rpc('create_se_request',{p_contract_id:contract.data.id,p_notes:'Valida liberación de saldo programado',p_lines:[{contract_line_id:custodyResult.data.contract_line_id,quantity:custody}],p_scheduled_for:null,p_vehicle:null,p_operator_name:null})
if(replacement.error)throw replacement.error
const cleanup=await client.rpc('cancel_request',{p_request_id:replacement.data.id,p_reason:'Limpieza controlada de solicitud de reemplazo'});if(cleanup.error)throw cleanup.error

console.log(`SE verificada: ${created.data.folio} · custodia ${custody}, edición, autorización, sobreasignación y cancelación OK`)

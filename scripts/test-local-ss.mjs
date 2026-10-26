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

const availability=await client.from('inventory_availability').select('product_id,available').eq('organization_id',organizationId).gte('available',3).order('available',{ascending:false}).limit(1).single()
if(availability.error)throw availability.error
const initialAvailable=Number(availability.data.available)
const product=await client.from('products').select('id,sku,description').eq('id',availability.data.product_id).single()
if(product.error)throw product.error
const site=await client.from('customer_sites').select('id,customer_id').eq('organization_id',organizationId).is('archived_at',null).limit(1).single()
if(site.error)throw site.error

const operation=await client.from('rental_operations').insert({organization_id:organizationId,customer_id:site.data.customer_id,site_id:site.data.id,name:`Prueba SS ${Date.now()}`,created_by:profileId}).select('id').single()
if(operation.error)throw operation.error
const contract=await client.from('contracts').insert({organization_id:organizationId,customer_id:site.data.customer_id,site_id:site.data.id,contract_type:'rental',starts_on:date(0),ends_on:date(14),created_by:profileId,rental_operation_id:operation.data.id,notes:'Contrato para prueba automática de SS.'}).select('id,folio').single()
if(contract.error)throw contract.error
const contractLine=await client.from('contract_lines').insert({organization_id:organizationId,contract_id:contract.data.id,line_no:1,product_id:product.data.id,quantity:3,unit_price:100,discount_percent:0,tax_rate:.16,starts_on:date(0),ends_on:date(14),billing_unit:'day',sku_snapshot:product.data.sku,description_snapshot:product.data.description}).select('id').single()
if(contractLine.error)throw contractLine.error
const submittedContract=await client.rpc('submit_contract',{p_contract_id:contract.data.id})
if(submittedContract.error)throw submittedContract.error
const authorizedContract=await client.rpc('authorize_contract',{p_contract_id:contract.data.id,p_justification:'Contrato creado para validar Solicitudes de Salida'})
if(authorizedContract.error)throw authorizedContract.error

const created=await client.rpc('create_ss_request',{p_contract_id:contract.data.id,p_notes:'Primera entrega de prueba',p_lines:[{contract_line_id:contractLine.data.id,quantity:2}],p_scheduled_for:new Date(Date.now()+86400000).toISOString(),p_vehicle:'Unidad de prueba',p_operator_name:'Operador de prueba'})
if(created.error)throw created.error
expect(/^SS-\d{4}-\d{6}$/.test(created.data.folio),'El folio SS no cumple la nomenclatura')
expect(created.data.status==='draft','La SS no se creó como borrador')

const updated=await client.rpc('update_ss_request_draft',{p_request_id:created.data.id,p_notes:'Cantidad editada en prueba',p_lines:[{contract_line_id:contractLine.data.id,quantity:3}],p_scheduled_for:null,p_vehicle:null,p_operator_name:null})
if(updated.error)throw updated.error
const line=await client.from('operation_request_lines').select('id,quantity').eq('request_id',created.data.id).single()
if(line.error)throw line.error
expect(Number(line.data.quantity)===3,'La edición no actualizó la cantidad de la SS')

const submitted=await client.rpc('submit_request',{p_request_id:created.data.id})
if(submitted.error)throw submitted.error
expect(submitted.data.status==='submitted','La SS no quedó enviada')
const blockedLine=await client.from('operation_request_lines').update({quantity:2}).eq('id',line.data.id)
expect(Boolean(blockedLine.error),'Fue posible modificar una partida después de enviar la SS')

const authorized=await client.rpc('authorize_request',{p_request_id:created.data.id})
if(authorized.error)throw authorized.error
expect(authorized.data.status==='authorized','La SS no quedó autorizada')
const reservations=await client.from('stock_reservations').select('quantity,consumed_quantity,released_at').eq('request_line_id',line.data.id)
if(reservations.error)throw reservations.error
expect(reservations.data.reduce((sum,row)=>sum+Number(row.quantity),0)===3,'La reserva no coincide con la cantidad solicitada')
const afterAuthorization=await client.from('inventory_availability').select('available').eq('organization_id',organizationId).eq('product_id',product.data.id)
if(afterAuthorization.error)throw afterAuthorization.error
expect(afterAuthorization.data.reduce((sum,row)=>sum+Number(row.available),0)===initialAvailable-3,'La disponibilidad no disminuyó al autorizar la SS')
const repeated=await client.rpc('authorize_request',{p_request_id:created.data.id})
expect(Boolean(repeated.error),'Fue posible autorizar dos veces la misma SS')
const shortCancel=await client.rpc('cancel_request',{p_request_id:created.data.id,p_reason:'corto'})
expect(Boolean(shortCancel.error),'La cancelación aceptó un motivo demasiado corto')

const cancelled=await client.rpc('cancel_request',{p_request_id:created.data.id,p_reason:'Cancelación controlada de la prueba automática'})
if(cancelled.error)throw cancelled.error
expect(cancelled.data.status==='cancelled','La SS no quedó cancelada')
const afterCancellation=await client.from('inventory_availability').select('available').eq('organization_id',organizationId).eq('product_id',product.data.id)
if(afterCancellation.error)throw afterCancellation.error
expect(afterCancellation.data.reduce((sum,row)=>sum+Number(row.available),0)===initialAvailable,'La cancelación no liberó toda la disponibilidad')

console.log(`SS verificada: ${created.data.folio} · borrador, edición, envío, reserva, idempotencia y liberación OK`)

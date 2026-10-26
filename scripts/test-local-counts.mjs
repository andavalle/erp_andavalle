import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env=Object.fromEntries(readFileSync(new URL('../.env.localdb.local',import.meta.url),'utf8').split(/\r?\n/).filter(line=>line&&!line.startsWith('#')).map(line=>{const at=line.indexOf('=');return [line.slice(0,at),line.slice(at+1)]}))
const client=createClient(env.VITE_SUPABASE_URL,env.VITE_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false}})
const expect=(condition,message)=>{if(!condition)throw new Error(message)}

const login=await client.auth.signInWithPassword({email:'admin@andavalle.local',password:'AndavalleLocal#2026'});if(login.error)throw login.error
const profileId=login.data.user.id
const membership=await client.from('organization_members').select('organization_id').eq('profile_id',profileId).eq('active',true).single();if(membership.error)throw membership.error
const organizationId=membership.data.organization_id
const staleDrafts=await client.from('inventory_counts').select('id').eq('organization_id',organizationId).eq('status','draft').ilike('reason','Prueba de corte%');if(staleDrafts.error)throw staleDrafts.error
for(const draft of staleDrafts.data){const cleanup=await client.rpc('cancel_inventory_count',{p_inventory_count_id:draft.id,p_reason:'Limpieza de borrador de prueba automática'});if(cleanup.error)throw cleanup.error}
const warehouse=await client.from('warehouses').select('id').eq('organization_id',organizationId).eq('active',true).limit(1).single();if(warehouse.error)throw warehouse.error
const location=await client.from('inventory_locations').select('id').eq('organization_id',organizationId).eq('warehouse_id',warehouse.data.id).eq('location_type','available').eq('active',true).limit(1).single();if(location.error)throw location.error
const product=await client.from('products').select('id,sku').eq('organization_id',organizationId).eq('item_type','inventory').eq('active',true).limit(1).single();if(product.error)throw product.error
const beforeResult=await client.from('inventory_balances').select('quantity').eq('organization_id',organizationId).eq('product_id',product.data.id).eq('location_id',location.data.id).maybeSingle();if(beforeResult.error)throw beforeResult.error
const before=Number(beforeResult.data?.quantity||0)
const payload=[{product_id:product.data.id,location_id:location.data.id,counted_quantity:before+2}]

const created=await client.rpc('create_inventory_count',{p_warehouse_id:warehouse.data.id,p_counted_on:new Date().toISOString().slice(0,10),p_reason:'Prueba de corte físico',p_notes:'Validación automática',p_lines:payload});if(created.error)throw created.error
expect(/^CF-\d{4}-\d{6}$/.test(created.data.folio),'El folio del corte físico no cumple la nomenclatura')
const countLine=await client.from('inventory_count_lines').select('system_quantity,counted_quantity,difference').eq('inventory_count_id',created.data.id).single();if(countLine.error)throw countLine.error
expect(Number(countLine.data.system_quantity)===before&&Number(countLine.data.difference)===2,'El corte no conservó correctamente sistema, conteo y diferencia')
const directEdit=await client.from('inventory_counts').update({reason:'Edición directa indebida'}).eq('id',created.data.id)
expect(Boolean(directEdit.error),'Fue posible editar directamente un corte físico')

const updated=await client.rpc('update_inventory_count_draft',{p_inventory_count_id:created.data.id,p_counted_on:new Date().toISOString().slice(0,10),p_reason:'Prueba de corte actualizada',p_notes:'Diferencia final de una pieza',p_lines:[{...payload[0],counted_quantity:before+1}]});if(updated.error)throw updated.error
const confirmed=await client.rpc('confirm_inventory_count',{p_inventory_count_id:created.data.id});if(confirmed.error)throw confirmed.error
expect(confirmed.data.status==='confirmed','El corte no quedó confirmado')
const repeated=await client.rpc('confirm_inventory_count',{p_inventory_count_id:created.data.id});if(repeated.error)throw repeated.error
const movements=await client.from('inventory_movements').select('id,quantity').eq('inventory_count_id',created.data.id).is('reversal_of_id',null);if(movements.error)throw movements.error
expect(movements.data.length===1&&Number(movements.data[0].quantity)===1,'La confirmación no fue idempotente o registró una diferencia incorrecta')
const afterResult=await client.from('inventory_balances').select('quantity').eq('organization_id',organizationId).eq('product_id',product.data.id).eq('location_id',location.data.id).single();if(afterResult.error)throw afterResult.error
expect(Number(afterResult.data.quantity)===before+1,'El movimiento del corte no ajustó el ledger')

const reversed=await client.rpc('reverse_inventory_count',{p_inventory_count_id:created.data.id,p_reason:'Reversión controlada de la prueba automática'});if(reversed.error)throw reversed.error
const restoredResult=await client.from('inventory_balances').select('quantity').eq('organization_id',organizationId).eq('product_id',product.data.id).eq('location_id',location.data.id).maybeSingle();if(restoredResult.error)throw restoredResult.error
expect(Number(restoredResult.data?.quantity||0)===before,'La reversión no restauró el saldo anterior')

const cancellable=await client.rpc('create_inventory_count',{p_warehouse_id:warehouse.data.id,p_counted_on:new Date().toISOString().slice(0,10),p_reason:'Corte cancelable',p_notes:null,p_lines:[{...payload[0],counted_quantity:before}]});if(cancellable.error)throw cancellable.error
const cancelled=await client.rpc('cancel_inventory_count',{p_inventory_count_id:cancellable.data.id,p_reason:'Cancelación controlada de prueba automática'});if(cancelled.error)throw cancelled.error
expect(cancelled.data.status==='cancelled','El borrador del corte no quedó cancelado')

console.log(`Corte físico verificado: ${created.data.folio} · ajuste, idempotencia, bloqueo directo, reversión y cancelación OK`)

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env=Object.fromEntries(readFileSync(new URL('../.env.localdb.local',import.meta.url),'utf8').split(/\r?\n/).filter(line=>line&&!line.startsWith('#')).map(line=>{const at=line.indexOf('=');return [line.slice(0,at),line.slice(at+1)]}))
const client=createClient(env.VITE_SUPABASE_URL,env.VITE_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false}})
const expect=(condition,message)=>{if(!condition)throw new Error(message)}
const date=(offset)=>{const value=new Date();value.setDate(value.getDate()+offset);return value.toISOString().slice(0,10)}

const login=await client.auth.signInWithPassword({email:'admin@andavalle.local',password:'AndavalleLocal#2026'});if(login.error)throw login.error
const profileId=login.data.user.id
const membership=await client.from('organization_members').select('organization_id').eq('profile_id',profileId).eq('active',true).single();if(membership.error)throw membership.error
const organizationId=membership.data.organization_id
const availability=await client.from('inventory_availability').select('product_id,available').eq('organization_id',organizationId).gte('available',3).order('available',{ascending:false}).limit(1).single();if(availability.error)throw availability.error
const product=await client.from('products').select('id,sku,description').eq('id',availability.data.product_id).single();if(product.error)throw product.error
const site=await client.from('customer_sites').select('id,customer_id').eq('organization_id',organizationId).is('archived_at',null).limit(1).single();if(site.error)throw site.error
const operation=await client.from('rental_operations').insert({organization_id:organizationId,customer_id:site.data.customer_id,site_id:site.data.id,name:`Prueba HS ${Date.now()}`,created_by:profileId}).select('id').single();if(operation.error)throw operation.error
const contract=await client.from('contracts').insert({organization_id:organizationId,customer_id:site.data.customer_id,site_id:site.data.id,contract_type:'rental',starts_on:date(0),ends_on:date(14),created_by:profileId,rental_operation_id:operation.data.id,notes:'Contrato para prueba HS.'}).select('id').single();if(contract.error)throw contract.error
const contractLine=await client.from('contract_lines').insert({organization_id:organizationId,contract_id:contract.data.id,line_no:1,product_id:product.data.id,quantity:3,unit_price:100,discount_percent:0,tax_rate:.16,billing_unit:'day',sku_snapshot:product.data.sku,description_snapshot:product.data.description}).select('id').single();if(contractLine.error)throw contractLine.error
const submittedContract=await client.rpc('submit_contract',{p_contract_id:contract.data.id});if(submittedContract.error)throw submittedContract.error
const authorizedContract=await client.rpc('authorize_contract',{p_contract_id:contract.data.id,p_justification:'Contrato para validar Hojas de Salida parciales'});if(authorizedContract.error)throw authorizedContract.error
const ss=await client.rpc('create_ss_request',{p_contract_id:contract.data.id,p_notes:'SS para prueba HS',p_lines:[{contract_line_id:contractLine.data.id,quantity:3}],p_scheduled_for:null,p_vehicle:null,p_operator_name:null});if(ss.error)throw ss.error
const requestLine=await client.from('operation_request_lines').select('id').eq('request_id',ss.data.id).single();if(requestLine.error)throw requestLine.error
const submittedSs=await client.rpc('submit_request',{p_request_id:ss.data.id});if(submittedSs.error)throw submittedSs.error
const authorizedSs=await client.rpc('authorize_request',{p_request_id:ss.data.id});if(authorizedSs.error)throw authorizedSs.error

async function attachSignature(documentId,label){const path=`${organizationId}/documents/${documentId}/signature-${label}-${Date.now()}.png`;const upload=await client.storage.from('erp-documents').upload(path,Buffer.from('firma de prueba'),{contentType:'image/png'});if(upload.error)throw upload.error;const metadata=await client.from('document_files').insert({organization_id:organizationId,document_id:documentId,storage_path:path,file_kind:'signature',content_type:'image/png',created_by:profileId});if(metadata.error)throw metadata.error}

const first=await client.rpc('create_hs_document',{p_request_id:ss.data.id,p_receiver_name:'Receptor de prueba',p_lines:[{request_line_id:requestLine.data.id,quantity:2}]});if(first.error)throw first.error
expect(/^HS-\d{4}-\d{6}$/.test(first.data.folio),'El folio HS no cumple la nomenclatura')
const blocked=await client.rpc('confirm_inventory_document',{p_document_id:first.data.id});expect(Boolean(blocked.error),'La HS se confirmó sin firma')
await attachSignature(first.data.id,'parcial')
const confirmedFirst=await client.rpc('confirm_inventory_document',{p_document_id:first.data.id});if(confirmedFirst.error)throw confirmedFirst.error
const repeated=await client.rpc('confirm_inventory_document',{p_document_id:first.data.id});if(repeated.error)throw repeated.error
const firstMovements=await client.from('inventory_movements').select('id').eq('document_id',first.data.id);if(firstMovements.error)throw firstMovements.error
expect(firstMovements.data.length===1,'La confirmación repetida duplicó movimientos')
const partial=await client.from('operation_requests').select('status').eq('id',ss.data.id).single();if(partial.error)throw partial.error
expect(partial.data.status==='partially_fulfilled','La SS no quedó parcialmente surtida')

const second=await client.rpc('create_hs_document',{p_request_id:ss.data.id,p_receiver_name:'Receptor final',p_lines:[{request_line_id:requestLine.data.id,quantity:1}]});if(second.error)throw second.error
await attachSignature(second.data.id,'final')
const confirmedSecond=await client.rpc('confirm_inventory_document',{p_document_id:second.data.id});if(confirmedSecond.error)throw confirmedSecond.error
const completed=await client.from('operation_requests').select('status').eq('id',ss.data.id).single();if(completed.error)throw completed.error
expect(completed.data.status==='completed','La SS no quedó completada con la segunda HS')
const activeContract=await client.from('contracts').select('status').eq('id',contract.data.id).single();if(activeContract.error)throw activeContract.error
expect(activeContract.data.status==='active','El contrato de renta no quedó activo')

const reversed=await client.rpc('reverse_inventory_document',{p_document_id:second.data.id,p_reason:'Reversión controlada de la prueba automática'});if(reversed.error)throw reversed.error
const afterReverse=await client.from('operation_requests').select('status').eq('id',ss.data.id).single();if(afterReverse.error)throw afterReverse.error
expect(afterReverse.data.status==='partially_fulfilled','La reversión no restauró el estado parcial de la SS')

console.log(`HS verificadas: ${first.data.folio} parcial + ${second.data.folio} final/revertida · firma, idempotencia y ledger OK`)

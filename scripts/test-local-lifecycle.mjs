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
const stock=await client.from('inventory_availability').select('product_id,available').eq('organization_id',organizationId).gte('available',1).order('available',{ascending:false}).limit(1).single();if(stock.error)throw stock.error
const product=await client.from('products').select('id,sku,description').eq('id',stock.data.product_id).single();if(product.error)throw product.error
const site=await client.from('customer_sites').select('id,customer_id').eq('organization_id',organizationId).is('archived_at',null).limit(1).single();if(site.error)throw site.error
const operation=await client.from('rental_operations').insert({organization_id:organizationId,customer_id:site.data.customer_id,site_id:site.data.id,name:`Ciclo renovación ${Date.now()}`,created_by:profileId}).select('id').single();if(operation.error)throw operation.error
const contract=await client.from('contracts').insert({organization_id:organizationId,customer_id:site.data.customer_id,site_id:site.data.id,contract_type:'rental',starts_on:date(0),ends_on:date(14),created_by:profileId,rental_operation_id:operation.data.id,notes:'Contrato para prueba de renovación.'}).select('id,contract_chain_id,folio').single();if(contract.error)throw contract.error
const contractLine=await client.from('contract_lines').insert({organization_id:organizationId,contract_id:contract.data.id,line_no:1,product_id:product.data.id,quantity:1,unit_price:100,discount_percent:0,tax_rate:.16,starts_on:date(0),ends_on:date(14),billing_unit:'day',sku_snapshot:product.data.sku,description_snapshot:product.data.description,base_unit_price:10,rate_factor:1}).select('id').single();if(contractLine.error)throw contractLine.error
const submitted=await client.rpc('submit_contract',{p_contract_id:contract.data.id});if(submitted.error)throw submitted.error
const authorized=await client.rpc('authorize_contract',{p_contract_id:contract.data.id,p_justification:'Autorización automática para probar renovación'});if(authorized.error)throw authorized.error
const ss=await client.rpc('create_ss_request',{p_contract_id:contract.data.id,p_notes:'Entrega previa a renovación',p_lines:[{contract_line_id:contractLine.data.id,quantity:1}],p_scheduled_for:null,p_vehicle:null,p_operator_name:null});if(ss.error)throw ss.error
const ssLine=await client.from('operation_request_lines').select('id').eq('request_id',ss.data.id).single();if(ssLine.error)throw ssLine.error
const submittedSs=await client.rpc('submit_request',{p_request_id:ss.data.id});if(submittedSs.error)throw submittedSs.error
const authorizedSs=await client.rpc('authorize_request',{p_request_id:ss.data.id});if(authorizedSs.error)throw authorizedSs.error
const hs=await client.rpc('create_hs_document',{p_request_id:ss.data.id,p_receiver_name:'Obra de renovación',p_lines:[{request_line_id:ssLine.data.id,quantity:1}]});if(hs.error)throw hs.error
const signaturePath=`${organizationId}/documents/${hs.data.id}/signature-${Date.now()}.png`
const signatureUpload=await client.storage.from('erp-documents').upload(signaturePath,Buffer.from('firma de prueba'),{contentType:'image/png'});if(signatureUpload.error)throw signatureUpload.error
const signatureMetadata=await client.from('document_files').insert({organization_id:organizationId,document_id:hs.data.id,storage_path:signaturePath,file_kind:'signature',content_type:'image/png',created_by:profileId});if(signatureMetadata.error)throw signatureMetadata.error
const confirmedHs=await client.rpc('confirm_inventory_document',{p_document_id:hs.data.id});if(confirmedHs.error)throw confirmedHs.error
const operationActive=await client.from('rental_operations').select('status').eq('id',operation.data.id).single();if(operationActive.error)throw operationActive.error
expect(operationActive.data.status==='active','La OR no quedó activa después de la entrega')
const beforeMovements=await client.from('inventory_movements').select('id').eq('contract_chain_id',contract.data.contract_chain_id);if(beforeMovements.error)throw beforeMovements.error

const renewed=await client.rpc('renew_contract',{p_contract_id:contract.data.id,p_starts_on:date(15),p_ends_on:date(44)});if(renewed.error)throw renewed.error
const renewal=await client.from('contracts').select('id,contract_chain_id,previous_contract_id,rental_operation_id,status,folio').eq('id',renewed.data).single();if(renewal.error)throw renewal.error
expect(renewal.data.status==='draft'&&renewal.data.contract_chain_id===contract.data.contract_chain_id&&renewal.data.previous_contract_id===contract.data.id&&renewal.data.rental_operation_id===operation.data.id,'La renovación no conservó contrato anterior, cadena y OR')
const renewalLine=await client.from('contract_lines').select('id,sku_snapshot,starts_on,ends_on,carried_quantity').eq('contract_id',renewal.data.id).single();if(renewalLine.error)throw renewalLine.error
expect(renewalLine.data.sku_snapshot===product.data.sku&&renewalLine.data.starts_on===date(15)&&renewalLine.data.ends_on===date(44),'La renovación no copió la partida con la nueva vigencia')
const afterDraftMovements=await client.from('inventory_movements').select('id').eq('contract_chain_id',contract.data.contract_chain_id);if(afterDraftMovements.error)throw afterDraftMovements.error
expect(afterDraftMovements.data.length===beforeMovements.data.length,'Crear la renovación movió inventario')

const submittedRenewal=await client.rpc('submit_contract',{p_contract_id:renewal.data.id});if(submittedRenewal.error)throw submittedRenewal.error
const authorizedRenewal=await client.rpc('authorize_contract',{p_contract_id:renewal.data.id,p_justification:'Autorización automática de la renovación'});if(authorizedRenewal.error)throw authorizedRenewal.error
expect(authorizedRenewal.data.status==='active','La renovación con custodia no quedó activa')
const predecessor=await client.from('contracts').select('status,closure_reason').eq('id',contract.data.id).single();if(predecessor.error)throw predecessor.error
expect(predecessor.data.status==='closed'&&String(predecessor.data.closure_reason).includes(renewal.data.folio),'El contrato anterior no quedó cerrado por sustitución')
const custody=await client.from('contract_line_custody').select('in_custody').eq('contract_line_id',renewalLine.data.id).single();if(custody.error)throw custody.error
expect(Number(custody.data.in_custody)===1,'La renovación no heredó la custodia física')
const afterAuthorizeMovements=await client.from('inventory_movements').select('id').eq('contract_chain_id',contract.data.contract_chain_id);if(afterAuthorizeMovements.error)throw afterAuthorizeMovements.error
expect(afterAuthorizeMovements.data.length===beforeMovements.data.length,'Autorizar la renovación movió inventario')
const blockedClose=await client.rpc('close_contract',{p_contract_id:renewal.data.id,p_force:false,p_reason:null})
expect(Boolean(blockedClose.error),'Fue posible cerrar normalmente una renta con saldo en obra')

const se=await client.rpc('create_se_request',{p_contract_id:renewal.data.id,p_notes:'Devolución final después de renovar',p_lines:[{contract_line_id:renewalLine.data.id,quantity:1}],p_scheduled_for:null,p_vehicle:null,p_operator_name:null});if(se.error)throw se.error
const seLine=await client.from('operation_request_lines').select('id').eq('request_id',se.data.id).single();if(seLine.error)throw seLine.error
const submittedSe=await client.rpc('submit_request',{p_request_id:se.data.id});if(submittedSe.error)throw submittedSe.error
const authorizedSe=await client.rpc('authorize_request',{p_request_id:se.data.id});if(authorizedSe.error)throw authorizedSe.error
const he=await client.rpc('create_he_document',{p_request_id:se.data.id,p_receiver_name:'Almacén de renovación',p_lines:[{request_line_id:seLine.data.id,available:1,inspection:0,maintenance:0,damaged:0,writeoff:0}]});if(he.error)throw he.error
const confirmedHe=await client.rpc('confirm_inventory_document',{p_document_id:he.data.id});if(confirmedHe.error)throw confirmedHe.error
const closed=await client.rpc('close_contract',{p_contract_id:renewal.data.id,p_force:false,p_reason:'Devolución completa conciliada'});if(closed.error)throw closed.error
expect(closed.data.status==='closed'&&!closed.data.closure_exception,'La renovación no cerró normalmente después de devolver el equipo')
const operationClosed=await client.from('rental_operations').select('status').eq('id',operation.data.id).single();if(operationClosed.error)throw operationClosed.error
expect(operationClosed.data.status==='closed','La OR no quedó cerrada al terminar la cadena sin custodia')

console.log(`Ciclo verificado: ${contract.data.folio} → ${renewal.data.folio} · custodia conservada, devolución y cierre de OR OK`)

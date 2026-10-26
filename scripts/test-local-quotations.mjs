import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env=Object.fromEntries(readFileSync(new URL('../.env.localdb.local',import.meta.url),'utf8').split(/\r?\n/).filter(line=>line&&!line.startsWith('#')).map(line=>{const at=line.indexOf('=');return [line.slice(0,at),line.slice(at+1)]}))
const client=createClient(env.VITE_SUPABASE_URL,env.VITE_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false}})
const fail=(message)=>{throw new Error(message)}
const expect=(condition,message)=>{if(!condition)fail(message)}
const date=(offset)=>{const value=new Date();value.setDate(value.getDate()+offset);return value.toISOString().slice(0,10)}

const login=await client.auth.signInWithPassword({email:'admin@andavalle.local',password:'AndavalleLocal#2026'})
if(login.error)throw login.error
const profileId=login.data.user.id
const membership=await client.from('organization_members').select('organization_id').eq('profile_id',profileId).eq('active',true).single()
if(membership.error)throw membership.error
const organizationId=membership.data.organization_id

const leadResult=await client.from('crm_leads').select('id,customer_id,site_id').eq('organization_id',organizationId).not('customer_id','is',null).not('site_id','is',null).not('status','in','(won,lost)').limit(1).single()
if(leadResult.error)throw leadResult.error
const contactResult=await client.from('customer_contacts').select('id').eq('organization_id',organizationId).eq('customer_id',leadResult.data.customer_id).eq('active',true).limit(1).single()
if(contactResult.error)throw contactResult.error
const inventory=await client.from('products').select('id,sku').eq('organization_id',organizationId).eq('item_type','inventory').eq('active',true).limit(1).single()
if(inventory.error)throw inventory.error
const service=await client.from('products').select('id,sku').eq('organization_id',organizationId).eq('item_type','service').eq('active',true).limit(1).single()
if(service.error)throw service.error

const created=await client.rpc('create_quotation',{
  p_lead_id:leadResult.data.id,p_contact_id:contactResult.data.id,p_quotation_type:'rental',
  p_starts_on:date(0),p_ends_on:date(4),p_operation_mode:'new',p_rental_operation_id:null,
  p_proposed_operation_name:`Prueba integral ${Date.now()}`,p_purpose:'expansion',p_other_purpose:null,
  p_discount_percent:5,p_discount_reason:null,p_notes:'Cotización creada por la prueba integral local.',
  p_lines:[{product_id:inventory.data.id,quantity:10},{product_id:service.data.id,quantity:1}],
})
if(created.error)throw created.error
let quote=created.data
expect(/^COT-R-\d{4}-\d{6}-R00$/.test(quote.folio),'El folio de cotización no cumple la nomenclatura')
expect(Number(quote.subtotal_equipment)>0&&Number(quote.subtotal_services)>0,'La cotización no separó equipo y servicios')

const requiresApproval=await client.rpc('update_quotation_draft',{
  p_quotation_id:quote.id,p_contact_id:contactResult.data.id,p_starts_on:date(0),p_ends_on:date(4),
  p_operation_mode:'new',p_rental_operation_id:null,p_proposed_operation_name:`Prueba autorización ${Date.now()}`,
  p_purpose:'expansion',p_other_purpose:null,p_discount_percent:12,p_discount_reason:'Prueba de autorización administrativa',
  p_notes:'Validación del límite de descuento.',
  p_lines:[{product_id:inventory.data.id,quantity:10},{product_id:service.data.id,quantity:1}],
})
if(requiresApproval.error)throw requiresApproval.error
const blockedIssue=await client.rpc('issue_quotation',{p_quotation_id:quote.id})
expect(Boolean(blockedIssue.error),'La cotización con descuento mayor a 10 % se emitió sin autorización')
const authorizedDiscount=await client.rpc('authorize_quotation_discount',{p_quotation_id:quote.id})
if(authorizedDiscount.error)throw authorizedDiscount.error
expect(Boolean(authorizedDiscount.data.discount_authorized_at),'No se registró la autorización administrativa del descuento')

const updated=await client.rpc('update_quotation_draft',{
  p_quotation_id:quote.id,p_contact_id:contactResult.data.id,p_starts_on:date(0),p_ends_on:date(6),
  p_operation_mode:'new',p_rental_operation_id:null,p_proposed_operation_name:`Prueba integral editada ${Date.now()}`,
  p_purpose:'expansion',p_other_purpose:null,p_discount_percent:3,p_discount_reason:null,
  p_notes:'Borrador editado por la prueba integral local.',
  p_lines:[{product_id:inventory.data.id,quantity:12},{product_id:service.data.id,quantity:1}],
})
if(updated.error)throw updated.error
quote=updated.data
expect(Number(quote.discount_percent)===3,'La edición no actualizó el descuento')

const lineResult=await client.from('quotation_lines').select('item_type,rental_days,rate_factor,discount_amount').eq('quotation_id',quote.id)
if(lineResult.error)throw lineResult.error
const equipmentLine=lineResult.data.find(row=>row.item_type==='inventory')
const serviceLine=lineResult.data.find(row=>row.item_type==='service')
expect(equipmentLine?.rental_days===7&&Number(equipmentLine.rate_factor)===1.2,'La edición no recalculó el factor de 7 días')
expect(Number(equipmentLine?.discount_amount)>0&&Number(serviceLine?.discount_amount)===0,'El descuento debe afectar sólo al equipo')

const issued=await client.rpc('issue_quotation',{p_quotation_id:quote.id})
if(issued.error)throw issued.error
expect(issued.data.status==='sent','La cotización no quedó enviada')

const revised=await client.rpc('revise_quotation',{p_quotation_id:quote.id})
if(revised.error)throw revised.error
expect(revised.data.folio.endsWith('-R01')&&revised.data.status==='draft','No se creó la revisión R01 en borrador')
const reissued=await client.rpc('issue_quotation',{p_quotation_id:revised.data.id})
if(reissued.error)throw reissued.error

const evidencePath=`${organizationId}/quotations/${revised.data.id}/acceptance-test-${Date.now()}.pdf`
const uploaded=await client.storage.from('erp-documents').upload(evidencePath,Buffer.from('%PDF-1.4\n% prueba local'),{contentType:'application/pdf'})
if(uploaded.error)throw uploaded.error
const accepted=await client.rpc('accept_quotation',{p_quotation_id:revised.data.id,p_evidence_path:evidencePath})
if(accepted.error)throw accepted.error
const repeated=await client.rpc('accept_quotation',{p_quotation_id:revised.data.id,p_evidence_path:evidencePath})
if(repeated.error)throw repeated.error
expect(accepted.data.contract_id===repeated.data.contract_id,'La aceptación no fue idempotente')

const contract=await client.from('contracts').select('id,status,rental_operation_id,total').eq('id',accepted.data.contract_id).single()
if(contract.error)throw contract.error
expect(contract.data.status==='draft'&&Boolean(contract.data.rental_operation_id),'No se creó contrato borrador y OR')
const won=await client.from('crm_leads').select('status').eq('id',leadResult.data.id).single()
if(won.error)throw won.error
expect(won.data.status==='won','La oportunidad no quedó ganada')

const currentPrice=await client.from('product_prices').select('amount').eq('product_id',inventory.data.id).eq('quotation_type','rental').is('valid_until',null).single()
if(currentPrice.error)throw currentPrice.error
const originalPrice=Number(currentPrice.data.amount)
const changedPrice=await client.rpc('set_product_price',{p_product_id:inventory.data.id,p_quotation_type:'rental',p_amount:originalPrice+1,p_effective_from:date(0)})
if(changedPrice.error)throw changedPrice.error
expect(Number(changedPrice.data.amount)===originalPrice+1,'No se actualizó el precio de renta')
const restoredPrice=await client.rpc('set_product_price',{p_product_id:inventory.data.id,p_quotation_type:'rental',p_amount:originalPrice,p_effective_from:date(0)})
if(restoredPrice.error)throw restoredPrice.error

const tierResult=await client.from('rental_rate_tiers').select('code,min_days,max_days,rate_factor,floor_multiplier').eq('organization_id',organizationId).is('valid_until',null).order('min_days')
if(tierResult.error)throw tierResult.error
const replacedTiers=await client.rpc('replace_rental_rate_tiers',{p_effective_from:date(0),p_tiers:tierResult.data.map(row=>({code:row.code,min_days:row.min_days,max_days:row.max_days,rate_factor:row.rate_factor,floor_multiplier:row.floor_multiplier}))})
if(replacedTiers.error)throw replacedTiers.error
expect(replacedTiers.data.length===tierResult.data.length,'No se conservaron todos los rangos de renta')

console.log(`Cotizaciones verificadas: edición → ${quote.folio} → ${revised.data.folio} → contrato ${accepted.data.contract_id}; precios y factores OK`)

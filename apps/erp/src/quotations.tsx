import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { CheckCircle2, ChevronRight, FileCheck2, History, Pencil, Plus, RefreshCw, Save, Send, ShieldCheck, Tags, Upload, X } from 'lucide-react'

type QuoteType='rental'|'sale'
type QuoteStatus='draft'|'sent'|'accepted'|'converted'|'rejected'|'expired'|'cancelled'

interface OpportunityOption{id:string;name:string;company?:string;customerId?:string;siteId?:string;status:string}
interface ContactOption{id:string;customer_id:string;name:string;position:string|null}
interface CustomerOption{id:string;legal_name:string;trade_name:string|null}
interface SiteOption{id:string;customer_id:string;name:string;site_code:string}
interface ProductRow{id:string;sku:string;description:string;item_type:'inventory'|'service'}
interface PriceRow{id:string;product_id:string;quotation_type:QuoteType;amount:number;valid_from:string;valid_until:string|null;active:boolean}
interface RateTier{id:string;code:string;min_days:number;max_days:number|null;rate_factor:number;floor_multiplier:number;valid_from:string;valid_until:string|null}
interface OperationRow{id:string;customer_id:string;site_id:string;folio:string;name:string;status:string}
interface QuoteRow{id:string;lead_id:string;customer_id:string;contact_id:string;site_id:string;quotation_type:QuoteType;folio:string;status:QuoteStatus;starts_on:string;ends_on:string|null;operation_mode:'new'|'existing'|null;rental_operation_id:string|null;proposed_operation_name:string|null;purpose:string;other_purpose:string|null;discount_percent:number;discount_reason:string|null;discount_authorized_at:string|null;subtotal_equipment:number;subtotal_services:number;discount_amount:number;tax_amount:number;total:number;notes:string|null;valid_until:string|null;converted_contract_id:string|null;created_at:string}
interface QuoteLine{id:string;quotation_id:string;line_no:number;product_id:string;sku_snapshot:string;description_snapshot:string;item_type:'inventory'|'service';quantity:number;starts_on:string|null;ends_on:string|null;rental_days:number|null;base_unit_price:number;rate_factor:number|null;unit_price:number;subtotal:number;discount_amount:number;tax_amount:number;total:number}
interface DraftLine{id:string;productId:string;quantity:number;startsOn:string;rentalDays:number}
interface CreateLine{productId:string;quantity:number;startsOn:string;endsOn:string}

interface Props{
  client:SupabaseClient|null;profileId?:string;organizationId?:string;demoMode:boolean
  opportunities:OpportunityOption[];contacts:ContactOption[];customers:CustomerOption[];sites:SiteOption[]
}

const statusLabels:Record<QuoteStatus,string>={draft:'Borrador',sent:'Enviada',accepted:'Aceptada',converted:'Convertida',rejected:'Rechazada',expired:'Vencida',cancelled:'Cancelada'}
const purposeLabels:Record<string,string>={initial:'Inicial',renewal:'Renovación',expansion:'Equipo adicional',terms_change:'Cambio de condiciones',replacement:'Reposición',other:'Otro'}
const money=new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN'})
const today=()=>new Date().toISOString().slice(0,10)
const plusDays=(days:number)=>{const date=new Date();date.setDate(date.getDate()+days);return date.toISOString().slice(0,10)}
const addDays=(start:string,days:number)=>{const date=new Date(`${start}T12:00:00`);date.setDate(date.getDate()+days);return date.toISOString().slice(0,10)}

const demoQuote:QuoteRow={id:'demo-quote',lead_id:'demo-lead-2',customer_id:'demo-customer',contact_id:'demo-contact',site_id:'demo-site',quotation_type:'rental',folio:'COT-R-2026-000001-R00',status:'draft',starts_on:today(),ends_on:plusDays(14),operation_mode:'new',rental_operation_id:null,proposed_operation_name:'Frente norte',purpose:'expansion',other_purpose:null,discount_percent:5,discount_reason:null,discount_authorized_at:null,subtotal_equipment:10920,subtotal_services:2500,discount_amount:546,tax_amount:2059.84,total:14933.84,notes:null,valid_until:null,converted_contract_id:null,created_at:new Date().toISOString()}

export function QuotationsModule({client,profileId,organizationId,demoMode,opportunities,contacts,customers,sites}:Props){
  const [quotes,setQuotes]=useState<QuoteRow[]>(demoMode?[demoQuote]:[])
  const [lines,setLines]=useState<QuoteLine[]>([])
  const [products,setProducts]=useState<ProductRow[]>([])
  const [prices,setPrices]=useState<PriceRow[]>([])
  const [operations,setOperations]=useState<OperationRow[]>([])
  const [selectedId,setSelectedId]=useState(demoMode?demoQuote.id:'')
  const [showNew,setShowNew]=useState(false)
  const [showEdit,setShowEdit]=useState(false)
  const [isAdmin,setIsAdmin]=useState(demoMode)
  const [message,setMessage]=useState('')
  const [loading,setLoading]=useState(!demoMode)
  const [evidence,setEvidence]=useState<File|null>(null)

  const refresh=useCallback(async()=>{
    if(!client||demoMode||!organizationId)return
    setLoading(true);setMessage('')
    try{
      const [quoteResult,lineResult,productResult,priceResult,operationResult,roleResult]=await Promise.all([
        client.from('quotations').select('id,lead_id,customer_id,contact_id,site_id,quotation_type,folio,status,starts_on,ends_on,operation_mode,rental_operation_id,proposed_operation_name,purpose,other_purpose,discount_percent,discount_reason,discount_authorized_at,subtotal_equipment,subtotal_services,discount_amount,tax_amount,total,notes,valid_until,converted_contract_id,created_at').eq('organization_id',organizationId).order('created_at',{ascending:false}),
        client.from('quotation_lines').select('id,quotation_id,line_no,product_id,sku_snapshot,description_snapshot,item_type,quantity,starts_on,ends_on,rental_days,base_unit_price,rate_factor,unit_price,subtotal,discount_amount,tax_amount,total').eq('organization_id',organizationId).order('line_no'),
        client.from('products').select('id,sku,description,item_type').eq('organization_id',organizationId).eq('active',true).order('sku'),
        client.from('product_prices').select('id,product_id,quotation_type,amount,valid_from,valid_until,active').eq('organization_id',organizationId).eq('active',true).order('valid_from',{ascending:false}),
        client.from('rental_operations').select('id,customer_id,site_id,folio,name,status').eq('organization_id',organizationId).in('status',['planned','active','pending_return']).order('created_at',{ascending:false}),
        client.from('organization_member_roles').select('role_code').eq('organization_id',organizationId).eq('profile_id',profileId!),
      ])
      const failure=[quoteResult,lineResult,productResult,priceResult,operationResult,roleResult].find(result=>result.error)?.error
      if(failure)throw failure
      const loaded=(quoteResult.data||[]) as QuoteRow[]
      setQuotes(loaded);setLines((lineResult.data||[]) as QuoteLine[]);setProducts((productResult.data||[]) as ProductRow[]);setPrices((priceResult.data||[]) as PriceRow[]);setOperations((operationResult.data||[]) as OperationRow[]);setIsAdmin((roleResult.data||[]).some(row=>row.role_code==='admin'))
      setSelectedId(current=>loaded.some(row=>row.id===current)?current:loaded[0]?.id||'')
    }catch(cause){setMessage(cause instanceof Error?cause.message:'No fue posible cargar las cotizaciones')}finally{setLoading(false)}
  },[client,demoMode,organizationId])
  useEffect(()=>{void refresh()},[refresh])

  const selected=quotes.find(row=>row.id===selectedId)
  const selectedLines=lines.filter(row=>row.quotation_id===selectedId)
  const currentPrices=useMemo(()=>prices.filter(row=>row.valid_until===null),[prices])
  const eligible=opportunities.filter(row=>row.customerId&&row.siteId&&!['won','lost'].includes(row.status))
  const customerName=(id:string)=>{const row=customers.find(item=>item.id===id);return row?.trade_name||row?.legal_name||'Cliente'}
  const siteName=(id:string)=>sites.find(item=>item.id===id)?.name||'Obra'

  async function run(action:()=>Promise<void>){setMessage('');try{await action()}catch(cause){setMessage(cause instanceof Error?cause.message:'No fue posible completar la acción')}}
  async function create(input:CreateInput){
    if(demoMode){const row={...demoQuote,id:`demo-${Date.now()}`,folio:`COT-${input.type==='rental'?'R':'V'}-2026-000002-R00`,lead_id:input.leadId,quotation_type:input.type,starts_on:input.startsOn,ends_on:input.endsOn||null,discount_percent:input.discount,total:0};setQuotes(current=>[row,...current]);setSelectedId(row.id);setShowNew(false);return}
    if(!client||!organizationId||!profileId)throw new Error('No hay sesión activa')
    const result=await client.rpc('create_quotation',{p_lead_id:input.leadId,p_contact_id:input.contactId,p_quotation_type:input.type,p_starts_on:input.startsOn,p_ends_on:input.endsOn||null,p_operation_mode:input.type==='rental'?input.operationMode:null,p_rental_operation_id:input.type==='rental'&&input.operationMode==='existing'?input.operationId||null:null,p_proposed_operation_name:input.type==='rental'&&input.operationMode==='new'?input.operationName:null,p_purpose:input.purpose,p_other_purpose:input.purpose==='other'?input.otherPurpose:null,p_discount_percent:input.discount,p_discount_reason:input.discount>10?input.discountReason:null,p_notes:input.notes||null,p_lines:input.lines.map(line=>({product_id:line.productId,quantity:line.quantity,starts_on:line.startsOn||null,ends_on:line.endsOn||null}))})
    if(result.error)throw result.error
    setShowNew(false);await refresh();setSelectedId((result.data as QuoteRow).id)
  }
  async function updateDraft(input:CreateInput){
    if(!selected)return
    if(demoMode){setQuotes(rows=>rows.map(row=>row.id===selected.id?{...row,starts_on:input.startsOn,ends_on:input.endsOn||null,discount_percent:input.discount,notes:input.notes||null}:row));setShowEdit(false);return}
    if(!client)throw new Error('No hay sesión activa')
    const result=await client.rpc('update_quotation_draft',{p_quotation_id:selected.id,p_contact_id:input.contactId,p_starts_on:input.startsOn,p_ends_on:input.endsOn||null,p_operation_mode:input.type==='rental'?input.operationMode:null,p_rental_operation_id:input.type==='rental'&&input.operationMode==='existing'?input.operationId||null:null,p_proposed_operation_name:input.type==='rental'&&input.operationMode==='new'?input.operationName:null,p_purpose:input.purpose,p_other_purpose:input.purpose==='other'?input.otherPurpose:null,p_discount_percent:input.discount,p_discount_reason:input.discount>10?input.discountReason:null,p_notes:input.notes||null,p_lines:input.lines.map(line=>({product_id:line.productId,quantity:line.quantity,starts_on:line.startsOn||null,ends_on:line.endsOn||null}))})
    if(result.error)throw result.error
    setShowEdit(false);await refresh()
  }
  async function authorizeDiscount(){if(!selected)return;if(demoMode){setQuotes(rows=>rows.map(row=>row.id===selected.id?{...row,discount_authorized_at:new Date().toISOString()}:row));return}if(!client)throw new Error('No hay sesión activa');const result=await client.rpc('authorize_quotation_discount',{p_quotation_id:selected.id});if(result.error)throw result.error;await refresh()}
  async function issue(){if(!selected)return;if(demoMode){setQuotes(rows=>rows.map(row=>row.id===selected.id?{...row,status:'sent',valid_until:plusDays(15)}:row));return}const result=await client!.rpc('issue_quotation',{p_quotation_id:selected.id});if(result.error)throw result.error;await refresh()}
  async function revise(){if(!selected)return;if(demoMode)return;if(!client)throw new Error('No hay sesión activa');const result=await client.rpc('revise_quotation',{p_quotation_id:selected.id});if(result.error)throw result.error;await refresh();setSelectedId((result.data as QuoteRow).id)}
  async function accept(){
    if(!selected||!organizationId||!client)return
    if(!evidence)throw new Error('Selecciona el PDF o imagen que acredita la aceptación')
    const safe=evidence.name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9._-]/g,'-')
    const path=`${organizationId}/quotations/${selected.id}/${Date.now()}-${safe}`
    const upload=await client.storage.from('erp-documents').upload(path,evidence,{upsert:false})
    if(upload.error)throw upload.error
    const result=await client.rpc('accept_quotation',{p_quotation_id:selected.id,p_evidence_path:path})
    if(result.error){await client.storage.from('erp-documents').remove([path]);throw result.error}
    setEvidence(null);await refresh()
  }

  return <>
    <div className="quote-head"><div><h2>Cotizaciones</h2><p>Precios, vigencia, revisiones y conversión a contrato.</p></div><button className="primary" disabled={!eligible.length} onClick={()=>setShowNew(true)}><Plus/>Nueva cotización</button></div>
    {message&&<div className="demo-banner" role="alert">{message}</div>}{loading&&<div className="demo-banner">Cargando cotizaciones…</div>}
    {!eligible.length&&<div className="info"><FileCheck2/><div><b>Primero vincula una oportunidad con cliente, contacto y obra.</b><p>La cotización sólo se habilita cuando esos datos comerciales están completos.</p></div></div>}
    <div className="quote-layout">
      <section className="panel quote-list">{quotes.length?quotes.map(row=><button key={row.id} className={row.id===selectedId?'selected':''} onClick={()=>setSelectedId(row.id)}><div><b>{row.folio}</b><small>{customerName(row.customer_id)} · {siteName(row.site_id)}</small></div><span className={`quote-status ${row.status}`}>{statusLabels[row.status]}</span><b>{money.format(row.total)}</b><ChevronRight/></button>):<div className="crm-empty">Aún no hay cotizaciones.</div>}</section>
      <section className="panel quote-detail">{selected?<><header><div><span className={`quote-status ${selected.status}`}>{statusLabels[selected.status]}</span><h2>{selected.folio}</h2><p>{customerName(selected.customer_id)} · {siteName(selected.site_id)}</p></div><b>{money.format(selected.total)}</b></header><div className="quote-body"><dl><div><dt>Tipo</dt><dd>{selected.quotation_type==='rental'?'Renta':'Venta'}</dd></div><div><dt>Periodo</dt><dd>{selected.starts_on} — {selected.ends_on||'Abierto'}</dd></div><div><dt>Propósito</dt><dd>{purposeLabels[selected.purpose]}</dd></div><div><dt>Vigencia</dt><dd>{selected.valid_until||'Al emitir: 15 días'}</dd></div></dl><div className="quote-lines">{selectedLines.map(line=><article key={line.id}><div><b>{line.sku_snapshot}</b><small>{line.description_snapshot}</small></div><span>{line.quantity} × {money.format(line.unit_price)}{line.rental_days?` · ${line.rental_days} días`:''}</span><b>{money.format(line.total)}</b></article>)}</div><div className="quote-totals"><span>Equipo <b>{money.format(selected.subtotal_equipment)}</b></span><span>Servicios <b>{money.format(selected.subtotal_services)}</b></span><span>Descuento ({selected.discount_percent} %) <b>− {money.format(selected.discount_amount)}</b></span><span>IVA <b>{money.format(selected.tax_amount)}</b></span><span className="grand">Total <b>{money.format(selected.total)}</b></span></div>{selected.status==='draft'&&selected.discount_percent>10&&!selected.discount_authorized_at&&<div className="info"><ShieldCheck/><div><b>Descuento pendiente de autorización</b><p>Administración debe autorizarlo antes de emitir esta cotización.</p></div></div>}{selected.status==='draft'&&selected.discount_percent>10&&selected.discount_authorized_at&&<div className="info"><CheckCircle2/><div><b>Descuento autorizado</b><p>La cotización ya puede emitirse al cliente.</p></div></div>}<div className="quote-actions">{selected.status==='draft'&&<button onClick={()=>setShowEdit(true)}><Pencil/>Editar borrador</button>}{selected.status==='draft'&&selected.discount_percent>10&&!selected.discount_authorized_at&&isAdmin&&<button onClick={()=>run(authorizeDiscount)}><ShieldCheck/>Autorizar descuento</button>}{selected.status==='draft'&&<button className="primary" disabled={selected.discount_percent>10&&!selected.discount_authorized_at} title={selected.discount_percent>10&&!selected.discount_authorized_at?'Requiere autorización administrativa del descuento':''} onClick={()=>run(issue)}><Send/>Emitir cotización</button>}{['sent','rejected','expired'].includes(selected.status)&&<button onClick={()=>run(revise)}><RefreshCw/>Crear revisión</button>}{selected.status==='sent'&&<label className="quote-upload"><Upload/>Evidencia<input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={event=>setEvidence(event.target.files?.[0]||null)}/></label>}{selected.status==='sent'&&<button className="primary" disabled={!evidence} onClick={()=>run(accept)}><CheckCircle2/>Registrar aceptación y crear contrato</button>}</div>{evidence&&<small className="quote-file">Archivo: {evidence.name}</small>}{selected.converted_contract_id&&<div className="info"><CheckCircle2/><div><b>Contrato borrador creado</b><p>{selected.converted_contract_id}</p></div></div>}</div></>:<div className="crm-empty">Selecciona una cotización.</div>}</section>
    </div>
    {showNew&&<QuoteForm opportunities={eligible} contacts={contacts} products={products} prices={currentPrices} operations={operations} onClose={()=>setShowNew(false)} onSubmit={input=>run(()=>create(input))}/>}
    {showEdit&&selected&&<QuoteForm initial={{quote:selected,lines:selectedLines}} opportunities={opportunities} contacts={contacts} products={products} prices={currentPrices} operations={operations} onClose={()=>setShowEdit(false)} onSubmit={input=>run(()=>updateDraft(input))}/>}
  </>
}

interface CreateInput{leadId:string;contactId:string;type:QuoteType;startsOn:string;endsOn:string;operationMode:'new'|'existing';operationId:string;operationName:string;purpose:string;otherPurpose:string;discount:number;discountReason:string;notes:string;lines:CreateLine[]}
interface QuoteFormInitial{quote:QuoteRow;lines:QuoteLine[]}
function QuoteForm({initial,opportunities,contacts,products,prices,operations,onClose,onSubmit}:{initial?:QuoteFormInitial;opportunities:OpportunityOption[];contacts:ContactOption[];products:ProductRow[];prices:PriceRow[];operations:OperationRow[];onClose:()=>void;onSubmit:(value:CreateInput)=>void}){
  const first=opportunities.find(item=>item.id===initial?.quote.lead_id)||opportunities[0]
  const initialInventoryLines=initial?.lines.filter(line=>line.item_type==='inventory')||[]
  const initialDays=initialInventoryLines[0]?.rental_days||15
  const initialGeneral=Boolean(initial&&(!initialInventoryLines.length||initialInventoryLines.every(line=>line.starts_on===initial.quote.starts_on&&line.rental_days===initialDays)))
  const [leadId,setLeadId]=useState(first?.id||'');const [contactId,setContactId]=useState(initial?.quote.contact_id||'');const [type,setType]=useState<QuoteType>(initial?.quote.quotation_type||'rental');const [startsOn,setStartsOn]=useState(initial?.quote.starts_on||today());const [generalDays,setGeneralDays]=useState(initialDays);const [periodMode,setPeriodMode]=useState<'general'|'particular'>(initialGeneral?'general':'particular');const [operationMode,setOperationMode]=useState<'new'|'existing'>(initial?.quote.operation_mode||'new');const [purpose,setPurpose]=useState(initial?.quote.purpose||'initial');const [discount,setDiscount]=useState(initial?.quote.discount_percent||0)
  const [draftLines,setDraftLines]=useState<DraftLine[]>(initial?.lines.map(line=>({id:line.id,productId:line.product_id,quantity:line.quantity,startsOn:line.starts_on&&line.starts_on!==initial.quote.starts_on?line.starts_on:'',rentalDays:line.rental_days||initialDays}))||[{id:crypto.randomUUID(),productId:'',quantity:1,startsOn:'',rentalDays:15}])
  const opportunity=opportunities.find(item=>item.id===leadId)||first
  const availableContacts=contacts.filter(item=>item.customer_id===opportunity?.customerId)
  const availableOperations=operations.filter(item=>item.customer_id===opportunity?.customerId&&item.site_id===opportunity?.siteId)
  const pricedProducts=useMemo(()=>products.filter(product=>prices.some(price=>price.product_id===product.id&&price.quotation_type===type)),[products,prices,type])
  function update(id:string,patch:Partial<DraftLine>){setDraftLines(rows=>rows.map(row=>row.id===id?{...row,...patch}:row))}
  function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();const data=new FormData(event.currentTarget)
    const lines:CreateLine[]=draftLines.map(line=>{const lineStart=type==='rental'&&periodMode==='particular'?(line.startsOn||startsOn):startsOn;const days=periodMode==='particular'?line.rentalDays:generalDays;return {productId:line.productId,quantity:line.quantity,startsOn:type==='rental'?lineStart:'',endsOn:type==='rental'?addDays(lineStart,days-1):''}})
    const rentalEnd=lines.reduce((latest,line)=>line.endsOn>latest?line.endsOn:latest,'')
    onSubmit({leadId,contactId,type,startsOn,endsOn:type==='rental'?rentalEnd:String(data.get('saleEndsOn')||''),operationMode,operationId:String(data.get('operationId')||''),operationName:String(data.get('operationName')||''),purpose,otherPurpose:String(data.get('otherPurpose')||''),discount,discountReason:String(data.get('discountReason')||''),notes:String(data.get('notes')||''),lines})
  }
  return <div className="crm-modal" role="dialog" aria-modal="true" aria-label="Nueva cotización">
    <form className="quote-form" onSubmit={submit}>
      <header><div><small>CRM comercial</small><h2>{initial?'Editar borrador':'Nueva cotización'}</h2></div><button type="button" onClick={onClose} aria-label="Cerrar"><X/></button></header>
      <div className="crm-form-grid quote-fields">
        <label>Oportunidad<select value={leadId} disabled={Boolean(initial)} onChange={event=>{setLeadId(event.target.value);setContactId('')}}>{opportunities.map(item=><option key={item.id} value={item.id}>{item.company||item.name}</option>)}</select></label>
        <label>Contacto<select name="contactId" required value={contactId} onChange={event=>setContactId(event.target.value)}><option value="" disabled>Selecciona</option>{availableContacts.map(item=><option key={item.id} value={item.id}>{item.name}{item.position?` · ${item.position}`:''}</option>)}</select></label>
        <label>Tipo<select value={type} disabled={Boolean(initial)} onChange={event=>{setType(event.target.value as QuoteType);setPeriodMode('general');setDraftLines([{id:crypto.randomUUID(),productId:'',quantity:1,startsOn:'',rentalDays:generalDays}])}}><option value="rental">Renta</option><option value="sale">Venta</option></select></label>
        <label>{type==='rental'?'Inicio general':'Fecha de cotización'}<input type="date" value={startsOn} onChange={event=>setStartsOn(event.target.value)} required/></label>
        {type==='sale'&&<label>Fecha compromiso opcional<input name="saleEndsOn" type="date" min={startsOn} defaultValue={initial?.quote.ends_on||''}/></label>}
        <label>Propósito<select value={purpose} onChange={event=>setPurpose(event.target.value)}>{Object.entries(purposeLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
        {purpose==='other'&&<label>Explica el propósito<input name="otherPurpose" required minLength={3} defaultValue={initial?.quote.other_purpose||''}/></label>}
        {type==='rental'&&<label>Operación de renta<select value={operationMode} onChange={event=>setOperationMode(event.target.value as 'new'|'existing')}><option value="new">Crear nueva OR al aceptar</option><option value="existing">Asignar a OR existente</option></select></label>}
        {type==='rental'&&operationMode==='new'&&<label>Nombre propuesto de OR<input name="operationName" required minLength={3} defaultValue={initial?.quote.proposed_operation_name||''} placeholder="Ej. Ampliación frente norte"/></label>}
        {type==='rental'&&operationMode==='existing'&&<label>OR activa<select name="operationId" required defaultValue={initial?.quote.rental_operation_id||''}><option value="" disabled>Selecciona</option>{availableOperations.map(row=><option key={row.id} value={row.id}>{row.folio} · {row.name}</option>)}</select></label>}
        <label>Descuento general a equipo (%)<input type="number" min="0" max="100" step=".01" value={discount} onChange={event=>setDiscount(Number(event.target.value))}/></label>
        {discount>10&&<label>Justificación del descuento<input name="discountReason" required minLength={5} defaultValue={initial?.quote.discount_reason||''}/></label>}
        <label className="wide">Notas<textarea name="notes" rows={2} defaultValue={initial?.quote.notes||''}/></label>
      </div>
      <div className="quote-line-editor">
        <div className="quote-line-title"><h3>Partidas</h3><button type="button" onClick={()=>setDraftLines(rows=>[...rows,{id:crypto.randomUUID(),productId:'',quantity:1,startsOn:'',rentalDays:generalDays}])}><Plus/>Agregar</button></div>
        {type==='rental'&&<div className="quote-period-config">
          <div><small>Periodo de renta</small><div className="quote-period-toggle"><button type="button" className={periodMode==='general'?'active':''} aria-pressed={periodMode==='general'} onClick={()=>setPeriodMode('general')}>Información general</button><button type="button" className={periodMode==='particular'?'active':''} aria-pressed={periodMode==='particular'} onClick={()=>setPeriodMode('particular')}>Por cada SKU</button></div></div>
          {periodMode==='general'?<label>Días de renta<input type="number" min="5" step="1" required value={generalDays} onChange={event=>setGeneralDays(Math.max(5,Number(event.target.value)))}/><span>Termina el {addDays(startsOn,generalDays-1)}</span></label>:<p>Indica únicamente los SKU que necesiten un inicio o duración diferente. El inicio vacío usa {startsOn}.</p>}
        </div>}
        {draftLines.map((line,index)=><div className={`quote-line-row ${type==='rental'&&periodMode==='particular'?'particular':''}`} key={line.id}>
          <span>{index+1}</span>
          <select required value={line.productId} onChange={event=>update(line.id,{productId:event.target.value})}><option value="" disabled>SKU / servicio</option>{pricedProducts.map(product=><option key={product.id} value={product.id}>{product.sku} · {product.description} · {money.format(prices.find(price=>price.product_id===product.id&&price.quotation_type===type)?.amount||0)}{type==='rental'&&product.item_type==='inventory'?'/día':''}</option>)}</select>
          <input aria-label="Cantidad" title="Cantidad" type="number" min=".001" step=".001" required value={line.quantity} onChange={event=>update(line.id,{quantity:Number(event.target.value)})}/>
          {type==='rental'&&periodMode==='particular'&&<input aria-label="Inicio particular" title="Inicio particular; vacío usa fecha general" type="date" value={line.startsOn} onChange={event=>update(line.id,{startsOn:event.target.value})}/>}
          {type==='rental'&&periodMode==='particular'&&<input aria-label="Días de renta" title="Días de renta" type="number" min="5" step="1" required value={line.rentalDays} onChange={event=>update(line.id,{rentalDays:Math.max(5,Number(event.target.value))})}/>}
          <button type="button" aria-label="Eliminar partida" disabled={draftLines.length===1} onClick={()=>setDraftLines(rows=>rows.filter(row=>row.id!==line.id))}><X/></button>
        </div>)}
      </div>
      <footer><button type="button" onClick={onClose}>Cancelar</button><button className="primary">{initial?'Guardar cambios':'Guardar borrador'}</button></footer>
    </form>
  </div>
}

export function PricingAdministration({client,organizationId,demoMode}:{client:SupabaseClient|null;organizationId?:string;demoMode:boolean}){
  const [products,setProducts]=useState<ProductRow[]>([])
  const [prices,setPrices]=useState<PriceRow[]>([])
  const [tiers,setTiers]=useState<RateTier[]>([])
  const [message,setMessage]=useState('')
  const [loading,setLoading]=useState(!demoMode)

  const refresh=useCallback(async()=>{
    if(!client||demoMode||!organizationId)return
    setLoading(true);setMessage('')
    try{
      const [productResult,priceResult,tierResult]=await Promise.all([
        client.from('products').select('id,sku,description,item_type').eq('organization_id',organizationId).eq('active',true).order('sku'),
        client.from('product_prices').select('id,product_id,quotation_type,amount,valid_from,valid_until,active').eq('organization_id',organizationId).eq('active',true).order('valid_from',{ascending:false}),
        client.from('rental_rate_tiers').select('id,code,min_days,max_days,rate_factor,floor_multiplier,valid_from,valid_until').eq('organization_id',organizationId).eq('active',true).order('min_days'),
      ])
      const failure=[productResult,priceResult,tierResult].find(result=>result.error)?.error
      if(failure)throw failure
      setProducts((productResult.data||[]) as ProductRow[]);setPrices((priceResult.data||[]) as PriceRow[]);setTiers((tierResult.data||[]) as RateTier[])
    }catch(cause){setMessage(cause instanceof Error?cause.message:'No fue posible cargar precios y factores')}finally{setLoading(false)}
  },[client,demoMode,organizationId])
  useEffect(()=>{void refresh()},[refresh])

  async function run(action:()=>Promise<void>){setMessage('');try{await action()}catch(cause){setMessage(cause instanceof Error?cause.message:'No fue posible completar la acción')}}
  async function savePrice(productId:string,type:QuoteType,amount:number){
    if(demoMode){setPrices(rows=>[...rows.filter(row=>!(row.product_id===productId&&row.quotation_type===type&&row.valid_until===null)),{id:`demo-price-${Date.now()}`,product_id:productId,quotation_type:type,amount,valid_from:today(),valid_until:null,active:true}]);return}
    if(!client)throw new Error('No hay sesión activa')
    const result=await client.rpc('set_product_price',{p_product_id:productId,p_quotation_type:type,p_amount:amount,p_effective_from:today()})
    if(result.error)throw result.error;await refresh()
  }
  async function saveTiers(rows:RateTierInput[]){
    if(demoMode)return
    if(!client)throw new Error('No hay sesión activa')
    const result=await client.rpc('replace_rental_rate_tiers',{p_effective_from:today(),p_tiers:rows.map(row=>({code:row.code,min_days:row.minDays,max_days:row.maxDays,rate_factor:row.factor,floor_multiplier:row.floor}))})
    if(result.error)throw result.error;await refresh()
  }

  if(!demoMode&&!organizationId)return <div className="demo-banner">Cargando organización administrativa…</div>
  const currentPrices=prices.filter(row=>row.valid_until===null)
  const currentTiers=tiers.filter(row=>row.valid_until===null)
  return <>
    <div className="admin-section-title"><div><h2>Precios y factores</h2><p>Configuración comercial reservada para administradores.</p></div><Tags/></div>
    {message&&<div className="demo-banner" role="alert">{message}</div>}{loading&&<div className="demo-banner">Cargando precios y factores…</div>}
    <PriceManager products={products} prices={prices} currentPrices={currentPrices} tiers={currentTiers} canManage onSavePrice={(productId,type,amount)=>run(()=>savePrice(productId,type,amount))} onSaveTiers={rows=>run(()=>saveTiers(rows))}/>
  </>
}

interface RateTierInput{code:string;minDays:number;maxDays:number|null;factor:number;floor:number}
function PriceManager({products,prices,currentPrices,tiers,canManage,onSavePrice,onSaveTiers}:{products:ProductRow[];prices:PriceRow[];currentPrices:PriceRow[];tiers:RateTier[];canManage:boolean;onSavePrice:(productId:string,type:QuoteType,amount:number)=>void;onSaveTiers:(rows:RateTierInput[])=>void}){
  const [draftPrices,setDraftPrices]=useState<Record<string,string>>({})
  const [draftTiers,setDraftTiers]=useState<RateTierInput[]>([])
  useEffect(()=>{setDraftPrices(Object.fromEntries(currentPrices.map(row=>[`${row.product_id}:${row.quotation_type}`,String(row.amount)])))},[currentPrices])
  useEffect(()=>{setDraftTiers(tiers.map(row=>({code:row.code,minDays:row.min_days,maxDays:row.max_days,factor:Number(row.rate_factor),floor:Number(row.floor_multiplier)})))},[tiers])
  const productName=(id:string)=>products.find(product=>product.id===id)?.sku||id
  const updateTier=(index:number,patch:Partial<RateTierInput>)=>setDraftTiers(rows=>rows.map((row,at)=>at===index?{...row,...patch}:row))
  return <div className="price-manager">
    {!canManage&&<div className="info"><Tags/><div><b>Consulta de precios</b><p>Sólo administración puede modificar precios y factores.</p></div></div>}
    <section className="panel price-panel"><header><div><h2>Precio base por SKU</h2><p>Renta corresponde al precio diario; venta al precio unitario antes de IVA.</p></div></header><div className="price-grid price-grid-head"><span>SKU</span><span>Renta / día</span><span>Venta</span></div>{products.map(product=><div className="price-grid" key={product.id}><div><b>{product.sku}</b><small>{product.description}{product.item_type==='service'?' · Servicio':''}</small></div>{(['rental','sale'] as QuoteType[]).map(type=>{const key=`${product.id}:${type}`;return <div className="price-editor" key={type}><span>$</span><input aria-label={`${type==='rental'?'Renta':'Venta'} ${product.sku}`} type="number" min="0" step=".01" disabled={!canManage} value={draftPrices[key]??''} onChange={event=>setDraftPrices(values=>({...values,[key]:event.target.value}))}/><button title="Guardar precio" disabled={!canManage||draftPrices[key]===''||Number(draftPrices[key])<0} onClick={()=>onSavePrice(product.id,type,Number(draftPrices[key]))}><Save/></button></div>})}</div>)}</section>
    <section className="panel rate-panel"><header><div><h2>Factores por duración</h2><p>El piso evita que una renta más larga resulte más barata que el rango anterior.</p></div>{canManage&&<button className="primary" onClick={()=>onSaveTiers(draftTiers)}><Save/>Guardar factores</button>}</header><div className="rate-grid rate-grid-head"><span>Días</span><span>Factor</span><span>Piso × precio diario</span></div>{draftTiers.map((row,index)=><div className="rate-grid" key={row.code}><b>{row.minDays}–{row.maxDays||'+'}</b><input aria-label={`Factor ${row.minDays} días`} type="number" min=".001" step=".01" disabled={!canManage} value={row.factor} onChange={event=>updateTier(index,{factor:Number(event.target.value)})}/><input aria-label={`Piso ${row.minDays} días`} type="number" min="0" step=".1" disabled={!canManage} value={row.floor} onChange={event=>updateTier(index,{floor:Number(event.target.value)})}/></div>)}</section>
    <section className="panel price-history"><header><div><h2><History/>Historial reciente</h2><p>Los precios anteriores permanecen disponibles para auditoría y cotizaciones históricas.</p></div></header><table><thead><tr><th>SKU</th><th>Tipo</th><th>Precio</th><th>Vigencia</th></tr></thead><tbody>{prices.slice(0,16).map(row=><tr key={row.id}><td>{productName(row.product_id)}</td><td>{row.quotation_type==='rental'?'Renta':'Venta'}</td><td>{money.format(row.amount)}</td><td>{row.valid_from} — {row.valid_until||'Actual'}</td></tr>)}</tbody></table></section>
  </div>
}

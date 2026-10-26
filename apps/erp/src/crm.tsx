import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { Building2, CalendarPlus, Check, ChevronRight, CircleUserRound, FileCheck2, Plus, ScrollText, Search, UserCheck, X } from 'lucide-react'
import {
  crmActivityTypeLabels, crmLeadStatusLabels, mockCrmActivities, mockCrmOpportunities,
  type CrmActivitySummary, type CrmActivityType, type CrmLeadStatus, type CrmOpportunitySummary,
} from '@andavalle/shared'
import { QuotationsModule } from './quotations'

interface CrmSource { id:string; code:string; name:string }
interface LossReason { id:string; code:string; name:string }
interface CustomerRow { id:string; customer_code:string; legal_name:string; trade_name:string|null; person_type:string; tax_id:string|null }
interface SiteRow { id:string; customer_id:string; site_code:string; name:string; address:string|null }
interface ContactRow { id:string; customer_id:string; site_id:string|null; name:string; position:string|null; phone:string|null; email:string|null; is_primary:boolean }
interface SiteQuote { id:string; folio:string; status:string; total:number; created_at:string }
interface SiteContract { id:string; folio:string; status:string; total:number; created_at:string }
interface OpportunityInput { name:string; company:string; phone:string; email:string; needSummary:string; sourceId:string; duplicateReason:string; customerId?:string; siteId?:string }

interface Opportunity extends CrmOpportunitySummary {
  customerId?:string
  siteId?:string
  sourceId:string
  lostReasonId?:string
  lostNotes?:string
}

interface CrmProps {
  client:SupabaseClient|null
  profileId?:string
  demoMode:boolean
}

const demoSources:CrmSource[]=[
  {id:'demo-source-manual',code:'manual',name:'Captura manual'},
  {id:'demo-source-web',code:'website',name:'Sitio web'},
  {id:'demo-source-referral',code:'referral',name:'Recomendación'},
  {id:'demo-source-repeat',code:'repeat_customer',name:'Cliente recurrente'},
]
const demoLossReasons:LossReason[]=[{id:'demo-loss-price',code:'price',name:'Precio'},{id:'demo-loss-other',code:'other',name:'Otro'}]
const demoCustomers:CustomerRow[]=[{id:'demo-customer',customer_code:'CLI-000001',legal_name:'Constructora Valle Alto, S.A. de C.V.',trade_name:'Constructora Valle Alto',person_type:'legal_entity',tax_id:'CVA260101AA1'}]
const demoSites:SiteRow[]=[{id:'demo-site',customer_id:'demo-customer',site_code:'OBR-000001',name:'Nave Norte',address:'Parque Industrial Toluca'}]
const demoContacts:ContactRow[]=[{id:'demo-contact',customer_id:'demo-customer',site_id:'demo-site',name:'Laura Méndez',position:'Residente de obra',phone:'55 1234 8901',email:'laura@example.com',is_primary:true}]

function formatDate(value?:string){return value?new Intl.DateTimeFormat('es-MX',{dateStyle:'medium',timeStyle:'short'}).format(new Date(value)):'Sin programar'}
function normalizePhone(value?:string){return (value||'').replace(/\D/g,'')}

export function CrmModule({client,profileId,demoMode}:CrmProps){
  const [organizationId,setOrganizationId]=useState<string>()
  const [opportunities,setOpportunities]=useState<Opportunity[]>(()=>mockCrmOpportunities.map((item,index)=>({...item,sourceId:demoSources[index%demoSources.length].id,...(index===0?{customerId:'demo-customer',siteId:'demo-site'}:{})})))
  const [activities,setActivities]=useState<CrmActivitySummary[]>(mockCrmActivities)
  const [sources,setSources]=useState<CrmSource[]>(demoSources)
  const [lossReasons,setLossReasons]=useState<LossReason[]>(demoLossReasons)
  const [customers,setCustomers]=useState<CustomerRow[]>(demoMode?demoCustomers:[])
  const [sites,setSites]=useState<SiteRow[]>(demoMode?demoSites:[])
  const [contacts,setContacts]=useState<ContactRow[]>(demoMode?demoContacts:[])
  const [selectedId,setSelectedId]=useState<string>(mockCrmOpportunities[0]?.id||'')
  const [view,setView]=useState<'opportunities'|'customers'|'quotations'>('opportunities')
  const [search,setSearch]=useState('')
  const [statusFilter,setStatusFilter]=useState<'all'|CrmLeadStatus>('all')
  const [showNew,setShowNew]=useState(false)
  const [showSiteOpportunity,setShowSiteOpportunity]=useState<{customer:CustomerRow;site:SiteRow}>()
  const [loading,setLoading]=useState(!demoMode)
  const [message,setMessage]=useState('')

  const refresh=useCallback(async()=>{
    if(!client||demoMode||!profileId)return
    setLoading(true);setMessage('')
    try{
      const membership=await client.from('organization_members').select('organization_id').eq('profile_id',profileId).eq('active',true).limit(1).single()
      if(membership.error)throw membership.error
      const org=membership.data.organization_id as string;setOrganizationId(org)
      const [sourceResult,lossResult,leadResult,activityResult,customerResult,siteResult,contactResult,profileResult]=await Promise.all([
        client.from('crm_sources').select('id,code,name').eq('organization_id',org).eq('active',true).order('sort_order'),
        client.from('crm_loss_reasons').select('id,code,name').eq('organization_id',org).eq('active',true).order('sort_order'),
        client.from('crm_leads').select('id,name,company,phone,email,need_summary,status,source_id,assigned_to,customer_id,site_id,lost_reason_id,lost_notes,created_at').eq('organization_id',org).is('archived_at',null).order('created_at',{ascending:false}),
        client.from('customer_activities').select('id,lead_id,activity_type,summary,due_at,completed_at').eq('organization_id',org).is('archived_at',null).order('due_at',{ascending:true}),
        client.from('customers').select('id,customer_code,legal_name,trade_name,person_type,tax_id').eq('organization_id',org).is('archived_at',null).order('legal_name'),
        client.from('customer_sites').select('id,customer_id,site_code,name,address').eq('organization_id',org).is('archived_at',null),
        client.from('customer_contacts').select('id,customer_id,site_id,name,position,phone,email,is_primary').eq('organization_id',org).is('archived_at',null),
        client.from('profiles').select('id,display_name'),
      ])
      const error=[sourceResult,lossResult,leadResult,activityResult,customerResult,siteResult,contactResult,profileResult].find(result=>result.error)?.error
      if(error)throw error
      const loadedSources=(sourceResult.data||[]) as CrmSource[];const sourceMap=new Map(loadedSources.map(item=>[item.id,item.name]))
      const profileMap=new Map(((profileResult.data||[]) as {id:string;display_name:string}[]).map(item=>[item.id,item.display_name]))
      const loadedActivities=((activityResult.data||[]) as {id:string;lead_id:string;activity_type:CrmActivityType;summary:string;due_at:string|null;completed_at:string|null}[]).map(row=>({id:row.id,leadId:row.lead_id,type:row.activity_type,summary:row.summary,dueAt:row.due_at||undefined,completedAt:row.completed_at||undefined}))
      const nextByLead=new Map<string,string>()
      for(const activity of loadedActivities){if(!activity.completedAt&&activity.dueAt&&!nextByLead.has(activity.leadId))nextByLead.set(activity.leadId,activity.dueAt)}
      const loadedOpportunities=((leadResult.data||[]) as {id:string;name:string;company:string|null;phone:string|null;email:string|null;need_summary:string;status:CrmLeadStatus;source_id:string;assigned_to:string|null;customer_id:string|null;site_id:string|null;lost_reason_id:string|null;lost_notes:string|null;created_at:string}[]).map(row=>({
        id:row.id,name:row.name,company:row.company||undefined,phone:row.phone||undefined,email:row.email||undefined,needSummary:row.need_summary,status:row.status,sourceId:row.source_id,sourceName:sourceMap.get(row.source_id)||'Sin origen',assignedTo:row.assigned_to||undefined,assignedName:row.assigned_to?profileMap.get(row.assigned_to):undefined,customerId:row.customer_id||undefined,siteId:row.site_id||undefined,lostReasonId:row.lost_reason_id||undefined,lostNotes:row.lost_notes||undefined,nextActivityAt:nextByLead.get(row.id),createdAt:row.created_at,
      }))
      setSources(loadedSources);setLossReasons((lossResult.data||[]) as LossReason[]);setOpportunities(loadedOpportunities);setActivities(loadedActivities);setCustomers((customerResult.data||[]) as CustomerRow[]);setSites((siteResult.data||[]) as SiteRow[]);setContacts((contactResult.data||[]) as ContactRow[])
      setSelectedId(current=>loadedOpportunities.some(item=>item.id===current)?current:loadedOpportunities[0]?.id||'')
    }catch(cause){setMessage(cause instanceof Error?cause.message:'No fue posible cargar el CRM')}finally{setLoading(false)}
  },[client,demoMode,profileId])

  useEffect(()=>{void refresh()},[refresh])

  const selected=opportunities.find(item=>item.id===selectedId)
  const selectedActivities=activities.filter(item=>item.leadId===selectedId)
  const filtered=useMemo(()=>{const term=search.trim().toLowerCase();return opportunities.filter(item=>(statusFilter==='all'||item.status===statusFilter)&&(!term||[item.name,item.company,item.phone,item.email,item.needSummary].filter(Boolean).some(value=>value!.toLowerCase().includes(term))))},[opportunities,search,statusFilter])
  const counts=useMemo(()=>({open:opportunities.filter(item=>!['won','lost'].includes(item.status)).length,unassigned:opportunities.filter(item=>!item.assignedTo).length,due:activities.filter(item=>!item.completedAt&&item.dueAt&&new Date(item.dueAt)<new Date()).length,won:opportunities.filter(item=>item.status==='won').length}),[opportunities,activities])

  async function createOpportunity(input:OpportunityInput){
    const duplicate=!input.siteId&&opportunities.find(item=>(input.email&&item.email?.toLowerCase()===input.email.toLowerCase())||(input.phone&&normalizePhone(item.phone)===normalizePhone(input.phone)))
    if(duplicate&&!input.duplicateReason)throw new Error(`Posible duplicado: ${duplicate.company||duplicate.name}. Indica el motivo para continuar.`)
    if(demoMode){const source=sources.find(item=>item.id===input.sourceId);const row:Opportunity={id:`demo-lead-${Date.now()}`,name:input.name,company:input.company||undefined,phone:input.phone||undefined,email:input.email||undefined,needSummary:input.needSummary,status:'new',sourceId:input.sourceId,sourceName:source?.name||'Manual',assignedTo:'demo-user',assignedName:'Gustavo',customerId:input.customerId,siteId:input.siteId,createdAt:new Date().toISOString()};setOpportunities(current=>[row,...current]);setSelectedId(row.id);setShowNew(false);return}
    if(!client||!organizationId||!profileId)throw new Error('No hay una organización activa')
    const result=await client.from('crm_leads').insert({organization_id:organizationId,name:input.name,company:input.company||null,phone:input.phone||null,email:input.email||null,need_summary:input.needSummary,source_id:input.sourceId,assigned_to:profileId,created_by:profileId,customer_id:input.customerId||null,site_id:input.siteId||null,duplicate_override_reason:input.duplicateReason||null}).select('id').single()
    if(result.error)throw result.error;setShowNew(false);await refresh();setSelectedId(result.data.id)
  }

  async function claim(){if(!selected)return;if(demoMode){setOpportunities(rows=>rows.map(row=>row.id===selected.id?{...row,assignedTo:'demo-user',assignedName:'Gustavo'}:row));return}const result=await client!.rpc('claim_crm_lead',{p_lead_id:selected.id});if(result.error)throw result.error;await refresh()}
  async function addActivity(input:{type:CrmActivityType;summary:string;dueAt:string}){if(!selected)return;const due=input.dueAt?new Date(input.dueAt).toISOString():null;if(demoMode){const row:CrmActivitySummary={id:`demo-activity-${Date.now()}`,leadId:selected.id,type:input.type,summary:input.summary,dueAt:due||undefined};setActivities(rows=>[...rows,row]);setOpportunities(rows=>rows.map(item=>item.id===selected.id?{...item,nextActivityAt:due||undefined}:item));return}if(!client||!organizationId||!profileId)throw new Error('No hay sesión activa');const result=await client.from('customer_activities').insert({organization_id:organizationId,lead_id:selected.id,customer_id:selected.customerId||null,site_id:selected.siteId||null,activity_type:input.type,summary:input.summary,due_at:due,assigned_to:profileId,created_by:profileId});if(result.error)throw result.error;await refresh()}
  async function completeActivity(id:string){if(demoMode){setActivities(rows=>rows.map(item=>item.id===id?{...item,completedAt:new Date().toISOString()}:item));return}const result=await client!.from('customer_activities').update({completed_at:new Date().toISOString()}).eq('id',id);if(result.error)throw result.error;await refresh()}
  async function transition(status:'contacted'|'qualified',lossReasonId?:string,lossNotes?:string){if(!selected)return;if(demoMode){setOpportunities(rows=>rows.map(item=>item.id===selected.id?{...item,status}:item));return}const result=await client!.rpc('transition_crm_lead',{p_lead_id:selected.id,p_status:status,p_loss_reason_id:lossReasonId||null,p_loss_notes:lossNotes||null});if(result.error)throw result.error;await refresh()}
  async function closeLost(reasonId:string,notes:string){if(!selected)return;if(demoMode){setOpportunities(rows=>rows.map(item=>item.id===selected.id?{...item,status:'lost',lostReasonId:reasonId,lostNotes:notes}:item));return}const result=await client!.rpc('transition_crm_lead',{p_lead_id:selected.id,p_status:'lost',p_loss_reason_id:reasonId,p_loss_notes:notes||null});if(result.error)throw result.error;await refresh()}
  async function cloneLost(){if(!selected)return;if(demoMode){const row={...selected,id:`demo-lead-${Date.now()}`,status:'new' as const,lostReasonId:undefined,lostNotes:undefined,createdAt:new Date().toISOString()};setOpportunities(rows=>[row,...rows]);setSelectedId(row.id);return}const result=await client!.rpc('clone_lost_crm_lead',{p_lead_id:selected.id});if(result.error)throw result.error;await refresh();setSelectedId(result.data.id)}
  async function convertCustomer(input:CustomerConversionInput){if(!selected)return;if(demoMode){const id=`demo-customer-${Date.now()}`;setCustomers(rows=>[...rows,{id,customer_code:`CLI-${String(rows.length+1).padStart(6,'0')}`,legal_name:input.legalName,trade_name:input.tradeName||null,person_type:input.personType,tax_id:input.taxId||null}]);setOpportunities(rows=>rows.map(row=>row.id===selected.id?{...row,customerId:id}:row));return}const result=await client!.rpc('create_crm_customer',{p_lead_id:selected.id,p_person_type:input.personType,p_legal_name:input.legalName,p_trade_name:input.tradeName||'',p_tax_id:input.taxId||'',p_contact_name:input.contactName,p_contact_position:input.contactPosition||'',p_contact_phone:input.contactPhone||'',p_contact_email:input.contactEmail||'',p_site_name:input.siteName,p_site_address:input.siteAddress});if(result.error)throw result.error;await refresh()}

  async function run(action:()=>Promise<void>){setMessage('');try{await action()}catch(cause){setMessage(cause instanceof Error?cause.message:'No fue posible completar la acción')}}

  return <>
    <div className="title crm-title"><div><p>Seguimiento comercial</p><h1>CRM ligero</h1></div><button className="primary" onClick={()=>setShowNew(true)}><Plus/>Nueva oportunidad</button></div>
    <div className="crm-tabs"><button className={view==='opportunities'?'active':''} onClick={()=>setView('opportunities')}>Oportunidades</button><button className={view==='customers'?'active':''} onClick={()=>setView('customers')}>Clientes y obras</button><button className={view==='quotations'?'active':''} onClick={()=>setView('quotations')}>Cotizaciones</button></div>
    {message&&<div className="demo-banner" role="alert">{message}</div>}{loading&&<div className="demo-banner">Cargando CRM…</div>}
    {view==='opportunities'?<>
      <div className="crm-kpis"><CrmKpi label="Abiertas" value={counts.open}/><CrmKpi label="Sin asignar" value={counts.unassigned}/><CrmKpi label="Seguimientos vencidos" value={counts.due}/><CrmKpi label="Ganadas" value={counts.won}/></div>
      <div className="crm-layout">
        <section className="panel crm-list"><div className="crm-toolbar"><Search/><input value={search} onChange={event=>setSearch(event.target.value)} placeholder="Buscar oportunidad"/><select value={statusFilter} onChange={event=>setStatusFilter(event.target.value as 'all'|CrmLeadStatus)}><option value="all">Todas las etapas</option>{Object.entries(crmLeadStatusLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></div>{filtered.length?filtered.map(item=><button key={item.id} className={selectedId===item.id?'selected':''} onClick={()=>setSelectedId(item.id)}><span className="avatar">{(item.company||item.name).slice(0,2).toUpperCase()}</span><span><b>{item.company||item.name}</b><small>{item.name} · {item.sourceName}</small></span><span className={`crm-status ${item.status}`}>{crmLeadStatusLabels[item.status]}</span><ChevronRight/></button>):<div className="crm-empty">No hay oportunidades con estos filtros.</div>}</section>
        <OpportunityDetail opportunity={selected} activities={selectedActivities} lossReasons={lossReasons} onClaim={()=>run(claim)} onAddActivity={input=>run(()=>addActivity(input))} onCompleteActivity={id=>run(()=>completeActivity(id))} onTransition={status=>run(()=>transition(status))} onCloseLost={(reason,notes)=>run(()=>closeLost(reason,notes))} onClone={()=>run(cloneLost)} onConvert={input=>run(()=>convertCustomer(input))}/>
      </div>
    </>:view==='customers'?<CustomerDirectory client={client} organizationId={organizationId} demoMode={demoMode} customers={customers} sites={sites} contacts={contacts} opportunities={opportunities} onNewOpportunity={(customer,site)=>setShowSiteOpportunity({customer,site})}/>:<QuotationsModule client={client} profileId={profileId} organizationId={organizationId} demoMode={demoMode} opportunities={opportunities} contacts={contacts} customers={customers} sites={sites}/>}
    {showNew&&<OpportunityForm sources={sources} onClose={()=>setShowNew(false)} onSubmit={input=>run(()=>createOpportunity(input))}/>}
    {showSiteOpportunity&&<SiteOpportunityForm customer={showSiteOpportunity.customer} site={showSiteOpportunity.site} contacts={contacts.filter(contact=>contact.customer_id===showSiteOpportunity.customer.id)} sources={sources} onClose={()=>setShowSiteOpportunity(undefined)} onSubmit={input=>run(async()=>{await createOpportunity(input);setShowSiteOpportunity(undefined)})}/>}
  </>
}

function CrmKpi({label,value}:{label:string;value:number}){return <article><small>{label}</small><b>{value.toString().padStart(2,'0')}</b></article>}

function OpportunityForm({sources,onClose,onSubmit}:{sources:CrmSource[];onClose:()=>void;onSubmit:(input:OpportunityInput)=>void}){
  const [duplicateReason,setDuplicateReason]=useState('')
  function submit(event:FormEvent<HTMLFormElement>){event.preventDefault();const data=new FormData(event.currentTarget);onSubmit({name:String(data.get('name')||'').trim(),company:String(data.get('company')||'').trim(),phone:String(data.get('phone')||'').trim(),email:String(data.get('email')||'').trim().toLowerCase(),needSummary:String(data.get('needSummary')||'').trim(),sourceId:String(data.get('sourceId')||''),duplicateReason:duplicateReason.trim()})}
  return <div className="crm-modal" role="dialog" aria-modal="true" aria-label="Nueva oportunidad"><form onSubmit={submit}><header><div><small>CRM</small><h2>Nueva oportunidad</h2></div><button type="button" onClick={onClose} aria-label="Cerrar"><X/></button></header><div className="crm-form-grid"><label>Contacto<input name="name" required minLength={2}/></label><label>Empresa<input name="company"/></label><label>Teléfono<input name="phone"/></label><label>Correo<input name="email" type="email"/></label><label>Origen<select name="sourceId" required defaultValue={sources.find(item=>item.code==='manual')?.id||sources[0]?.id}>{sources.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Motivo si existe duplicado<input value={duplicateReason} onChange={event=>setDuplicateReason(event.target.value)} placeholder="Sólo si el sistema lo solicita"/></label><label className="wide">Necesidad<textarea name="needSummary" required minLength={10} rows={4}/></label></div><footer><button type="button" onClick={onClose}>Cancelar</button><button className="primary">Crear oportunidad</button></footer></form></div>
}

function OpportunityDetail({opportunity,activities,lossReasons,onClaim,onAddActivity,onCompleteActivity,onTransition,onCloseLost,onClone,onConvert}:{opportunity?:Opportunity;activities:CrmActivitySummary[];lossReasons:LossReason[];onClaim:()=>void;onAddActivity:(input:{type:CrmActivityType;summary:string;dueAt:string})=>void;onCompleteActivity:(id:string)=>void;onTransition:(status:'contacted'|'qualified')=>void;onCloseLost:(reason:string,notes:string)=>void;onClone:()=>void;onConvert:(input:CustomerConversionInput)=>void}){
  const [activityOpen,setActivityOpen]=useState(false);const [conversionOpen,setConversionOpen]=useState(false);const [lossOpen,setLossOpen]=useState(false)
  if(!opportunity)return <section className="panel crm-detail crm-empty">Selecciona una oportunidad.</section>
  const hasFuture=activities.some(item=>!item.completedAt&&item.dueAt&&new Date(item.dueAt)>new Date())
  return <section className="panel crm-detail"><header><div><span className={`crm-status ${opportunity.status}`}>{crmLeadStatusLabels[opportunity.status]}</span><h2>{opportunity.company||opportunity.name}</h2><p>{opportunity.name} · {opportunity.phone||opportunity.email}</p></div>{!opportunity.assignedTo&&<button className="primary" onClick={onClaim}><UserCheck/>Tomar oportunidad</button>}</header><div className="crm-detail-body"><p className="crm-need">{opportunity.needSummary}</p><dl><div><dt>Responsable</dt><dd>{opportunity.assignedName||'Bandeja compartida'}</dd></div><div><dt>Próximo seguimiento</dt><dd>{formatDate(opportunity.nextActivityAt)}</dd></div><div><dt>Origen</dt><dd>{opportunity.sourceName}</dd></div><div><dt>Creada</dt><dd>{formatDate(opportunity.createdAt)}</dd></div></dl><div className="crm-actions">{opportunity.status==='new'&&<button onClick={()=>hasFuture?onTransition('contacted'):setActivityOpen(true)}>Registrar contacto</button>}{opportunity.status==='contacted'&&<button onClick={()=>onTransition('qualified')}>Calificar</button>}{!['won','lost'].includes(opportunity.status)&&<button onClick={()=>setLossOpen(true)}>Marcar perdida</button>}{opportunity.status==='lost'&&<button onClick={onClone}>Retomar como nueva</button>}{!opportunity.customerId&&!['won','lost'].includes(opportunity.status)&&<button onClick={()=>setConversionOpen(true)}>Crear cliente y obra</button>}<button onClick={()=>setActivityOpen(value=>!value)}><CalendarPlus/>Nueva actividad</button></div>{activityOpen&&<ActivityForm onSubmit={input=>{onAddActivity(input);setActivityOpen(false)}}/>}{lossOpen&&<LossForm reasons={lossReasons} onSubmit={(reason,notes)=>{onCloseLost(reason,notes);setLossOpen(false)}}/>}{conversionOpen&&<CustomerConversionForm opportunity={opportunity} onSubmit={input=>{onConvert(input);setConversionOpen(false)}}/>}<h3>Actividades</h3><div className="crm-activities">{activities.length?activities.map(item=><article key={item.id}><span>{crmActivityTypeLabels[item.type]}</span><div><b>{item.summary}</b><small>{item.completedAt?`Completada · ${formatDate(item.completedAt)}`:formatDate(item.dueAt)}</small></div>{!item.completedAt&&<button onClick={()=>onCompleteActivity(item.id)} aria-label="Completar actividad"><Check/></button>}</article>):<p>Sin actividades registradas.</p>}</div></div></section>
}

function ActivityForm({onSubmit}:{onSubmit:(input:{type:CrmActivityType;summary:string;dueAt:string})=>void}){function submit(event:FormEvent<HTMLFormElement>){event.preventDefault();const data=new FormData(event.currentTarget);onSubmit({type:String(data.get('type')) as CrmActivityType,summary:String(data.get('summary')||''),dueAt:String(data.get('dueAt')||'')})}return <form className="crm-inline-form" onSubmit={submit}><select name="type" defaultValue="call">{Object.entries(crmActivityTypeLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select><input name="summary" required placeholder="Resumen del seguimiento"/><input name="dueAt" type="datetime-local" required/><button className="primary">Guardar</button></form>}
function LossForm({reasons,onSubmit}:{reasons:LossReason[];onSubmit:(reason:string,notes:string)=>void}){function submit(event:FormEvent<HTMLFormElement>){event.preventDefault();const data=new FormData(event.currentTarget);onSubmit(String(data.get('reason')),String(data.get('notes')||''))}return <form className="crm-inline-form" onSubmit={submit}><select name="reason" required defaultValue=""><option value="" disabled>Motivo de pérdida</option>{reasons.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select><input name="notes" placeholder="Comentario"/><button className="primary">Cerrar oportunidad</button></form>}

interface CustomerConversionInput{personType:string;legalName:string;tradeName:string;taxId:string;contactName:string;contactPosition:string;contactPhone:string;contactEmail:string;siteName:string;siteAddress:string}
function CustomerConversionForm({opportunity,onSubmit}:{opportunity:Opportunity;onSubmit:(input:CustomerConversionInput)=>void}){function submit(event:FormEvent<HTMLFormElement>){event.preventDefault();const data=new FormData(event.currentTarget);onSubmit({personType:String(data.get('personType')),legalName:String(data.get('legalName')||''),tradeName:String(data.get('tradeName')||''),taxId:String(data.get('taxId')||''),contactName:String(data.get('contactName')||''),contactPosition:String(data.get('contactPosition')||''),contactPhone:String(data.get('contactPhone')||''),contactEmail:String(data.get('contactEmail')||''),siteName:String(data.get('siteName')||''),siteAddress:String(data.get('siteAddress')||'')})}return <form className="crm-conversion" onSubmit={submit}><h3>Crear cliente, contacto y obra</h3><div className="crm-form-grid"><label>Tipo<select name="personType" defaultValue="legal_entity"><option value="legal_entity">Persona moral</option><option value="individual">Persona física</option></select></label><label>Razón social o nombre<input name="legalName" required defaultValue={opportunity.company||opportunity.name}/></label><label>Nombre comercial<input name="tradeName" defaultValue={opportunity.company||''}/></label><label>RFC<input name="taxId"/></label><label>Contacto<input name="contactName" required defaultValue={opportunity.name}/></label><label>Puesto<input name="contactPosition"/></label><label>Teléfono<input name="contactPhone" defaultValue={opportunity.phone||''}/></label><label>Correo<input name="contactEmail" type="email" defaultValue={opportunity.email||''}/></label><label>Obra<input name="siteName" required/></label><label>Dirección<input name="siteAddress" required/></label></div><button className="primary">Crear registros</button></form>}

function CustomerDirectory({client,organizationId,demoMode,customers,sites,contacts,opportunities,onNewOpportunity}:{client:SupabaseClient|null;organizationId?:string;demoMode:boolean;customers:CustomerRow[];sites:SiteRow[];contacts:ContactRow[];opportunities:Opportunity[];onNewOpportunity:(customer:CustomerRow,site:SiteRow)=>void}){
  const [selectedSiteId,setSelectedSiteId]=useState('')
  useEffect(()=>{setSelectedSiteId(current=>sites.some(site=>site.id===current)?current:sites[0]?.id||'')},[sites])
  const selectedSite=sites.find(site=>site.id===selectedSiteId)
  const selectedCustomer=customers.find(customer=>customer.id===selectedSite?.customer_id)
  const siteContacts=contacts.filter(contact=>contact.customer_id===selectedCustomer?.id&&(contact.site_id===selectedSiteId||contact.site_id===null))
  const siteOpportunities=opportunities.filter(opportunity=>opportunity.siteId===selectedSiteId)
  return <div className="customer-workspace">
    <section className="panel customer-site-list"><header><div><h2>Clientes y obras</h2><p>Selecciona una obra para consultar su historial comercial.</p></div></header>{customers.length?customers.map(customer=>{const customerSites=sites.filter(site=>site.customer_id===customer.id);return <div className="customer-site-group" key={customer.id}><div className="customer-site-heading"><span className="avatar">{(customer.trade_name||customer.legal_name).slice(0,2).toUpperCase()}</span><div><h3>{customer.trade_name||customer.legal_name}</h3><p>{customer.customer_code} · {customerSites.length} {customerSites.length===1?'obra':'obras'}</p></div></div><div className="customer-sites">{customerSites.length?customerSites.map(site=><button key={site.id} className={selectedSiteId===site.id?'selected':''} onClick={()=>setSelectedSiteId(site.id)}><Building2/><span><b>{site.name}</b><small>{site.site_code} · {site.address||'Sin dirección'}</small></span><ChevronRight/></button>):<small>Sin obras registradas</small>}</div></div>}):<div className="crm-empty">Aún no hay clientes.</div>}</section>
    <section className="panel site-workspace">{selectedSite&&selectedCustomer?<><header><div><small>{selectedCustomer.trade_name||selectedCustomer.legal_name}</small><h2>{selectedSite.name}</h2><p>{selectedSite.site_code} · {selectedSite.address||'Sin dirección registrada'}</p></div><button className="primary" onClick={()=>onNewOpportunity(selectedCustomer,selectedSite)}><Plus/>Nueva oportunidad</button></header><div className="site-workspace-body"><div className="site-summary"><div><small>Contacto</small><b>{siteContacts.find(contact=>contact.is_primary)?.name||siteContacts[0]?.name||'Sin contacto'}</b></div><div><small>Oportunidades</small><b>{siteOpportunities.length}</b></div></div><SiteHistory client={client} organizationId={organizationId} siteId={selectedSite.id} demoMode={demoMode} opportunities={siteOpportunities}/></div></>:<div className="crm-empty">Selecciona una obra para consultar su información.</div>}</section>
  </div>
}

function SiteHistory({client,organizationId,siteId,demoMode,opportunities}:{client:SupabaseClient|null;organizationId?:string;siteId:string;demoMode:boolean;opportunities:Opportunity[]}){
  const [quotes,setQuotes]=useState<SiteQuote[]>([]);const [contracts,setContracts]=useState<SiteContract[]>([]);const [message,setMessage]=useState('');const [loading,setLoading]=useState(!demoMode)
  useEffect(()=>{if(!client||!organizationId||demoMode){setQuotes([]);setContracts([]);setLoading(false);return}let active=true;(async()=>{setLoading(true);setMessage('');const [quoteResult,contractResult]=await Promise.all([
    client.from('quotations').select('id,folio,status,total,created_at').eq('organization_id',organizationId).eq('site_id',siteId).order('created_at',{ascending:false}),
    client.from('contracts').select('id,folio,status,total,created_at').eq('organization_id',organizationId).eq('site_id',siteId).order('created_at',{ascending:false}),
  ]);const failure=quoteResult.error||contractResult.error;if(!active)return;if(failure)setMessage(failure.message);else{setQuotes((quoteResult.data||[]) as SiteQuote[]);setContracts((contractResult.data||[]) as SiteContract[])}setLoading(false)})();return()=>{active=false}},[client,organizationId,siteId,demoMode])
  const quoteLabels:Record<string,string>={draft:'Borrador',sent:'Enviada',accepted:'Aceptada',converted:'Convertida',rejected:'Rechazada',expired:'Vencida',cancelled:'Cancelada'}
  const contractLabels:Record<string,string>={draft:'Borrador',pending_authorization:'Pendiente',authorized:'Autorizado',active:'Activo',closed:'Cerrado',cancelled:'Cancelado'}
  const money=new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN'})
  return <>{message&&<div className="demo-banner" role="alert">{message}</div>}{loading&&<div className="site-loading">Cargando historial…</div>}<div className="site-history-grid">
    <section><h3><CircleUserRound/>Oportunidades</h3>{opportunities.length?opportunities.map(row=><article key={row.id}><div><b>{row.needSummary}</b><small>{row.name} · {formatDate(row.createdAt)}</small></div><span className={`crm-status ${row.status}`}>{crmLeadStatusLabels[row.status]}</span></article>):<p>Sin oportunidades para esta obra.</p>}</section>
    <section><h3><FileCheck2/>Cotizaciones</h3>{quotes.length?quotes.map(row=><article key={row.id}><div><b>{row.folio}</b><small>{new Date(row.created_at).toLocaleDateString('es-MX')} · {money.format(Number(row.total))}</small></div><span className={`quote-status ${row.status}`}>{quoteLabels[row.status]||row.status}</span></article>):<p>Sin cotizaciones para esta obra.</p>}</section>
    <section><h3><ScrollText/>Contratos</h3>{contracts.length?contracts.map(row=><article key={row.id}><div><b>{row.folio||'Contrato sin folio'}</b><small>{new Date(row.created_at).toLocaleDateString('es-MX')} · {money.format(Number(row.total))}</small></div><span className="badge">{contractLabels[row.status]||row.status}</span></article>):<p>Sin contratos para esta obra.</p>}</section>
  </div></>
}

function SiteOpportunityForm({customer,site,contacts,sources,onClose,onSubmit}:{customer:CustomerRow;site:SiteRow;contacts:ContactRow[];sources:CrmSource[];onClose:()=>void;onSubmit:(input:OpportunityInput)=>void}){
  const relevantContacts=contacts.filter(contact=>contact.site_id===site.id||contact.site_id===null)
  const preferred=relevantContacts.find(contact=>contact.site_id===site.id&&contact.is_primary)||relevantContacts.find(contact=>contact.is_primary)||relevantContacts[0]
  const [contactId,setContactId]=useState(preferred?.id||'')
  function submit(event:FormEvent<HTMLFormElement>){event.preventDefault();const data=new FormData(event.currentTarget);const contact=relevantContacts.find(item=>item.id===contactId);onSubmit({name:contact?.name||String(data.get('contactName')||'').trim(),company:customer.trade_name||customer.legal_name,phone:contact?.phone||String(data.get('phone')||'').trim(),email:contact?.email||String(data.get('email')||'').trim().toLowerCase(),needSummary:String(data.get('needSummary')||'').trim(),sourceId:String(data.get('sourceId')||''),duplicateReason:'Nueva oportunidad para obra existente',customerId:customer.id,siteId:site.id})}
  return <div className="crm-modal" role="dialog" aria-modal="true" aria-label="Nueva oportunidad para obra"><form onSubmit={submit}><header><div><small>{customer.trade_name||customer.legal_name} · {site.site_code}</small><h2>Nueva oportunidad en {site.name}</h2></div><button type="button" onClick={onClose} aria-label="Cerrar"><X/></button></header><div className="crm-form-grid">{relevantContacts.length?<label>Contacto<select value={contactId} onChange={event=>setContactId(event.target.value)} required>{relevantContacts.map(contact=><option key={contact.id} value={contact.id}>{contact.name}{contact.position?` · ${contact.position}`:''}</option>)}</select></label>:<><label>Contacto<input name="contactName" required minLength={2}/></label><label>Teléfono<input name="phone"/></label><label>Correo<input name="email" type="email"/></label></>}<label>Origen<select name="sourceId" required defaultValue={sources.find(source=>source.code==='repeat_customer')?.id||sources.find(source=>source.code==='manual')?.id||sources[0]?.id}>{sources.map(source=><option key={source.id} value={source.id}>{source.name}</option>)}</select></label><label className="wide">Necesidad o nuevo frente<textarea name="needSummary" required minLength={10} rows={4} placeholder="Describe el equipo, frente o necesidad adicional"/></label></div><footer><button type="button" onClick={onClose}>Cancelar</button><button className="primary"><Plus/>Crear oportunidad</button></footer></form></div>
}

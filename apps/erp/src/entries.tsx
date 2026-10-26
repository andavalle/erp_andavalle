import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { CheckCircle2, ChevronRight, FilePenLine, PackageOpen, Plus, Send, Truck, X, XCircle } from 'lucide-react'

type RequestStatus='draft'|'submitted'|'authorized'|'partially_fulfilled'|'completed'|'cancelled'
interface ContractRow{id:string;folio:string;customer_id:string;site_id:string;contract_type:'rental'|'sale';status:string}
interface ContractLine{id:string;contract_id:string;product_id:string;sku_snapshot:string|null;description_snapshot:string|null}
interface CustodyRow{contract_id:string;contract_line_id:string;product_id:string;delivered:number;returned:number;in_custody:number}
interface RequestRow{id:string;contract_id:string;folio:string;status:RequestStatus;requested_at:string;requested_by:string;authorized_at:string|null;notes:string|null}
interface RequestLine{id:string;request_id:string;contract_line_id:string|null;quantity:number}
interface LogisticsRow{request_id:string;scheduled_for:string|null;vehicle:string|null;operator_name:string|null}
interface CustomerRow{id:string;legal_name:string;trade_name:string|null}
interface SiteRow{id:string;name:string}

const labels:Record<RequestStatus,string>={draft:'Borrador',submitted:'Enviada',authorized:'Autorizada',partially_fulfilled:'Parcialmente recibida',completed:'Completada',cancelled:'Cancelada'}

export function EntriesModule({client,profileId,demoMode,onShowSs,onCreateHe}:{client:SupabaseClient|null;profileId?:string;demoMode:boolean;onShowSs:()=>void;onCreateHe?:(requestId:string)=>void}){
  const [roles,setRoles]=useState<string[]>(demoMode?['admin']:[])
  const [contracts,setContracts]=useState<ContractRow[]>([])
  const [contractLines,setContractLines]=useState<ContractLine[]>([])
  const [custody,setCustody]=useState<CustodyRow[]>([])
  const [requests,setRequests]=useState<RequestRow[]>([])
  const [requestLines,setRequestLines]=useState<RequestLine[]>([])
  const [logistics,setLogistics]=useState<LogisticsRow[]>([])
  const [customers,setCustomers]=useState<CustomerRow[]>([])
  const [sites,setSites]=useState<SiteRow[]>([])
  const [selectedId,setSelectedId]=useState('')
  const [search,setSearch]=useState('')
  const [message,setMessage]=useState('')
  const [loading,setLoading]=useState(!demoMode)
  const [dialog,setDialog]=useState<'create'|'edit'|'cancel'|null>(null)

  const refresh=useCallback(async()=>{
    if(!client||!profileId||demoMode)return
    setLoading(true);setMessage('')
    try{
      const membership=await client.from('organization_members').select('organization_id').eq('profile_id',profileId).eq('active',true).limit(1).single();if(membership.error)throw membership.error
      const org=membership.data.organization_id as string
      const results=await Promise.all([
        client.from('contracts').select('id,folio,customer_id,site_id,contract_type,status').eq('organization_id',org).eq('contract_type','rental').order('created_at',{ascending:false}),
        client.from('contract_lines').select('id,contract_id,product_id,sku_snapshot,description_snapshot').eq('organization_id',org),
        client.from('contract_line_custody').select('contract_id,contract_line_id,product_id,delivered,returned,in_custody').eq('organization_id',org),
        client.from('operation_requests').select('id,contract_id,folio,status,requested_at,requested_by,authorized_at,notes').eq('organization_id',org).eq('request_type','SE').order('requested_at',{ascending:false}),
        client.from('operation_request_lines').select('id,request_id,contract_line_id,quantity').eq('organization_id',org),
        client.from('logistics_assignments').select('request_id,scheduled_for,vehicle,operator_name').eq('organization_id',org),
        client.from('customers').select('id,legal_name,trade_name').eq('organization_id',org),
        client.from('customer_sites').select('id,name').eq('organization_id',org),
        client.from('organization_member_roles').select('role_code').eq('organization_id',org).eq('profile_id',profileId),
      ])
      const failure=results.find(result=>result.error)?.error;if(failure)throw failure
      const loaded=(results[3].data||[]) as RequestRow[]
      setContracts((results[0].data||[]) as ContractRow[]);setContractLines((results[1].data||[]) as ContractLine[]);setCustody((results[2].data||[]) as CustodyRow[]);setRequests(loaded);setRequestLines((results[4].data||[]) as RequestLine[]);setLogistics((results[5].data||[]) as LogisticsRow[]);setCustomers((results[6].data||[]) as CustomerRow[]);setSites((results[7].data||[]) as SiteRow[]);setRoles((results[8].data||[]).map(row=>row.role_code));setSelectedId(current=>loaded.some(request=>request.id===current)?current:loaded[0]?.id||'')
    }catch(cause){setMessage(cause instanceof Error?cause.message:'No fue posible cargar las Solicitudes de Entrada')}finally{setLoading(false)}
  },[client,profileId,demoMode])
  useEffect(()=>{void refresh()},[refresh])
  const selected=requests.find(request=>request.id===selectedId)
  const selectedContract=contracts.find(contract=>contract.id===selected?.contract_id)
  const selectedLines=requestLines.filter(line=>line.request_id===selectedId)
  const canCreate=roles.some(role=>['admin','commercial'].includes(role));const canAuthorize=roles.some(role=>['admin','warehouse'].includes(role));const canLogistics=roles.some(role=>['admin','logistics'].includes(role))
  const customerName=(id?:string)=>{const row=customers.find(customer=>customer.id===id);return row?.trade_name||row?.legal_name||'Cliente'}
  const siteName=(id?:string)=>sites.find(site=>site.id===id)?.name||'Obra'
  const filtered=useMemo(()=>{const term=search.trim().toLowerCase();return requests.filter(request=>{const contract=contracts.find(row=>row.id===request.contract_id);return !term||[request.folio,contract?.folio||'',customerName(contract?.customer_id),siteName(contract?.site_id),labels[request.status]].some(value=>value.toLowerCase().includes(term))})},[requests,contracts,customers,sites,search])
  const allocated=(lineId:string,exclude?:string)=>requestLines.filter(line=>line.contract_line_id===lineId&&line.request_id!==exclude&&requests.some(request=>request.id===line.request_id&&!['cancelled','completed'].includes(request.status))).reduce((sum,line)=>sum+Number(line.quantity),0)
  async function run(action:()=>Promise<void>){setMessage('');try{await action()}catch(cause){setMessage(cause instanceof Error?cause.message:'No fue posible completar la acción')}}
  async function save(input:EntryInput,requestId?:string){if(demoMode){setDialog(null);return}const params={p_notes:input.notes||null,p_lines:input.lines,p_scheduled_for:input.scheduledFor?new Date(input.scheduledFor).toISOString():null,p_vehicle:input.vehicle||null,p_operator_name:input.operatorName||null};const result=requestId?await client!.rpc('update_se_request_draft',{p_request_id:requestId,...params}):await client!.rpc('create_se_request',{p_contract_id:input.contractId,...params});if(result.error)throw result.error;setSelectedId(result.data.id);setDialog(null);await refresh()}
  async function submit(){if(!selected)return;const result=await client!.rpc('submit_request',{p_request_id:selected.id});if(result.error)throw result.error;await refresh()}
  async function authorize(){if(!selected)return;const result=await client!.rpc('authorize_request',{p_request_id:selected.id});if(result.error)throw result.error;await refresh()}
  async function cancel(reason:string){if(!selected)return;const result=await client!.rpc('cancel_request',{p_request_id:selected.id,p_reason:reason});if(result.error)throw result.error;setDialog(null);await refresh()}

  return <>
    <div className="title request-title"><div><p>Devoluciones y recolecciones</p><h1>Solicitudes de Entrada</h1></div>{canCreate&&<button className="primary" onClick={()=>setDialog('create')}><Plus/>Nueva SE</button>}</div>
    <div className="crm-tabs"><button onClick={onShowSs}>Salidas SS</button><button className="active">Entradas SE</button></div>
    <div className="info"><PackageOpen/><div><b>Programación sin movimiento</b><p>La SE aparta el saldo a devolver; la clasificación y el movimiento físico ocurrirán en la Hoja de Entrada.</p></div></div>
    {message&&<div className="demo-banner" role="alert">{message}</div>}{loading&&<div className="demo-banner">Cargando solicitudes…</div>}
    <div className="request-workspace"><section className="panel ss-list"><div className="ss-search"><input value={search} onChange={event=>setSearch(event.target.value)} placeholder="Buscar SE, contrato, cliente u obra"/></div>{filtered.length?filtered.map(request=>{const contract=contracts.find(row=>row.id===request.contract_id);return <button key={request.id} className={selectedId===request.id?'selected':''} onClick={()=>setSelectedId(request.id)}><span className="ss-icon entry"><PackageOpen/></span><span><b>{request.folio}</b><small>{contract?.folio} · {customerName(contract?.customer_id)} · {siteName(contract?.site_id)}</small></span><span className={`request-status ${request.status}`}>{labels[request.status]}</span><ChevronRight/></button>}):<div className="crm-empty">Aún no hay Solicitudes de Entrada.</div>}</section><section className="panel ss-detail">{selected&&selectedContract?<><header><div><span className={`request-status ${selected.status}`}>{labels[selected.status]}</span><h2>{selected.folio}</h2><p>{selectedContract.folio} · {customerName(selectedContract.customer_id)} · {siteName(selectedContract.site_id)}</p></div><PackageOpen/></header><div className="ss-body"><dl><div><dt>Solicitada</dt><dd>{new Date(selected.requested_at).toLocaleString('es-MX')}</dd></div><div><dt>Autorizada</dt><dd>{selected.authorized_at?new Date(selected.authorized_at).toLocaleString('es-MX'):'Pendiente'}</dd></div><div><dt>Recolección</dt><dd>{logistics.find(row=>row.request_id===selected.id)?.scheduled_for?new Date(logistics.find(row=>row.request_id===selected.id)!.scheduled_for!).toLocaleString('es-MX'):'Sin programar'}</dd></div></dl><div className="ss-lines">{selectedLines.map(line=>{const source=contractLines.find(row=>row.id===line.contract_line_id);return <article key={line.id}><div><b>{source?.sku_snapshot||line.contract_line_id}</b><small>{source?.description_snapshot||'Equipo'}</small></div><strong>{Number(line.quantity).toLocaleString('es-MX')} pzas.</strong><div><small>Programadas para devolución</small></div></article>})}</div>{selected.notes&&<div className="contract-notes"><b>Notas</b><p>{selected.notes}</p></div>}<div className="ss-actions">{selected.status==='draft'&&<button onClick={()=>setDialog('edit')}><FilePenLine/>Editar borrador</button>}{selected.status==='draft'&&<button className="primary" onClick={()=>run(submit)}><Send/>Enviar solicitud</button>}{selected.status==='submitted'&&canAuthorize&&<button className="primary" onClick={()=>run(authorize)}><CheckCircle2/>Autorizar SE</button>}{['authorized','partially_fulfilled'].includes(selected.status)&&canAuthorize&&<button className="primary" onClick={()=>onCreateHe?.(selected.id)}><PackageOpen/>Crear HE</button>}{!['completed','cancelled'].includes(selected.status)&&<button className="danger" onClick={()=>setDialog('cancel')}><XCircle/>Cancelar</button>}</div>{['authorized','partially_fulfilled'].includes(selected.status)&&<div className="info"><CheckCircle2/><div><b>{selected.status==='authorized'?'Recolección autorizada':'Recepción parcial'}</b><p>La solicitud está lista para generar una Hoja de Entrada.</p></div></div>}</div></>:<div className="crm-empty">Selecciona una solicitud.</div>}</section></div>
    {dialog==='create'&&<EntryForm title="Nueva Solicitud de Entrada" contracts={contracts.filter(contract=>contract.status==='active'&&custody.some(row=>row.contract_id===contract.id&&Number(row.in_custody)>0))} contractLines={contractLines} custody={custody} requestLines={requestLines} requests={requests} canLogistics={canLogistics} allocated={allocated} onClose={()=>setDialog(null)} onSubmit={input=>run(()=>save(input))}/>}
    {dialog==='edit'&&selected&&<EntryForm title={`Editar ${selected.folio}`} contracts={contracts.filter(contract=>contract.id===selected.contract_id)} contractLines={contractLines} custody={custody} requestLines={requestLines} requests={requests} request={selected} assignment={logistics.find(row=>row.request_id===selected.id)} canLogistics={canLogistics} allocated={allocated} onClose={()=>setDialog(null)} onSubmit={input=>run(()=>save(input,selected.id))}/>}
    {dialog==='cancel'&&<ReasonDialog onClose={()=>setDialog(null)} onSubmit={reason=>run(()=>cancel(reason))}/>}
  </>
}

interface EntryInput{contractId:string;notes:string;scheduledFor:string;vehicle:string;operatorName:string;lines:Array<{contract_line_id:string;quantity:number}>}
function EntryForm({title,contracts,contractLines,custody,requestLines,request,assignment,canLogistics,allocated,onClose,onSubmit}:{title:string;contracts:ContractRow[];contractLines:ContractLine[];custody:CustodyRow[];requestLines:RequestLine[];requests:RequestRow[];request?:RequestRow;assignment?:LogisticsRow;canLogistics:boolean;allocated:(lineId:string,exclude?:string)=>number;onClose:()=>void;onSubmit:(input:EntryInput)=>void}){
  const [contractId,setContractId]=useState(request?.contract_id||contracts[0]?.id||'')
  const [quantities,setQuantities]=useState<Record<string,string>>(request?Object.fromEntries(requestLines.filter(line=>line.request_id===request.id).map(line=>[line.contract_line_id||'',String(line.quantity)])): {})
  const lines=contractLines.filter(line=>line.contract_id===contractId&&Number(custody.find(row=>row.contract_line_id===line.id)?.in_custody||0)>0)
  const dateValue=assignment?.scheduled_for?new Date(new Date(assignment.scheduled_for).getTime()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,16):''
  function submit(event:FormEvent<HTMLFormElement>){event.preventDefault();const data=new FormData(event.currentTarget);onSubmit({contractId,notes:String(data.get('notes')||''),scheduledFor:String(data.get('scheduledFor')||''),vehicle:String(data.get('vehicle')||''),operatorName:String(data.get('operatorName')||''),lines:lines.map(line=>({contract_line_id:line.id,quantity:Number(quantities[line.id]||0)})).filter(line=>line.quantity>0)})}
  return <div className="crm-modal" role="dialog" aria-modal="true" aria-label={title}><form className="ss-form" onSubmit={submit}><header><div><small>Saldo físico en obra</small><h2>{title}</h2></div><button type="button" onClick={onClose} aria-label="Cerrar"><X/></button></header><div className="crm-form-grid"><label className="wide">Contrato activo<select value={contractId} disabled={Boolean(request)} onChange={event=>{setContractId(event.target.value);setQuantities({})}} required><option value="" disabled>Selecciona un contrato</option>{contracts.map(contract=><option key={contract.id} value={contract.id}>{contract.folio}</option>)}</select></label><label className="wide">Notas<textarea name="notes" rows={3} defaultValue={request?.notes||''}/></label></div><div className="ss-line-editor"><h3>Equipo a devolver</h3>{lines.map(line=>{const inCustody=Number(custody.find(row=>row.contract_line_id===line.id)?.in_custody||0);const available=Math.max(0,inCustody-allocated(line.id,request?.id));return <label key={line.id}><span><b>{line.sku_snapshot||line.product_id}</b><small>{line.description_snapshot||'Equipo'} · En obra: {inCustody.toLocaleString('es-MX')} · Disponible para SE: {available.toLocaleString('es-MX')}</small></span><input type="number" min="0" max={available} step="0.001" value={quantities[line.id]||''} onChange={event=>setQuantities(values=>({...values,[line.id]:event.target.value}))} placeholder="0"/></label>})}</div>{canLogistics&&<div className="ss-logistics-form"><h3>Programación de recolección</h3><div className="crm-form-grid"><label>Fecha y hora<input name="scheduledFor" type="datetime-local" defaultValue={dateValue}/></label><label>Vehículo<input name="vehicle" defaultValue={assignment?.vehicle||''}/></label><label className="wide">Operador<input name="operatorName" defaultValue={assignment?.operator_name||''}/></label></div></div>}<footer><button type="button" onClick={onClose}>Cancelar</button><button className="primary" disabled={!contractId||!lines.length}>Guardar borrador</button></footer></form></div>
}

function ReasonDialog({onClose,onSubmit}:{onClose:()=>void;onSubmit:(reason:string)=>void}){function submit(event:FormEvent<HTMLFormElement>){event.preventDefault();onSubmit(String(new FormData(event.currentTarget).get('reason')||'').trim())}return <div className="crm-modal" role="dialog" aria-modal="true" aria-label="Cancelar Solicitud de Entrada"><form className="contract-reason" onSubmit={submit}><header><div><small>Solicitud de Entrada</small><h2>Cancelar solicitud</h2></div><button type="button" onClick={onClose} aria-label="Cerrar"><X/></button></header><div className="crm-form-grid"><label className="wide">Motivo<textarea name="reason" rows={4} minLength={10} required/></label></div><footer><button type="button" onClick={onClose}>Volver</button><button className="danger">Cancelar solicitud</button></footer></form></div>}

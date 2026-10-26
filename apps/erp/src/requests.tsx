import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { CalendarClock, CheckCircle2, ChevronRight, ClipboardCheck, FilePenLine, PackageCheck, Plus, Send, Truck, X, XCircle } from 'lucide-react'
import { EntriesModule } from './entries'

type RequestStatus='draft'|'submitted'|'authorized'|'partially_fulfilled'|'completed'|'cancelled'
interface ContractRow{id:string;folio:string;contract_type:'rental'|'sale';customer_id:string;site_id:string;status:string}
interface ContractLine{id:string;contract_id:string;line_no:number;product_id:string;quantity:number;sku_snapshot:string|null;description_snapshot:string|null}
interface RequestRow{id:string;organization_id:string;contract_id:string;request_type:'SS'|'SE';folio:string;status:RequestStatus;requested_at:string;requested_by:string;authorized_by:string|null;authorized_at:string|null;notes:string|null}
interface RequestLine{id:string;request_id:string;contract_line_id:string|null;line_no:number;product_id:string;quantity:number}
interface ReservationRow{request_line_id:string;location_id:string;quantity:number;consumed_quantity:number;released_at:string|null}
interface LogisticsRow{request_id:string;status:string;scheduled_for:string|null;vehicle:string|null;operator_name:string|null;notes:string|null}
interface CustomerRow{id:string;legal_name:string;trade_name:string|null}
interface SiteRow{id:string;name:string}
interface LocationRow{id:string;name:string;code:string}

const statusLabels:Record<RequestStatus,string>={draft:'Borrador',submitted:'Enviada',authorized:'Autorizada',partially_fulfilled:'Parcialmente surtida',completed:'Completada',cancelled:'Cancelada'}
const demoContract:ContractRow={id:'demo-contract',folio:'CTR-R-2026-000001',contract_type:'rental',customer_id:'demo-customer',site_id:'demo-site',status:'authorized'}
const demoContractLines:ContractLine[]=[{id:'demo-contract-line',contract_id:'demo-contract',line_no:1,product_id:'demo-product',quantity:100,sku_snapshot:'MAR-156-200',description_snapshot:'Marco de 156 × 200 cm'}]
const demoRequest:RequestRow={id:'demo-request',organization_id:'demo-org',contract_id:'demo-contract',request_type:'SS',folio:'SS-2026-000001',status:'authorized',requested_at:new Date().toISOString(),requested_by:'demo-user',authorized_by:'demo-user',authorized_at:new Date().toISOString(),notes:'Primera entrega a obra'}
const demoRequestLine:RequestLine={id:'demo-request-line',request_id:'demo-request',contract_line_id:'demo-contract-line',line_no:1,product_id:'demo-product',quantity:40}

export function RequestsModule({client,profileId,demoMode,initialContractId,onInitialContractConsumed,onCreateHs,onCreateHe}:{client:SupabaseClient|null;profileId?:string;demoMode:boolean;initialContractId?:string;onInitialContractConsumed?:()=>void;onCreateHs?:(requestId:string)=>void;onCreateHe?:(requestId:string)=>void}){
  const [organizationId,setOrganizationId]=useState<string>()
  const [roles,setRoles]=useState<string[]>(demoMode?['admin']:[])
  const [contracts,setContracts]=useState<ContractRow[]>(demoMode?[demoContract]:[])
  const [contractLines,setContractLines]=useState<ContractLine[]>(demoMode?demoContractLines:[])
  const [requests,setRequests]=useState<RequestRow[]>(demoMode?[demoRequest]:[])
  const [requestLines,setRequestLines]=useState<RequestLine[]>(demoMode?[demoRequestLine]:[])
  const [reservations,setReservations]=useState<ReservationRow[]>(demoMode?[{request_line_id:'demo-request-line',location_id:'demo-location',quantity:40,consumed_quantity:0,released_at:null}]:[])
  const [logistics,setLogistics]=useState<LogisticsRow[]>(demoMode?[{request_id:'demo-request',status:'planned',scheduled_for:null,vehicle:null,operator_name:null,notes:null}]:[])
  const [customers,setCustomers]=useState<CustomerRow[]>(demoMode?[{id:'demo-customer',legal_name:'Constructora Valle Alto, S.A. de C.V.',trade_name:'Valle Alto'}]:[])
  const [sites,setSites]=useState<SiteRow[]>(demoMode?[{id:'demo-site',name:'Nave Norte'}]:[])
  const [locations,setLocations]=useState<LocationRow[]>(demoMode?[{id:'demo-location',name:'Almacén principal',code:'ALM-01'}]:[])
  const [selectedId,setSelectedId]=useState(demoMode?demoRequest.id:'')
  const [search,setSearch]=useState('')
  const [loading,setLoading]=useState(!demoMode)
  const [message,setMessage]=useState('')
  const [dialog,setDialog]=useState<'create'|'edit'|'cancel'|null>(null)
  const [section,setSection]=useState<'SS'|'SE'>('SS')

  const refresh=useCallback(async()=>{
    if(!client||!profileId||demoMode)return
    setLoading(true);setMessage('')
    try{
      const membership=await client.from('organization_members').select('organization_id').eq('profile_id',profileId).eq('active',true).limit(1).single()
      if(membership.error)throw membership.error
      const org=membership.data.organization_id as string;setOrganizationId(org)
      const [contractResult,contractLineResult,requestResult,requestLineResult,reservationResult,logisticsResult,customerResult,siteResult,locationResult,roleResult]=await Promise.all([
        client.from('contracts').select('id,folio,contract_type,customer_id,site_id,status').eq('organization_id',org).order('created_at',{ascending:false}),
        client.from('contract_lines').select('id,contract_id,line_no,product_id,quantity,sku_snapshot,description_snapshot').eq('organization_id',org).order('line_no'),
        client.from('operation_requests').select('id,organization_id,contract_id,request_type,folio,status,requested_at,requested_by,authorized_by,authorized_at,notes').eq('organization_id',org).eq('request_type','SS').order('requested_at',{ascending:false}),
        client.from('operation_request_lines').select('id,request_id,contract_line_id,line_no,product_id,quantity').eq('organization_id',org).order('line_no'),
        client.from('stock_reservations').select('request_line_id,location_id,quantity,consumed_quantity,released_at').eq('organization_id',org),
        client.from('logistics_assignments').select('request_id,status,scheduled_for,vehicle,operator_name,notes').eq('organization_id',org),
        client.from('customers').select('id,legal_name,trade_name').eq('organization_id',org),
        client.from('customer_sites').select('id,name').eq('organization_id',org),
        client.from('inventory_locations').select('id,name,code').eq('organization_id',org),
        client.from('organization_member_roles').select('role_code').eq('organization_id',org).eq('profile_id',profileId),
      ])
      const failure=[contractResult,contractLineResult,requestResult,requestLineResult,reservationResult,logisticsResult,customerResult,siteResult,locationResult,roleResult].find(result=>result.error)?.error
      if(failure)throw failure
      const loaded=(requestResult.data||[]) as RequestRow[]
      setContracts((contractResult.data||[]) as ContractRow[]);setContractLines((contractLineResult.data||[]) as ContractLine[]);setRequests(loaded);setRequestLines((requestLineResult.data||[]) as RequestLine[]);setReservations((reservationResult.data||[]) as ReservationRow[]);setLogistics((logisticsResult.data||[]) as LogisticsRow[]);setCustomers((customerResult.data||[]) as CustomerRow[]);setSites((siteResult.data||[]) as SiteRow[]);setLocations((locationResult.data||[]) as LocationRow[]);setRoles((roleResult.data||[]).map(row=>row.role_code))
      setSelectedId(current=>loaded.some(request=>request.id===current)?current:loaded[0]?.id||'')
    }catch(cause){setMessage(cause instanceof Error?cause.message:'No fue posible cargar las solicitudes')}finally{setLoading(false)}
  },[client,profileId,demoMode])
  useEffect(()=>{void refresh()},[refresh])
  useEffect(()=>{if(initialContractId){setDialog('create');onInitialContractConsumed?.()}},[initialContractId,onInitialContractConsumed])

  const selected=requests.find(request=>request.id===selectedId)
  const selectedContract=contracts.find(contract=>contract.id===selected?.contract_id)
  const selectedLines=requestLines.filter(line=>line.request_id===selectedId)
  const canCreate=roles.some(role=>['admin','commercial'].includes(role))
  const canAuthorize=roles.some(role=>['admin','warehouse'].includes(role))
  const canLogistics=roles.some(role=>['admin','logistics'].includes(role))
  const customerName=(id?:string)=>{const row=customers.find(customer=>customer.id===id);return row?.trade_name||row?.legal_name||'Cliente'}
  const siteName=(id?:string)=>sites.find(site=>site.id===id)?.name||'Obra'
  const lineName=(line:RequestLine)=>{const source=contractLines.find(item=>item.id===line.contract_line_id);return{sku:source?.sku_snapshot||line.product_id,description:source?.description_snapshot||'Equipo'}}
  const filtered=useMemo(()=>{const term=search.trim().toLowerCase();return requests.filter(request=>{const contract=contracts.find(item=>item.id===request.contract_id);return !term||[request.folio,contract?.folio||'',customerName(contract?.customer_id),siteName(contract?.site_id),statusLabels[request.status]].some(value=>value.toLowerCase().includes(term))})},[requests,contracts,customers,sites,search])
  const usedQuantity=(contractLineId:string,excludeRequestId?:string)=>requestLines.filter(line=>line.contract_line_id===contractLineId&&line.request_id!==excludeRequestId&&requests.some(request=>request.id===line.request_id&&request.status!=='cancelled')).reduce((sum,line)=>sum+Number(line.quantity),0)

  async function run(action:()=>Promise<void>){setMessage('');try{await action()}catch(cause){setMessage(cause instanceof Error?cause.message:'No fue posible completar la acción')}}
  async function save(input:RequestInput,requestId?:string){
    if(demoMode){setDialog(null);return}
    const params={p_notes:input.notes||null,p_lines:input.lines,p_scheduled_for:input.scheduledFor?new Date(input.scheduledFor).toISOString():null,p_vehicle:input.vehicle||null,p_operator_name:input.operatorName||null}
    const result=requestId?await client!.rpc('update_ss_request_draft',{p_request_id:requestId,...params}):await client!.rpc('create_ss_request',{p_contract_id:input.contractId,...params})
    if(result.error)throw result.error
    setSelectedId(result.data.id);setDialog(null);await refresh()
  }
  async function submit(){if(!selected)return;if(demoMode){setRequests(rows=>rows.map(row=>row.id===selected.id?{...row,status:'submitted'}:row));return}const result=await client!.rpc('submit_request',{p_request_id:selected.id});if(result.error)throw result.error;await refresh()}
  async function authorize(){if(!selected)return;if(demoMode){setRequests(rows=>rows.map(row=>row.id===selected.id?{...row,status:'authorized'}:row));return}const result=await client!.rpc('authorize_request',{p_request_id:selected.id});if(result.error)throw result.error;await refresh()}
  async function cancel(reason:string){if(!selected)return;if(demoMode){setRequests(rows=>rows.map(row=>row.id===selected.id?{...row,status:'cancelled'}:row));setDialog(null);return}const result=await client!.rpc('cancel_request',{p_request_id:selected.id,p_reason:reason});if(result.error)throw result.error;setDialog(null);await refresh()}

  if(section==='SE')return <EntriesModule client={client} profileId={profileId} demoMode={demoMode} onShowSs={()=>setSection('SS')} onCreateHe={onCreateHe}/>
  return <>
    <div className="title request-title"><div><p>Reservas y logística</p><h1>Solicitudes de salida</h1></div>{canCreate&&<button className="primary" onClick={()=>setDialog('create')}><Plus/>Nueva SS</button>}</div>
    <div className="crm-tabs"><button className="active">Salidas SS</button><button onClick={()=>setSection('SE')}>Entradas SE</button></div>
    <div className="info"><ClipboardCheck/><div><b>Reserva sin mover inventario</b><p>La SS autorizada aparta existencia; el movimiento físico ocurrirá al confirmar la Hoja de Salida.</p></div></div>
    {message&&<div className="demo-banner" role="alert">{message}</div>}{loading&&<div className="demo-banner">Cargando solicitudes…</div>}
    <div className="request-workspace">
      <section className="panel ss-list"><div className="ss-search"><input value={search} onChange={event=>setSearch(event.target.value)} placeholder="Buscar SS, contrato, cliente u obra"/></div>{filtered.length?filtered.map(request=>{const contract=contracts.find(item=>item.id===request.contract_id);return <button key={request.id} className={selectedId===request.id?'selected':''} onClick={()=>setSelectedId(request.id)}><span className="ss-icon"><Truck/></span><span><b>{request.folio}</b><small>{contract?.folio} · {customerName(contract?.customer_id)} · {siteName(contract?.site_id)}</small></span><span className={`request-status ${request.status}`}>{statusLabels[request.status]}</span><ChevronRight/></button>}):<div className="crm-empty">Aún no hay Solicitudes de Salida.</div>}</section>
      <section className="panel ss-detail">{selected&&selectedContract?<><header><div><span className={`request-status ${selected.status}`}>{statusLabels[selected.status]}</span><h2>{selected.folio}</h2><p>{selectedContract.folio} · {customerName(selectedContract.customer_id)} · {siteName(selectedContract.site_id)}</p></div><Truck/></header><div className="ss-body"><dl><div><dt>Solicitada</dt><dd>{new Date(selected.requested_at).toLocaleString('es-MX')}</dd></div><div><dt>Autorizada</dt><dd>{selected.authorized_at?new Date(selected.authorized_at).toLocaleString('es-MX'):'Pendiente'}</dd></div><div><dt>Entrega</dt><dd>{logistics.find(row=>row.request_id===selected.id)?.scheduled_for?new Date(logistics.find(row=>row.request_id===selected.id)!.scheduled_for!).toLocaleString('es-MX'):'Sin programar'}</dd></div></dl><div className="ss-lines">{selectedLines.map(line=>{const name=lineName(line);const lineReservations=reservations.filter(row=>row.request_line_id===line.id&&!row.released_at);return <article key={line.id}><div><b>{name.sku}</b><small>{name.description}</small></div><strong>{Number(line.quantity).toLocaleString('es-MX')} pzas.</strong><div>{lineReservations.map(row=><small key={row.location_id}>{locations.find(location=>location.id===row.location_id)?.name||'Almacén'}: {Number(row.quantity-row.consumed_quantity).toLocaleString('es-MX')} reservadas</small>)}</div></article>})}</div>{selected.notes&&<div className="contract-notes"><b>Notas</b><p>{selected.notes}</p></div>}<Logistics assignment={logistics.find(row=>row.request_id===selected.id)}/><div className="ss-actions">{selected.status==='draft'&&<button onClick={()=>setDialog('edit')}><FilePenLine/>Editar borrador</button>}{selected.status==='draft'&&<button className="primary" onClick={()=>run(submit)}><Send/>Enviar solicitud</button>}{selected.status==='submitted'&&canAuthorize&&<button className="primary" onClick={()=>run(authorize)}><PackageCheck/>Autorizar y reservar</button>}{['authorized','partially_fulfilled'].includes(selected.status)&&onCreateHs&&<button className="primary" onClick={()=>onCreateHs(selected.id)}><Truck/>Crear HS</button>}{!['completed','cancelled'].includes(selected.status)&&<button className="danger" onClick={()=>setDialog('cancel')}><XCircle/>Cancelar</button>}</div>{['authorized','partially_fulfilled'].includes(selected.status)&&<div className="info"><CheckCircle2/><div><b>Existencia reservada</b><p>La solicitud está lista para generar una Hoja de Salida.</p></div></div>}</div></>:<div className="crm-empty">Selecciona una solicitud.</div>}</section>
    </div>
    {dialog==='create'&&<RequestForm title="Nueva Solicitud de Salida" contracts={contracts.filter(contract=>['authorized','active'].includes(contract.status))} contractLines={contractLines} requests={requests} requestLines={requestLines} initialContractId={initialContractId} canLogistics={canLogistics} usedQuantity={usedQuantity} onClose={()=>setDialog(null)} onSubmit={input=>run(()=>save(input))}/>}
    {dialog==='edit'&&selected&&<RequestForm title={`Editar ${selected.folio}`} contracts={contracts.filter(contract=>contract.id===selected.contract_id)} contractLines={contractLines} requests={requests} requestLines={requestLines} request={selected} assignment={logistics.find(row=>row.request_id===selected.id)} canLogistics={canLogistics} usedQuantity={usedQuantity} onClose={()=>setDialog(null)} onSubmit={input=>run(()=>save(input,selected.id))}/>}
    {dialog==='cancel'&&<ReasonDialog onClose={()=>setDialog(null)} onSubmit={reason=>run(()=>cancel(reason))}/>}
  </>
}

interface RequestInput{contractId:string;notes:string;scheduledFor:string;vehicle:string;operatorName:string;lines:Array<{contract_line_id:string;quantity:number}>}
function RequestForm({title,contracts,contractLines,requests,requestLines,request,assignment,initialContractId,canLogistics,usedQuantity,onClose,onSubmit}:{title:string;contracts:ContractRow[];contractLines:ContractLine[];requests:RequestRow[];requestLines:RequestLine[];request?:RequestRow;assignment?:LogisticsRow;initialContractId?:string;canLogistics:boolean;usedQuantity:(lineId:string,excludeRequestId?:string)=>number;onClose:()=>void;onSubmit:(input:RequestInput)=>void}){
  const firstContract=contracts.find(row=>row.id===(request?.contract_id||initialContractId))||contracts[0]
  const [contractId,setContractId]=useState(firstContract?.id||'')
  const initialLines=request?Object.fromEntries(requestLines.filter(line=>line.request_id===request.id).map(line=>[line.contract_line_id||'',String(line.quantity)])):{}
  const [quantities,setQuantities]=useState<Record<string,string>>(initialLines)
  const availableLines=contractLines.filter(line=>line.contract_id===contractId)
  const dateValue=assignment?.scheduled_for?new Date(new Date(assignment.scheduled_for).getTime()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,16):''
  function submit(event:FormEvent<HTMLFormElement>){event.preventDefault();const data=new FormData(event.currentTarget);const lines=availableLines.map(line=>({contract_line_id:line.id,quantity:Number(quantities[line.id]||0)})).filter(line=>line.quantity>0);onSubmit({contractId,notes:String(data.get('notes')||''),scheduledFor:String(data.get('scheduledFor')||''),vehicle:String(data.get('vehicle')||''),operatorName:String(data.get('operatorName')||''),lines})}
  return <div className="crm-modal" role="dialog" aria-modal="true" aria-label={title}><form className="ss-form" onSubmit={submit}><header><div><small>Reserva de inventario</small><h2>{title}</h2></div><button type="button" onClick={onClose} aria-label="Cerrar"><X/></button></header><div className="crm-form-grid"><label className="wide">Contrato autorizado<select value={contractId} disabled={Boolean(request)} onChange={event=>{setContractId(event.target.value);setQuantities({})}} required><option value="" disabled>Selecciona un contrato</option>{contracts.map(contract=><option key={contract.id} value={contract.id}>{contract.folio} · {contract.contract_type==='rental'?'Renta':'Venta'}</option>)}</select></label><label className="wide">Notas<textarea name="notes" rows={3} defaultValue={request?.notes||''}/></label></div><div className="ss-line-editor"><h3>Equipo solicitado</h3>{availableLines.length?availableLines.map(line=>{const remaining=Math.max(0,Number(line.quantity)-usedQuantity(line.id,request?.id));return <label key={line.id}><span><b>{line.sku_snapshot||line.product_id}</b><small>{line.description_snapshot||'Equipo'} · Contrato: {Number(line.quantity).toLocaleString('es-MX')} · Pendiente: {remaining.toLocaleString('es-MX')}</small></span><input type="number" min="0" max={remaining} step="0.001" value={quantities[line.id]||''} onChange={event=>setQuantities(values=>({...values,[line.id]:event.target.value}))} placeholder="0"/></label>}):<p>Este contrato no tiene partidas disponibles.</p>}</div>{canLogistics&&<div className="ss-logistics-form"><h3>Programación opcional</h3><div className="crm-form-grid"><label>Fecha y hora<input name="scheduledFor" type="datetime-local" defaultValue={dateValue}/></label><label>Vehículo<input name="vehicle" defaultValue={assignment?.vehicle||''}/></label><label className="wide">Operador<input name="operatorName" defaultValue={assignment?.operator_name||''}/></label></div></div>}<footer><button type="button" onClick={onClose}>Cancelar</button><button className="primary" disabled={!contractId||availableLines.length===0}>Guardar borrador</button></footer></form></div>
}

function Logistics({assignment}:{assignment?:LogisticsRow}){return <div className="ss-logistics"><Truck/><div><b>Logística</b><p>{assignment?[assignment.scheduled_for&&new Date(assignment.scheduled_for).toLocaleString('es-MX'),assignment.vehicle,assignment.operator_name].filter(Boolean).join(' · ')||'Pendiente de asignar':'Pendiente de asignar'}</p></div></div>}
function ReasonDialog({onClose,onSubmit}:{onClose:()=>void;onSubmit:(reason:string)=>void}){function submit(event:FormEvent<HTMLFormElement>){event.preventDefault();onSubmit(String(new FormData(event.currentTarget).get('reason')||'').trim())}return <div className="crm-modal" role="dialog" aria-modal="true" aria-label="Cancelar solicitud"><form className="contract-reason" onSubmit={submit}><header><div><small>Solicitud de Salida</small><h2>Cancelar solicitud</h2></div><button type="button" onClick={onClose} aria-label="Cerrar"><X/></button></header><div className="crm-form-grid"><label className="wide">Motivo de cancelación<textarea name="reason" rows={4} minLength={10} required/></label></div><footer><button type="button" onClick={onClose}>Volver</button><button className="danger">Cancelar solicitud</button></footer></form></div>}

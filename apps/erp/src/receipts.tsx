import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { Camera, CheckCircle2, ChevronRight, FilePenLine, FileText, PackageOpen, Plus, RotateCcw, X, XCircle } from 'lucide-react'

type DocumentStatus='draft'|'confirmed'|'reversed'|'cancelled'
type Condition='available'|'inspection'|'maintenance'|'damaged'|'writeoff'
interface DocumentRow{id:string;organization_id:string;request_id:string;folio:string;status:DocumentStatus;receiver_name:string|null;confirmed_at:string|null;reversal_reason:string|null;created_at:string}
interface DocumentLine{id:string;document_id:string;request_line_id:string;product_id:string;to_location_id:string|null;quantity:number}
interface RequestRow{id:string;contract_id:string;folio:string;status:string}
interface RequestLine{id:string;request_id:string;contract_line_id:string|null;quantity:number}
interface ContractRow{id:string;folio:string;customer_id:string;site_id:string}
interface ContractLine{id:string;sku_snapshot:string|null;description_snapshot:string|null}
interface CustomerRow{id:string;legal_name:string;trade_name:string|null}
interface SiteRow{id:string;name:string}
interface LocationRow{id:string;name:string;code:string;location_type:Condition|'customer'|'sold'}
interface FileRow{id:string;document_id:string;storage_path:string;file_kind:'signature'|'photo'|'pdf';created_at:string}
interface Classification{available:string;inspection:string;maintenance:string;damaged:string;writeoff:string}

const emptyClassification=():Classification=>({available:'',inspection:'',maintenance:'',damaged:'',writeoff:''})
const statusLabels:Record<DocumentStatus,string>={draft:'Borrador',confirmed:'Confirmada',reversed:'Revertida',cancelled:'Cancelada'}
const conditionLabels:Record<Condition,string>={available:'Disponible',inspection:'Inspección',maintenance:'Mantenimiento',damaged:'Dañado',writeoff:'Baja'}

export function ReceiptsModule({client,profileId,demoMode,initialRequestId,onInitialRequestConsumed,onShowHs}:{client:SupabaseClient|null;profileId?:string;demoMode:boolean;initialRequestId?:string;onInitialRequestConsumed?:()=>void;onShowHs:()=>void}){
  const [organizationId,setOrganizationId]=useState(demoMode?'demo-org':'')
  const [roles,setRoles]=useState<string[]>(demoMode?['admin','warehouse']:[])
  const [documents,setDocuments]=useState<DocumentRow[]>([])
  const [documentLines,setDocumentLines]=useState<DocumentLine[]>([])
  const [requests,setRequests]=useState<RequestRow[]>([])
  const [requestLines,setRequestLines]=useState<RequestLine[]>([])
  const [contracts,setContracts]=useState<ContractRow[]>([])
  const [contractLines,setContractLines]=useState<ContractLine[]>([])
  const [customers,setCustomers]=useState<CustomerRow[]>([])
  const [sites,setSites]=useState<SiteRow[]>([])
  const [locations,setLocations]=useState<LocationRow[]>([])
  const [files,setFiles]=useState<FileRow[]>([])
  const [selectedId,setSelectedId]=useState('')
  const [search,setSearch]=useState('')
  const [message,setMessage]=useState('')
  const [loading,setLoading]=useState(!demoMode)
  const [dialog,setDialog]=useState<'create'|'edit'|'reverse'|'cancel'|null>(null)

  const refresh=useCallback(async()=>{
    if(!client||!profileId||demoMode)return
    setLoading(true);setMessage('')
    try{
      const membership=await client.from('organization_members').select('organization_id').eq('profile_id',profileId).eq('active',true).limit(1).single();if(membership.error)throw membership.error
      const org=membership.data.organization_id as string;setOrganizationId(org)
      const results=await Promise.all([
        client.from('inventory_documents').select('id,organization_id,request_id,folio,status,receiver_name,confirmed_at,reversal_reason,created_at').eq('organization_id',org).eq('document_type','HE').order('created_at',{ascending:false}),
        client.from('inventory_document_lines').select('id,document_id,request_line_id,product_id,to_location_id,quantity').eq('organization_id',org),
        client.from('operation_requests').select('id,contract_id,folio,status').eq('organization_id',org).eq('request_type','SE'),
        client.from('operation_request_lines').select('id,request_id,contract_line_id,quantity').eq('organization_id',org),
        client.from('contracts').select('id,folio,customer_id,site_id').eq('organization_id',org),
        client.from('contract_lines').select('id,sku_snapshot,description_snapshot').eq('organization_id',org),
        client.from('customers').select('id,legal_name,trade_name').eq('organization_id',org),
        client.from('customer_sites').select('id,name').eq('organization_id',org),
        client.from('inventory_locations').select('id,name,code,location_type').eq('organization_id',org),
        client.from('document_files').select('id,document_id,storage_path,file_kind,created_at').eq('organization_id',org),
        client.from('organization_member_roles').select('role_code').eq('organization_id',org).eq('profile_id',profileId),
      ])
      const failure=results.find(result=>result.error)?.error;if(failure)throw failure
      const loaded=(results[0].data||[]) as DocumentRow[]
      setDocuments(loaded);setDocumentLines((results[1].data||[]) as DocumentLine[]);setRequests((results[2].data||[]) as RequestRow[]);setRequestLines((results[3].data||[]) as RequestLine[]);setContracts((results[4].data||[]) as ContractRow[]);setContractLines((results[5].data||[]) as ContractLine[]);setCustomers((results[6].data||[]) as CustomerRow[]);setSites((results[7].data||[]) as SiteRow[]);setLocations((results[8].data||[]) as LocationRow[]);setFiles((results[9].data||[]) as FileRow[]);setRoles((results[10].data||[]).map(row=>row.role_code));setSelectedId(current=>loaded.some(document=>document.id===current)?current:loaded[0]?.id||'')
    }catch(cause){setMessage(cause instanceof Error?cause.message:'No fue posible cargar las Hojas de Entrada')}finally{setLoading(false)}
  },[client,profileId,demoMode])
  useEffect(()=>{void refresh()},[refresh])
  useEffect(()=>{if(initialRequestId){setDialog('create');onInitialRequestConsumed?.()}},[initialRequestId,onInitialRequestConsumed])

  const selected=documents.find(document=>document.id===selectedId)
  const selectedRequest=requests.find(request=>request.id===selected?.request_id)
  const selectedContract=contracts.find(contract=>contract.id===selectedRequest?.contract_id)
  const selectedLines=documentLines.filter(line=>line.document_id===selectedId)
  const selectedFiles=files.filter(file=>file.document_id===selectedId)
  const canOperate=roles.some(role=>['admin','warehouse'].includes(role));const isAdmin=roles.includes('admin')
  const customerName=(id?:string)=>{const row=customers.find(customer=>customer.id===id);return row?.trade_name||row?.legal_name||'Cliente'}
  const siteName=(id?:string)=>sites.find(site=>site.id===id)?.name||'Obra'
  const lineName=(requestLineId:string)=>{const requestLine=requestLines.find(line=>line.id===requestLineId);const contractLine=contractLines.find(line=>line.id===requestLine?.contract_line_id);return{sku:contractLine?.sku_snapshot||'SKU sin código',description:contractLine?.description_snapshot||'Equipo'}}
  const condition=(locationId:string|null)=>locations.find(location=>location.id===locationId)?.location_type as Condition|undefined
  const confirmedQuantity=(requestLineId:string)=>documentLines.filter(line=>line.request_line_id===requestLineId&&documents.some(document=>document.id===line.document_id&&document.status==='confirmed')).reduce((sum,line)=>sum+Number(line.quantity),0)
  const filtered=useMemo(()=>{const term=search.trim().toLowerCase();return documents.filter(document=>{const request=requests.find(row=>row.id===document.request_id);const contract=contracts.find(row=>row.id===request?.contract_id);return !term||[document.folio,request?.folio||'',contract?.folio||'',customerName(contract?.customer_id),statusLabels[document.status]].some(value=>value.toLowerCase().includes(term))})},[documents,requests,contracts,customers,search])
  async function run(action:()=>Promise<void>){setMessage('');try{await action()}catch(cause){setMessage(cause instanceof Error?cause.message:'No fue posible completar la acción')}}
  async function save(input:{requestId:string;receiver:string;lines:Array<{request_line_id:string}&Record<Condition,number>>},documentId?:string){if(demoMode){setDialog(null);return}const result=documentId?await client!.rpc('update_he_document_draft',{p_document_id:documentId,p_receiver_name:input.receiver,p_lines:input.lines}):await client!.rpc('create_he_document',{p_request_id:input.requestId,p_receiver_name:input.receiver,p_lines:input.lines});if(result.error)throw result.error;setSelectedId(result.data.id);setDialog(null);await refresh()}
  async function confirm(){if(!selected)return;const result=await client!.rpc('confirm_inventory_document',{p_document_id:selected.id});if(result.error)throw result.error;await refresh()}
  async function reasonAction(reason:string,kind:'reverse'|'cancel'){if(!selected)return;const result=await client!.rpc(kind==='reverse'?'reverse_inventory_document':'cancel_inventory_document',{p_document_id:selected.id,p_reason:reason});if(result.error)throw result.error;setDialog(null);await refresh()}
  async function upload(event:ChangeEvent<HTMLInputElement>,kind:'photo'|'pdf'){const file=event.target.files?.[0];if(!file||!selected||!client)return;event.target.value='';const safe=file.name.normalize('NFKD').replace(/[^a-zA-Z0-9._-]/g,'-');const path=`${organizationId}/documents/${selected.id}/${crypto.randomUUID()}-${safe}`;const stored=await client.storage.from('erp-documents').upload(path,file,{contentType:file.type,upsert:false});if(stored.error){setMessage(stored.error.message);return}const metadata=await client.from('document_files').insert({organization_id:organizationId,document_id:selected.id,storage_path:path,file_kind:kind,content_type:file.type||'application/octet-stream',created_by:profileId});if(metadata.error){await client.storage.from('erp-documents').remove([path]);setMessage(metadata.error.message);return}await refresh()}
  async function openFile(path:string){if(!client)return;const result=await client.storage.from('erp-documents').createSignedUrl(path,60);if(result.error)throw result.error;window.open(result.data.signedUrl,'_blank','noopener,noreferrer')}
  const needsPhoto=selectedLines.some(line=>['damaged','writeoff'].includes(condition(line.to_location_id)||''))

  return <>
    <div className="title document-title"><div><p>Recepción y clasificación</p><h1>Hojas de Entrada</h1></div>{canOperate&&<button className="primary" onClick={()=>setDialog('create')}><Plus/>Nueva HE</button>}</div>
    <div className="crm-tabs"><button onClick={onShowHs}>Salidas HS</button><button className="active">Entradas HE</button></div>
    <div className="info"><PackageOpen/><div><b>Clasificación física</b><p>Cada pieza recibida se clasifica. Sólo la cantidad disponible vuelve a poder reservarse.</p></div></div>
    {message&&<div className="demo-banner" role="alert">{message}</div>}{loading&&<div className="demo-banner">Cargando documentos…</div>}
    <div className="document-workspace"><section className="panel document-list"><div className="document-search"><input value={search} onChange={event=>setSearch(event.target.value)} placeholder="Buscar HE, SE, contrato o cliente"/></div>{filtered.length?filtered.map(document=>{const request=requests.find(row=>row.id===document.request_id);return <button key={document.id} className={selectedId===document.id?'selected':''} onClick={()=>setSelectedId(document.id)}><span><b>{document.folio}</b><small>{request?.folio}</small></span><span className={`document-status ${document.status}`}>{statusLabels[document.status]}</span><ChevronRight/></button>}):<div className="crm-empty">Aún no hay Hojas de Entrada.</div>}</section><section className="panel document-detail">{selected&&selectedRequest&&selectedContract?<><header><div><span className={`document-status ${selected.status}`}>{statusLabels[selected.status]}</span><h2>{selected.folio}</h2><p>{selectedRequest.folio} · {selectedContract.folio} · {customerName(selectedContract.customer_id)} · {siteName(selectedContract.site_id)}</p></div><PackageOpen/></header><div className="document-body"><dl><div><dt>Recibido por</dt><dd>{selected.receiver_name||'Pendiente'}</dd></div><div><dt>Confirmación</dt><dd>{selected.confirmed_at?new Date(selected.confirmed_at).toLocaleString('es-MX'):'Pendiente'}</dd></div></dl><div className="document-lines">{selectedLines.map(line=>{const name=lineName(line.request_line_id);const target=condition(line.to_location_id);return <article key={line.id}><div><b>{name.sku}</b><small>{name.description}</small></div><strong>{Number(line.quantity).toLocaleString('es-MX')} pzas.</strong><span className={`condition-badge ${target}`}>{target?conditionLabels[target]:'Sin clasificar'}</span></article>})}</div><section className="document-files"><h3>Evidencias privadas</h3>{selected.status==='draft'&&<div className="document-uploads"><label><Camera/>Fotografía<input type="file" accept="image/png,image/jpeg,image/webp" onChange={event=>void upload(event,'photo')}/></label><label><FileText/>PDF<input type="file" accept="application/pdf" onChange={event=>void upload(event,'pdf')}/></label></div>}<div className="document-file-list">{selectedFiles.map(file=><button key={file.id} onClick={()=>run(()=>openFile(file.storage_path))}>{file.file_kind==='photo'?<Camera/>:<FileText/>}{file.file_kind==='photo'?'Fotografía':'PDF'} · {new Date(file.created_at).toLocaleString('es-MX')}</button>)}{!selectedFiles.length&&<p>Sin archivos adjuntos.</p>}</div>{needsPhoto&&selected.status==='draft'&&<small>Daño o baja requieren al menos una fotografía antes de confirmar.</small>}</section><div className="document-actions">{selected.status==='draft'&&<button onClick={()=>setDialog('edit')}><FilePenLine/>Editar</button>}{selected.status==='draft'&&<button className="primary" disabled={needsPhoto&&!selectedFiles.some(file=>file.file_kind==='photo')} onClick={()=>run(confirm)}><CheckCircle2/>Confirmar entrada</button>}{selected.status==='confirmed'&&isAdmin&&<button onClick={()=>setDialog('reverse')}><RotateCcw/>Revertir</button>}{selected.status==='draft'&&<button className="danger" onClick={()=>setDialog('cancel')}><XCircle/>Cancelar</button>}</div>{selected.status==='confirmed'&&<div className="info"><CheckCircle2/><div><b>Recepción confirmada</b><p>El saldo salió de custodia y quedó clasificado en inventario.</p></div></div>}</div></>:<div className="crm-empty">Selecciona una Hoja de Entrada.</div>}</section></div>
    {dialog==='create'&&<HeForm title="Nueva Hoja de Entrada" requests={requests.filter(request=>['authorized','partially_fulfilled'].includes(request.status))} requestLines={requestLines} contractLines={contractLines} documents={documents} documentLines={documentLines} locations={locations} initialRequestId={initialRequestId} confirmedQuantity={confirmedQuantity} onClose={()=>setDialog(null)} onSubmit={input=>run(()=>save(input))}/>}
    {dialog==='edit'&&selected&&<HeForm title={`Editar ${selected.folio}`} requests={requests.filter(request=>request.id===selected.request_id)} requestLines={requestLines} contractLines={contractLines} documents={documents} documentLines={documentLines} locations={locations} document={selected} confirmedQuantity={confirmedQuantity} onClose={()=>setDialog(null)} onSubmit={input=>run(()=>save(input,selected.id))}/>}
    {(dialog==='reverse'||dialog==='cancel')&&<ReasonDialog title={dialog==='reverse'?'Revertir Hoja de Entrada':'Cancelar Hoja de Entrada'} confirm={dialog==='reverse'?'Revertir movimiento':'Cancelar documento'} onClose={()=>setDialog(null)} onSubmit={reason=>run(()=>reasonAction(reason,dialog))}/>}
  </>
}

function HeForm({title,requests,requestLines,contractLines,documentLines,locations,document,initialRequestId,confirmedQuantity,onClose,onSubmit}:{title:string;requests:RequestRow[];requestLines:RequestLine[];contractLines:ContractLine[];documents:DocumentRow[];documentLines:DocumentLine[];locations:LocationRow[];document?:DocumentRow;initialRequestId?:string;confirmedQuantity:(requestLineId:string)=>number;onClose:()=>void;onSubmit:(input:{requestId:string;receiver:string;lines:Array<{request_line_id:string}&Record<Condition,number>>})=>void}){
  const first=requests.find(row=>row.id===(document?.request_id||initialRequestId))||requests[0]
  const [requestId,setRequestId]=useState(first?.id||'')
  const initial:Record<string,Classification>={}
  if(document)documentLines.filter(line=>line.document_id===document.id).forEach(line=>{const target=locations.find(location=>location.id===line.to_location_id)?.location_type as Condition|undefined;if(!target||!conditionLabels[target])return;initial[line.request_line_id]??=emptyClassification();initial[line.request_line_id][target]=String(Number(initial[line.request_line_id][target]||0)+Number(line.quantity))})
  const [quantities,setQuantities]=useState<Record<string,Classification>>(initial)
  const lines=requestLines.filter(line=>line.request_id===requestId)
  const total=(values?:Classification)=>values?Object.values(values).reduce((sum,value)=>sum+Number(value||0),0):0
  function submit(event:FormEvent<HTMLFormElement>){event.preventDefault();const data=new FormData(event.currentTarget);onSubmit({requestId,receiver:String(data.get('receiver')||''),lines:lines.map(line=>({request_line_id:line.id,available:Number(quantities[line.id]?.available||0),inspection:Number(quantities[line.id]?.inspection||0),maintenance:Number(quantities[line.id]?.maintenance||0),damaged:Number(quantities[line.id]?.damaged||0),writeoff:Number(quantities[line.id]?.writeoff||0)})).filter(line=>line.available+line.inspection+line.maintenance+line.damaged+line.writeoff>0)})}
  return <div className="crm-modal" role="dialog" aria-modal="true" aria-label={title}><form className="document-form he-form" onSubmit={submit}><header><div><small>Recepción desde custodia</small><h2>{title}</h2></div><button type="button" onClick={onClose} aria-label="Cerrar"><X/></button></header><div className="crm-form-grid"><label className="wide">Solicitud autorizada<select value={requestId} disabled={Boolean(document)} onChange={event=>{setRequestId(event.target.value);setQuantities({})}} required><option value="" disabled>Selecciona una SE</option>{requests.map(request=><option key={request.id} value={request.id}>{request.folio}</option>)}</select></label><label className="wide">Recibido por<input name="receiver" minLength={3} required defaultValue={document?.receiver_name||''}/></label></div><div className="he-line-editor"><div className="he-grid he-head"><span>Partida</span>{Object.values(conditionLabels).map(label=><span key={label}>{label}</span>)}</div>{lines.map(line=>{const source=contractLines.find(contractLine=>contractLine.id===line.contract_line_id);const remaining=Math.max(0,Number(line.quantity)-confirmedQuantity(line.id));const values=quantities[line.id]||emptyClassification();return <div className="he-grid" key={line.id}><span><b>{source?.sku_snapshot||'SKU sin código'}</b><small>{source?.description_snapshot||'Equipo'}<br/>Pendiente: {remaining.toLocaleString('es-MX')} · Clasificado: {total(values).toLocaleString('es-MX')}</small></span>{(Object.keys(conditionLabels) as Condition[]).map(key=><label key={key}><span>{conditionLabels[key]}</span><input type="number" min="0" max={remaining} step="0.001" value={values[key]} onChange={event=>setQuantities(current=>({...current,[line.id]:{...(current[line.id]||emptyClassification()),[key]:event.target.value}}))} placeholder="0"/></label>)}</div>})}</div><footer><button type="button" onClick={onClose}>Cancelar</button><button className="primary" disabled={!requestId||!lines.length}>Guardar borrador</button></footer></form></div>
}

function ReasonDialog({title,confirm,onClose,onSubmit}:{title:string;confirm:string;onClose:()=>void;onSubmit:(reason:string)=>void}){function submit(event:FormEvent<HTMLFormElement>){event.preventDefault();onSubmit(String(new FormData(event.currentTarget).get('reason')||'').trim())}return <div className="crm-modal" role="dialog" aria-modal="true" aria-label={title}><form className="contract-reason" onSubmit={submit}><header><div><small>Documento de inventario</small><h2>{title}</h2></div><button type="button" onClick={onClose} aria-label="Cerrar"><X/></button></header><div className="crm-form-grid"><label className="wide">Motivo<textarea name="reason" rows={4} minLength={10} required/></label></div><footer><button type="button" onClick={onClose}>Volver</button><button className="danger">{confirm}</button></footer></form></div>}

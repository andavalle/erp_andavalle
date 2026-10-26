import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { Camera, CheckCircle2, ChevronRight, FilePenLine, FileSignature, FileText, PackageCheck, Plus, RotateCcw, Truck, Upload, X, XCircle } from 'lucide-react'
import { ReceiptsModule } from './receipts'

type DocumentStatus='draft'|'confirmed'|'reversed'|'cancelled'
interface DocumentRow{id:string;organization_id:string;request_id:string;document_type:'HS'|'HE';folio:string;status:DocumentStatus;receiver_name:string|null;confirmed_at:string|null;reversed_at:string|null;reversal_reason:string|null;created_at:string}
interface DocumentLine{id:string;document_id:string;request_line_id:string;line_no:number;product_id:string;from_location_id:string|null;to_location_id:string|null;quantity:number}
interface RequestRow{id:string;contract_id:string;folio:string;request_type:'SS'|'SE';status:string}
interface RequestLine{id:string;request_id:string;contract_line_id:string|null;product_id:string;quantity:number}
interface ContractRow{id:string;folio:string;customer_id:string;site_id:string;contract_type:'rental'|'sale'}
interface ContractLine{id:string;sku_snapshot:string|null;description_snapshot:string|null}
interface FileRow{id:string;document_id:string;storage_path:string;file_kind:'signature'|'photo'|'pdf';content_type:string;created_at:string}
interface CustomerRow{id:string;legal_name:string;trade_name:string|null}
interface SiteRow{id:string;name:string}
interface LocationRow{id:string;name:string;code:string}

const statusLabels:Record<DocumentStatus,string>={draft:'Borrador',confirmed:'Confirmada',reversed:'Revertida',cancelled:'Cancelada'}
const fileLabels={signature:'Firma',photo:'Fotografía',pdf:'PDF'}

export function DocumentsModule({client,profileId,demoMode,initialRequestId,onInitialRequestConsumed,initialHeRequestId,onInitialHeRequestConsumed}:{client:SupabaseClient|null;profileId?:string;demoMode:boolean;initialRequestId?:string;onInitialRequestConsumed?:()=>void;initialHeRequestId?:string;onInitialHeRequestConsumed?:()=>void}){
  const [section,setSection]=useState<'HS'|'HE'>(initialHeRequestId?'HE':'HS')
  const [organizationId,setOrganizationId]=useState(demoMode?'demo-org':'')
  const [roles,setRoles]=useState<string[]>(demoMode?['admin','warehouse']:[])
  const [documents,setDocuments]=useState<DocumentRow[]>([])
  const [documentLines,setDocumentLines]=useState<DocumentLine[]>([])
  const [requests,setRequests]=useState<RequestRow[]>([])
  const [requestLines,setRequestLines]=useState<RequestLine[]>([])
  const [contracts,setContracts]=useState<ContractRow[]>([])
  const [contractLines,setContractLines]=useState<ContractLine[]>([])
  const [files,setFiles]=useState<FileRow[]>([])
  const [customers,setCustomers]=useState<CustomerRow[]>([])
  const [sites,setSites]=useState<SiteRow[]>([])
  const [locations,setLocations]=useState<LocationRow[]>([])
  const [selectedId,setSelectedId]=useState('')
  const [search,setSearch]=useState('')
  const [message,setMessage]=useState('')
  const [loading,setLoading]=useState(!demoMode)
  const [dialog,setDialog]=useState<'create'|'edit'|'reverse'|'cancel'|null>(null)

  const refresh=useCallback(async()=>{
    if(!client||!profileId||demoMode)return
    setLoading(true);setMessage('')
    try{
      const membership=await client.from('organization_members').select('organization_id').eq('profile_id',profileId).eq('active',true).limit(1).single()
      if(membership.error)throw membership.error
      const org=membership.data.organization_id as string;setOrganizationId(org)
      const results=await Promise.all([
        client.from('inventory_documents').select('id,organization_id,request_id,document_type,folio,status,receiver_name,confirmed_at,reversed_at,reversal_reason,created_at').eq('organization_id',org).eq('document_type','HS').order('created_at',{ascending:false}),
        client.from('inventory_document_lines').select('id,document_id,request_line_id,line_no,product_id,from_location_id,to_location_id,quantity').eq('organization_id',org).order('line_no'),
        client.from('operation_requests').select('id,contract_id,folio,request_type,status').eq('organization_id',org).eq('request_type','SS'),
        client.from('operation_request_lines').select('id,request_id,contract_line_id,product_id,quantity').eq('organization_id',org),
        client.from('contracts').select('id,folio,customer_id,site_id,contract_type').eq('organization_id',org),
        client.from('contract_lines').select('id,sku_snapshot,description_snapshot').eq('organization_id',org),
        client.from('document_files').select('id,document_id,storage_path,file_kind,content_type,created_at').eq('organization_id',org),
        client.from('customers').select('id,legal_name,trade_name').eq('organization_id',org),
        client.from('customer_sites').select('id,name').eq('organization_id',org),
        client.from('inventory_locations').select('id,name,code').eq('organization_id',org),
        client.from('organization_member_roles').select('role_code').eq('organization_id',org).eq('profile_id',profileId),
      ])
      const failure=results.find(result=>result.error)?.error;if(failure)throw failure
      const loaded=(results[0].data||[]) as DocumentRow[]
      setDocuments(loaded);setDocumentLines((results[1].data||[]) as DocumentLine[]);setRequests((results[2].data||[]) as RequestRow[]);setRequestLines((results[3].data||[]) as RequestLine[]);setContracts((results[4].data||[]) as ContractRow[]);setContractLines((results[5].data||[]) as ContractLine[]);setFiles((results[6].data||[]) as FileRow[]);setCustomers((results[7].data||[]) as CustomerRow[]);setSites((results[8].data||[]) as SiteRow[]);setLocations((results[9].data||[]) as LocationRow[]);setRoles((results[10].data||[]).map(row=>row.role_code));setSelectedId(current=>loaded.some(document=>document.id===current)?current:loaded[0]?.id||'')
    }catch(cause){setMessage(cause instanceof Error?cause.message:'No fue posible cargar las Hojas de Salida')}finally{setLoading(false)}
  },[client,profileId,demoMode])
  useEffect(()=>{void refresh()},[refresh])
  useEffect(()=>{if(initialRequestId){setSection('HS');setDialog('create');onInitialRequestConsumed?.()}},[initialRequestId,onInitialRequestConsumed])
  useEffect(()=>{if(initialHeRequestId)setSection('HE')},[initialHeRequestId])

  const selected=documents.find(document=>document.id===selectedId)
  const selectedRequest=requests.find(request=>request.id===selected?.request_id)
  const selectedContract=contracts.find(contract=>contract.id===selectedRequest?.contract_id)
  const selectedLines=documentLines.filter(line=>line.document_id===selectedId)
  const selectedFiles=files.filter(file=>file.document_id===selectedId)
  const canOperate=roles.some(role=>['admin','warehouse'].includes(role))
  const isAdmin=roles.includes('admin')
  const customerName=(id?:string)=>{const row=customers.find(customer=>customer.id===id);return row?.trade_name||row?.legal_name||'Cliente'}
  const siteName=(id?:string)=>sites.find(site=>site.id===id)?.name||'Obra'
  const lineName=(requestLineId:string)=>{const requestLine=requestLines.find(line=>line.id===requestLineId);const contractLine=contractLines.find(line=>line.id===requestLine?.contract_line_id);return{sku:contractLine?.sku_snapshot||requestLine?.product_id||'Equipo',description:contractLine?.description_snapshot||'Equipo'}}
  const filtered=useMemo(()=>{const term=search.trim().toLowerCase();return documents.filter(document=>{const request=requests.find(row=>row.id===document.request_id);const contract=contracts.find(row=>row.id===request?.contract_id);return !term||[document.folio,request?.folio||'',contract?.folio||'',customerName(contract?.customer_id),statusLabels[document.status]].some(value=>value.toLowerCase().includes(term))})},[documents,requests,contracts,customers,search])
  const confirmedQuantity=(requestLineId:string)=>documentLines.filter(line=>line.request_line_id===requestLineId&&documents.some(document=>document.id===line.document_id&&document.status==='confirmed')).reduce((sum,line)=>sum+Number(line.quantity),0)

  async function run(action:()=>Promise<void>){setMessage('');try{await action()}catch(cause){setMessage(cause instanceof Error?cause.message:'No fue posible completar la acción')}}
  async function save(input:{requestId:string;receiver:string;lines:Array<{request_line_id:string;quantity:number}>},documentId?:string){if(demoMode){setDialog(null);return}const result=documentId?await client!.rpc('update_hs_document_draft',{p_document_id:documentId,p_receiver_name:input.receiver,p_lines:input.lines}):await client!.rpc('create_hs_document',{p_request_id:input.requestId,p_receiver_name:input.receiver,p_lines:input.lines});if(result.error)throw result.error;setSelectedId(result.data.id);setDialog(null);await refresh()}
  async function confirm(){if(!selected)return;const result=await client!.rpc('confirm_inventory_document',{p_document_id:selected.id});if(result.error)throw result.error;await refresh()}
  async function reasonAction(reason:string,kind:'reverse'|'cancel'){if(!selected)return;const result=await client!.rpc(kind==='reverse'?'reverse_inventory_document':'cancel_inventory_document',{p_document_id:selected.id,p_reason:reason});if(result.error)throw result.error;setDialog(null);await refresh()}
  async function upload(event:ChangeEvent<HTMLInputElement>,kind:'signature'|'photo'|'pdf'){const file=event.target.files?.[0];if(!file||!selected||!client)return;event.target.value='';setMessage('');const safe=file.name.normalize('NFKD').replace(/[^a-zA-Z0-9._-]/g,'-');const path=`${organizationId}/documents/${selected.id}/${crypto.randomUUID()}-${safe}`;const stored=await client.storage.from('erp-documents').upload(path,file,{contentType:file.type,upsert:false});if(stored.error){setMessage(stored.error.message);return}const metadata=await client.from('document_files').insert({organization_id:organizationId,document_id:selected.id,storage_path:path,file_kind:kind,content_type:file.type||'application/octet-stream',created_by:profileId});if(metadata.error){await client.storage.from('erp-documents').remove([path]);setMessage(metadata.error.message);return}await refresh()}
  async function openFile(path:string){if(!client)return;const result=await client.storage.from('erp-documents').createSignedUrl(path,60);if(result.error)throw result.error;window.open(result.data.signedUrl,'_blank','noopener,noreferrer')}

  if(section==='HE')return <ReceiptsModule client={client} profileId={profileId} demoMode={demoMode} initialRequestId={initialHeRequestId} onInitialRequestConsumed={onInitialHeRequestConsumed} onShowHs={()=>setSection('HS')}/>

  return <>
    <div className="title document-title"><div><p>Movimientos confirmados</p><h1>Hojas de Salida</h1></div>{canOperate&&<button className="primary" onClick={()=>setDialog('create')}><Plus/>Nueva HS</button>}</div>
    <div className="crm-tabs"><button className="active">Salidas HS</button><button onClick={()=>setSection('HE')}>Entradas HE</button></div>
    <div className="info"><PackageCheck/><div><b>Movimiento físico controlado</b><p>Confirmar una HS consume reservas y mueve el equipo del almacén hacia la obra o venta.</p></div></div>
    {message&&<div className="demo-banner" role="alert">{message}</div>}{loading&&<div className="demo-banner">Cargando documentos…</div>}
    <div className="document-workspace"><section className="panel document-list"><div className="document-search"><input value={search} onChange={event=>setSearch(event.target.value)} placeholder="Buscar HS, SS, contrato o cliente"/></div>{filtered.length?filtered.map(document=>{const request=requests.find(row=>row.id===document.request_id);return <button key={document.id} className={selectedId===document.id?'selected':''} onClick={()=>setSelectedId(document.id)}><span><b>{document.folio}</b><small>{request?.folio}</small></span><span className={`document-status ${document.status}`}>{statusLabels[document.status]}</span><ChevronRight/></button>}):<div className="crm-empty">Aún no hay Hojas de Salida.</div>}</section><section className="panel document-detail">{selected&&selectedRequest&&selectedContract?<><header><div><span className={`document-status ${selected.status}`}>{statusLabels[selected.status]}</span><h2>{selected.folio}</h2><p>{selectedRequest.folio} · {selectedContract.folio} · {customerName(selectedContract.customer_id)} · {siteName(selectedContract.site_id)}</p></div><Truck/></header><div className="document-body"><dl><div><dt>Receptor</dt><dd>{selected.receiver_name||'Pendiente'}</dd></div><div><dt>Confirmación</dt><dd>{selected.confirmed_at?new Date(selected.confirmed_at).toLocaleString('es-MX'):'Pendiente'}</dd></div><div><dt>Tipo</dt><dd>{selectedContract.contract_type==='rental'?'Renta':'Venta'}</dd></div></dl><div className="document-lines">{selectedLines.map(line=>{const name=lineName(line.request_line_id);return <article key={line.id}><div><b>{name.sku}</b><small>{name.description}</small></div><strong>{Number(line.quantity).toLocaleString('es-MX')} pzas.</strong><small>{locations.find(location=>location.id===line.from_location_id)?.name} → {locations.find(location=>location.id===line.to_location_id)?.name}</small></article>})}</div><section className="document-files"><h3>Evidencias privadas</h3>{selected.status==='draft'&&<div className="document-uploads"><label><FileSignature/>Firma<input type="file" accept="image/png,image/jpeg,image/webp" onChange={event=>void upload(event,'signature')}/></label><label><Camera/>Foto<input type="file" accept="image/png,image/jpeg,image/webp" onChange={event=>void upload(event,'photo')}/></label><label><FileText/>PDF<input type="file" accept="application/pdf" onChange={event=>void upload(event,'pdf')}/></label></div>}<div className="document-file-list">{selectedFiles.map(file=><button key={file.id} onClick={()=>run(()=>openFile(file.storage_path))}>{file.file_kind==='signature'?<FileSignature/>:file.file_kind==='photo'?<Camera/>:<FileText/>}{fileLabels[file.file_kind]} · {new Date(file.created_at).toLocaleString('es-MX')}</button>)}{!selectedFiles.length&&<p>Sin archivos adjuntos.</p>}</div></section><div className="document-actions">{selected.status==='draft'&&<button onClick={()=>setDialog('edit')}><FilePenLine/>Editar</button>}{selected.status==='draft'&&<button className="primary" disabled={!selectedFiles.some(file=>file.file_kind==='signature')} title={!selectedFiles.some(file=>file.file_kind==='signature')?'Adjunta la firma antes de confirmar':''} onClick={()=>run(confirm)}><CheckCircle2/>Confirmar salida</button>}{selected.status==='confirmed'&&isAdmin&&<button onClick={()=>setDialog('reverse')}><RotateCcw/>Revertir</button>}{selected.status==='draft'&&<button className="danger" onClick={()=>setDialog('cancel')}><XCircle/>Cancelar</button>}</div>{selected.status==='confirmed'&&<div className="info"><CheckCircle2/><div><b>Movimiento confirmado</b><p>El equipo ya forma parte del saldo físico de la obra.</p></div></div>}</div></>:<div className="crm-empty">Selecciona una Hoja de Salida.</div>}</section></div>
    {dialog==='create'&&<HsForm title="Nueva Hoja de Salida" requests={requests.filter(request=>['authorized','partially_fulfilled'].includes(request.status))} requestLines={requestLines} contractLines={contractLines} documents={documents} documentLines={documentLines} initialRequestId={initialRequestId} confirmedQuantity={confirmedQuantity} onClose={()=>setDialog(null)} onSubmit={input=>run(()=>save(input))}/>}
    {dialog==='edit'&&selected&&<HsForm title={`Editar ${selected.folio}`} requests={requests.filter(request=>request.id===selected.request_id)} requestLines={requestLines} contractLines={contractLines} documents={documents} documentLines={documentLines} document={selected} confirmedQuantity={confirmedQuantity} onClose={()=>setDialog(null)} onSubmit={input=>run(()=>save(input,selected.id))}/>}
    {(dialog==='reverse'||dialog==='cancel')&&<ReasonDialog title={dialog==='reverse'?'Revertir Hoja de Salida':'Cancelar Hoja de Salida'} confirm={dialog==='reverse'?'Revertir movimiento':'Cancelar documento'} onClose={()=>setDialog(null)} onSubmit={reason=>run(()=>reasonAction(reason,dialog))}/>}
  </>
}

function HsForm({title,requests,requestLines,contractLines,documents,documentLines,document,initialRequestId,confirmedQuantity,onClose,onSubmit}:{title:string;requests:RequestRow[];requestLines:RequestLine[];contractLines:ContractLine[];documents:DocumentRow[];documentLines:DocumentLine[];document?:DocumentRow;initialRequestId?:string;confirmedQuantity:(requestLineId:string)=>number;onClose:()=>void;onSubmit:(input:{requestId:string;receiver:string;lines:Array<{request_line_id:string;quantity:number}>})=>void}){
  const first=requests.find(row=>row.id===(document?.request_id||initialRequestId))||requests[0]
  const [requestId,setRequestId]=useState(first?.id||'')
  const initial=document?Object.fromEntries(documentLines.filter(line=>line.document_id===document.id).reduce<Array<[string,string]>>((rows,line)=>{const found=rows.find(row=>row[0]===line.request_line_id);if(found)found[1]=String(Number(found[1])+Number(line.quantity));else rows.push([line.request_line_id,String(line.quantity)]);return rows},[])):{}
  const [quantities,setQuantities]=useState<Record<string,string>>(initial)
  const lines=requestLines.filter(line=>line.request_id===requestId)
  function submit(event:FormEvent<HTMLFormElement>){event.preventDefault();const data=new FormData(event.currentTarget);onSubmit({requestId,receiver:String(data.get('receiver')||''),lines:lines.map(line=>({request_line_id:line.id,quantity:Number(quantities[line.id]||0)})).filter(line=>line.quantity>0)})}
  return <div className="crm-modal" role="dialog" aria-modal="true" aria-label={title}><form className="document-form" onSubmit={submit}><header><div><small>Surtido desde reservas</small><h2>{title}</h2></div><button type="button" onClick={onClose} aria-label="Cerrar"><X/></button></header><div className="crm-form-grid"><label className="wide">Solicitud autorizada<select value={requestId} disabled={Boolean(document)} onChange={event=>{setRequestId(event.target.value);setQuantities({})}} required><option value="" disabled>Selecciona una SS</option>{requests.map(request=><option key={request.id} value={request.id}>{request.folio}</option>)}</select></label><label className="wide">Nombre del receptor<input name="receiver" minLength={3} required defaultValue={document?.receiver_name||''}/></label></div><div className="document-line-editor"><h3>Cantidades a entregar</h3>{lines.map(line=>{const source=contractLines.find(contractLine=>contractLine.id===line.contract_line_id);const remaining=Math.max(0,Number(line.quantity)-confirmedQuantity(line.id));return <label key={line.id}><span><b>{source?.sku_snapshot||'SKU sin código'}</b><small>{source?.description_snapshot||'Equipo'} · Solicitado: {Number(line.quantity).toLocaleString('es-MX')} · Pendiente: {remaining.toLocaleString('es-MX')}</small></span><input type="number" min="0" max={remaining} step="0.001" value={quantities[line.id]||''} onChange={event=>setQuantities(values=>({...values,[line.id]:event.target.value}))} placeholder="0"/></label>})}</div><footer><button type="button" onClick={onClose}>Cancelar</button><button className="primary" disabled={!requestId||!lines.length}>Guardar borrador</button></footer></form></div>
}

function ReasonDialog({title,confirm,onClose,onSubmit}:{title:string;confirm:string;onClose:()=>void;onSubmit:(reason:string)=>void}){function submit(event:FormEvent<HTMLFormElement>){event.preventDefault();onSubmit(String(new FormData(event.currentTarget).get('reason')||'').trim())}return <div className="crm-modal" role="dialog" aria-modal="true" aria-label={title}><form className="contract-reason" onSubmit={submit}><header><div><small>Documento de inventario</small><h2>{title}</h2></div><button type="button" onClick={onClose} aria-label="Cerrar"><X/></button></header><div className="crm-form-grid"><label className="wide">Motivo<textarea name="reason" rows={4} minLength={10} required/></label></div><footer><button type="button" onClick={onClose}>Volver</button><button className="danger">{confirm}</button></footer></form></div>}

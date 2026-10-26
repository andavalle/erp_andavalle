import { useCallback, useEffect, useState, type FormEvent } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { CheckCircle2, ChevronRight, ClipboardCheck, FilePenLine, Plus, RotateCcw, Scale, X, XCircle } from 'lucide-react'

type CountStatus='draft'|'confirmed'|'reversed'|'cancelled'
interface CountRow{id:string;organization_id:string;warehouse_id:string;folio:string;status:CountStatus;counted_on:string;reason:string;notes:string|null;confirmed_at:string|null;reversal_reason:string|null;created_at:string}
interface CountLine{id:string;inventory_count_id:string;product_id:string;location_id:string;system_quantity:number;counted_quantity:number;difference:number}
interface ProductRow{id:string;sku:string;description:string}
interface WarehouseRow{id:string;name:string;code:string}
interface LocationRow{id:string;warehouse_id:string|null;name:string;code:string;location_type:string}
interface BalanceRow{product_id:string;location_id:string;quantity:number}
interface DraftLine{product_id:string;location_id:string;counted_quantity:string}

const statusLabels:Record<CountStatus,string>={draft:'Borrador',confirmed:'Confirmado',reversed:'Revertido',cancelled:'Cancelado'}

export function PhysicalCountsModule({client,profileId,demoMode,onShowStock}:{client:SupabaseClient|null;profileId?:string;demoMode:boolean;onShowStock:()=>void}){
  const [roles,setRoles]=useState<string[]>(demoMode?['admin','warehouse']:[])
  const [counts,setCounts]=useState<CountRow[]>([])
  const [lines,setLines]=useState<CountLine[]>([])
  const [products,setProducts]=useState<ProductRow[]>([])
  const [warehouses,setWarehouses]=useState<WarehouseRow[]>([])
  const [locations,setLocations]=useState<LocationRow[]>([])
  const [balances,setBalances]=useState<BalanceRow[]>([])
  const [selectedId,setSelectedId]=useState('')
  const [dialog,setDialog]=useState<'create'|'edit'|'reverse'|'cancel'|null>(null)
  const [message,setMessage]=useState('')
  const [loading,setLoading]=useState(!demoMode)

  const refresh=useCallback(async()=>{
    if(!client||!profileId||demoMode)return
    setLoading(true);setMessage('')
    try{
      const membership=await client.from('organization_members').select('organization_id').eq('profile_id',profileId).eq('active',true).limit(1).single();if(membership.error)throw membership.error
      const org=membership.data.organization_id as string
      const results=await Promise.all([
        client.from('inventory_counts').select('id,organization_id,warehouse_id,folio,status,counted_on,reason,notes,confirmed_at,reversal_reason,created_at').eq('organization_id',org).order('created_at',{ascending:false}),
        client.from('inventory_count_lines').select('id,inventory_count_id,product_id,location_id,system_quantity,counted_quantity,difference').eq('organization_id',org).order('line_no'),
        client.from('products').select('id,sku,description').eq('organization_id',org).eq('item_type','inventory').eq('active',true).order('sku'),
        client.from('warehouses').select('id,name,code').eq('organization_id',org).eq('active',true).order('name'),
        client.from('inventory_locations').select('id,warehouse_id,name,code,location_type').eq('organization_id',org).eq('active',true).in('location_type',['available','inspection','maintenance','damaged','writeoff']).order('name'),
        client.from('inventory_balances').select('product_id,location_id,quantity').eq('organization_id',org),
        client.from('organization_member_roles').select('role_code').eq('organization_id',org).eq('profile_id',profileId),
      ])
      const failure=results.find(result=>result.error)?.error;if(failure)throw failure
      const loaded=(results[0].data||[]) as CountRow[];setCounts(loaded);setLines((results[1].data||[]) as CountLine[]);setProducts((results[2].data||[]) as ProductRow[]);setWarehouses((results[3].data||[]) as WarehouseRow[]);setLocations((results[4].data||[]) as LocationRow[]);setBalances((results[5].data||[]) as BalanceRow[]);setRoles((results[6].data||[]).map(row=>row.role_code));setSelectedId(current=>loaded.some(count=>count.id===current)?current:loaded[0]?.id||'')
    }catch(cause){setMessage(cause instanceof Error?cause.message:'No fue posible cargar los cortes físicos')}finally{setLoading(false)}
  },[client,profileId,demoMode])
  useEffect(()=>{void refresh()},[refresh])
  const selected=counts.find(count=>count.id===selectedId)
  const selectedLines=lines.filter(line=>line.inventory_count_id===selectedId)
  const canCapture=roles.some(role=>['admin','warehouse'].includes(role));const isAdmin=roles.includes('admin')
  const productName=(id:string)=>products.find(product=>product.id===id)
  const locationName=(id:string)=>locations.find(location=>location.id===id)
  async function run(action:()=>Promise<void>){setMessage('');try{await action()}catch(cause){setMessage(cause instanceof Error?cause.message:'No fue posible completar la operación')}}
  async function save(input:{warehouseId:string;countedOn:string;reason:string;notes:string;lines:Array<{product_id:string;location_id:string;counted_quantity:number}>},countId?:string){if(demoMode){setDialog(null);return}const params={p_counted_on:input.countedOn,p_reason:input.reason,p_notes:input.notes||null,p_lines:input.lines};const result=countId?await client!.rpc('update_inventory_count_draft',{p_inventory_count_id:countId,...params}):await client!.rpc('create_inventory_count',{p_warehouse_id:input.warehouseId,...params});if(result.error)throw result.error;setSelectedId(result.data.id);setDialog(null);await refresh()}
  async function confirm(){if(!selected)return;const result=await client!.rpc('confirm_inventory_count',{p_inventory_count_id:selected.id});if(result.error)throw result.error;await refresh()}
  async function reasonAction(reason:string,kind:'reverse'|'cancel'){if(!selected)return;const result=await client!.rpc(kind==='reverse'?'reverse_inventory_count':'cancel_inventory_count',{p_inventory_count_id:selected.id,p_reason:reason});if(result.error)throw result.error;setDialog(null);await refresh()}

  return <>
    <div className="title inventory-title"><div><p>Conciliación contra el ledger</p><h1>Cortes físicos</h1></div>{canCapture&&<button className="primary" onClick={()=>setDialog('create')}><Plus/>Nuevo corte</button>}</div>
    <div className="crm-tabs"><button onClick={onShowStock}>Existencias</button><button className="active">Cortes físicos</button></div>
    <div className="info"><Scale/><div><b>Ajuste compensatorio</b><p>El conteo confirmado conserva el saldo anterior y registra únicamente la diferencia en el ledger.</p></div></div>
    {message&&<div className="demo-banner" role="alert">{message}</div>}{loading&&<div className="demo-banner">Cargando cortes físicos…</div>}
    <div className="document-workspace"><section className="panel document-list">{counts.length?counts.map(count=><button key={count.id} className={selectedId===count.id?'selected':''} onClick={()=>setSelectedId(count.id)}><span><b>{count.folio}</b><small>{warehouses.find(row=>row.id===count.warehouse_id)?.name} · {new Date(count.counted_on+'T12:00:00').toLocaleDateString('es-MX')}</small></span><span className={`document-status ${count.status}`}>{statusLabels[count.status]}</span><ChevronRight/></button>):<div className="crm-empty">Aún no hay cortes físicos.</div>}</section><section className="panel count-detail">{selected?<><header><div><span className={`document-status ${selected.status}`}>{statusLabels[selected.status]}</span><h2>{selected.folio}</h2><p>{warehouses.find(row=>row.id===selected.warehouse_id)?.name} · {new Date(selected.counted_on+'T12:00:00').toLocaleDateString('es-MX')}</p></div><ClipboardCheck/></header><div className="count-body"><dl><div><dt>Motivo</dt><dd>{selected.reason}</dd></div><div><dt>Partidas</dt><dd>{selectedLines.length}</dd></div><div><dt>Diferencia neta</dt><dd>{selectedLines.reduce((sum,line)=>sum+Number(line.difference),0).toLocaleString('es-MX')}</dd></div></dl>{selected.notes&&<div className="contract-notes"><b>Notas</b><p>{selected.notes}</p></div>}<div className="count-lines"><div className="count-line-head"><span>SKU / ubicación</span><span>Sistema</span><span>Conteo</span><span>Diferencia</span></div>{selectedLines.map(line=>{const product=productName(line.product_id);const difference=Number(line.difference);return <article key={line.id}><span><b>{product?.sku||line.product_id}</b><small>{product?.description} · {locationName(line.location_id)?.name}</small></span><b>{Number(line.system_quantity).toLocaleString('es-MX')}</b><b>{Number(line.counted_quantity).toLocaleString('es-MX')}</b><strong className={difference===0?'zero':difference>0?'positive':'negative'}>{difference>0?'+':''}{difference.toLocaleString('es-MX')}</strong></article>})}</div><div className="document-actions">{selected.status==='draft'&&canCapture&&<button onClick={()=>setDialog('edit')}><FilePenLine/>Editar</button>}{selected.status==='draft'&&isAdmin&&<button className="primary" onClick={()=>run(confirm)}><CheckCircle2/>Confirmar ajuste</button>}{selected.status==='confirmed'&&isAdmin&&<button onClick={()=>setDialog('reverse')}><RotateCcw/>Revertir</button>}{selected.status==='draft'&&canCapture&&<button className="danger" onClick={()=>setDialog('cancel')}><XCircle/>Cancelar</button>}</div>{selected.status==='draft'&&!isAdmin&&<div className="info"><ClipboardCheck/><div><b>Pendiente de autorización</b><p>Administración debe confirmar el corte para generar movimientos.</p></div></div>}</div></>:<div className="crm-empty">Selecciona un corte físico.</div>}</section></div>
    {dialog==='create'&&<CountForm title="Nuevo corte físico" products={products} warehouses={warehouses} locations={locations} balances={balances} onClose={()=>setDialog(null)} onSubmit={input=>run(()=>save(input))}/>}
    {dialog==='edit'&&selected&&<CountForm title={`Editar ${selected.folio}`} products={products} warehouses={warehouses.filter(row=>row.id===selected.warehouse_id)} locations={locations} balances={balances} count={selected} countLines={selectedLines} onClose={()=>setDialog(null)} onSubmit={input=>run(()=>save(input,selected.id))}/>}
    {(dialog==='reverse'||dialog==='cancel')&&<ReasonDialog title={dialog==='reverse'?'Revertir corte físico':'Cancelar corte físico'} confirm={dialog==='reverse'?'Revertir ajuste':'Cancelar corte'} onClose={()=>setDialog(null)} onSubmit={reason=>run(()=>reasonAction(reason,dialog))}/>}
  </>
}

function CountForm({title,products,warehouses,locations,balances,count,countLines=[],onClose,onSubmit}:{title:string;products:ProductRow[];warehouses:WarehouseRow[];locations:LocationRow[];balances:BalanceRow[];count?:CountRow;countLines?:CountLine[];onClose:()=>void;onSubmit:(input:{warehouseId:string;countedOn:string;reason:string;notes:string;lines:Array<{product_id:string;location_id:string;counted_quantity:number}>})=>void}){
  const [warehouseId,setWarehouseId]=useState(count?.warehouse_id||warehouses[0]?.id||'')
  const warehouseLocations=locations.filter(location=>location.warehouse_id===warehouseId)
  const initial=countLines.length?countLines.map(line=>({product_id:line.product_id,location_id:line.location_id,counted_quantity:String(line.counted_quantity)})):[]
  const [draftLines,setDraftLines]=useState<DraftLine[]>(initial)
  const system=(line:DraftLine)=>Number(balances.find(balance=>balance.product_id===line.product_id&&balance.location_id===line.location_id)?.quantity||0)
  function add(){setDraftLines(current=>[...current,{product_id:products[0]?.id||'',location_id:warehouseLocations[0]?.id||'',counted_quantity:''}])}
  function submit(event:FormEvent<HTMLFormElement>){event.preventDefault();const data=new FormData(event.currentTarget);onSubmit({warehouseId,countedOn:String(data.get('countedOn')||''),reason:String(data.get('reason')||''),notes:String(data.get('notes')||''),lines:draftLines.map(line=>({product_id:line.product_id,location_id:line.location_id,counted_quantity:Number(line.counted_quantity)}))})}
  return <div className="crm-modal" role="dialog" aria-modal="true" aria-label={title}><form className="count-form" onSubmit={submit}><header><div><small>Conteo contra ledger</small><h2>{title}</h2></div><button type="button" onClick={onClose} aria-label="Cerrar"><X/></button></header><div className="crm-form-grid"><label>Almacén<select value={warehouseId} disabled={Boolean(count)} onChange={event=>{setWarehouseId(event.target.value);setDraftLines([])}} required><option value="" disabled>Selecciona</option>{warehouses.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select></label><label>Fecha del conteo<input name="countedOn" type="date" max={new Date().toISOString().slice(0,10)} defaultValue={count?.counted_on||new Date().toISOString().slice(0,10)} required/></label><label className="wide">Motivo<input name="reason" minLength={5} defaultValue={count?.reason||'Conteo físico de almacén'} required/></label><label className="wide">Notas<textarea name="notes" rows={2} defaultValue={count?.notes||''}/></label></div><div className="count-editor"><div className="count-editor-title"><h3>Partidas contadas</h3><button type="button" onClick={add} disabled={!warehouseLocations.length||!products.length}><Plus/>Agregar SKU</button></div>{draftLines.map((line,index)=><div className="count-editor-row" key={`${index}-${line.product_id}-${line.location_id}`}><select value={line.product_id} onChange={event=>setDraftLines(current=>current.map((item,at)=>at===index?{...item,product_id:event.target.value}:item))} required><option value="" disabled>SKU</option>{products.map(product=><option key={product.id} value={product.id}>{product.sku} · {product.description}</option>)}</select><select value={line.location_id} onChange={event=>setDraftLines(current=>current.map((item,at)=>at===index?{...item,location_id:event.target.value}:item))} required><option value="" disabled>Ubicación</option>{warehouseLocations.map(location=><option key={location.id} value={location.id}>{location.name}</option>)}</select><span>Sistema <b>{system(line).toLocaleString('es-MX')}</b></span><input type="number" min="0" step="0.001" value={line.counted_quantity} onChange={event=>setDraftLines(current=>current.map((item,at)=>at===index?{...item,counted_quantity:event.target.value}:item))} placeholder="Conteo" required/><button type="button" onClick={()=>setDraftLines(current=>current.filter((_item,at)=>at!==index))}><X/></button></div>)}{!draftLines.length&&<p>Agrega los SKU que fueron contados físicamente.</p>}</div><footer><button type="button" onClick={onClose}>Cancelar</button><button className="primary" disabled={!warehouseId||!draftLines.length}>Guardar borrador</button></footer></form></div>
}

function ReasonDialog({title,confirm,onClose,onSubmit}:{title:string;confirm:string;onClose:()=>void;onSubmit:(reason:string)=>void}){function submit(event:FormEvent<HTMLFormElement>){event.preventDefault();onSubmit(String(new FormData(event.currentTarget).get('reason')||'').trim())}return <div className="crm-modal" role="dialog" aria-modal="true"><form className="contract-reason" onSubmit={submit}><header><div><small>Movimiento de inventario</small><h2>{title}</h2></div><button type="button" onClick={onClose}><X/></button></header><div className="crm-form-grid"><label className="wide">Motivo<textarea name="reason" rows={4} minLength={10} required/></label></div><footer><button type="button" onClick={onClose}>Volver</button><button className="danger">{confirm}</button></footer></form></div>}

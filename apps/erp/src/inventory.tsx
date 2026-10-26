import { useCallback, useEffect, useMemo, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { AlertTriangle, Boxes, Building2, ChevronRight, ClipboardList, Download, PackageCheck, Search, Warehouse, Wrench } from 'lucide-react'
import { PhysicalCountsModule } from './inventory-counts'

interface PositionRow{organization_id:string;product_id:string;sku:string;description:string;family:string|null;unit_of_measure:string;active:boolean;available_on_hand:number;reserved:number;available:number;customer:number;inspection:number;maintenance:number;damaged:number;writeoff:number;sold:number;net_quantity:number}
interface TraceRow{movement_id:string;product_id:string;created_at:string;quantity:number;movement_kind:string;reversal_of_id:string|null;from_location:string|null;from_location_type:string|null;to_location:string|null;to_location_type:string|null;document_folio:string|null;document_type:'HS'|'HE'|null;document_status:string|null;request_folio:string|null;contract_folio:string|null;customer_name:string|null;site_name:string|null}
type Filter='all'|'stock'|'customer'|'attention'

const demoRows:PositionRow[]=[
  {organization_id:'demo',product_id:'demo-1',sku:'MAR-156-200',description:'Marco de 156 × 200 cm',family:'Marcos',unit_of_measure:'pieza',active:true,available_on_hand:120,reserved:24,available:96,customer:40,inspection:3,maintenance:1,damaged:2,writeoff:0,sold:0,net_quantity:166},
  {organization_id:'demo',product_id:'demo-2',sku:'VER-100-000',description:'Vertical de 100 cm sistema multidireccional',family:'Verticales',unit_of_measure:'pieza',active:true,available_on_hand:74,reserved:10,available:64,customer:28,inspection:0,maintenance:2,damaged:0,writeoff:1,sold:0,net_quantity:105},
]

export function InventoryModule({client,profileId,demoMode}:{client:SupabaseClient|null;profileId?:string;demoMode:boolean}){
  const [section,setSection]=useState<'stock'|'counts'>('stock')
  const [rows,setRows]=useState<PositionRow[]>(demoMode?demoRows:[])
  const [trace,setTrace]=useState<TraceRow[]>([])
  const [selectedId,setSelectedId]=useState(demoMode?demoRows[0].product_id:'')
  const [search,setSearch]=useState('')
  const [filter,setFilter]=useState<Filter>('all')
  const [loading,setLoading]=useState(!demoMode)
  const [message,setMessage]=useState('')

  const refresh=useCallback(async()=>{
    if(!client||!profileId||demoMode)return
    setLoading(true);setMessage('')
    try{
      const membership=await client.from('organization_members').select('organization_id').eq('profile_id',profileId).eq('active',true).limit(1).single();if(membership.error)throw membership.error
      const org=membership.data.organization_id as string
      const [positions,movements]=await Promise.all([
        client.from('inventory_position').select('*').eq('organization_id',org).order('sku'),
        client.from('inventory_trace').select('*').eq('organization_id',org).order('created_at',{ascending:false}).limit(750),
      ])
      if(positions.error)throw positions.error;if(movements.error)throw movements.error
      const loaded=(positions.data||[]) as PositionRow[];setRows(loaded);setTrace((movements.data||[]) as TraceRow[]);setSelectedId(current=>loaded.some(row=>row.product_id===current)?current:loaded[0]?.product_id||'')
    }catch(cause){setMessage(cause instanceof Error?cause.message:'No fue posible cargar el inventario')}finally{setLoading(false)}
  },[client,profileId,demoMode])
  useEffect(()=>{void refresh()},[refresh])

  const number=(value:number)=>Number(value||0)
  const totals=useMemo(()=>rows.reduce((sum,row)=>({available:sum.available+number(row.available),reserved:sum.reserved+number(row.reserved),customer:sum.customer+number(row.customer),attention:sum.attention+number(row.inspection)+number(row.maintenance)+number(row.damaged),writeoff:sum.writeoff+number(row.writeoff)}),{available:0,reserved:0,customer:0,attention:0,writeoff:0}),[rows])
  const filtered=useMemo(()=>{const term=search.trim().toLowerCase();return rows.filter(row=>(!term||[row.sku,row.description,row.family||''].some(value=>value.toLowerCase().includes(term)))&&(filter==='all'||filter==='stock'&&number(row.net_quantity)!==0||filter==='customer'&&number(row.customer)>0||filter==='attention'&&number(row.inspection)+number(row.maintenance)+number(row.damaged)>0))},[rows,search,filter])
  const selected=rows.find(row=>row.product_id===selectedId)
  const selectedTrace=trace.filter(row=>row.product_id===selectedId)
  function exportCsv(){const headers=['SKU','Descripción','Familia','Disponible','Reservado','En obra','Inspección','Mantenimiento','Dañado','Baja','Vendido','Saldo neto'];const body=rows.map(row=>[row.sku,row.description,row.family||'',row.available,row.reserved,row.customer,row.inspection,row.maintenance,row.damaged,row.writeoff,row.sold,row.net_quantity]);const csv=[headers,...body].map(line=>line.map(value=>`"${String(value).replaceAll('"','""')}"`).join(',')).join('\n');const url=URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}));const anchor=document.createElement('a');anchor.href=url;anchor.download=`inventario-andavalle-${new Date().toISOString().slice(0,10)}.csv`;anchor.click();URL.revokeObjectURL(url)}

  if(section==='counts')return <PhysicalCountsModule client={client} profileId={profileId} demoMode={demoMode} onShowStock={()=>setSection('stock')}/>

  return <>
    <div className="title inventory-title"><div><p>Existencias derivadas del ledger</p><h1>Inventario</h1></div><button className="primary" onClick={exportCsv}><Download/>Exportar CSV</button></div>
    <div className="crm-tabs"><button className="active">Existencias</button><button onClick={()=>setSection('counts')}>Cortes físicos</button></div>
    <div className="inventory-kpis"><InventoryKpi icon={Warehouse} label="Disponible" value={totals.available} note="apto para reservar"/><InventoryKpi icon={ClipboardList} label="Reservado" value={totals.reserved} note="pendiente de salida"/><InventoryKpi icon={Building2} label="En obra" value={totals.customer} note="custodia del cliente"/><InventoryKpi icon={Wrench} label="Atención" value={totals.attention} note="inspección, taller o daño"/><InventoryKpi icon={AlertTriangle} label="Baja" value={totals.writeoff} note="fuera de operación"/></div>
    <div className="info"><PackageCheck/><div><b>Ledger como fuente de verdad</b><p>Estos saldos no se editan: provienen de movimientos confirmados y reservas activas.</p></div></div>
    {message&&<div className="demo-banner" role="alert">{message}</div>}{loading&&<div className="demo-banner">Calculando saldos…</div>}
    <div className="inventory-toolbar"><Search/><input value={search} onChange={event=>setSearch(event.target.value)} placeholder="Buscar SKU, descripción o familia"/><div>{([['all','Todos'],['stock','Con saldo'],['customer','En obra'],['attention','Requiere atención']] as Array<[Filter,string]>).map(([id,label])=><button key={id} className={filter===id?'active':''} onClick={()=>setFilter(id)}>{label}</button>)}</div></div>
    <div className="inventory-layout"><section className="panel inventory-table"><div className="inventory-grid inventory-grid-head"><span>SKU / equipo</span><span>Disponible</span><span>Reservado</span><span>En obra</span><span>Atención</span><span>Baja</span><span/></div>{filtered.map(row=><button key={row.product_id} className={selectedId===row.product_id?'selected':''} onClick={()=>setSelectedId(row.product_id)}><span><b>{row.sku}</b><small>{row.description} · {row.family||'Sin familia'}</small></span><b>{number(row.available).toLocaleString('es-MX')}</b><b>{number(row.reserved).toLocaleString('es-MX')}</b><b>{number(row.customer).toLocaleString('es-MX')}</b><b>{(number(row.inspection)+number(row.maintenance)+number(row.damaged)).toLocaleString('es-MX')}</b><b>{number(row.writeoff).toLocaleString('es-MX')}</b><ChevronRight/></button>)}{!filtered.length&&<div className="crm-empty">No hay productos que coincidan con el filtro.</div>}</section><section className="panel inventory-detail">{selected?<><header><div><small>{selected.family||'Sin familia'}</small><h2>{selected.sku}</h2><p>{selected.description}</p></div><Boxes/></header><div className="inventory-detail-body"><div className="condition-grid"><Condition label="Disponible físico" value={selected.available_on_hand}/><Condition label="Reservado" value={selected.reserved}/><Condition label="Disponible neto" value={selected.available} accent/><Condition label="En obra" value={selected.customer}/><Condition label="Inspección" value={selected.inspection}/><Condition label="Mantenimiento" value={selected.maintenance}/><Condition label="Dañado" value={selected.damaged}/><Condition label="Baja" value={selected.writeoff}/><Condition label="Vendido" value={selected.sold}/></div><div className="inventory-trace-title"><div><h3>Trazabilidad reciente</h3><p>{selectedTrace.length} movimientos mostrados</p></div></div><div className="inventory-trace">{selectedTrace.map(item=><article key={item.movement_id}><span className={`movement-kind ${item.movement_kind}`}>{item.document_type||item.movement_kind}</span><div><b>{item.from_location||'Origen externo'} → {item.to_location||'Destino externo'}</b><small>{[item.document_folio,item.request_folio,item.contract_folio,item.customer_name,item.site_name].filter(Boolean).join(' · ')||'Movimiento de inventario'}</small></div><strong>{number(item.quantity).toLocaleString('es-MX')} {selected.unit_of_measure}</strong><time>{new Date(item.created_at).toLocaleString('es-MX')}</time></article>)}{!selectedTrace.length&&<p>Este SKU aún no tiene movimientos.</p>}</div></div></>:<div className="crm-empty">Selecciona un SKU para revisar sus saldos.</div>}</section></div>
  </>
}

function InventoryKpi({icon:Icon,label,value,note}:{icon:typeof Warehouse;label:string;value:number;note:string}){return <article><span><Icon/></span><div><small>{label}</small><b>{Number(value).toLocaleString('es-MX')}</b><p>{note}</p></div></article>}
function Condition({label,value,accent=false}:{label:string;value:number;accent?:boolean}){return <div className={accent?'accent':''}><small>{label}</small><b>{Number(value).toLocaleString('es-MX')}</b></div>}

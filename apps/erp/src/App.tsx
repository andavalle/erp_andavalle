import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import type { Session, SupabaseClient } from '@supabase/supabase-js'
import {
  Boxes, Building2, CalendarClock, ChevronRight, ClipboardCheck, ClipboardList,
  FileInput, FileOutput, Gauge, LogOut, PackageCheck, Search, Settings, ShieldCheck,
  ShoppingCart, Truck, Users, Warehouse,
} from 'lucide-react'
import {
  createBrowserSupabaseClient, mockCustomers, mockInventory, mockRequests,
  readPublicSupabaseEnvironment, requestStatusLabels, type ContractStatus, type ContractType,
  type CustomerSummary, type InventorySummary, type OperationRequestSummary, type RequestStatus, type RequestType,
} from '@andavalle/shared'
import { CrmModule } from './crm'
import { ContractsModule } from './contracts'
import { PricingAdministration } from './quotations'
import { RequestsModule } from './requests'
import { DocumentsModule } from './documents'
import { InventoryModule } from './inventory'

type Screen = 'dashboard' | 'crm' | 'contracts' | 'requests' | 'documents' | 'inventory' | 'settings'

const environment = readPublicSupabaseEnvironment(import.meta.env)
const supabase = environment ? createBrowserSupabaseClient(environment) : null
const demoMode = import.meta.env.VITE_DEMO_MODE === 'true' || !supabase

interface ContractSummary { id:string; folio:string; type:ContractType; customer:string; site:string; status:ContractStatus; total:number }
interface ErpData { customers:CustomerSummary[]; requests:OperationRequestSummary[]; inventory:InventorySummary; contracts:ContractSummary[] }
const emptyInventory:InventorySummary={available:0,reserved:0,customer:0,inspection:0,maintenance:0,damaged:0}
const demoContracts:ContractSummary[]=[
  {id:'demo-contract-1',folio:'CTR-R-2026-000001',type:'rental',customer:'Valle Alto',site:'Nave Norte',status:'active',total:84680},
  {id:'demo-contract-2',folio:'CTR-V-2026-000001',type:'sale',customer:'Proyectos Lerma',site:'Edificio B',status:'authorized',total:126440},
]
const contractStatusLabels:Record<ContractStatus,string>={draft:'Borrador',pending_authorization:'Pendiente',authorized:'Autorizado',active:'Activo',closed:'Cerrado',cancelled:'Cancelado'}

function useErpData(client:SupabaseClient|null){
  const [data,setData]=useState<ErpData>({customers:demoMode?mockCustomers:[],requests:demoMode?mockRequests:[],inventory:demoMode?mockInventory:emptyInventory,contracts:demoMode?demoContracts:[]})
  const [loading,setLoading]=useState(!demoMode); const [error,setError]=useState('')
  useEffect(()=>{if(!client||demoMode)return;let active=true;(async()=>{setLoading(true);setError('');try{
    const [customersResult,sitesResult,contractsResult,requestsResult,requestLinesResult,balancesResult,availabilityResult,locationsResult]=await Promise.all([
      client.from('customers').select('id,legal_name,trade_name').is('archived_at',null).order('legal_name'),
      client.from('customer_sites').select('id,customer_id,name,contact_name').is('archived_at',null),
      client.from('contracts').select('id,folio,contract_type,status,total,customer_id,site_id'),
      client.from('operation_requests').select('id,folio,request_type,status,contract_id,requested_at').order('requested_at',{ascending:false}).limit(20),
      client.from('operation_request_lines').select('request_id'),
      client.from('inventory_balances').select('quantity,location_id'),
      client.from('inventory_availability').select('available,reserved'),
      client.from('inventory_locations').select('id,location_type'),
    ])
    const firstError=[customersResult,sitesResult,contractsResult,requestsResult,requestLinesResult,balancesResult,availabilityResult,locationsResult].find(result=>result.error)?.error
    if(firstError)throw firstError
    type CustomerRow={id:string;legal_name:string;trade_name:string|null};type SiteRow={id:string;customer_id:string;name:string;contact_name:string|null}
    type ContractRow={id:string;folio:string;contract_type:ContractType;status:ContractStatus;total:number;customer_id:string;site_id:string}
    type RequestRow={id:string;folio:string;request_type:RequestType;status:RequestStatus;contract_id:string;requested_at:string}
    const customerRows=(customersResult.data||[]) as CustomerRow[];const siteRows=(sitesResult.data||[]) as SiteRow[];const contractRows=(contractsResult.data||[]) as ContractRow[]
    const requestRows=(requestsResult.data||[]) as RequestRow[];const lineRows=(requestLinesResult.data||[]) as {request_id:string}[]
    const customerById=new Map(customerRows.map(row=>[row.id,row]));const siteById=new Map(siteRows.map(row=>[row.id,row]));const contractById=new Map(contractRows.map(row=>[row.id,row]))
    const locationTypes=new Map(((locationsResult.data||[]) as {id:string;location_type:string}[]).map(row=>[row.id,row.location_type]));const inventory={...emptyInventory}
    for(const row of (availabilityResult.data||[]) as {available:number;reserved:number}[]){inventory.available+=Number(row.available);inventory.reserved+=Number(row.reserved)}
    for(const row of (balancesResult.data||[]) as {quantity:number;location_id:string}[]){const type=locationTypes.get(row.location_id);const quantity=Number(row.quantity);if(type==='customer')inventory.customer+=quantity;else if(type==='inspection')inventory.inspection+=quantity;else if(type==='maintenance')inventory.maintenance+=quantity;else if(type==='damaged')inventory.damaged+=quantity}
    const contracts=contractRows.map(row=>({id:row.id,folio:row.folio,type:row.contract_type,customer:customerById.get(row.customer_id)?.trade_name||customerById.get(row.customer_id)?.legal_name||'Cliente',site:siteById.get(row.site_id)?.name||'Obra',status:row.status,total:Number(row.total)}))
    const customers=customerRows.map(row=>{const site=siteRows.find(item=>item.customer_id===row.id);return{id:row.id,legalName:row.legal_name,tradeName:row.trade_name||undefined,siteName:site?.name||'Sin obra',contactName:site?.contact_name||'Sin contacto',activeContracts:contractRows.filter(item=>item.customer_id===row.id&&['authorized','active'].includes(item.status)).length,equipmentAtSite:0}})
    const requests=requestRows.map(row=>{const contract=contractById.get(row.contract_id);return{id:row.id,folio:row.folio,type:row.request_type,customer:customerById.get(contract?.customer_id||'')?.trade_name||customerById.get(contract?.customer_id||'')?.legal_name||'Cliente',site:siteById.get(contract?.site_id||'')?.name||'Obra',status:row.status,lineCount:lineRows.filter(line=>line.request_id===row.id).length,requestedAt:row.requested_at}})
    if(active)setData({customers,requests,inventory,contracts})
  }catch(cause){if(active)setError(cause instanceof Error?cause.message:'No fue posible cargar la operación')}finally{if(active)setLoading(false)}})();return()=>{active=false}},[client])
  return {data,loading,error}
}

function useActiveMembership(client:SupabaseClient|null,profileId?:string){
  const [organizationId,setOrganizationId]=useState<string>()
  const [roles,setRoles]=useState<string[]>(demoMode?['admin']:[])
  useEffect(()=>{if(!client||!profileId||demoMode)return;let active=true;(async()=>{
    const membership=await client.from('organization_members').select('organization_id').eq('profile_id',profileId).eq('active',true).limit(1).single()
    if(membership.error||!membership.data)return
    const organization=membership.data.organization_id as string
    const roleResult=await client.from('organization_member_roles').select('role_code').eq('organization_id',organization).eq('profile_id',profileId)
    if(active&&!roleResult.error){setOrganizationId(organization);setRoles((roleResult.data||[]).map(row=>row.role_code))}
  })();return()=>{active=false}},[client,profileId])
  return {organizationId,roles}
}

function Brand() {
  return <span className="brand"><span className="mark"><i/><i/><i/></span><span><b>ANDA</b>VALLE<small>OPERACIONES</small></span></span>
}

function Login({ client }: { client: SupabaseClient }) {
  const [email,setEmail]=useState(''); const [password,setPassword]=useState(''); const [message,setMessage]=useState(''); const [busy,setBusy]=useState(false)
  async function submit(event:FormEvent){event.preventDefault();setBusy(true);setMessage('');const {error}=await client.auth.signInWithPassword({email,password});setBusy(false);if(error)setMessage(error.message)}
  return <main className="login"><section><Brand/><p className="eyebrow">Acceso interno</p><h1>Control operativo<br/><em>en un solo lugar.</em></h1><p>Ingresa con la cuenta que te proporcionó el administrador de Andavalle.</p></section><form onSubmit={submit}><ShieldCheck/><h2>Iniciar sesión</h2><label>Correo<input type="email" value={email} onChange={e=>setEmail(e.target.value)} required autoComplete="email"/></label><label>Contraseña<input type="password" value={password} onChange={e=>setPassword(e.target.value)} required autoComplete="current-password"/></label><button disabled={busy}>{busy?'Ingresando…':'Ingresar'}</button>{message&&<p role="alert">{message}</p>}</form></main>
}

function Kpi({icon:Icon,label,value,meta}:{icon:any,label:string,value:string,meta:string}){return <article className="kpi"><span><Icon/></span><div><small>{label}</small><b>{value}</b><p>{meta}</p></div></article>}

function Dashboard({inventory,requests}:{inventory:InventorySummary;requests:OperationRequestSummary[]}){const availability=inventory.available+inventory.reserved?Math.round(inventory.available/(inventory.available+inventory.reserved)*100):0;return <><Title kicker="Resumen operativo" title="Buen día" action="Nueva solicitud"/><div className="kpis"><Kpi icon={Boxes} label="Equipo en obra" value={inventory.customer.toLocaleString('es-MX')} meta="piezas bajo custodia"/><Kpi icon={FileOutput} label="Reservado" value={inventory.reserved.toLocaleString('es-MX')} meta="pendiente de salida"/><Kpi icon={FileInput} label="En inspección" value={inventory.inspection.toLocaleString('es-MX')} meta="pendiente de clasificar"/><Kpi icon={CalendarClock} label="Solicitudes abiertas" value={requests.filter(row=>!['completed','cancelled'].includes(row.status)).length.toString().padStart(2,'0')} meta="salidas y entradas"/></div><div className="dashboard-grid"><Panel title="Flujo operativo" subtitle="Solicitudes recientes"><RequestRows rows={requests}/></Panel><Panel title="Disponibilidad" subtitle="Saldo por condición"><div className="availability"><b>{availability}%</b><span>disponible</span></div><Legend label="Disponible" value={inventory.available}/><Legend label="Reservado" value={inventory.reserved}/><Legend label="Inspección" value={inventory.inspection}/></Panel></div></>}

function Customers({customers}:{customers:CustomerSummary[]}){return <><Title kicker="CRM ligero" title="Clientes y obras" action="Nuevo cliente"/><div className="toolbar"><Search/><input placeholder="Buscar cliente, obra o contacto"/></div><section className="panel customer-list">{customers.map(c=><article key={c.id}><span className="avatar">{(c.tradeName||c.legalName).slice(0,2).toUpperCase()}</span><div><h3>{c.tradeName||c.legalName}</h3><p><Building2/> {c.siteName} · {c.contactName}</p></div><div><small>Contratos activos</small><b>{c.activeContracts}</b></div><div><small>Equipo en obra</small><b>{c.equipmentAtSite.toLocaleString('es-MX')} pzas.</b></div><ChevronRight/></article>)}</section></>}

function Contracts({contracts}:{contracts:ContractSummary[]}){return <><Title kicker="Renta y venta" title="Contratos" action="Nuevo contrato"/><Info icon={<ShoppingCart/>} title="Regla comercial" text="Sólo un contrato autorizado puede originar una SS. Las renovaciones crean un contrato ligado y no mueven inventario."/><Panel title={demoMode?'Contratos de demostración':'Contratos'} subtitle="Importes básicos en MXN"><table><thead><tr><th>Folio</th><th>Tipo</th><th>Cliente / obra</th><th>Estado</th><th>Total</th></tr></thead><tbody>{contracts.map(row=><tr key={row.id}><td>{row.folio}</td><td>{row.type==='rental'?'Renta':'Venta'}</td><td>{row.customer} · {row.site}</td><td><Badge>{contractStatusLabels[row.status]}</Badge></td><td>{row.total.toLocaleString('es-MX',{style:'currency',currency:'MXN'})}</td></tr>)}</tbody></table></Panel></>}

function Requests({requests}:{requests:OperationRequestSummary[]}){return <><Title kicker="Reservas y recolecciones" title="Solicitudes SS / SE" action="Nueva solicitud"/><Info icon={<ClipboardCheck/>} title="Impacto controlado" text="Una SS autorizada reserva disponibilidad. Sólo una HS o HE confirmada genera movimientos en el ledger."/><Panel title="Solicitudes abiertas" subtitle={demoMode?'Datos ficticios reproducibles':'Datos protegidos por RLS'}><RequestRows rows={requests}/></Panel></>}

function Documents(){return <><Title kicker="Documentos confirmados" title="Movimientos HS / HE" action="Confirmar documento"/><Info icon={<PackageCheck/>} title="Documentos inmutables" text="Una confirmación se ejecuta de forma atómica e idempotente. Las correcciones generan una reversión compensatoria."/><Empty icon={<FileOutput/>} title="Ledger preparado" text="Las HS moverán equipo a cliente o venta; las HE clasificarán cada cantidad por condición."/></>}

function Configuration({client,organizationId}:{client:SupabaseClient|null;organizationId?:string}){return <><Title kicker="Administración" title="Configuración"/><div className="settings-grid"><Panel title="Usuarios y roles" subtitle="Invitación administrada"><p>Un usuario puede acumular los roles Administrador, Comercial, Almacén y Logística.</p><button className="primary" disabled title="La función de servidor está lista; falta conectar este formulario">Invitar usuario</button></Panel><Panel title="Entorno" subtitle={demoMode?'Modo demostración':'Supabase conectado'}><p>{demoMode?'La interfaz usa datos ficticios. Configura Supabase y desactiva VITE_DEMO_MODE después de aplicar la migración.':'La sesión y las consultas están protegidas por RLS.'}</p></Panel></div><PricingAdministration client={client} organizationId={organizationId} demoMode={demoMode}/></>}

function Title({kicker,title,action}:{kicker:string,title:string,action?:string}){return <div className="title"><div><p>{kicker}</p><h1>{title}</h1></div>{action&&<button className="primary" disabled title="Disponible al implementar el formulario de este módulo"><ClipboardList/>{action}</button>}</div>}
function Panel({title,subtitle,children}:{title:string,subtitle:string,children:ReactNode}){return <section className="panel"><header><div><h2>{title}</h2><p>{subtitle}</p></div></header>{children}</section>}
function Badge({children}:{children:ReactNode}){return <span className="badge">{children}</span>}
function Legend({label,value}:{label:string,value:number}){return <div className="legend"><span>{label}</span><b>{value.toLocaleString('es-MX')}</b></div>}
function Info({icon,title,text}:{icon:ReactNode,title:string,text:string}){return <div className="info">{icon}<div><b>{title}</b><p>{text}</p></div></div>}
function Empty({icon,title,text}:{icon:ReactNode,title:string,text:string}){return <section className="empty"><span>{icon}</span><h2>{title}</h2><p>{text}</p></section>}
function RequestRows({rows}:{rows:OperationRequestSummary[]}){return <div className="request-list">{rows.map(r=><article key={r.id}><span className={r.type==='SS'?'out':'in'}>{r.type==='SS'?<FileOutput/>:<FileInput/>}</span><div><b>{r.folio}</b><small>{r.type==='SS'?'Solicitud de salida':'Solicitud de entrada'}</small></div><div><b>{r.customer}</b><small>{r.site}</small></div><div><b>{r.lineCount}</b><small>partidas</small></div><Badge>{requestStatusLabels[r.status]}</Badge><ChevronRight/></article>)}</div>}

function Shell({session,client}:{session:Session|null,client:SupabaseClient|null}){
  const [screen,setScreen]=useState<Screen>('dashboard')
  const [requestContractId,setRequestContractId]=useState<string>()
  const [documentRequestId,setDocumentRequestId]=useState<string>()
  const [receiptRequestId,setReceiptRequestId]=useState<string>()
  const {data,loading,error}=useErpData(client)
  const membership=useActiveMembership(client,session?.user.id)
  const isAdmin=demoMode||membership.roles.includes('admin')
  const nav:Array<[Screen,string,typeof Gauge]>=[
    ['dashboard','Resumen',Gauge],['crm','CRM y clientes',Users],['contracts','Contratos',ShoppingCart],['requests','Solicitudes SS / SE',ClipboardList],['documents','Documentos HS / HE',PackageCheck],['inventory','Inventario',Warehouse],
  ]
  if(isAdmin)nav.push(['settings','Configuración',Settings])
  const screens:Record<Screen,ReactNode>={dashboard:<Dashboard inventory={data.inventory} requests={data.requests}/>,crm:<CrmModule client={client} profileId={session?.user.id} demoMode={demoMode}/>,contracts:<ContractsModule client={client} profileId={session?.user.id} demoMode={demoMode} onCreateSs={contractId=>{setRequestContractId(contractId);setScreen('requests')}}/>,requests:<RequestsModule client={client} profileId={session?.user.id} demoMode={demoMode} initialContractId={requestContractId} onInitialContractConsumed={()=>setRequestContractId(undefined)} onCreateHs={requestId=>{setDocumentRequestId(requestId);setScreen('documents')}} onCreateHe={requestId=>{setReceiptRequestId(requestId);setScreen('documents')}}/>,documents:<DocumentsModule client={client} profileId={session?.user.id} demoMode={demoMode} initialRequestId={documentRequestId} onInitialRequestConsumed={()=>setDocumentRequestId(undefined)} initialHeRequestId={receiptRequestId} onInitialHeRequestConsumed={()=>setReceiptRequestId(undefined)}/>,inventory:<InventoryModule client={client} profileId={session?.user.id} demoMode={demoMode}/>,settings:isAdmin?<Configuration client={client} organizationId={membership.organizationId}/>:<Empty icon={<ShieldCheck/>} title="Acceso restringido" text="Sólo administración puede modificar la configuración del sistema."/>}
  return <div className="shell"><aside><Brand/><nav>{nav.map(([id,label,Icon])=><button key={id} className={screen===id?'active':''} onClick={()=>setScreen(id)}><Icon/>{label}</button>)}</nav><div className="aside-bottom"><a href={import.meta.env.VITE_SITE_URL||'/'}>Ver sitio público</a>{client&&session&&<button onClick={()=>client.auth.signOut()}><LogOut/>Cerrar sesión</button>}<div className="user"><span>{demoMode?'DA':(session?.user.email||'U').slice(0,2).toUpperCase()}</span><div><b>{demoMode?'Demo arquitectura':session?.user.email}</b><small>{demoMode?'Administrador':'Sesión protegida'}</small></div></div></div></aside><main>{demoMode&&<div className="demo-banner">Modo demostración · Los registros visibles son ficticios</div>}{loading&&<div className="demo-banner">Cargando datos protegidos…</div>}{error&&<div className="demo-banner" role="alert">No se pudieron cargar los datos: {error}</div>}{screens[screen]}</main></div>
}

export default function App(){
  const [session,setSession]=useState<Session|null>(null); const [loading,setLoading]=useState(Boolean(supabase)&&!demoMode)
  useEffect(()=>{if(!supabase||demoMode)return;supabase.auth.getSession().then(({data})=>{setSession(data.session);setLoading(false)});const {data}=supabase.auth.onAuthStateChange((_event,next)=>setSession(next));return()=>data.subscription.unsubscribe()},[])
  if(loading)return <div className="loading">Cargando Andavalle ERP…</div>
  if(supabase&&!demoMode&&!session)return <Login client={supabase}/>
  return <Shell session={session} client={supabase}/>
}

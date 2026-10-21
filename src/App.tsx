import { useEffect, useMemo, useState } from 'react'
import {
  ArrowRight, Boxes, Building2, CalendarClock, CheckCircle2, ChevronRight,
  ClipboardCheck, ClipboardList, Construction, FileInput, FileOutput, Gauge,
  HardHat, Headphones, Menu, MessageCircle, PackageCheck, Phone, Search,
  ShieldCheck, Users, Warehouse, Wrench, X,
} from 'lucide-react'

type Screen = 'inicio' | 'clientes' | 'solicitudes' | 'movimientos' | 'inventario'

const services = [
  { icon: Construction, title: 'Andamios', text: 'Sistemas convencionales y multidireccionales para renta o venta, dimensionados para cada frente de trabajo.' },
  { icon: Gauge, title: 'Apuntalamiento', text: 'Diseño y suministro de soluciones temporales con andamios o puntales para proyectos de distinta escala.' },
  { icon: HardHat, title: 'Armado de equipo', text: 'Personal para el montaje del sistema, con planeación operativa y acompañamiento en sitio.' },
  { icon: Headphones, title: 'Asesoría técnica', text: 'Revisión de necesidades, selección de equipo y acompañamiento desde la planeación hasta el retiro.' },
]

const equipment = [
  { code: 'AC', title: 'Andamio convencional', meta: 'Marcos, crucetas y plataformas', tone: 'lime' },
  { code: 'AM', title: 'Multidireccional', meta: 'Configuraciones complejas y modulares', tone: 'dark' },
  { code: 'AP', title: 'Apuntalamiento', meta: 'Puntales y torres de carga', tone: 'gray' },
  { code: 'HM', title: 'Hamacas', meta: 'Acceso suspendido para fachadas', tone: 'outline' },
]

const requests = [
  { folio: 'SS-0028', type: 'Salida', client: 'Constructora Valle Alto', site: 'Nave Norte', date: '21 oct', status: 'Lista para HS', lines: 14 },
  { folio: 'SE-0019', type: 'Entrada', client: 'Proyectos Lerma', site: 'Edificio B', date: '21 oct', status: 'En recepción', lines: 8 },
  { folio: 'SS-0027', type: 'Salida', client: 'Ingeniería del Centro', site: 'Planta Toluca', date: '20 oct', status: 'En preparación', lines: 11 },
]

const customers = [
  { initials: 'CV', name: 'Constructora Valle Alto', site: 'Nave Norte', contact: 'Laura Méndez', active: 2, balance: '1,248 pzas.' },
  { initials: 'PL', name: 'Proyectos Lerma', site: 'Edificio B', contact: 'Mauricio León', active: 1, balance: '684 pzas.' },
  { initials: 'IC', name: 'Ingeniería del Centro', site: 'Planta Toluca', contact: 'Sara Luna', active: 3, balance: '2,106 pzas.' },
]

function Brand({ inverse = false }: { inverse?: boolean }) {
  return <div className={`brand ${inverse ? 'brand--inverse' : ''}`}>
    <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
    <span><b>ANDA</b>VALLE<small>Soluciones en altura</small></span>
  </div>
}

function PublicSite({ openErp }: { openErp: () => void }) {
  const [menuOpen, setMenuOpen] = useState(false)
  return <div className="public-site">
    <header className="site-header">
      <a href="#inicio" aria-label="Andavalle inicio"><Brand /></a>
      <nav className={menuOpen ? 'nav-open' : ''}>
        {['Inicio', 'Nosotros', 'Equipos', 'Servicios', 'Contacto'].map(item => <a key={item} href={`#${item.toLowerCase()}`} onClick={() => setMenuOpen(false)}>{item}</a>)}
        <button className="link-button" onClick={openErp}>Acceso ERP <ArrowRight size={16}/></button>
      </nav>
      <button className="menu-button" onClick={() => setMenuOpen(v => !v)} aria-label="Abrir menú">{menuOpen ? <X/> : <Menu/>}</button>
    </header>

    <main>
      <section id="inicio" className="hero">
        <div className="hero-copy">
          <p className="eyebrow"><span /> Ingeniería práctica para obra</p>
          <h1>Altura segura.<br/><em>Proyecto resuelto.</em></h1>
          <p className="hero-lead">Venta, renta y armado de sistemas de andamios, hamacas y apuntalamiento para proyectos que necesitan avanzar con certeza.</p>
          <div className="hero-actions">
            <a className="button button--primary" href="#contacto">Cotizar proyecto <ArrowRight size={18}/></a>
            <a className="button button--ghost" href="#equipos">Ver equipos</a>
          </div>
          <div className="hero-trust"><ShieldCheck/><span><b>Asesoría desde el primer contacto</b><small>Lerma, Estado de México</small></span></div>
        </div>
        <div className="hero-visual" aria-label="Estructura modular de andamios">
          <div className="grid-lines" />
          <div className="scaffold">
            {[0,1,2,3].map(col => <span key={col} className="post" style={{left:`${12 + col*24}%`}} />)}
            {[0,1,2,3].map(row => <span key={row} className="level" style={{top:`${14 + row*22}%`}} />)}
            {[0,1,2].map(i => <span key={i} className="brace brace-a" style={{left:`${13+i*24}%`}} />)}
            {[0,1,2].map(i => <span key={i} className="brace brace-b" style={{left:`${13+i*24}%`}} />)}
            <div className="platform"/><div className="worker"><HardHat/></div>
          </div>
          <div className="spec-card"><small>CAPACIDAD OPERATIVA</small><b>Sistemas configurados<br/>para cada proyecto</b></div>
        </div>
      </section>

      <section className="metric-strip">
        <div><b>01</b><span>Diagnóstico técnico</span></div><div><b>02</b><span>Selección de sistema</span></div><div><b>03</b><span>Entrega y armado</span></div><div><b>04</b><span>Seguimiento en obra</span></div>
      </section>

      <section id="nosotros" className="section split-section">
        <div><p className="eyebrow">Quiénes somos</p><h2>Equipo confiable para trabajar <em>por encima.</em></h2></div>
        <div><p>En Andavalle convertimos una necesidad de acceso o soporte temporal en una solución clara: equipo adecuado, suministro coordinado y asesoría técnica cercana.</p><p>Atendemos desde requerimientos puntuales hasta configuraciones especiales de apuntalamiento y armado.</p><a href="#contacto" className="text-link">Hablar con un asesor <ArrowRight size={17}/></a></div>
      </section>

      <section id="equipos" className="section equipment-section">
        <div className="section-heading"><div><p className="eyebrow">Catálogo</p><h2>Equipos para cada <em>desafío.</em></h2></div><p>Consulta nuestras familias principales. La selección y disponibilidad se confirman para cada proyecto.</p></div>
        <div className="equipment-grid">{equipment.map((item, idx) => <article className={`equipment-card ${item.tone}`} key={item.code}>
          <div className="equipment-index">0{idx+1}</div><div className="equipment-glyph"><span>{item.code}</span></div><h3>{item.title}</h3><p>{item.meta}</p><a href="#contacto">Solicitar información <ChevronRight size={16}/></a>
        </article>)}</div>
      </section>

      <section id="servicios" className="section services-section">
        <div className="service-intro"><p className="eyebrow">Servicios</p><h2>Más que equipo:<br/><em>acompañamiento.</em></h2><p>Integramos suministro, planeación y soporte técnico para simplificar la operación en obra.</p></div>
        <div className="service-list">{services.map((service, idx) => { const Icon=service.icon; return <article key={service.title}><span>0{idx+1}</span><Icon/><div><h3>{service.title}</h3><p>{service.text}</p></div></article>})}</div>
      </section>

      <section id="contacto" className="contact-section">
        <div className="contact-copy"><p className="eyebrow">Comencemos</p><h2>Cuéntanos qué necesita tu <em>proyecto.</em></h2><p>Comparte ubicación, altura aproximada, tipo de trabajo y fechas. Te ayudamos a identificar la solución adecuada.</p><div className="contact-details"><a href="tel:+525538137988"><Phone/>55 3813 7988</a><a href="https://wa.me/525538137988" target="_blank" rel="noreferrer"><MessageCircle/>WhatsApp</a></div></div>
        <form className="contact-form" onSubmit={e => e.preventDefault()}>
          <label>Nombre<input placeholder="Tu nombre" /></label><label>Empresa<input placeholder="Nombre de la empresa" /></label>
          <label>Teléfono<input placeholder="55 0000 0000" /></label><label>Correo<input type="email" placeholder="correo@empresa.com" /></label>
          <label className="full">Cuéntanos sobre el proyecto<textarea rows={4} placeholder="Tipo de equipo, ubicación y fechas aproximadas" /></label>
          <button className="button button--primary full" type="submit">Enviar solicitud <ArrowRight size={18}/></button><small className="full">Formulario de demostración. Se conectará al CRM al configurar Supabase.</small>
        </form>
      </section>
    </main>
    <footer><Brand inverse/><div><b>Andavalle S.A. de C.V.</b><span>Lerma, Estado de México</span><span>Lunes a viernes · 8:00–17:00</span></div><div><a href="mailto:grupoandavalle@gmail.com">grupoandavalle@gmail.com</a><button onClick={openErp}>Acceso ERP</button></div></footer>
    <a className="whatsapp-float" href="https://wa.me/525538137988" target="_blank" rel="noreferrer" aria-label="Escribir por WhatsApp"><MessageCircle/></a>
  </div>
}

function Dashboard() {
  return <><div className="erp-heading"><div><p>Miércoles, 21 de octubre</p><h1>Buen día, Gustavo</h1></div><button className="erp-primary"><ClipboardList size={18}/> Nueva solicitud</button></div>
    <div className="kpi-grid">
      <Kpi icon={Boxes} label="Equipo en obra" value="4,038" meta="piezas en 6 proyectos" />
      <Kpi icon={FileOutput} label="Salidas pendientes" value="02" meta="1 lista para confirmar" alert />
      <Kpi icon={FileInput} label="Entradas hoy" value="684" meta="piezas recibidas" />
      <Kpi icon={CalendarClock} label="Por recolectar" value="03" meta="contratos con solicitud" />
    </div>
    <div className="dashboard-grid">
      <section className="panel span-2"><div className="panel-title"><div><h2>Flujo operativo</h2><p>Solicitudes y movimientos recientes</p></div><button>Ver todos</button></div><div className="request-list">{requests.map((r,i)=><div className="request-row" key={r.folio}><span className={`doc-icon ${r.type==='Salida'?'out':'in'}`}>{r.type==='Salida'?<FileOutput/>:<FileInput/>}</span><div><b>{r.folio}</b><small>{r.type} · {r.lines} partidas</small></div><div><b>{r.client}</b><small>{r.site}</small></div><span className="status-pill">{r.status}</span><small>{r.date}</small><ChevronRight/></div>)}</div></section>
      <section className="panel"><div className="panel-title"><div><h2>Disponibilidad</h2><p>Resumen de almacén</p></div></div><div className="donut"><div><b>86%</b><span>disponible</span></div></div><div className="legend"><span><i className="green"/>Disponible <b>8,420</b></span><span><i className="yellow"/>Reservado <b>1,108</b></span><span><i className="gray"/>Inspección <b>312</b></span></div></section>
      <section className="panel span-3"><div className="panel-title"><div><h2>Contratos activos</h2><p>Seguimiento de equipo en obra</p></div><button>Ver contratos</button></div><table><thead><tr><th>Contrato</th><th>Cliente / obra</th><th>Inicio</th><th>Equipo</th><th>Estado</th></tr></thead><tbody><tr><td><b>R-1042</b></td><td>Constructora Valle Alto<br/><small>Nave Norte</small></td><td>08 oct 2026</td><td>1,248 pzas.</td><td><span className="status-pill">En renta</span></td></tr><tr><td><b>R-1040</b></td><td>Ingeniería del Centro<br/><small>Planta Toluca</small></td><td>01 oct 2026</td><td>2,106 pzas.</td><td><span className="status-pill muted">Renovación</span></td></tr></tbody></table></section>
    </div></>
}

function Kpi({icon:Icon,label,value,meta,alert=false}:{icon:any,label:string,value:string,meta:string,alert?:boolean}) { return <div className={`kpi ${alert?'kpi--alert':''}`}><span><Icon/></span><div><small>{label}</small><b>{value}</b><p>{meta}</p></div></div> }

function Customers() { return <><div className="erp-heading"><div><p>CRM ligero</p><h1>Clientes y obras</h1></div><button className="erp-primary"><Users size={18}/> Nuevo cliente</button></div><div className="toolbar"><div className="search"><Search/><input placeholder="Buscar cliente, obra o contacto"/></div><button>Todos los clientes</button></div><section className="panel customer-panel">{customers.map(c=><article className="customer-card" key={c.name}><span className="avatar">{c.initials}</span><div className="customer-main"><h3>{c.name}</h3><p><Building2 size={15}/>{c.site}</p><small>Contacto: {c.contact}</small></div><div><small>Contratos activos</small><b>{c.active}</b></div><div><small>Equipo en obra</small><b>{c.balance}</b></div><button><ChevronRight/></button></article>)}</section></> }

function Requests() { return <><div className="erp-heading"><div><p>Borradores operativos</p><h1>Solicitudes SS / SE</h1></div><button className="erp-primary"><ClipboardList size={18}/> Nueva solicitud</button></div><div className="process-banner"><ClipboardCheck/><div><b>Las solicitudes no afectan inventario</b><p>Una SS se convierte en HS al confirmar la salida; una SE se convierte en HE al confirmar la recepción.</p></div></div><section className="panel"><div className="panel-title"><div><h2>Solicitudes abiertas</h2><p>Preparación y recepción por confirmar</p></div></div><div className="request-list large">{requests.map(r=><div className="request-row" key={r.folio}><span className={`doc-icon ${r.type==='Salida'?'out':'in'}`}>{r.type==='Salida'?<FileOutput/>:<FileInput/>}</span><div><b>{r.folio}</b><small>Solicitud de {r.type.toLowerCase()}</small></div><div><b>{r.client}</b><small>{r.site}</small></div><div><b>{r.lines}</b><small>partidas</small></div><span className="status-pill">{r.status}</span><ChevronRight/></div>)}</div></section></> }

function Placeholder({kind}:{kind:'movimientos'|'inventario'}) { const inventory=kind==='inventario'; return <><div className="erp-heading"><div><p>{inventory?'Existencias derivadas del ledger':'Documentos confirmados'}</p><h1>{inventory?'Inventario':'Movimientos HS / HE'}</h1></div><button className="erp-primary">{inventory?<><Warehouse size={18}/> Conteo físico</>:<><PackageCheck size={18}/> Confirmar documento</>}</button></div><div className="empty-feature"><div>{inventory?<Warehouse/>:<PackageCheck/>}</div><h2>{inventory?'Saldo por SKU y ubicación':'Trazabilidad de cada movimiento'}</h2><p>{inventory?'El inventario no se editará directamente: se calculará desde movimientos confirmados.':'Las HS y HE confirmadas serán inmutables. Las correcciones se realizarán con movimientos compensatorios.'}</p><span>Vista preparada para conectar con Supabase</span></div></> }

function ErpApp({ closeErp }: { closeErp: () => void }) {
  const [screen,setScreen]=useState<Screen>('inicio')
  const nav = useMemo(()=>[
    {id:'inicio' as Screen,label:'Resumen',icon:Gauge},{id:'clientes' as Screen,label:'Clientes y obras',icon:Users},{id:'solicitudes' as Screen,label:'Solicitudes SS / SE',icon:ClipboardList},{id:'movimientos' as Screen,label:'Movimientos HS / HE',icon:PackageCheck},{id:'inventario' as Screen,label:'Inventario',icon:Warehouse},
  ],[])
  return <div className="erp-shell"><aside><div className="erp-brand"><Brand inverse/><span>OPERACIONES</span></div><nav>{nav.map(item=>{const Icon=item.icon; return <button className={screen===item.id?'active':''} key={item.id} onClick={()=>setScreen(item.id)}><Icon/>{item.label}</button>})}</nav><div className="aside-bottom"><button><Wrench/>Configuración</button><button onClick={closeErp}><ArrowRight/>Ver sitio público</button><div className="user-chip"><span>GM</span><div><b>Gustavo M.</b><small>Administrador</small></div></div></div></aside><main className="erp-main">{screen==='inicio'&&<Dashboard/>}{screen==='clientes'&&<Customers/>}{screen==='solicitudes'&&<Requests/>}{screen==='movimientos'&&<Placeholder kind="movimientos"/>}{screen==='inventario'&&<Placeholder kind="inventario"/>}</main></div>
}

export default function App() {
  const [erp, setErp] = useState(window.location.hash === '#erp')
  useEffect(()=>{const onHash=()=>setErp(window.location.hash==='#erp'); window.addEventListener('hashchange',onHash); return()=>window.removeEventListener('hashchange',onHash)},[])
  const openErp=()=>{window.location.hash='erp';setErp(true)}
  const closeErp=()=>{history.pushState('',document.title,window.location.pathname);setErp(false)}
  return erp ? <ErpApp closeErp={closeErp}/> : <PublicSite openErp={openErp}/>
}

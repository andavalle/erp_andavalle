import { useState, type FormEvent } from 'react'
import { ArrowRight, Construction, Gauge, HardHat, Headphones, Menu, MessageCircle, Phone, ShieldCheck, X } from 'lucide-react'
import { validateContactLead } from '@andavalle/shared'

const services = [
  { icon: Construction, title: 'Andamios', text: 'Sistemas convencionales y multidireccionales para renta o venta.' },
  { icon: Gauge, title: 'Apuntalamiento', text: 'Soluciones temporales con andamios o puntales para cada proyecto.' },
  { icon: HardHat, title: 'Armado de equipo', text: 'Planeación y montaje del sistema con acompañamiento en sitio.' },
  { icon: Headphones, title: 'Asesoría técnica', text: 'Selección de equipo y seguimiento desde la planeación hasta el retiro.' },
]

const equipment = [
  ['AC', 'Andamio convencional', 'Marcos, crucetas y plataformas'],
  ['AM', 'Multidireccional', 'Configuraciones complejas y modulares'],
  ['AP', 'Apuntalamiento', 'Puntales y torres de carga'],
  ['HM', 'Hamacas', 'Acceso suspendido para fachadas'],
]
const privacyNoticeVersion = '2026-10-26'

function Brand() {
  return <span className="brand"><span className="brand-mark"><i/><i/><i/></span><span><b>ANDA</b>VALLE<small>Soluciones en altura</small></span></span>
}

function ContactForm() {
  const [state, setState] = useState<'idle' | 'sending' | 'success' | 'error'>('idle')
  const [message, setMessage] = useState('')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    const result = validateContactLead({
      name: String(data.get('name') || ''), company: String(data.get('company') || ''),
      phone: String(data.get('phone') || ''), email: String(data.get('email') || ''),
      message: String(data.get('message') || ''), turnstileToken: String(data.get('cf-turnstile-response') || ''),
      privacyConsent: data.get('privacyConsent') === 'on', privacyNoticeVersion,
    })
    if (!result.ok || !result.value) { setState('error'); setMessage(result.errors[0]); return }
    const url = import.meta.env.VITE_SUPABASE_URL
    const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
    if (!url || !key) { setState('error'); setMessage('El formulario aún no está conectado. Escríbenos por WhatsApp.'); return }
    setState('sending')
    try {
      const response = await fetch(`${url}/functions/v1/submit-lead`, {
        method: 'POST', headers: { 'content-type': 'application/json', apikey: key }, body: JSON.stringify(result.value),
      })
      if (!response.ok) throw new Error('No fue posible enviar la solicitud.')
      form.reset(); setState('success'); setMessage('Recibimos tu solicitud. Te contactaremos pronto.')
    } catch (error) {
      setState('error'); setMessage(error instanceof Error ? error.message : 'No fue posible enviar la solicitud.')
    }
  }

  return <form className="contact-form" onSubmit={submit}>
    <label>Nombre<input name="name" required maxLength={120} placeholder="Tu nombre" /></label>
    <label>Empresa<input name="company" maxLength={160} placeholder="Nombre de la empresa" /></label>
    <label>Teléfono<input name="phone" maxLength={30} placeholder="55 0000 0000" /></label>
    <label>Correo<input name="email" type="email" maxLength={254} placeholder="correo@empresa.com" /></label>
    <label className="full">Cuéntanos sobre el proyecto<textarea name="message" required minLength={10} maxLength={2000} rows={4} placeholder="Equipo, ubicación y fechas aproximadas" /></label>
    <label className="privacy-consent full"><input type="checkbox" name="privacyConsent" required/><span>Acepto que Andavalle utilice estos datos para atender mi solicitud conforme al aviso de privacidad.</span></label>
    {import.meta.env.VITE_TURNSTILE_SITE_KEY
      ? <div className="cf-turnstile full" data-sitekey={import.meta.env.VITE_TURNSTILE_SITE_KEY} />
      : <p className="form-note full">Configura VITE_TURNSTILE_SITE_KEY para habilitar envíos.</p>}
    <button className="button primary full" disabled={state === 'sending'}>{state === 'sending' ? 'Enviando…' : <>Enviar solicitud <ArrowRight size={18}/></>}</button>
    {message && <p className={`form-message full ${state}`} role="status">{message}</p>}
  </form>
}

export default function App() {
  const [menu, setMenu] = useState(false)
  const erpUrl = import.meta.env.VITE_ERP_URL || '/erp'
  return <div>
    <header><a href="#inicio"><Brand/></a><nav className={menu ? 'open' : ''}>{['Inicio','Nosotros','Equipos','Servicios','Contacto'].map(label => <a key={label} href={`#${label.toLowerCase()}`} onClick={()=>setMenu(false)}>{label}</a>)}<a className="erp-link" href={erpUrl}>Acceso ERP <ArrowRight size={16}/></a></nav><button className="menu" onClick={()=>setMenu(!menu)} aria-label="Abrir menú">{menu?<X/>:<Menu/>}</button></header>
    <main>
      <section id="inicio" className="hero"><div><p className="eyebrow">Ingeniería práctica para obra</p><h1>Altura segura.<br/><em>Proyecto resuelto.</em></h1><p className="lead">Venta, renta y armado de sistemas de andamios, hamacas y apuntalamiento para proyectos que necesitan avanzar con certeza.</p><div className="actions"><a className="button primary" href="#contacto">Cotizar proyecto <ArrowRight size={18}/></a><a className="button secondary" href="#equipos">Ver equipos</a></div><div className="trust"><ShieldCheck/><span><b>Asesoría desde el primer contacto</b><small>Lerma, Estado de México</small></span></div></div><div className="hero-art"><div className="scaffold">{[0,1,2,3].map(i=><i key={`p${i}`} className="post" style={{left:`${12+i*24}%`}}/>)}{[0,1,2,3].map(i=><i key={`l${i}`} className="level" style={{top:`${14+i*22}%`}}/>)}<HardHat/></div><span>Sistemas configurados<br/>para cada proyecto</span></div></section>
      <section id="nosotros" className="section split"><div><p className="eyebrow">Quiénes somos</p><h2>Equipo confiable para trabajar <em>por encima.</em></h2></div><div><p>Convertimos una necesidad de acceso o soporte temporal en una solución clara: equipo adecuado, suministro coordinado y asesoría técnica cercana.</p><p>Atendemos requerimientos puntuales, proyectos de apuntalamiento y armado.</p></div></section>
      <section id="equipos" className="section"><p className="eyebrow">Catálogo</p><h2>Equipos para cada <em>desafío.</em></h2><div className="equipment">{equipment.map(([code,title,text],i)=><article key={code}><small>0{i+1}</small><span>{code}</span><h3>{title}</h3><p>{text}</p><a href="#contacto">Solicitar información <ArrowRight size={15}/></a></article>)}</div></section>
      <section id="servicios" className="section services"><div><p className="eyebrow">Servicios</p><h2>Más que equipo:<br/><em>acompañamiento.</em></h2></div><div>{services.map(({icon:Icon,title,text})=><article key={title}><Icon/><div><h3>{title}</h3><p>{text}</p></div></article>)}</div></section>
      <section id="contacto" className="contact"><div><p className="eyebrow">Comencemos</p><h2>Cuéntanos qué necesita tu <em>proyecto.</em></h2><p>Comparte ubicación, altura aproximada, tipo de trabajo y fechas.</p><a href="tel:+525538137988"><Phone/>55 3813 7988</a><a href="https://wa.me/525538137988"><MessageCircle/>WhatsApp</a></div><ContactForm/></section>
    </main>
    <footer><Brand/><span>Andavalle S.A. de C.V. · Lerma, Estado de México · L–V 8:00–17:00</span><a href="mailto:grupoandavalle@gmail.com">grupoandavalle@gmail.com</a></footer>
    <a className="whatsapp" href="https://wa.me/525538137988" aria-label="WhatsApp"><MessageCircle/></a>
  </div>
}

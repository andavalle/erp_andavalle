import { adminClient, corsHeaders, json } from '../_shared/server.ts'

interface LeadPayload { name?:unknown; company?:unknown; phone?:unknown; email?:unknown; message?:unknown; turnstileToken?:unknown; privacyConsent?:unknown; privacyNoticeVersion?:unknown }
const emailPattern=/^[^\s@]+@[^\s@]+\.[^\s@]+$/

Deno.serve(async req => {
  if (req.method==='OPTIONS') return new Response(null,{status:204,headers:corsHeaders(req)})
  if (req.method!=='POST') return json(req,{error:'Método no permitido'},405)
  try {
    const body=await req.json() as LeadPayload
    const name=typeof body.name==='string'?body.name.trim():''
    const company=typeof body.company==='string'?body.company.trim():''
    const phone=typeof body.phone==='string'?body.phone.trim():''
    const email=typeof body.email==='string'?body.email.trim().toLowerCase():''
    const message=typeof body.message==='string'?body.message.trim():''
    const token=typeof body.turnstileToken==='string'?body.turnstileToken.trim():''
    const privacyConsent=body.privacyConsent===true
    const privacyNoticeVersion=typeof body.privacyNoticeVersion==='string'?body.privacyNoticeVersion.trim():''
    if(name.length<2||name.length>120||(!phone&&!email)||(phone&&(phone.length<8||phone.length>30))||message.length<10||message.length>2000||(email&&!emailPattern.test(email))||!privacyConsent||!privacyNoticeVersion) return json(req,{error:'Datos inválidos'},400)

    const turnstileSecret=Deno.env.get('TURNSTILE_SECRET_KEY')
    if(!turnstileSecret||!token) return json(req,{error:'Verificación requerida'},400)
    const verification=new URLSearchParams({secret:turnstileSecret,response:token})
    const remoteIp=req.headers.get('cf-connecting-ip'); if(remoteIp) verification.set('remoteip',remoteIp)
    const turnstileResponse=await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',body:verification})
    const turnstile=await turnstileResponse.json() as {success?:boolean;hostname?:string}
    const allowedHosts=(Deno.env.get('TURNSTILE_ALLOWED_HOSTS')||'').split(',').map(v=>v.trim()).filter(Boolean)
    if(!turnstile.success||(allowedHosts.length>0&&!allowedHosts.includes(turnstile.hostname||''))) return json(req,{error:'Verificación rechazada'},403)

    const organizationId=Deno.env.get('PUBLIC_ORGANIZATION_ID')
    if(!organizationId) throw new Error('PUBLIC_ORGANIZATION_ID is not configured')
    const admin=adminClient()
    const {error}=await admin.rpc('create_website_crm_lead',{
      p_organization_id:organizationId,p_name:name,p_company:company,p_phone:phone,
      p_email:email,p_need_summary:message,p_privacy_notice_version:privacyNoticeVersion,
    })
    if(error) throw error
    return json(req,{ok:true},201)
  } catch(error) {
    console.error('submit-lead failed',error)
    return json(req,{error:'No fue posible registrar la solicitud'},500)
  }
})

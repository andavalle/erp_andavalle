import { adminClient, corsHeaders, json, userClient } from '../_shared/server.ts'

const roles=['admin','commercial','warehouse','logistics'] as const
type Role=typeof roles[number]

Deno.serve(async req=>{
  if(req.method==='OPTIONS') return new Response(null,{status:204,headers:corsHeaders(req)})
  if(req.method!=='POST') return json(req,{error:'Método no permitido'},405)
  try{
    const scoped=userClient(req)
    const {data:{user},error:userError}=await scoped.auth.getUser()
    if(userError||!user) return json(req,{error:'Sesión inválida'},401)
    const body=await req.json() as {organizationId?:string;email?:string;displayName?:string;roles?:Role[];redirectTo?:string}
    const requestedRoles=[...new Set(body.roles||[])].filter((role):role is Role=>roles.includes(role))
    if(!body.organizationId||!body.email||requestedRoles.length===0) return json(req,{error:'Datos incompletos'},400)
    const {data:adminRole}=await scoped.from('organization_member_roles').select('role_code').eq('organization_id',body.organizationId).eq('profile_id',user.id).eq('role_code','admin').maybeSingle()
    if(!adminRole) return json(req,{error:'Sin permiso'},403)

    const admin=adminClient()
    const {data:invited,error:inviteError}=await admin.auth.admin.inviteUserByEmail(body.email,{data:{display_name:body.displayName||body.email.split('@')[0]},redirectTo:body.redirectTo})
    if(inviteError||!invited.user) throw inviteError||new Error('No user returned')
    const {error:memberError}=await admin.from('organization_members').insert({organization_id:body.organizationId,profile_id:invited.user.id})
    if(memberError) throw memberError
    const {error:roleError}=await admin.from('organization_member_roles').insert(requestedRoles.map(role_code=>({organization_id:body.organizationId,profile_id:invited.user.id,role_code})))
    if(roleError) throw roleError
    return json(req,{ok:true,userId:invited.user.id},201)
  }catch(error){console.error('invite-user failed',error);return json(req,{error:'No fue posible enviar la invitación'},500)}
})

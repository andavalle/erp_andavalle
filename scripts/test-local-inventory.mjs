import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env=Object.fromEntries(readFileSync(new URL('../.env.localdb.local',import.meta.url),'utf8').split(/\r?\n/).filter(line=>line&&!line.startsWith('#')).map(line=>{const at=line.indexOf('=');return [line.slice(0,at),line.slice(at+1)]}))
const client=createClient(env.VITE_SUPABASE_URL,env.VITE_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false}})
const expect=(condition,message)=>{if(!condition)throw new Error(message)}

const login=await client.auth.signInWithPassword({email:'admin@andavalle.local',password:'AndavalleLocal#2026'});if(login.error)throw login.error
const membership=await client.from('organization_members').select('organization_id').eq('profile_id',login.data.user.id).eq('active',true).single();if(membership.error)throw membership.error
const organizationId=membership.data.organization_id
const positions=await client.from('inventory_position').select('*').eq('organization_id',organizationId);if(positions.error)throw positions.error
expect(positions.data.length>0,'El tablero no devolvió productos')
for(const row of positions.data){
  expect(Math.abs(Number(row.available_on_hand)-Number(row.reserved)-Number(row.available))<.0001,`Disponible inconsistente para ${row.sku}`)
  const classified=Number(row.available_on_hand)+Number(row.customer)+Number(row.inspection)+Number(row.maintenance)+Number(row.damaged)+Number(row.writeoff)+Number(row.sold)
  expect(Math.abs(classified-Number(row.net_quantity))<.0001,`Saldo clasificado inconsistente para ${row.sku}`)
}
const traces=await client.from('inventory_trace').select('movement_id,product_id,document_folio,from_location,to_location').eq('organization_id',organizationId).limit(1000);if(traces.error)throw traces.error
const movements=await client.from('inventory_movements').select('id').eq('organization_id',organizationId).limit(1000);if(movements.error)throw movements.error
expect(traces.data.length===movements.data.length,'La trazabilidad no representa todos los movimientos consultados')
console.log(`Inventario verificado: ${positions.data.length} SKU y ${traces.data.length} movimientos · saldos y trazabilidad consistentes`)

import { corsHeaders } from '../_shared/cors.ts'
import { adminClient } from '../_shared/supabase.ts'
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:corsHeaders})
 try{
  const body=await req.json();
  // Adapter intentionally keeps provider-specific processing isolated. Map the exact
  // InfinitePay webhook payload/statuses configured for your account before production.
  const eventId=req.headers.get('x-request-id')||body.id||crypto.randomUUID()
  const {data:existing}=await adminClient.from('payment_events').select('id').eq('provider','infinitepay').eq('event_id',String(eventId)).maybeSingle()
  if(existing)return new Response(JSON.stringify({ok:true,duplicate:true}),{headers:{...corsHeaders,'content-type':'application/json'}})
  await adminClient.from('payment_events').insert({provider:'infinitepay',event_id:String(eventId),event_type:body.type||'unknown',external_id:body.id?String(body.id):null,payload:body})
  return new Response(JSON.stringify({ok:true,received:true}),{headers:{...corsHeaders,'content-type':'application/json'}})
 }catch(e){return new Response(JSON.stringify({error:e instanceof Error?e.message:'Invalid payload'}),{status:400,headers:{...corsHeaders,'content-type':'application/json'}})}
})

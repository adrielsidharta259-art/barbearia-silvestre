import { corsHeaders } from '../_shared/cors.ts'
import { adminClient } from '../_shared/supabase.ts'

function json(body:any,status=200){return new Response(JSON.stringify(body),{status,headers:{...corsHeaders,'content-type':'application/json'}})}
function parseSig(v:string|null){const out:{ts?:string;v1?:string}={};if(!v)return out;for(const p of v.split(',')){const [k,val]=p.trim().split('=');if(k==='ts')out.ts=val;if(k==='v1')out.v1=val}return out}
async function hmac(secret:string,msg:string){const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);const sig=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(msg));return [...new Uint8Array(sig)].map(x=>x.toString(16).padStart(2,'0')).join('')}
function safeEqual(a:string,b:string){if(a.length!==b.length)return false;let n=0;for(let i=0;i<a.length;i++)n|=a.charCodeAt(i)^b.charCodeAt(i);return n===0}

Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:corsHeaders})
 try{
  const raw=await req.text(); const body=raw?JSON.parse(raw):{}; const url=new URL(req.url)
  const type=body.type||url.searchParams.get('type')||'unknown'; const dataId=String(body.data?.id||url.searchParams.get('data.id')||'')
  const eventId=req.headers.get('x-request-id')||`${type}:${dataId}:${req.headers.get('x-signature')||''}`
  const {data:existing}=await adminClient.from('payment_events').select('id').eq('provider','mercado_pago').eq('event_id',eventId).maybeSingle()
  if(existing)return json({ok:true,duplicate:true})
  const sig=parseSig(req.headers.get('x-signature')); const secret=Deno.env.get('MERCADOPAGO_WEBHOOK_SECRET')
  if(secret && sig.ts && sig.v1 && dataId){const manifest=`id:${dataId};request-id:${req.headers.get('x-request-id')||''};ts:${sig.ts};`;const expected=await hmac(secret,manifest);if(!safeEqual(expected,sig.v1))return json({error:'invalid signature'},401)}
  await adminClient.from('payment_events').insert({provider:'mercado_pago',event_id:eventId,event_type:type,external_id:dataId,payload:body,status:'received'})
  const token=Deno.env.get('MERCADOPAGO_ACCESS_TOKEN');
  if(!token || !dataId)return json({ok:true,received:true})
  if(type==='order'){
   const r=await fetch(`https://api.mercadopago.com/v1/orders/${encodeURIComponent(dataId)}`,{headers:{Authorization:`Bearer ${token}`}});const o=await r.json();if(!r.ok)throw new Error('Não foi possível consultar a order')
   const tx=o.transactions?.payments?.[0]; const statusMap:any={processed:'approved',created:'pending',action_required:'pending',cancelled:'cancelled',failed:'failed',refunded:'refunded'}; const status=statusMap[o.status]||statusMap[tx?.status]||'pending';
   const {data:pay}=await adminClient.from('payments').select('id,subscription_id,client_id').eq('origin','mercado_pago').eq('provider_order_id',String(o.id)).maybeSingle()
   if(pay){await adminClient.from('payments').update({status,provider_payment_id:tx?.id?String(tx.id):undefined,paid_at:status==='approved'?new Date().toISOString():null,status_detail:o.status_detail||tx?.status_detail,metadata:o}).eq('id',pay.id);if(status==='approved'&&pay.subscription_id)await adminClient.from('subscriptions').update({status:'active',starts_at:new Date().toISOString()}).eq('id',pay.subscription_id)}
   else if(o.external_reference){const {data:sub}=await adminClient.from('subscriptions').select('id,client_id,contracted_amount').eq('id',o.external_reference).maybeSingle();if(sub){await adminClient.from('payments').insert({client_id:sub.client_id,subscription_id:sub.id,amount:Number(o.total_amount||sub.contracted_amount),status,payment_type:'one_time',origin:'mercado_pago',provider_order_id:String(o.id),provider_payment_id:tx?.id?String(tx.id):null,external_reference:o.external_reference,paid_at:status==='approved'?new Date().toISOString():null,status_detail:o.status_detail||tx?.status_detail,metadata:o});if(status==='approved')await adminClient.from('subscriptions').update({status:'active',starts_at:new Date().toISOString()}).eq('id',sub.id)}}
  } else if(type==='payment'){
   const r=await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(dataId)}`,{headers:{Authorization:`Bearer ${token}`}});const p=await r.json();if(!r.ok)throw new Error('Não foi possível consultar pagamento')
   const ref=p.external_reference; const statusMap:any={approved:'approved',pending:'pending',authorized:'pending',in_process:'pending',rejected:'rejected',cancelled:'cancelled',refunded:'refunded',charged_back:'charged_back'}
   const status=statusMap[p.status]||'failed'
   const {data:pay}=await adminClient.from('payments').select('id,subscription_id,client_id').eq('origin','mercado_pago').eq('provider_payment_id',String(p.id)).maybeSingle()
   if(pay){await adminClient.from('payments').update({status,paid_at:status==='approved'?new Date().toISOString():null,status_detail:p.status_detail,metadata:p}).eq('id',pay.id);if(status==='approved'&&pay.subscription_id)await adminClient.from('subscriptions').update({status:'active',starts_at:new Date().toISOString()}).eq('id',pay.subscription_id)}
   else if(ref){const {data:sub}=await adminClient.from('subscriptions').select('id,client_id,contracted_amount').eq('id',ref).maybeSingle();if(sub){await adminClient.from('payments').insert({client_id:sub.client_id,subscription_id:sub.id,amount:p.transaction_amount,status,payment_type:'one_time',origin:'mercado_pago',provider_payment_id:String(p.id),external_reference:ref,paid_at:status==='approved'?new Date().toISOString():null,status_detail:p.status_detail,metadata:p});if(status==='approved')await adminClient.from('subscriptions').update({status:'active',starts_at:new Date().toISOString()}).eq('id',sub.id)}}
  } else if(type==='subscription_preapproval' || type==='subscription_authorized_payment'){
   const r=await fetch(`https://api.mercadopago.com/preapproval/${encodeURIComponent(dataId)}`,{headers:{Authorization:`Bearer ${token}`}});const subp=await r.json();if(r.ok){const ref=subp.external_reference;const {data:sub}=await adminClient.from('subscriptions').select('id').eq('id',ref).maybeSingle();if(sub)await adminClient.from('subscriptions').update({provider_subscription_id:String(subp.id),status:subp.status==='authorized'?'active':'payment_pending',next_billing_date:subp.next_payment_date?.slice(0,10)}).eq('id',sub.id)}
  }
  await adminClient.from('payment_events').update({status:'processed',processed_at:new Date().toISOString()}).eq('provider','mercado_pago').eq('event_id',eventId)
  return json({ok:true})
 }catch(e){return json({error:e instanceof Error?e.message:'Unknown error'},500)}
})

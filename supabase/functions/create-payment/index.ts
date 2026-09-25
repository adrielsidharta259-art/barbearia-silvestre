import { corsHeaders } from '../_shared/cors.ts'
import { adminClient, getUser } from '../_shared/supabase.ts'

const MP='https://api.mercadopago.com'
function json(body:any,status=200){return new Response(JSON.stringify(body),{status,headers:{...corsHeaders,'content-type':'application/json'}})}
function idempotency(){return crypto.randomUUID()}

Deno.serve(async req=>{
 if(req.method==='OPTIONS') return new Response('ok',{headers:corsHeaders})
 try{
  const user=await getUser(req); if(!user) return json({error:'Unauthorized'},401)
  const body=await req.json(); const {plan_id,payment_type='one_time',provider='mercado_pago'}=body
  const {data:client}=await adminClient.from('clients').select('*').eq('id',user.id).single();
  const {data:plan}=await adminClient.from('plans').select('*').eq('id',plan_id).eq('active',true).single();
  if(!client||!plan) return json({error:'Cliente ou plano não encontrado'},404)
  const {data:sub,error:subError}=await adminClient.from('subscriptions').insert({client_id:user.id,plan_id,contracted_amount:plan.price,status:'pending_payment',payment_provider:provider,payment_type,created_by:user.id}).select().single()
  if(subError) throw subError
  if(provider==='manual') return json({ok:true,subscription_id:sub.id,message:'Assinatura criada como pagamento manual. Aguarde a confirmação da barbearia.'})
  if(provider!=='mercado_pago') return json({error:'Provedor ainda não configurado nesta função'},400)
  const token=Deno.env.get('MERCADOPAGO_ACCESS_TOKEN'); if(!token) return json({error:'Mercado Pago não configurado'},503)
  if(payment_type==='recurring'){
    const payload={reason:`Barbearia Silvestre - ${plan.name}`,external_reference:sub.id,payer_email:client.email||undefined,auto_recurring:{frequency:1,frequency_type:'months',transaction_amount:Number(plan.price),currency_id:'BRL'},back_url:Deno.env.get('APP_URL')||'http://localhost:5173'}
    const r=await fetch(`${MP}/preapproval`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json','X-Idempotency-Key':idempotency()},body:JSON.stringify(payload)})
    const d=await r.json(); if(!r.ok) throw new Error(d.message||'Mercado Pago recusou a criação da assinatura')
    await adminClient.from('subscriptions').update({provider_subscription_id:d.id,provider_customer_id:d.payer_id,next_billing_date:d.next_payment_date?.slice(0,10)}).eq('id',sub.id)
    return json({ok:true,subscription_id:sub.id,provider_subscription_id:d.id,checkout_url:d.init_point||d.sandbox_init_point})
  }
  if(!client.email) return json({error:'Para pagamento online, informe um e-mail válido no cadastro.'},400)
  const payload={type:'online',processing_mode:'manual',capture_mode:'automatic_async',total_amount:Number(plan.price).toFixed(2),description:`Barbearia Silvestre - ${plan.name}`,external_reference:sub.id,payer:{email:client.email},items:[{title:plan.name,unit_price:Number(plan.price).toFixed(2),quantity:1,unit_measure:'unit',total_amount:Number(plan.price).toFixed(2)}],config:{online:{success_url:`${Deno.env.get('APP_URL')||''}/?payment=success`,failure_url:`${Deno.env.get('APP_URL')||''}/?payment=failure`,pending_url:`${Deno.env.get('APP_URL')||''}/?payment=pending`,auto_return:'approved'}}
  const r=await fetch(`${MP}/v1/orders`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json','X-Idempotency-Key':idempotency()},body:JSON.stringify(payload)})
  const d=await r.json(); if(!r.ok) throw new Error(d.message||'Mercado Pago recusou a criação da cobrança')
  const paymentId=d.transactions?.payments?.[0]?.id ? String(d.transactions.payments[0].id) : null
  await adminClient.from('payments').insert({client_id:user.id,subscription_id:sub.id,amount:plan.price,status:'pending',payment_type:'one_time',origin:'mercado_pago',provider_payment_id:paymentId,provider_order_id:String(d.id),external_reference:sub.id,metadata:d})
  return json({ok:true,subscription_id:sub.id,order_id:d.id,status:d.status,checkout_url:d.checkout_url})
 }catch(e){return json({error:e instanceof Error?e.message:'Unknown error'},400)}
})

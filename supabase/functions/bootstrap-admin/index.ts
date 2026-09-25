import { corsHeaders } from '../_shared/cors.ts'
import { adminClient } from '../_shared/supabase.ts'

Deno.serve(async req=>{
 if(req.method==='OPTIONS') return new Response('ok',{headers:corsHeaders})
 try{
  const secret=req.headers.get('x-bootstrap-secret')
  if(!secret || secret!==Deno.env.get('BOOTSTRAP_SECRET')) return new Response(JSON.stringify({error:'Unauthorized'}),{status:401,headers:{...corsHeaders,'content-type':'application/json'}})
  const {email,phone,password,display_name='Barbearia Silvestre',username='Barbeariasilvestre'}=await req.json()
  if(!phone||!password) throw new Error('phone e password são obrigatórios')
  const authEmail=email || `${username.toLowerCase()}@barbearia-silvestre.local`; const {data,error}=await adminClient.auth.admin.createUser({phone,email:authEmail,password,email_confirm:true,phone_confirm:true,user_metadata:{display_name}})
  if(error) throw error
  const uid=data.user.id
  const normalized=phone.replace(/\D/g,'')
  const {error:profileError}=await adminClient.from('profiles').upsert({id:uid,role:'admin',display_name,username,phone,phone_normalized:normalized,must_change_password:true,active:true})
  if(profileError) throw profileError
  await adminClient.from('clients').delete().eq('id',uid)
  return new Response(JSON.stringify({ok:true,user_id:uid}),{headers:{...corsHeaders,'content-type':'application/json'}})
 }catch(e){return new Response(JSON.stringify({error:e instanceof Error?e.message:'Unknown error'}),{status:400,headers:{...corsHeaders,'content-type':'application/json'}})}
})

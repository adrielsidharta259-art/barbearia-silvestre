import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
export const adminClient = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)
export async function getUser(req:Request){
  const auth=req.headers.get('Authorization')
  if(!auth) return null
  const token=auth.replace(/^Bearer\s+/i,'')
  const client=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:`Bearer ${token}`}}})
  const {data}=await client.auth.getUser()
  return data.user
}

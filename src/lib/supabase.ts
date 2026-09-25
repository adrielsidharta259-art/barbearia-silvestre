import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY
if (!url || !anon) throw new Error('Configure VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.')
export const supabase = createClient(url, anon, { auth: { persistSession:true, autoRefreshToken:true, detectSessionInUrl:true } })

export function normalizePhone(value:string){ return value.replace(/\D/g,'') }
export function money(value:number){ return new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(value) }

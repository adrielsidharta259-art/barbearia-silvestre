import React, { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  CalendarDays,
  CheckCircle2,
  Clock3,
  LogIn,
  LogOut,
  Scissors,
  ShieldCheck,
  UserRound,
  Users,
} from 'lucide-react'
import { supabase, normalizePhone, money } from './lib/supabase'
import './styles.css'

type Role = 'admin' | 'barber' | 'client'
type Profile = { id: string; role: Role; display_name: string }
type Plan = {
  id: string
  name: string
  price: number
  description: string
  benefits: string[]
  limits?: Record<string, unknown>
}
type Service = { id: string; name: string; default_price: number }
type Barber = { id: string; name: string }
type Appointment = {
  id: string
  appointment_date: string
  appointment_time: string | null
  amount: number
  kind: string
  notes: string | null
  services?: { name: string } | null
  barbers?: { name: string } | null
}

type AuthForm = { name: string; phone: string; email: string; password: string }

function authPhone(value: string) {
  const digits = normalizePhone(value)
  if (!digits) return ''
  return digits.startsWith('55') ? `+${digits}` : `+55${digits}`
}

function errorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || '')
  if (/invalid login credentials/i.test(message)) return 'E-mail/telefone ou senha incorretos.'
  if (/user already registered/i.test(message)) return 'Esse e-mail ou telefone já está cadastrado.'
  return message || 'Não foi possível concluir a operação.'
}

function App() {
  const [session, setSession] = useState<any>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [plans, setPlans] = useState<Plan[]>([])
  const [loading, setLoading] = useState(true)
  const [fatalError, setFatalError] = useState('')

  async function loadProfile(uid: string) {
    const { data, error } = await supabase
      .from('profiles')
      .select('id,role,display_name')
      .eq('id', uid)
      .single()
    if (error) throw error
    setProfile(data as Profile)
  }

  async function loadPlans() {
    const { data, error } = await supabase
      .from('plans')
      .select('id,name,price,description,benefits,limits')
      .eq('is_public', true)
      .eq('active', true)
      .order('sort_order')
    if (error) throw error
    setPlans((data || []) as Plan[])
  }

  useEffect(() => {
    let alive = true
    Promise.all([
      supabase.auth.getSession(),
      loadPlans(),
    ])
      .then(async ([sessionResult]) => {
        if (!alive) return
        const currentSession = sessionResult.data.session
        setSession(currentSession)
        if (currentSession) {
          try {
            await loadProfile(currentSession.user.id)
          } catch (error) {
            setFatalError(errorMessage(error))
          }
        }
      })
      .catch((error) => alive && setFatalError(errorMessage(error)))
      .finally(() => alive && setLoading(false))

    const { data: auth } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      if (!nextSession) {
        setProfile(null)
        return
      }
      window.setTimeout(() => {
        loadProfile(nextSession.user.id).catch((error) => setFatalError(errorMessage(error)))
      }, 0)
    })

    return () => {
      alive = false
      auth.subscription.unsubscribe()
    }
  }, [])

  if (loading) return <Loading />
  if (fatalError && !session) return <FatalError message={fatalError} />
  if (session && profile) {
    return (
      <Dashboard
        session={session}
        profile={profile}
        plans={plans}
        onLogout={() => supabase.auth.signOut()}
      />
    )
  }
  return <Public plans={plans} />
}

function Loading() {
  return (
    <div className="app">
      <main className="container hero centered">
        <div className="eyebrow">BARBEARIA SILVESTRE</div>
        <h1>Carregando…</h1>
      </main>
    </div>
  )
}

function FatalError({ message }: { message: string }) {
  return (
    <div className="app">
      <main className="container hero centered">
        <div className="eyebrow">BARBEARIA SILVESTRE</div>
        <h1>Configuração necessária</h1>
        <p>{message}</p>
        <p className="muted">Confira as variáveis VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.</p>
      </main>
    </div>
  )
}

function Public({ plans }: { plans: Plan[] }) {
  const [mode, setMode] = useState<'home' | 'login' | 'signup'>('home')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null)
  const [form, setForm] = useState<AuthForm>({ name: '', phone: '', email: '', password: '' })

  function openSignup(planId?: string) {
    setSelectedPlan(planId || null)
    setMessage('')
    setMode('signup')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function signup(event: React.FormEvent) {
    event.preventDefault()
    setMessage('')
    setBusy(true)
    try {
      const phone = authPhone(form.phone)
      if (normalizePhone(form.phone).length < 10) throw new Error('Informe um telefone válido.')
      if (form.password.length < 8) throw new Error('A senha precisa ter pelo menos 8 caracteres.')

      const options = {
        data: {
          display_name: form.name.trim(),
          phone,
          phone_normalized: normalizePhone(form.phone),
          selected_plan_id: selectedPlan,
        },
      }
      const result = form.email.trim()
        ? await supabase.auth.signUp({ email: form.email.trim().toLowerCase(), password: form.password, options })
        : await supabase.auth.signUp({ phone, password: form.password, options })
      const { data, error } = result
      if (error) throw error
      if (!data.user) throw new Error('Não foi possível criar a conta.')

      if (data.session) {
        setMessage(selectedPlan ? 'Cadastro criado. Você já pode contratar o plano no painel.' : 'Cadastro criado com sucesso.')
      } else {
        setMessage('Cadastro criado. Confirme o e-mail/telefone, se a confirmação estiver habilitada, e depois entre.')
      }
      setMode('login')
      setForm((current) => ({ ...current, password: '' }))
    } catch (error) {
      setMessage(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  async function login(event: React.FormEvent) {
    event.preventDefault()
    setMessage('')
    setBusy(true)
    try {
      const identifier = form.email.trim()
      if (!identifier) throw new Error('Informe seu e-mail ou telefone.')
      const isEmail = identifier.includes('@')
      const { error } = await supabase.auth.signInWithPassword({
        ...(isEmail ? { email: identifier.toLowerCase() } : { phone: authPhone(identifier) }),
        password: form.password,
      })
      if (error) throw error
    } catch (error) {
      setMessage(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="app">
      <header className="nav">
        <div className="container nav-inner">
          <div className="brand">
            <img src="/logo.jpg" alt="Barbearia Silvestre" />
            <span>BARBEARIA <span className="gold">SILVESTRE</span></span>
          </div>
          <button className="btn btn-dark" onClick={() => setMode(mode === 'login' ? 'home' : 'login')}>
            <LogIn size={16} /> Entrar
          </button>
        </div>
      </header>

      <main>
        <section className="hero container">
          <div className="eyebrow">DESDE 2018</div>
          <h1>Seu estilo. <span className="gold">Seu horário.</span></h1>
          <p>Escolha seu plano, acompanhe sua assinatura e organize seus atendimentos pelo celular.</p>
        </section>

        <section className="section container">
          <div className="section-heading">
            <div><div className="eyebrow">PLANOS</div><h2>Escolha o seu</h2></div>
            <span className="muted">Valores mensais</span>
          </div>
          <div className="grid">
            {plans.map((plan) => (
              <article className="card plan" key={plan.id}>
                <div className="eyebrow">PLANO</div>
                <h3>{plan.name}</h3>
                <div className="price">{money(Number(plan.price))}<span className="muted" style={{ fontSize: 14 }}>/mês</span></div>
                <p className="muted">{plan.description}</p>
                <ul className="features">
                  {(plan.benefits || []).map((benefit, index) => <li key={index}>{benefit}</li>)}
                </ul>
                <button className="btn btn-gold" onClick={() => openSignup(plan.id)}>Escolher {plan.name}</button>
              </article>
            ))}
          </div>
        </section>

        <section className="section container">
          <div className="card">
            <div className="between">
              <div>
                <div className="eyebrow">JÁ É CLIENTE?</div>
                <h2>Acesse seu painel</h2>
                <p className="muted">Veja assinatura, pagamentos, serviços e agendamentos.</p>
              </div>
              <button className="btn btn-dark" onClick={() => { setMode('login'); setMessage('') }}>Entrar</button>
            </div>
          </div>
        </section>

        {mode === 'login' && (
          <section className="section container">
            <div className="card auth-card">
              <h2>Entrar</h2>
              <form className="form" onSubmit={login}>
                <label className="label">E-mail ou telefone</label>
                <input className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} autoComplete="username" required />
                <label className="label">Senha</label>
                <input className="input" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} autoComplete="current-password" required />
                <button className="btn btn-gold" disabled={busy}>{busy ? 'Entrando…' : 'Entrar'}</button>
                {message && <div className="notice">{message}</div>}
              </form>
              <button className="link-button" onClick={() => { setMode('signup'); setMessage('') }}>Ainda não tenho cadastro</button>
            </div>
          </section>
        )}

        {mode === 'signup' && (
          <section className="section container">
            <div className="card auth-card">
              <h2>Criar cadastro</h2>
              <p className="muted">{selectedPlan ? 'Depois do cadastro, você poderá contratar o plano escolhido.' : 'Você poderá escolher o plano depois.'}</p>
              <form className="form" onSubmit={signup}>
                <label className="label">Nome completo</label>
                <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoComplete="name" required />
                <label className="label">WhatsApp/telefone</label>
                <input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} autoComplete="tel" required />
                <label className="label">E-mail <span className="muted">(recomendado para pagamentos)</span></label>
                <input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} autoComplete="email" />
                <label className="label">Senha</label>
                <input className="input" type="password" minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} autoComplete="new-password" required />
                <button className="btn btn-gold" disabled={busy}>{busy ? 'Criando…' : 'Criar cadastro'}</button>
                {message && <div className="notice">{message}</div>}
              </form>
              <button className="link-button" onClick={() => { setMode('login'); setMessage('') }}>Já tenho cadastro</button>
            </div>
          </section>
        )}
      </main>
      <footer className="footer">Barbearia Silvestre · Desde 2018</footer>
    </div>
  )
}

function Dashboard({ session, profile, plans, onLogout }: { session: any; profile: Profile; plans: Plan[]; onLogout: () => Promise<any> }) {
  const [refresh, setRefresh] = useState(0)
  return (
    <div className="app">
      <header className="nav">
        <div className="container nav-inner">
          <div className="brand"><img src="/logo.jpg" alt="Barbearia Silvestre" /><span>BARBEARIA <span className="gold">SILVESTRE</span></span></div>
          <button className="btn btn-dark" onClick={onLogout}><LogOut size={16} /> Sair</button>
        </div>
      </header>
      <main className="container section">
        <div className="eyebrow">PAINEL</div>
        <h1>{profile.display_name || 'Olá'}</h1>
        {profile.role === 'admin' && <AdminPanel refresh={refresh} />}
        {profile.role === 'client' && <ClientPanel session={session} plans={plans} refresh={refresh} onChanged={() => setRefresh((v) => v + 1)} />}
        {profile.role === 'barber' && <BarberPanel session={session} refresh={refresh} />}
      </main>
    </div>
  )
}

function AdminPanel({ refresh }: { refresh: number }) {
  const [stats, setStats] = useState({ clients: 0, active: 0, revenue: 0 })
  const [message, setMessage] = useState('')
  useEffect(() => {
    Promise.all([
      supabase.from('clients').select('id', { count: 'exact', head: true }),
      supabase.from('subscriptions').select('id', { count: 'exact', head: true }).eq('status', 'active'),
      supabase.from('payments').select('amount').eq('status', 'approved'),
    ]).then(([clients, subscriptions, payments]) => {
      if (clients.error || subscriptions.error || payments.error) {
        setMessage(errorMessage(clients.error || subscriptions.error || payments.error))
        return
      }
      setStats({
        clients: clients.count || 0,
        active: subscriptions.count || 0,
        revenue: (payments.data || []).reduce((total, row) => total + Number(row.amount || 0), 0),
      })
    })
  }, [refresh])

  return (
    <div className="stack">
      {message && <div className="error">{message}</div>}
      <div className="grid">
        <StatCard icon={<Users />} label="Clientes" value={String(stats.clients)} />
        <StatCard icon={<CalendarDays />} label="Assinaturas ativas" value={String(stats.active)} />
        <StatCard icon={<ShieldCheck />} label="Receita aprovada" value={money(stats.revenue)} />
      </div>
      <div className="card"><h2>Administração</h2><p className="muted">A estrutura de clientes, serviços, assinaturas, pagamentos e fechamentos está no Supabase. Use o SQL e as Edge Functions deste projeto para concluir a configuração de produção.</p></div>
    </div>
  )
}

function ClientPanel({ session, plans, refresh, onChanged }: { session: any; plans: Plan[]; refresh: number; onChanged: () => void }) {
  const [subscription, setSubscription] = useState<any>(null)
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [services, setServices] = useState<Service[]>([])
  const [barbers, setBarbers] = useState<Barber[]>([])
  const [selectedPlan, setSelectedPlan] = useState('')
  const [appointment, setAppointment] = useState({ service: '', barber: '', date: '', time: '', notes: '' })
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    async function load() {
      const [subResult, appointmentResult, serviceResult, barberResult] = await Promise.all([
        supabase.from('subscriptions').select('id,status,contracted_amount,next_billing_date,plans(name,description)').eq('client_id', session.user.id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
        supabase.from('appointments').select('id,appointment_date,appointment_time,amount,kind,notes,services(name),barbers(name)').eq('client_id', session.user.id).order('appointment_date', { ascending: true }).limit(10),
        supabase.from('services').select('id,name,default_price').eq('active', true).order('name'),
        supabase.from('barbers').select('id,name').eq('active', true).order('name'),
      ])
      if (subResult.error || appointmentResult.error || serviceResult.error || barberResult.error) {
        setMessage(errorMessage(subResult.error || appointmentResult.error || serviceResult.error || barberResult.error))
        return
      }
      setSubscription(subResult.data)
      setAppointments((appointmentResult.data || []) as Appointment[])
      setServices((serviceResult.data || []) as Service[])
      setBarbers((barberResult.data || []) as Barber[])
    }
    load()
  }, [session.user.id, refresh])

  const chosenService = useMemo(() => services.find((item) => item.id === appointment.service), [services, appointment.service])

  async function choosePlan() {
    if (!selectedPlan) return
    setBusy(true)
    setMessage('')
    try {
      const { data, error } = await supabase.functions.invoke('create-payment', { body: { plan_id: selectedPlan, payment_type: 'one_time', provider: 'manual' } })
      if (error) throw error
      setMessage(data?.message || 'Solicitação de assinatura criada. Aguarde a confirmação da barbearia.')
      onChanged()
    } catch (error) {
      setMessage(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  async function createAppointment(event: React.FormEvent) {
    event.preventDefault()
    if (!appointment.service || !appointment.barber || !appointment.date) {
      setMessage('Escolha serviço, barbeiro e data.')
      return
    }
    setBusy(true)
    setMessage('')
    try {
      const { error } = await supabase.from('appointments').insert({
        client_id: session.user.id,
        barber_id: appointment.barber,
        service_id: appointment.service,
        appointment_date: appointment.date,
        appointment_time: appointment.time || null,
        amount: chosenService?.default_price || 0,
        kind: subscription ? 'ASSINATURA' : 'AVULSO',
        subscription_id: subscription?.id || null,
        notes: appointment.notes || null,
        created_by: session.user.id,
      })
      if (error) throw error
      setMessage('Agendamento criado com sucesso.')
      setAppointment({ service: '', barber: '', date: '', time: '', notes: '' })
      onChanged()
    } catch (error) {
      setMessage(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="stack">
      {message && <div className="notice">{message}</div>}
      <div className="card">
        <div className="eyebrow">MINHA ASSINATURA</div>
        {subscription ? <>
          <h2>{subscription.plans?.name || 'Plano'}</h2>
          <p className="muted">Valor contratado: {money(Number(subscription.contracted_amount))}</p>
          <p>Status: <span className="pill">{subscription.status}</span></p>
          <p className="muted">Próxima cobrança: {subscription.next_billing_date ? new Date(`${subscription.next_billing_date}T12:00:00`).toLocaleDateString('pt-BR') : '—'}</p>
        </> : <>
          <h2>Nenhuma assinatura</h2>
          <div className="row wrap">
            <select className="input" value={selectedPlan} onChange={(e) => setSelectedPlan(e.target.value)}>
              <option value="">Escolha um plano</option>
              {plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name} — {money(Number(plan.price))}/mês</option>)}
            </select>
            <button className="btn btn-gold" disabled={!selectedPlan || busy} onClick={choosePlan}>{busy ? 'Processando…' : 'Contratar'}</button>
          </div>
        </>}
      </div>

      <div className="card">
        <div className="eyebrow">NOVO AGENDAMENTO</div>
        <h2>Marque seu horário</h2>
        <form className="form" onSubmit={createAppointment}>
          <label className="label">Serviço</label>
          <select className="input" value={appointment.service} onChange={(e) => setAppointment({ ...appointment, service: e.target.value })} required>
            <option value="">Selecione</option>
            {services.map((service) => <option key={service.id} value={service.id}>{service.name} — {money(Number(service.default_price))}</option>)}
          </select>
          <label className="label">Barbeiro</label>
          <select className="input" value={appointment.barber} onChange={(e) => setAppointment({ ...appointment, barber: e.target.value })} required>
            <option value="">Selecione</option>
            {barbers.map((barber) => <option key={barber.id} value={barber.id}>{barber.name}</option>)}
          </select>
          <div className="grid two">
            <div><label className="label">Data</label><input className="input" type="date" value={appointment.date} onChange={(e) => setAppointment({ ...appointment, date: e.target.value })} required /></div>
            <div><label className="label">Horário</label><input className="input" type="time" value={appointment.time} onChange={(e) => setAppointment({ ...appointment, time: e.target.value })} /></div>
          </div>
          <label className="label">Observação</label>
          <textarea className="input" value={appointment.notes} onChange={(e) => setAppointment({ ...appointment, notes: e.target.value })} rows={3} />
          <button className="btn btn-gold" disabled={busy}>{busy ? 'Salvando…' : 'Confirmar agendamento'}</button>
        </form>
      </div>

      <div className="card">
        <div className="eyebrow">MEUS HORÁRIOS</div>
        <h2>Agendamentos</h2>
        {appointments.length === 0 ? <p className="muted">Você ainda não tem agendamentos.</p> : <div className="list">{appointments.map((item) => <div className="list-item" key={item.id}><CalendarDays size={18} /><div><strong>{item.services?.name || 'Serviço'}</strong><div className="muted">{new Date(`${item.appointment_date}T12:00:00`).toLocaleDateString('pt-BR')} {item.appointment_time ? `às ${item.appointment_time.slice(0, 5)}` : ''} · {item.barbers?.name || 'Barbeiro'}</div></div><span className="pill">{item.kind}</span></div>)}</div>}
      </div>
    </div>
  )
}

function BarberPanel({ session, refresh }: { session: any; refresh: number }) {
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [message, setMessage] = useState('')
  useEffect(() => {
    async function load() {
      const { data: barber, error: barberError } = await supabase.from('barbers').select('id').eq('profile_id', session.user.id).single()
      if (barberError) { setMessage('Seu usuário ainda não está vinculado a um cadastro de barbeiro.'); return }
      const { data, error } = await supabase.from('appointments').select('id,appointment_date,appointment_time,amount,kind,notes,services(name),barbers(name)').eq('barber_id', barber.id).order('appointment_date', { ascending: true }).limit(50)
      if (error) setMessage(errorMessage(error))
      else setAppointments((data || []) as Appointment[])
    }
    load()
  }, [session.user.id, refresh])

  return (
    <div className="stack">
      {message && <div className="notice">{message}</div>}
      <div className="card"><div className="eyebrow">MEUS ATENDIMENTOS</div><h2>Agenda</h2>{appointments.length === 0 ? <p className="muted">Nenhum atendimento encontrado.</p> : <div className="list">{appointments.map((item) => <div className="list-item" key={item.id}><Scissors size={18} /><div><strong>{item.services?.name || 'Serviço'}</strong><div className="muted">{new Date(`${item.appointment_date}T12:00:00`).toLocaleDateString('pt-BR')} {item.appointment_time ? `às ${item.appointment_time.slice(0, 5)}` : ''}</div></div><span>{money(Number(item.amount || 0))}</span></div>)}</div>}</div>
    </div>
  )
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <div className="card stat"><div>{icon}</div><p className="muted">{label}</p><h2>{value}</h2></div>
}

createRoot(document.getElementById('root')!).render(<App />)

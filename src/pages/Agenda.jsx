import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { Plus, Trash2, Pencil, CheckCircle2, Circle, Bell, Calendar, DollarSign, Clock } from 'lucide-react'

const formatBRL = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0)
const formatData = (d) => new Date(d + 'T00:00:00').toLocaleDateString('pt-BR')

const categorias = [
  { valor: 'conta', label: 'Conta', icone: DollarSign, cor: 'text-red' },
  { valor: 'compromisso', label: 'Compromisso', icone: Calendar, cor: 'text-indigo' },
  { valor: 'prazo', label: 'Prazo', icone: Clock, cor: 'text-yellow' },
  { valor: 'outro', label: 'Outro', icone: Bell, cor: 'text-textsecondary' },
]

export default function Agenda() {
  const { user } = useAuth()
  const [lembretes, setLembretes] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [editandoId, setEditandoId] = useState(null)
  const [filtro, setFiltro] = useState('pendentes')

  const hoje = new Date().toISOString().split('T')[0]

  const vazio = { descricao: '', data: '', valor: '', categoria: 'conta' }
  const [form, setForm] = useState(vazio)

  const fetchLembretes = async () => {
    const { data } = await supabase
      .from('lembretes')
      .select('*')
      .eq('user_id', user.id)
      .order('data', { ascending: true })
    setLembretes(data || [])
  }

  useEffect(() => { fetchLembretes() }, [])

  const handleSave = async () => {
    setLoading(true)
    const payload = {
      descricao: form.descricao,
      data: form.data,
      valor: form.valor ? parseFloat(form.valor) : null,
      categoria: form.categoria,
    }

    let error
    if (editandoId) {
      const result = await supabase.from('lembretes').update(payload).eq('id', editandoId)
      error = result.error
    } else {
      const result = await supabase.from('lembretes').insert({ ...payload, user_id: user.id })
      error = result.error
    }

    if (error) { alert('Erro: ' + error.message); setLoading(false); return }
    setForm(vazio)
    setEditandoId(null)
    setShowForm(false)
    fetchLembretes()
    setLoading(false)
  }

  const handleEdit = (l) => {
    setForm({
      descricao: l.descricao,
      data: l.data,
      valor: l.valor ? String(l.valor) : '',
      categoria: l.categoria
    })
    setEditandoId(l.id)
    setTimeout(() => setShowForm(true), 0)
  }

  const handleToggle = async (id, concluido) => {
    await supabase.from('lembretes').update({ concluido: !concluido }).eq('id', id)
    fetchLembretes()
  }

  const handleDelete = async (id) => {
    await supabase.from('lembretes').delete().eq('id', id)
    fetchLembretes()
  }

  const pendentes = lembretes.filter(l => !l.concluido)
  const concluidos = lembretes.filter(l => l.concluido)
  const vencidos = pendentes.filter(l => l.data < hoje)
  const lista = filtro === 'pendentes' ? pendentes : filtro === 'concluidos' ? concluidos : lembretes

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-display text-2xl font-bold text-textprimary flex items-center gap-2">
            <Bell size={22} className="text-indigo" /> Agenda
          </h1>
          <p className="text-textsecondary text-sm mt-1">Contas e compromissos para não esquecer</p>
        </div>
        <button onClick={() => { setEditandoId(null); setForm(vazio); setShowForm(true) }}
          className="flex items-center gap-2 bg-indigo hover:bg-indigo/90 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors">
          <Plus size={16} /> Novo Lembrete
        </button>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-surface border border-border rounded-2xl p-5">
          <p className="text-textsecondary text-xs mb-1">Pendentes</p>
          <p className="font-display text-3xl font-bold text-textprimary">{pendentes.length}</p>
        </div>
        <div className={`border rounded-2xl p-5 ${vencidos.length > 0 ? 'bg-red/10 border-red/30' : 'bg-surface border-border'}`}>
          <p className="text-textsecondary text-xs mb-1">Vencidos</p>
          <p className={`font-display text-3xl font-bold ${vencidos.length > 0 ? 'text-red' : 'text-textprimary'}`}>
            {vencidos.length}
          </p>
        </div>
        <div className="bg-surface border border-green/20 rounded-2xl p-5">
          <p className="text-textsecondary text-xs mb-1">Concluídos</p>
          <p className="font-display text-3xl font-bold text-green">{concluidos.length}</p>
        </div>
      </div>

      <div className="flex gap-2 mb-4">
        {[
          { valor: 'pendentes', label: 'Pendentes' },
          { valor: 'concluidos', label: 'Concluídos' },
          { valor: 'todos', label: 'Todos' },
        ].map(f => (
          <button key={f.valor} onClick={() => setFiltro(f.valor)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
              filtro === f.valor ? 'bg-indigo/15 text-indigo' : 'text-textsecondary hover:text-textprimary'
            }`}>
            {f.label}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {lista.map(l => {
          const cat = categorias.find(c => c.valor === l.categoria)
          const Icone = cat?.icone || Bell
          const vencido = !l.concluido && l.data < hoje
          const hoje7 = new Date()
          hoje7.setDate(hoje7.getDate() + 7)
          const urgente = !l.concluido && !vencido && new Date(l.data + 'T00:00:00') <= hoje7

          return (
            <div key={l.id} className={`bg-surface border rounded-2xl p-4 flex items-center gap-4 transition-all ${
              vencido ? 'border-red/30' : urgente ? 'border-yellow/30' : 'border-border'
            } ${l.concluido ? 'opacity-50' : ''}`}>
              <button onClick={() => handleToggle(l.id, l.concluido)}
                className="flex-shrink-0 text-textsecondary hover:text-green transition-colors">
                {l.concluido ? <CheckCircle2 size={20} className="text-green" /> : <Circle size={20} />}
              </button>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <Icone size={14} className={cat?.cor || 'text-textsecondary'} />
                  <p className={`font-medium text-sm ${l.concluido ? 'line-through text-textsecondary' : 'text-textprimary'}`}>
                    {l.descricao}
                  </p>
                  {vencido && <span className="text-xs bg-red/20 text-red px-2 py-0.5 rounded-full">Vencido</span>}
                  {urgente && <span className="text-xs bg-yellow/20 text-yellow px-2 py-0.5 rounded-full">Esta semana</span>}
                </div>
                <div className="flex items-center gap-3 mt-1">
                  <span className={`text-xs ${vencido ? 'text-red' : 'text-textsecondary'}`}>{formatData(l.data)}</span>
                  {l.valor && <span className="text-xs text-textprimary font-medium">{formatBRL(l.valor)}</span>}
                </div>
              </div>

              <div className="flex gap-2 flex-shrink-0">
                <button onClick={() => handleEdit(l)} className="text-textsecondary hover:text-indigo transition-colors">
                  <Pencil size={14} />
                </button>
                <button onClick={() => handleDelete(l.id)} className="text-textsecondary hover:text-red transition-colors">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          )
        })}
        {lista.length === 0 && (
          <div className="bg-surface border border-border rounded-2xl p-12 text-center">
            <Bell size={32} className="text-textsecondary mx-auto mb-3" />
            <p className="text-textsecondary">
              {filtro === 'pendentes' ? 'Nenhum lembrete pendente' :
               filtro === 'concluidos' ? 'Nenhum lembrete concluído' : 'Nenhum lembrete cadastrado'}
            </p>
          </div>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <div className="bg-surface border border-border rounded-2xl p-8 w-full max-w-md">
            <h2 className="font-display text-xl font-bold text-textprimary mb-6">
              {editandoId ? 'Editar Lembrete' : 'Novo Lembrete'}
            </h2>
            <div className="space-y-4">
              <div>
                <label className="text-textsecondary text-sm mb-1 block">Descrição</label>
                <input value={form.descricao} onChange={e => setForm({ ...form, descricao: e.target.value })}
                  className="w-full bg-bg border border-border rounded-xl px-4 py-3 text-textprimary focus:outline-none focus:border-indigo"
                  placeholder="Ex: Pagar IPVA, Renovar seguro..." autoFocus />
              </div>

              <div>
                <label className="text-textsecondary text-sm mb-2 block">Categoria</label>
                <div className="grid grid-cols-4 gap-2">
                  {categorias.map(c => (
                    <button key={c.valor} onClick={() => setForm({ ...form, categoria: c.valor })}
                      className={`py-2.5 rounded-xl text-xs font-medium transition-colors flex flex-col items-center gap-1 ${
                        form.categoria === c.valor
                          ? 'bg-indigo/15 text-indigo border border-indigo/30'
                          : 'border border-border text-textsecondary'
                      }`}>
                      <c.icone size={14} />
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-textsecondary text-sm mb-1 block">Data</label>
                  <input type="date" value={form.data} onChange={e => setForm({ ...form, data: e.target.value })}
                    className="w-full bg-bg border border-border rounded-xl px-4 py-3 text-textprimary focus:outline-none focus:border-indigo" />
                </div>
                <div>
                  <label className="text-textsecondary text-sm mb-1 block">Valor (opcional)</label>
                  <input type="number" value={form.valor} onChange={e => setForm({ ...form, valor: e.target.value })}
                    className="w-full bg-bg border border-border rounded-xl px-4 py-3 text-textprimary focus:outline-none focus:border-indigo"
                    placeholder="0,00" />
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={() => { setShowForm(false); setEditandoId(null); setForm(vazio) }}
                className="flex-1 border border-border text-textsecondary hover:text-textprimary py-3 rounded-xl text-sm font-medium transition-colors">
                Cancelar
              </button>
              <button onClick={handleSave} disabled={loading || !form.descricao || !form.data}
                className="flex-1 bg-indigo hover:bg-indigo/90 text-white py-3 rounded-xl text-sm font-medium transition-colors disabled:opacity-50">
                {loading ? 'Salvando...' : editandoId ? 'Atualizar' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { Plus, Trash2, Pencil, Target, CheckCircle2 } from 'lucide-react'

const formatBRL = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0)

export default function Objetivos() {
  const { user } = useAuth()
  const [objetivos, setObjetivos] = useState([])
  const [contas, setContas] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [editandoId, setEditandoId] = useState(null)

  const vazio = { nome: '', descricao: '', valor_alvo: '', valor_atual: '0', data_alvo: '', conta_id: '' }
  const [form, setForm] = useState(vazio)

  const fetchObjetivos = async () => {
    const { data } = await supabase
      .from('objetivos')
      .select('*, conta:conta_id(nome, saldo_atual)')
      .eq('user_id', user.id)
      .eq('ativo', true)
      .order('criado_em', { ascending: false })
    setObjetivos(data || [])
  }

  const fetchContas = async () => {
    const { data } = await supabase.from('contas').select('*').eq('user_id', user.id).eq('ativo', true)
    setContas(data || [])
  }

  useEffect(() => { fetchObjetivos(); fetchContas() }, [])

  const handleSave = async () => {
    setLoading(true)
    const payload = {
      nome: form.nome,
      descricao: form.descricao || null,
      valor_alvo: parseFloat(form.valor_alvo),
      valor_atual: parseFloat(form.valor_atual) || 0,
      data_alvo: form.data_alvo || null,
      conta_id: form.conta_id || null,
    }

    let error
    if (editandoId) {
      const result = await supabase.from('objetivos').update(payload).eq('id', editandoId)
      error = result.error
    } else {
      const result = await supabase.from('objetivos').insert({ ...payload, user_id: user.id })
      error = result.error
    }

    if (error) { alert('Erro: ' + error.message); setLoading(false); return }
    setForm(vazio)
    setEditandoId(null)
    setShowForm(false)
    fetchObjetivos()
    setLoading(false)
  }

  const handleEdit = (o) => {
    setForm({
      nome: o.nome,
      descricao: o.descricao || '',
      valor_alvo: String(o.valor_alvo),
      valor_atual: String(o.valor_atual),
      data_alvo: o.data_alvo || '',
      conta_id: o.conta_id || ''
    })
    setEditandoId(o.id)
    setTimeout(() => setShowForm(true), 0)
  }

  const handleDelete = async (id) => {
    await supabase.from('objetivos').update({ ativo: false }).eq('id', id)
    fetchObjetivos()
  }

  const handleConcluir = async (id) => {
    await supabase.from('objetivos').update({ concluido: true, ativo: false }).eq('id', id)
    fetchObjetivos()
  }

  const calcularMensalidade = (obj) => {
    if (!obj.data_alvo) return null
    const hoje = new Date()
    const alvo = new Date(obj.data_alvo + 'T00:00:00')
    const meses = Math.max(1, (alvo.getFullYear() - hoje.getFullYear()) * 12 + (alvo.getMonth() - hoje.getMonth()))
    const falta = Number(obj.valor_alvo) - Number(obj.valor_atual)
    return falta > 0 ? falta / meses : 0
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-display text-2xl font-bold text-textprimary flex items-center gap-2">
            <Target size={22} className="text-indigo" /> Objetivos
          </h1>
          <p className="text-textsecondary text-sm mt-1">Metas financeiras e sonhos a realizar</p>
        </div>
        <button onClick={() => { setEditandoId(null); setForm(vazio); setShowForm(true) }}
          className="flex items-center gap-2 bg-indigo hover:bg-indigo/90 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors">
          <Plus size={16} /> Novo Objetivo
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {objetivos.map(o => {
          const pct = Math.min(100, Math.round((Number(o.valor_atual) / Number(o.valor_alvo)) * 100))
          const mensalidade = calcularMensalidade(o)
          const cor = pct >= 100 ? '#22C55E' : pct >= 50 ? '#EAB308' : '#6366F1'
          const saldoConta = o.conta ? Number(o.conta.saldo_atual) : null

          return (
            <div key={o.id} className="bg-surface border border-border rounded-2xl p-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <p className="font-display font-bold text-textprimary">{o.nome}</p>
                  {o.descricao && <p className="text-textsecondary text-xs mt-0.5">{o.descricao}</p>}
                  {o.conta && <p className="text-xs text-indigo mt-1">Vinculado: {o.conta.nome}</p>}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => handleEdit(o)} className="text-textsecondary hover:text-indigo transition-colors">
                    <Pencil size={14} />
                  </button>
                  <button onClick={() => handleConcluir(o.id)} className="text-textsecondary hover:text-green transition-colors" title="Marcar como concluído">
                    <CheckCircle2 size={14} />
                  </button>
                  <button onClick={() => handleDelete(o.id)} className="text-textsecondary hover:text-red transition-colors">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              <div className="flex items-end justify-between mb-2">
                <p className="font-display text-2xl font-bold" style={{ color: cor }}>{pct}%</p>
                <p className="text-textsecondary text-sm">{formatBRL(o.valor_atual)} / {formatBRL(o.valor_alvo)}</p>
              </div>

              <div className="w-full bg-border rounded-full h-3 mb-3">
                <div className="h-3 rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: cor }} />
              </div>

              <div className="flex items-center justify-between text-xs text-textsecondary">
                {o.data_alvo && (
                  <span>Meta: {new Date(o.data_alvo + 'T00:00:00').toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' })}</span>
                )}
                {mensalidade !== null && mensalidade > 0 && (
                  <span className="text-indigo font-medium">{formatBRL(mensalidade)}/mês necessário</span>
                )}
              </div>

              {saldoConta !== null && pct < 100 && (
                <div className="mt-3 bg-bg rounded-xl px-3 py-2 text-xs text-textsecondary">
                  Saldo atual da conta vinculada: <span className="text-textprimary font-medium">{formatBRL(saldoConta)}</span>
                </div>
              )}
            </div>
          )
        })}

        {objetivos.length === 0 && (
          <div className="col-span-2 bg-surface border border-border rounded-2xl p-12 text-center">
            <Target size={40} className="text-textsecondary mx-auto mb-3" />
            <p className="text-textprimary font-medium mb-1">Nenhum objetivo cadastrado</p>
            <p className="text-textsecondary text-sm">Crie seu primeiro objetivo financeiro</p>
          </div>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50 overflow-y-auto py-8">
          <div className="bg-surface border border-border rounded-2xl p-8 w-full max-w-md">
            <h2 className="font-display text-xl font-bold text-textprimary mb-6">
              {editandoId ? 'Editar Objetivo' : 'Novo Objetivo'}
            </h2>
            <div className="space-y-4">
              <div>
                <label className="text-textsecondary text-sm mb-1 block">Nome do objetivo</label>
                <input value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })}
                  className="w-full bg-bg border border-border rounded-xl px-4 py-3 text-textprimary focus:outline-none focus:border-indigo"
                  placeholder="Ex: Ar condicionado, Viagem, Notebook..." autoFocus />
              </div>
              <div>
                <label className="text-textsecondary text-sm mb-1 block">Descrição (opcional)</label>
                <input value={form.descricao} onChange={e => setForm({ ...form, descricao: e.target.value })}
                  className="w-full bg-bg border border-border rounded-xl px-4 py-3 text-textprimary focus:outline-none focus:border-indigo"
                  placeholder="Ex: Split 12.000 BTUs para o quarto" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-textsecondary text-sm mb-1 block">Valor alvo (R$)</label>
                  <input type="number" value={form.valor_alvo} onChange={e => setForm({ ...form, valor_alvo: e.target.value })}
                    className="w-full bg-bg border border-border rounded-xl px-4 py-3 text-textprimary focus:outline-none focus:border-indigo"
                    placeholder="0,00" />
                </div>
                <div>
                  <label className="text-textsecondary text-sm mb-1 block">Já guardei (R$)</label>
                  <input type="number" value={form.valor_atual} onChange={e => setForm({ ...form, valor_atual: e.target.value })}
                    className="w-full bg-bg border border-border rounded-xl px-4 py-3 text-textprimary focus:outline-none focus:border-indigo"
                    placeholder="0,00" />
                </div>
              </div>
              <div>
                <label className="text-textsecondary text-sm mb-1 block">Data alvo (opcional)</label>
                <input type="date" value={form.data_alvo} onChange={e => setForm({ ...form, data_alvo: e.target.value })}
                  className="w-full bg-bg border border-border rounded-xl px-4 py-3 text-textprimary focus:outline-none focus:border-indigo" />
              </div>
              {form.valor_alvo && form.data_alvo && (
                <div className="bg-indigo/10 border border-indigo/20 rounded-xl px-4 py-3">
                  <p className="text-textsecondary text-xs">Você precisa guardar por mês</p>
                  <p className="text-indigo font-display font-bold text-xl">
                    {(() => {
                      const hoje = new Date()
                      const alvo = new Date(form.data_alvo + 'T00:00:00')
                      const meses = Math.max(1, (alvo.getFullYear() - hoje.getFullYear()) * 12 + (alvo.getMonth() - hoje.getMonth()))
                      const falta = parseFloat(form.valor_alvo) - (parseFloat(form.valor_atual) || 0)
                      return formatBRL(Math.max(0, falta / meses))
                    })()}
                  </p>
                </div>
              )}
              <div>
                <label className="text-textsecondary text-sm mb-1 block">Vincular a uma caixinha (opcional)</label>
                <select value={form.conta_id} onChange={e => setForm({ ...form, conta_id: e.target.value })}
                  className="w-full bg-bg border border-border rounded-xl px-4 py-3 text-textprimary focus:outline-none focus:border-indigo">
                  <option value="">Sem vínculo</option>
                  {contas.filter(c => c.categoria_conta === 'reserva').map(c => (
                    <option key={c.id} value={c.id}>{c.nome}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => { setShowForm(false); setEditandoId(null); setForm(vazio) }}
                className="flex-1 border border-border text-textsecondary hover:text-textprimary py-3 rounded-xl text-sm font-medium transition-colors">
                Cancelar
              </button>
              <button onClick={handleSave} disabled={loading || !form.nome || !form.valor_alvo}
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

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { Plus, Trash2, Pencil, Clock, PiggyBank, CheckCircle2 } from 'lucide-react'
import FAB from '../components/FAB'

const formatBRL = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

const statusConfig = {
  pendente: { label: 'Pendente', icon: Clock, cor: 'text-yellow', bg: 'bg-yellow/10 border-yellow/30' },
  reservado: { label: 'Reservado', icon: PiggyBank, cor: 'text-indigo', bg: 'bg-indigo/10 border-indigo/30' },
  pago: { label: 'Pago', icon: CheckCircle2, cor: 'text-green', bg: 'bg-green/10 border-green/30' },
}

const proximoStatus = { pendente: 'reservado', reservado: 'pago', pago: 'pendente' }

export default function Fixos() {
  const { user } = useAuth()
  const [fixos, setFixos] = useState([])
  const [statusMap, setStatusMap] = useState({})
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [editandoId, setEditandoId] = useState(null)

  const hoje = new Date()
  const mesAtual = hoje.getMonth() + 1
  const anoAtual = hoje.getFullYear()

  const [form, setForm] = useState({
    descricao: '', valor: '', dia_vencimento: '1',
    data_inicio: new Date().toISOString().split('T')[0], data_fim: ''
  })

  const fetchFixos = async () => {
    const { data } = await supabase.from('fixos').select('*').eq('user_id', user.id).order('dia_vencimento')
    setFixos(data || [])

    const { data: statusData } = await supabase
      .from('fixos_status')
      .select('*')
      .eq('user_id', user.id)
      .eq('mes', mesAtual)
      .eq('ano', anoAtual)

    const map = {}
    ;(statusData || []).forEach(s => { map[s.fixo_id] = s.status })
    setStatusMap(map)
  }

  useEffect(() => { fetchFixos() }, [])

  const handleSave = async () => {
    setLoading(true)
    const payload = {
      descricao: form.descricao,
      valor: parseFloat(form.valor),
      dia_vencimento: parseInt(form.dia_vencimento),
      data_inicio: form.data_inicio,
      data_fim: form.data_fim || null,
    }

    let error
    if (editandoId) {
      const result = await supabase.from('fixos').update(payload).eq('id', editandoId)
      error = result.error
    } else {
      const result = await supabase.from('fixos').insert({ ...payload, user_id: user.id })
      error = result.error
    }

    if (error) { alert('Erro: ' + error.message); setLoading(false); return }
    setForm({ descricao: '', valor: '', dia_vencimento: '1', data_inicio: new Date().toISOString().split('T')[0], data_fim: '' })
    setEditandoId(null)
    setShowForm(false)
    fetchFixos()
    setLoading(false)
  }

  const handleEdit = (f) => {
    setForm({
      descricao: f.descricao,
      valor: String(f.valor),
      dia_vencimento: String(f.dia_vencimento),
      data_inicio: f.data_inicio,
      data_fim: f.data_fim || ''
    })
    setEditandoId(f.id)
    setTimeout(() => setShowForm(true), 0)
  }

  const handleDelete = async (id) => {
    await supabase.from('fixos').update({ ativo: false }).eq('id', id)
    fetchFixos()
  }

  const handleToggleStatus = async (fixoId) => {
    const statusAtual = statusMap[fixoId] || 'pendente'
    const novoStatus = proximoStatus[statusAtual]

    const { error } = await supabase.from('fixos_status').upsert({
      user_id: user.id,
      fixo_id: fixoId,
      mes: mesAtual,
      ano: anoAtual,
      status: novoStatus,
      data_atualizacao: new Date().toISOString()
    }, { onConflict: 'fixo_id,mes,ano' })

    if (!error) {
      setStatusMap(prev => ({ ...prev, [fixoId]: novoStatus }))
    }
  }

  const totalMensal = fixos.filter(f => f.ativo).reduce((sum, f) => sum + Number(f.valor), 0)
  const totalPago = fixos.filter(f => statusMap[f.id] === 'pago').reduce((sum, f) => sum + Number(f.valor), 0)
  const totalReservado = fixos.filter(f => statusMap[f.id] === 'reservado').reduce((sum, f) => sum + Number(f.valor), 0)

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-display text-2xl font-bold text-textprimary">Fixos Recorrentes</h1>
          <p className="text-textsecondary text-sm mt-1">Gastos que se repetem todo mês</p>
        </div>
        <button onClick={() => { setEditandoId(null); setForm({ descricao: '', valor: '', dia_vencimento: '1', data_inicio: new Date().toISOString().split('T')[0], data_fim: '' }); setShowForm(true) }}
          className="hidden md:flex items-center gap-2 bg-indigo hover:bg-indigo/90 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors">
          <Plus size={16} /> Novo Fixo
        </button>
      </div>

      {/* Resumo do mês */}
      <div className="grid grid-cols-3 gap-2 md:gap-4 mb-6">
        <div className="bg-surface border border-border rounded-2xl p-3 md:p-5">
          <p className="text-textsecondary text-xs mb-1">Total</p>
          <p className="font-display text-sm md:text-2xl font-bold text-red leading-tight">
            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(totalMensal)}
          </p>
        </div>
        <div className="bg-surface border border-indigo/20 rounded-2xl p-3 md:p-5">
          <p className="text-textsecondary text-xs mb-1">Reservado</p>
          <p className="font-display text-sm md:text-2xl font-bold text-indigo leading-tight">
            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(totalReservado)}
          </p>
        </div>
        <div className="bg-surface border border-green/20 rounded-2xl p-3 md:p-5">
          <p className="text-textsecondary text-xs mb-1">Pago</p>
          <p className="font-display text-sm md:text-2xl font-bold text-green leading-tight">
            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(totalPago)}
          </p>
        </div>
      </div>

      <div className="bg-surface border border-border rounded-2xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left px-3 md:px-6 py-3 md:py-4 text-textsecondary text-xs md:text-sm font-medium">Descrição</th>
              <th className="hidden md:table-cell text-center px-6 py-4 text-textsecondary text-sm font-medium">Dia</th>
              <th className="text-right px-3 md:px-6 py-3 md:py-4 text-textsecondary text-xs md:text-sm font-medium">Valor</th>
              <th className="text-center px-3 md:px-6 py-3 md:py-4 text-textsecondary text-xs md:text-sm font-medium">Status</th>
              <th className="px-3 md:px-6 py-3 md:py-4"></th>
            </tr>
          </thead>
          <tbody>
            {fixos.filter(f => f.ativo).map(f => {
              const status = statusMap[f.id] || 'pendente'
              const cfg = statusConfig[status]
              const Icone = cfg.icon
              return (
                <tr key={f.id} className="border-b border-border/50 hover:bg-white/5 transition-colors">
                  <td className="px-3 md:px-6 py-3 md:py-4 text-textprimary text-sm">{f.descricao}</td>
                  <td className="hidden md:table-cell px-6 py-4 text-center text-textsecondary text-sm">Dia {f.dia_vencimento}</td>
                  <td className="px-3 md:px-6 py-3 md:py-4 text-right text-red font-medium text-sm">{formatBRL(f.valor)}</td>
                  <td className="px-3 md:px-6 py-3 md:py-4 text-center">
                    <button onClick={() => handleToggleStatus(f.id)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${cfg.bg} ${cfg.cor}`}>
                      <Icone size={12} />
                      {cfg.label}
                    </button>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex gap-2 justify-end">
                      <button onClick={() => handleEdit(f)} className="text-textsecondary hover:text-indigo transition-colors">
                        <Pencil size={15} />
                      </button>
                      <button onClick={() => handleDelete(f.id)} className="text-textsecondary hover:text-red transition-colors">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
            {fixos.filter(f => f.ativo).length === 0 && (
              <tr><td colSpan={5} className="px-6 py-12 text-center text-textsecondary">Nenhum fixo cadastrado</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/60 flex items-end md:items-center justify-center z-50">
          <div className="bg-surface border border-border rounded-t-2xl md:rounded-2xl p-6 md:p-8 w-full md:max-w-md max-h-[90vh] overflow-y-auto">
            <h2 className="font-display text-xl font-bold text-textprimary mb-6">
              {editandoId ? 'Editar Fixo' : 'Novo Fixo Recorrente'}
            </h2>
            <div className="space-y-4">
              <div>
                <label className="text-textsecondary text-sm mb-1 block">Descrição</label>
                <input value={form.descricao} onChange={e => setForm({ ...form, descricao: e.target.value })}
                  className="w-full bg-bg border border-border rounded-xl px-4 py-3 text-textprimary focus:outline-none focus:border-indigo"
                  placeholder="Ex: Consignado, Netflix..." />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-textsecondary text-sm mb-1 block">Valor (R$)</label>
                  <input type="number" value={form.valor} onChange={e => setForm({ ...form, valor: e.target.value })}
                    className="w-full bg-bg border border-border rounded-xl px-4 py-3 text-textprimary focus:outline-none focus:border-indigo"
                    placeholder="0,00" />
                </div>
                <div>
                  <label className="text-textsecondary text-sm mb-1 block">Dia de vencimento</label>
                  <input type="number" min="1" max="31" value={form.dia_vencimento}
                    onChange={e => setForm({ ...form, dia_vencimento: e.target.value })}
                    className="w-full bg-bg border border-border rounded-xl px-4 py-3 text-textprimary focus:outline-none focus:border-indigo" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-textsecondary text-sm mb-1 block">Início</label>
                  <input type="date" value={form.data_inicio} onChange={e => setForm({ ...form, data_inicio: e.target.value })}
                    className="w-full bg-bg border border-border rounded-xl px-4 py-3 text-textprimary focus:outline-none focus:border-indigo" />
                </div>
                <div>
                  <label className="text-textsecondary text-sm mb-1 block">Fim (opcional)</label>
                  <input type="date" value={form.data_fim} onChange={e => setForm({ ...form, data_fim: e.target.value })}
                    className="w-full bg-bg border border-border rounded-xl px-4 py-3 text-textprimary focus:outline-none focus:border-indigo" />
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => { setShowForm(false); setEditandoId(null) }}
                className="flex-1 border border-border text-textsecondary hover:text-textprimary py-3 rounded-xl text-sm font-medium transition-colors">
                Cancelar
              </button>
              <button onClick={handleSave} disabled={loading || !form.descricao || !form.valor}
                className="flex-1 bg-indigo hover:bg-indigo/90 text-white py-3 rounded-xl text-sm font-medium transition-colors disabled:opacity-50">
                {loading ? 'Salvando...' : editandoId ? 'Atualizar' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
      <FAB onClick={() => { setEditandoId(null); setForm({ descricao: '', valor: '', dia_vencimento: '1', data_inicio: new Date().toISOString().split('T')[0], data_fim: '' }); setShowForm(true) }} label="Novo Fixo" />
    </div>
  )
}

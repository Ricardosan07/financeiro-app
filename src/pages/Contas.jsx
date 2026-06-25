import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { Plus, Trash2, Pencil, Wallet, PiggyBank, TrendingUp } from 'lucide-react'
import FAB from '../components/FAB'

const tiposConta = ['corrente', 'poupanca', 'investimento', 'digital']
const tipoLabel = { corrente: 'Conta Corrente', poupanca: 'Poupança', investimento: 'Investimento', digital: 'Carteira Digital' }

const categoriasConta = [
  { valor: 'livre', label: 'Saldo Livre', desc: 'Dinheiro disponível, entra na projeção diária', icon: Wallet, cor: 'indigo' },
  { valor: 'reserva', label: 'Reserva', desc: 'Tem propósito definido, não entra na projeção', icon: PiggyBank, cor: 'yellow' },
  { valor: 'patrimonio', label: 'Patrimônio', desc: 'Investimento de longo prazo, só visualização', icon: TrendingUp, cor: 'green' },
]

const formatBRL = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

const formVazio = {
  nome: '', tipo: 'corrente', categoria_conta: 'livre', saldo_atual: '',
  data_referencia: new Date().toISOString().split('T')[0],
  proposito: '', meta_valor: '', dia_fechamento_fatura: ''
}

export default function Contas() {
  const { user } = useAuth()
  const [contas, setContas] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [editandoId, setEditandoId] = useState(null)
  const [form, setForm] = useState(formVazio)

  const fetchContas = async () => {
    const { data } = await supabase.from('contas').select('*').eq('user_id', user.id).eq('ativo', true).order('categoria_conta').order('criado_em')
    setContas(data || [])
  }

  useEffect(() => { fetchContas() }, [])

  const handleSave = async () => {
    setLoading(true)
    const payload = {
      nome: form.nome,
      tipo: form.tipo,
      categoria_conta: form.categoria_conta,
      saldo_atual: parseFloat(form.saldo_atual) || 0,
      data_referencia: form.data_referencia,
      proposito: form.proposito || null,
      meta_valor: form.meta_valor ? parseFloat(form.meta_valor) : null,
      dia_fechamento_fatura: form.dia_fechamento_fatura ? parseInt(form.dia_fechamento_fatura) : null,
    }

    let error
    if (editandoId) {
      const result = await supabase.from('contas').update(payload).eq('id', editandoId)
      error = result.error
    } else {
      const result = await supabase.from('contas').insert({ ...payload, user_id: user.id }).select()
      error = result.error
    }

    if (error) {
      alert('Erro ao salvar conta: ' + error.message)
      setLoading(false)
      return
    }

    setForm(formVazio)
    setEditandoId(null)
    setShowForm(false)
    fetchContas()
    setLoading(false)
  }

  const handleEdit = (conta) => {
    setForm({
      nome: conta.nome || '',
      tipo: conta.tipo || 'corrente',
      categoria_conta: conta.categoria_conta || 'livre',
      saldo_atual: conta.saldo_atual !== undefined ? String(conta.saldo_atual) : '',
      data_referencia: conta.data_referencia || new Date().toISOString().split('T')[0],
      proposito: conta.proposito || '',
      meta_valor: conta.meta_valor ? String(conta.meta_valor) : '',
      dia_fechamento_fatura: conta.dia_fechamento_fatura ? String(conta.dia_fechamento_fatura) : ''
    })
    setEditandoId(conta.id)
    setTimeout(() => setShowForm(true), 0)
  }

  const handleDelete = async (id) => {
    await supabase.from('contas').update({ ativo: false }).eq('id', id)
    fetchContas()
  }

  const porCategoria = (cat) => contas.filter(c => c.categoria_conta === cat || (!c.categoria_conta && cat === 'livre'))
  const totalCategoria = (cat) => porCategoria(cat).reduce((sum, c) => sum + Number(c.saldo_atual), 0)
  const totalGeral = contas.reduce((sum, c) => sum + Number(c.saldo_atual), 0)

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-display text-2xl font-bold text-textprimary">Contas</h1>
          <p className="text-textsecondary text-sm mt-1">Saldo livre, reservas e patrimônio</p>
        </div>
        <button onClick={() => { setEditandoId(null); setForm(formVazio); setShowForm(true) }}
          className="hidden md:flex items-center gap-2 bg-indigo hover:bg-indigo/90 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors">
          <Plus size={16} /> Nova Conta
        </button>
      </div>

      {/* Resumo por categoria */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        {categoriasConta.map(cat => (
          <div key={cat.valor} className="bg-surface border border-border rounded-2xl p-6">
            <div className="flex items-center gap-2 mb-2">
              <cat.icon size={16} className={`text-${cat.cor}`} />
              <p className="text-textsecondary text-sm">{cat.label}</p>
            </div>
            <p className={`font-display text-2xl font-bold ${cat.cor === 'indigo' ? 'text-textprimary' : `text-${cat.cor}`}`}>
              {formatBRL(totalCategoria(cat.valor))}
            </p>
            <p className="text-textsecondary text-xs mt-1">{cat.desc}</p>
          </div>
        ))}
      </div>

      <div className="bg-surface border border-border rounded-2xl p-6 mb-8">
        <p className="text-textsecondary text-sm">Patrimônio Total Consolidado</p>
        <p className="font-display text-3xl font-bold text-textprimary mt-1">{formatBRL(totalGeral)}</p>
        <p className="text-textsecondary text-xs mt-2">Soma de tudo: livre + reserva + patrimônio (referência apenas)</p>
      </div>

      {/* Seções por categoria */}
      {categoriasConta.map(cat => {
        const lista = porCategoria(cat.valor)
        if (lista.length === 0) return null
        return (
          <div key={cat.valor} className="mb-8">
            <div className="flex items-center gap-2 mb-4">
              <cat.icon size={16} className={`text-${cat.cor}`} />
              <h2 className="font-display font-semibold text-textprimary">{cat.label}</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {lista.map(conta => (
                <div key={conta.id} className="bg-surface border border-border rounded-2xl p-6">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="font-semibold text-textprimary">{conta.nome}</p>
                      <p className="text-textsecondary text-xs mt-1">{tipoLabel[conta.tipo]}</p>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => handleEdit(conta)} className="text-textsecondary hover:text-indigo transition-colors">
                        <Pencil size={14} />
                      </button>
                      <button onClick={() => handleDelete(conta.id)} className="text-textsecondary hover:text-red transition-colors">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                  <p className={`font-display text-2xl font-bold ${Number(conta.saldo_atual) >= 0 ? 'text-textprimary' : 'text-red'}`}>
                    {formatBRL(conta.saldo_atual)}
                  </p>
                  {conta.proposito && (
                    <p className="text-textsecondary text-xs mt-2 italic">{conta.proposito}</p>
                  )}
                  {conta.meta_valor && (
                    <div className="mt-3">
                      <div className="flex justify-between text-xs text-textsecondary mb-1">
                        <span>Meta: {formatBRL(conta.meta_valor)}</span>
                        <span>{Math.round((Number(conta.saldo_atual) / Number(conta.meta_valor)) * 100)}%</span>
                      </div>
                      <div className="w-full bg-border rounded-full h-1.5">
                        <div className="bg-yellow h-1.5 rounded-full transition-all"
                          style={{ width: `${Math.min(100, (Number(conta.saldo_atual) / Number(conta.meta_valor)) * 100)}%` }} />
                      </div>
                    </div>
                  )}
                  {conta.dia_fechamento_fatura && (
                    <p className="text-textsecondary text-xs mt-2">Fatura fecha dia {conta.dia_fechamento_fatura}</p>
                  )}
                  <p className="text-textsecondary text-xs mt-2">
                    Ref: {new Date(conta.data_referencia + 'T00:00:00').toLocaleDateString('pt-BR')}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )
      })}

      {showForm && (
        <div className="fixed inset-0 bg-black/60 flex items-end md:items-center justify-center z-50">
          <div className="bg-surface border border-border rounded-t-2xl md:rounded-2xl p-6 md:p-8 w-full md:max-w-md max-h-[90vh] overflow-y-auto">
            <h2 className="font-display text-xl font-bold text-textprimary mb-6">
              {editandoId ? 'Editar Conta' : 'Nova Conta'}
            </h2>
            <div className="space-y-4">
              <div>
                <label className="text-textsecondary text-sm mb-1 block">Nome</label>
                <input value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })}
                  className="w-full bg-bg border border-border rounded-xl px-4 py-3 text-textprimary focus:outline-none focus:border-indigo"
                  placeholder="Ex: Nubank, Caixinha Pet, Previdência..." />
              </div>

              <div>
                <label className="text-textsecondary text-sm mb-1 block">Categoria</label>
                <div className="grid grid-cols-3 gap-2">
                  {categoriasConta.map(cat => (
                    <button key={cat.valor} onClick={() => setForm({ ...form, categoria_conta: cat.valor })}
                      className={`p-3 rounded-xl text-xs font-medium transition-colors border ${
                        form.categoria_conta === cat.valor
                          ? `bg-${cat.cor}/15 text-${cat.cor} border-${cat.cor}/30`
                          : 'border-border text-textsecondary'
                      }`}>
                      {cat.label}
                    </button>
                  ))}
                </div>
                <p className="text-textsecondary text-xs mt-2">
                  {categoriasConta.find(c => c.valor === form.categoria_conta)?.desc}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-textsecondary text-sm mb-1 block">Tipo</label>
                  <select value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value })}
                    className="w-full bg-bg border border-border rounded-xl px-4 py-3 text-textprimary focus:outline-none focus:border-indigo">
                    {tiposConta.map(t => <option key={t} value={t}>{tipoLabel[t]}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-textsecondary text-sm mb-1 block">Saldo atual (R$)</label>
                  <input type="number" value={form.saldo_atual} onChange={e => setForm({ ...form, saldo_atual: e.target.value })}
                    className="w-full bg-bg border border-border rounded-xl px-4 py-3 text-textprimary focus:outline-none focus:border-indigo"
                    placeholder="0,00" />
                </div>
              </div>

              {form.categoria_conta === 'reserva' && (
                <>
                  <div>
                    <label className="text-textsecondary text-sm mb-1 block">Propósito (opcional)</label>
                    <input value={form.proposito} onChange={e => setForm({ ...form, proposito: e.target.value })}
                      className="w-full bg-bg border border-border rounded-xl px-4 py-3 text-textprimary focus:outline-none focus:border-indigo"
                      placeholder="Ex: Manutenções da casa" />
                  </div>
                  <div>
                    <label className="text-textsecondary text-sm mb-1 block">Meta (opcional)</label>
                    <input type="number" value={form.meta_valor} onChange={e => setForm({ ...form, meta_valor: e.target.value })}
                      className="w-full bg-bg border border-border rounded-xl px-4 py-3 text-textprimary focus:outline-none focus:border-indigo"
                      placeholder="0,00" />
                  </div>
                </>
              )}

              {form.categoria_conta === 'livre' && (
                <div>
                  <label className="text-textsecondary text-sm mb-1 block">Dia de fechamento da fatura (se cartão, opcional)</label>
                  <input type="number" min="1" max="31" value={form.dia_fechamento_fatura}
                    onChange={e => setForm({ ...form, dia_fechamento_fatura: e.target.value })}
                    className="w-full bg-bg border border-border rounded-xl px-4 py-3 text-textprimary focus:outline-none focus:border-indigo"
                    placeholder="Ex: 27" />
                </div>
              )}

              <div>
                <label className="text-textsecondary text-sm mb-1 block">Data de referência do saldo</label>
                <input type="date" value={form.data_referencia} onChange={e => setForm({ ...form, data_referencia: e.target.value })}
                  className="w-full bg-bg border border-border rounded-xl px-4 py-3 text-textprimary focus:outline-none focus:border-indigo" />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => { setShowForm(false); setEditandoId(null); setForm(formVazio) }}
                className="flex-1 border border-border text-textsecondary hover:text-textprimary py-3 rounded-xl text-sm font-medium transition-colors">
                Cancelar
              </button>
              <button onClick={handleSave} disabled={loading || !form.nome}
                className="flex-1 bg-indigo hover:bg-indigo/90 text-white py-3 rounded-xl text-sm font-medium transition-colors disabled:opacity-50">
                {loading ? 'Salvando...' : editandoId ? 'Atualizar' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
      <FAB onClick={() => { setEditandoId(null); setForm(formVazio); setShowForm(true) }} label="Nova Conta" />
    </div>
  )
}

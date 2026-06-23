import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { Plus, Trash2, Pencil } from 'lucide-react'

const formatBRL = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
const meses = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

function parcelaAtualIndex(parcela) {
  const hoje = new Date()
  const anoAtual = hoje.getFullYear()
  const mesAtual = hoje.getMonth() + 1
  const diffAnos = anoAtual - parcela.ano_inicio
  const diffMeses = mesAtual - parcela.mes_inicio
  return Math.max(0, Math.min(parcela.num_parcelas - 1, diffAnos * 12 + diffMeses))
}

export default function Parcelas() {
  const { user } = useAuth()
  const [parcelas, setParcelas] = useState([])
  const [cartoes, setCartoes] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [editandoId, setEditandoId] = useState(null)
  const hoje = new Date()

  const vazio = {
    descricao: '', valor_total: '', num_parcelas: '12',
    mes_inicio: String(hoje.getMonth() + 1),
    ano_inicio: String(hoje.getFullYear()),
    dia_pagamento: '1',
    forma: 'cartao',
    cartao_id: ''
  }
  const [form, setForm] = useState(vazio)

  const fetchParcelas = async () => {
    const { data } = await supabase
      .from('parcelas')
      .select('*, cartao:cartao_id(nome)')
      .eq('user_id', user.id)
      .eq('ativo', true)
      .order('criado_em', { ascending: false })
    setParcelas(data || [])
  }

  const fetchCartoes = async () => {
    const { data } = await supabase.from('cartoes').select('*').eq('user_id', user.id).eq('ativo', true)
    setCartoes(data || [])
    if (data?.length > 0 && !form.cartao_id) {
      setForm(f => ({ ...f, cartao_id: data[0].id }))
    }
  }

  useEffect(() => { fetchParcelas(); fetchCartoes() }, [])

  const valorParcela = form.valor_total && form.num_parcelas
    ? (parseFloat(form.valor_total) / parseInt(form.num_parcelas)).toFixed(2)
    : '0.00'

  const calcularFim = () => {
    const mes = parseInt(form.mes_inicio)
    const ano = parseInt(form.ano_inicio)
    const n = parseInt(form.num_parcelas) - 1
    const totalMeses = (mes - 1) + n
    return { mes_fim: (totalMeses % 12) + 1, ano_fim: ano + Math.floor(totalMeses / 12) }
  }

  const handleSave = async () => {
    setLoading(true)
    const { mes_fim, ano_fim } = calcularFim()
    const payload = {
      descricao: form.descricao,
      valor_total: parseFloat(form.valor_total),
      num_parcelas: parseInt(form.num_parcelas),
      valor_parcela: parseFloat(valorParcela),
      mes_inicio: parseInt(form.mes_inicio),
      ano_inicio: parseInt(form.ano_inicio),
      mes_fim, ano_fim,
      dia_pagamento: parseInt(form.dia_pagamento) || 1,
      forma: form.forma,
      cartao_id: form.forma === 'cartao' ? form.cartao_id || null : null,
    }

    let error
    if (editandoId) {
      const result = await supabase.from('parcelas').update(payload).eq('id', editandoId)
      error = result.error
    } else {
      const result = await supabase.from('parcelas').insert({ ...payload, user_id: user.id })
      error = result.error
    }

    if (error) { alert('Erro: ' + error.message); setLoading(false); return }

    setForm(vazio)
    setEditandoId(null)
    setShowForm(false)
    fetchParcelas()
    setLoading(false)
  }

  const handleEdit = (p) => {
    setForm({
      descricao: p.descricao,
      valor_total: String(p.valor_total),
      num_parcelas: String(p.num_parcelas),
      mes_inicio: String(p.mes_inicio),
      ano_inicio: String(p.ano_inicio),
      dia_pagamento: String(p.dia_pagamento || 1),
      forma: p.forma || 'cartao',
      cartao_id: p.cartao_id || ''
    })
    setEditandoId(p.id)
    setTimeout(() => setShowForm(true), 0)
  }

  const handleDelete = async (id) => {
    await supabase.from('parcelas').update({ ativo: false }).eq('id', id)
    fetchParcelas()
  }

  const totalMensal = parcelas.reduce((sum, p) => sum + Number(p.valor_parcela), 0)

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-display text-2xl font-bold text-textprimary">Parcelas</h1>
          <p className="text-textsecondary text-sm mt-1">Compras parceladas em andamento</p>
        </div>
        <button onClick={() => { setEditandoId(null); setForm(vazio); setShowForm(true) }}
          className="flex items-center gap-2 bg-indigo hover:bg-indigo/90 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors">
          <Plus size={16} /> Nova Parcela
        </button>
      </div>

      <div className="bg-surface border border-border rounded-2xl p-6 mb-6">
        <p className="text-textsecondary text-sm">Total Comprometido por Mês</p>
        <p className="font-display text-4xl font-bold text-yellow mt-1">{formatBRL(totalMensal)}</p>
      </div>

      <div className="space-y-4">
        {parcelas.map(p => {
          const atual = parcelaAtualIndex(p) + 1
          const progresso = (atual / p.num_parcelas) * 100
          const restante = (p.num_parcelas - atual + 1) * Number(p.valor_parcela)
          return (
            <div key={p.id} className="bg-surface border border-border rounded-2xl p-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <p className="font-semibold text-textprimary">{p.descricao}</p>
                  <div className="flex items-center gap-3 mt-1">
                    {p.cartao?.nome && (
                      <span className="text-textsecondary text-xs bg-indigo/10 text-indigo px-2 py-0.5 rounded-full">
                        {p.cartao.nome}
                      </span>
                    )}
                    {p.dia_pagamento && (
                      <span className="text-textsecondary text-xs">Dia {p.dia_pagamento}</span>
                    )}
                    <span className="text-textsecondary text-xs capitalize">{p.forma || 'cartão'}</span>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="text-yellow font-display font-bold text-lg">{formatBRL(p.valor_parcela)}/mês</p>
                    <p className="text-textsecondary text-xs">{atual}/{p.num_parcelas} parcelas</p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => handleEdit(p)} className="text-textsecondary hover:text-indigo transition-colors">
                      <Pencil size={15} />
                    </button>
                    <button onClick={() => handleDelete(p.id)} className="text-textsecondary hover:text-red transition-colors">
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              </div>
              <div className="w-full bg-border rounded-full h-2 mb-2">
                <div className="bg-indigo h-2 rounded-full transition-all" style={{ width: `${progresso}%` }} />
              </div>
              <div className="flex justify-between text-xs text-textsecondary">
                <span>Término: {meses[p.mes_fim - 1]}/{p.ano_fim}</span>
                <span>Restante: {formatBRL(restante)}</span>
              </div>
            </div>
          )
        })}
        {parcelas.length === 0 && (
          <div className="bg-surface border border-border rounded-2xl p-12 text-center text-textsecondary">
            Nenhuma parcela cadastrada
          </div>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50 overflow-y-auto py-8">
          <div className="bg-surface border border-border rounded-2xl p-8 w-full max-w-md">
            <h2 className="font-display text-xl font-bold text-textprimary mb-6">
              {editandoId ? 'Editar Parcela' : 'Nova Parcela'}
            </h2>
            <div className="space-y-4">
              <div>
                <label className="text-textsecondary text-sm mb-1 block">Descrição</label>
                <input value={form.descricao} onChange={e => setForm({ ...form, descricao: e.target.value })}
                  className="w-full bg-bg border border-border rounded-xl px-4 py-3 text-textprimary focus:outline-none focus:border-indigo"
                  placeholder="Ex: Samsung Galaxy, Geladeira..." />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-textsecondary text-sm mb-1 block">Valor Total (R$)</label>
                  <input type="number" value={form.valor_total} onChange={e => setForm({ ...form, valor_total: e.target.value })}
                    className="w-full bg-bg border border-border rounded-xl px-4 py-3 text-textprimary focus:outline-none focus:border-indigo"
                    placeholder="0,00" />
                </div>
                <div>
                  <label className="text-textsecondary text-sm mb-1 block">Nº de Parcelas</label>
                  <input type="number" min="1" max="60" value={form.num_parcelas}
                    onChange={e => setForm({ ...form, num_parcelas: e.target.value })}
                    className="w-full bg-bg border border-border rounded-xl px-4 py-3 text-textprimary focus:outline-none focus:border-indigo" />
                </div>
              </div>

              {form.valor_total && form.num_parcelas && (
                <div className="bg-indigo/10 border border-indigo/20 rounded-xl px-4 py-3">
                  <p className="text-textsecondary text-xs">Valor por parcela</p>
                  <p className="text-indigo font-display font-bold text-xl">{formatBRL(parseFloat(valorParcela))}</p>
                </div>
              )}

              <div>
                <label className="text-textsecondary text-sm mb-2 block">Forma de pagamento</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { valor: 'cartao', label: 'Cartão' },
                    { valor: 'debito', label: 'Débito' },
                    { valor: 'boleto', label: 'Boleto' },
                  ].map(f => (
                    <button key={f.valor} onClick={() => setForm({ ...form, forma: f.valor })}
                      className={`py-2.5 rounded-xl text-sm font-medium transition-colors ${
                        form.forma === f.valor
                          ? 'bg-indigo/15 text-indigo border border-indigo/30'
                          : 'border border-border text-textsecondary'
                      }`}>
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              {form.forma === 'cartao' && cartoes.length > 0 && (
                <div>
                  <label className="text-textsecondary text-sm mb-1 block">Cartão</label>
                  <select value={form.cartao_id} onChange={e => setForm({ ...form, cartao_id: e.target.value })}
                    className="w-full bg-bg border border-border rounded-xl px-4 py-3 text-textprimary focus:outline-none focus:border-indigo">
                    <option value="">Selecione...</option>
                    {cartoes.map(c => <option key={c.id} value={c.id}>{c.nome} (fecha dia {c.dia_fechamento})</option>)}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="text-textsecondary text-sm mb-1 block">Dia pagamento</label>
                  <input type="number" min="1" max="31" value={form.dia_pagamento}
                    onChange={e => setForm({ ...form, dia_pagamento: e.target.value })}
                    className="w-full bg-bg border border-border rounded-xl px-4 py-3 text-textprimary focus:outline-none focus:border-indigo"
                    placeholder="1" />
                </div>
                <div>
                  <label className="text-textsecondary text-sm mb-1 block">Mês início</label>
                  <select value={form.mes_inicio} onChange={e => setForm({ ...form, mes_inicio: e.target.value })}
                    className="w-full bg-bg border border-border rounded-xl px-4 py-3 text-textprimary focus:outline-none focus:border-indigo">
                    {meses.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-textsecondary text-sm mb-1 block">Ano início</label>
                  <input type="number" value={form.ano_inicio} onChange={e => setForm({ ...form, ano_inicio: e.target.value })}
                    className="w-full bg-bg border border-border rounded-xl px-4 py-3 text-textprimary focus:outline-none focus:border-indigo" />
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={() => { setShowForm(false); setEditandoId(null) }}
                className="flex-1 border border-border text-textsecondary hover:text-textprimary py-3 rounded-xl text-sm font-medium transition-colors">
                Cancelar
              </button>
              <button onClick={handleSave} disabled={loading || !form.descricao || !form.valor_total}
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

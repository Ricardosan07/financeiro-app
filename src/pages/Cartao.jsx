import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useCartao } from '../hooks/useCartao'
import { CreditCard, Plus, CheckCircle2, TrendingDown, TrendingUp, History, Lock, Pencil, X } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

const formatBRL = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0)
const mesesNome = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

export default function Cartao() {
  const { user } = useAuth()
  const [cartaoSelecionadoId, setCartaoSelecionadoId] = useState(null)
  const { cartoes, cartao, faturaAberta, faturaFechada, historico, comprasAbertas, loading, recarregar } = useCartao(cartaoSelecionadoId)

  const [editandoCompra, setEditandoCompra] = useState(null)
  const [formCompra, setFormCompra] = useState({ descricao: '', valor: '', data: '' })
  const [showSetup, setShowSetup] = useState(false)
  const [showNovoCartao, setShowNovoCartao] = useState(false)
  const [showPagar, setShowPagar] = useState(false)
  const [showEditarInicial, setShowEditarInicial] = useState(false)
  const [showFecharFatura, setShowFecharFatura] = useState(false)
  const [valorInicial, setValorInicial] = useState('')
  const [dataPagamento, setDataPagamento] = useState(new Date().toISOString().split('T')[0])
  const [saving, setSaving] = useState(false)
  const [setupForm, setSetupForm] = useState({ nome: 'Nubank', dia_fechamento: '27', conta_pagamento_id: '' })
  const [contas, setContas] = useState([])

  const carregarContas = async () => {
    const { data } = await supabase.from('contas').select('*').eq('user_id', user.id).eq('ativo', true).eq('categoria_conta', 'livre')
    setContas(data || [])
    if (data?.length > 0) setSetupForm(f => ({ ...f, conta_pagamento_id: data[0].id }))
  }

  const handleSetup = async () => {
    setSaving(true)
    await supabase.from('cartoes').insert({
      user_id: user.id,
      nome: setupForm.nome,
      dia_fechamento: parseInt(setupForm.dia_fechamento),
      conta_pagamento_id: setupForm.conta_pagamento_id
    })
    setShowSetup(false)
    recarregar()
    setSaving(false)
  }

  const handleEditarInicial = async () => {
    if (!faturaAberta) return
    setSaving(true)
    await supabase.from('faturas').update({
      valor_inicial: parseFloat(valorInicial.replace(',', '.')) || 0
    }).eq('id', faturaAberta.id)
    setShowEditarInicial(false)
    setValorInicial('')
    recarregar()
    setSaving(false)
  }

  const handleFecharFatura = async () => {
    if (!faturaAberta) return
    setSaving(true)
    await supabase.from('faturas').update({
      status: 'fechada',
      data_fechamento: new Date().toISOString().split('T')[0]
    }).eq('id', faturaAberta.id)
    setShowFecharFatura(false)
    recarregar()
    setSaving(false)
  }

  const handlePagarFatura = async () => {
    if (!faturaFechada && !faturaAberta) return
    setSaving(true)
    const fatura = faturaFechada || faturaAberta
    const totalFatura = calcularTotalFatura(fatura)

    await supabase.from('faturas').update({
      status: 'paga',
      data_pagamento: dataPagamento,
      valor_pago: totalFatura
    }).eq('id', fatura.id)

    if (cartao?.conta_pagamento_id && totalFatura > 0) {
      const { data: conta } = await supabase.from('contas').select('saldo_atual').eq('id', cartao.conta_pagamento_id).single()
      if (conta) {
        await supabase.from('contas').update({
          saldo_atual: Number(conta.saldo_atual) - totalFatura
        }).eq('id', cartao.conta_pagamento_id)
      }
      await supabase.from('lancamentos').insert({
        user_id: user.id,
        data: dataPagamento,
        descricao: `Pagamento fatura ${mesesNome[fatura.mes - 1]}/${fatura.ano}`,
        valor: totalFatura,
        tipo: 'saida',
        conta_id: cartao.conta_pagamento_id
      })
    }

    setShowPagar(false)
    recarregar()
    setSaving(false)
  }

  const handleExcluirCompra = async (compra) => {
    if (!confirm(`Excluir "${compra.descricao}" de ${formatBRL(compra.valor)}?`)) return
    await supabase.from('lancamentos').delete().eq('id', compra.id)
    recarregar()
  }

  const handleSalvarCompra = async () => {
    if (!editandoCompra) return
    setSaving(true)
    await supabase.from('lancamentos').update({
      descricao: formCompra.descricao,
      valor: parseFloat(formCompra.valor),
      data: formCompra.data
    }).eq('id', editandoCompra.id)
    setEditandoCompra(null)
    recarregar()
    setSaving(false)
  }

  useEffect(() => {
    if (editandoCompra) {
      setFormCompra({
        descricao: editandoCompra.descricao,
        valor: String(editandoCompra.valor),
        data: editandoCompra.data
      })
    }
  }, [editandoCompra])

  const calcularTotalFatura = (fatura) => {
    if (!fatura) return 0
    const compras = fatura.id === faturaAberta?.id ? comprasAbertas : []
    const totalCompras = compras.reduce((sum, c) => sum + Number(c.valor), 0)
    return Number(fatura.valor_inicial || 0) + totalCompras
  }

  const totalFaturaAberta = calcularTotalFatura(faturaAberta)
  const totalFaturaFechada = faturaFechada ? Number(faturaFechada.valor_pago || 0) : 0

  const dadosGrafico = [...historico].reverse().slice(-6).map(f => ({
    mes: `${mesesNome[f.mes - 1]}/${String(f.ano).slice(2)}`,
    valor: Number(f.valor_pago || 0)
  }))

  const tendencia = historico.length >= 2
    ? ((historico[0].valor_pago - historico[1].valor_pago) / historico[1].valor_pago) * 100
    : null

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <p className="text-textsecondary">Carregando...</p>
    </div>
  )

  if (!cartao) return (
    <div>
      <h1 className="font-display text-xl md:text-2xl font-bold text-textprimary flex items-center gap-2 mb-8">
        <CreditCard size={22} className="text-indigo" /> Cartão de Crédito
      </h1>
      <div className="bg-surface border border-border rounded-2xl p-12 text-center">
        <CreditCard size={40} className="text-textsecondary mx-auto mb-4" />
        <p className="text-textprimary font-medium mb-2">Nenhum cartão cadastrado</p>
        <button onClick={() => { carregarContas(); setShowSetup(true) }}
          className="bg-indigo hover:bg-indigo/90 text-white px-6 py-3 rounded-xl text-sm font-medium transition-colors mt-4">
          Cadastrar Cartão
        </button>
      </div>
      {showSetup && (
        <div className="fixed inset-0 bg-black/60 flex items-end md:items-center justify-center z-50">
          <div className="bg-surface border border-border rounded-t-2xl md:rounded-2xl p-6 md:p-8 w-full md:max-w-md">
            <h2 className="font-display text-xl font-bold text-textprimary mb-6">Cadastrar Cartão</h2>
            <div className="space-y-4">
              <div>
                <label className="text-textsecondary text-sm mb-1 block">Nome</label>
                <input value={setupForm.nome} onChange={e => setSetupForm({ ...setupForm, nome: e.target.value })}
                  className="w-full bg-bg border border-border rounded-xl px-4 py-3 text-textprimary focus:outline-none focus:border-indigo" />
              </div>
              <div>
                <label className="text-textsecondary text-sm mb-1 block">Dia de fechamento</label>
                <input type="number" min="1" max="31" value={setupForm.dia_fechamento}
                  onChange={e => setSetupForm({ ...setupForm, dia_fechamento: e.target.value })}
                  className="w-full bg-bg border border-border rounded-xl px-4 py-3 text-textprimary focus:outline-none focus:border-indigo" />
              </div>
              <div>
                <label className="text-textsecondary text-sm mb-1 block">Conta para pagamento</label>
                <select value={setupForm.conta_pagamento_id}
                  onChange={e => setSetupForm({ ...setupForm, conta_pagamento_id: e.target.value })}
                  className="w-full bg-bg border border-border rounded-xl px-4 py-3 text-textprimary focus:outline-none focus:border-indigo">
                  {contas.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowSetup(false)} className="flex-1 border border-border text-textsecondary py-3 rounded-xl text-sm">Cancelar</button>
              <button onClick={handleSetup} disabled={saving} className="flex-1 bg-indigo text-white py-3 rounded-xl text-sm font-medium disabled:opacity-50">
                {saving ? 'Salvando...' : 'Cadastrar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-xl md:text-2xl font-bold text-textprimary flex items-center gap-2">
            <CreditCard size={20} className="text-indigo" /> {cartao.nome}
          </h1>
          <p className="text-textsecondary text-xs md:text-sm mt-1">
            Fecha dia {cartao.dia_fechamento} · Pago em {cartao.conta?.nome}
          </p>
        </div>
        <button onClick={() => { carregarContas(); setShowNovoCartao(true) }}
          className="hidden md:flex items-center gap-2 border border-border text-textsecondary hover:text-textprimary px-3 py-2 rounded-xl text-sm transition-colors">
          <Plus size={14} /> Novo cartão
        </button>
      </div>

      {/* Seletor de cartões */}
      {cartoes.length > 1 && (
        <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
          {cartoes.map(c => (
            <button key={c.id}
              onClick={() => setCartaoSelecionadoId(c.id)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors flex-shrink-0 ${
                (cartaoSelecionadoId || cartoes[0]?.id) === c.id
                  ? 'bg-indigo/15 text-indigo border border-indigo/30'
                  : 'border border-border text-textsecondary'
              }`}>
              {c.nome} · Fecha dia {c.dia_fechamento}
            </button>
          ))}
        </div>
      )}

      {/* Fatura Fechada */}
      {faturaFechada && (
        <div className="bg-red/10 border border-red/30 rounded-2xl p-5 md:p-6 mb-4">
          <div className="flex items-start justify-between mb-2 gap-3">
            <div className="flex items-center gap-2">
              <Lock size={16} className="text-red flex-shrink-0" />
              <p className="text-red font-medium text-sm">
                Fatura {mesesNome[faturaFechada.mes - 1]}/{faturaFechada.ano} — Aguardando Pagamento
              </p>
            </div>
            <button onClick={() => setShowPagar(true)}
              className="flex items-center gap-1.5 bg-green hover:bg-green/90 text-white px-3 py-2 rounded-xl text-xs font-medium transition-colors flex-shrink-0">
              <CheckCircle2 size={14} /> Pagar
            </button>
          </div>
          <p className="font-display text-3xl font-bold text-red">{formatBRL(totalFaturaFechada)}</p>
        </div>
      )}

      {/* Fatura Aberta */}
      {faturaAberta && (
        <div className="bg-surface border border-border rounded-2xl p-5 md:p-6 mb-4">
          <div className="flex items-start justify-between mb-4 gap-3">
            <div>
              <p className="text-textsecondary text-sm">
                Fatura em Aberto — {mesesNome[faturaAberta.mes - 1]}/{faturaAberta.ano}
              </p>
              <p className="font-display text-3xl md:text-4xl font-bold text-textprimary mt-1">
                {formatBRL(totalFaturaAberta)}
              </p>
            </div>
            <div className="text-right flex-shrink-0">
              {tendencia !== null && (
                <div className={`flex items-center gap-1 justify-end text-xs ${tendencia > 0 ? 'text-red' : 'text-green'}`}>
                  {tendencia > 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                  <span>{Math.abs(tendencia).toFixed(0)}% vs anterior</span>
                </div>
              )}
              <p className="text-textsecondary text-xs mt-1">Fecha dia {cartao.dia_fechamento}</p>
            </div>
          </div>

          {/* Saldo inicial com botão de editar */}
          {Number(faturaAberta.valor_inicial) > 0 ? (
            <div className="bg-bg rounded-xl px-4 py-3 mb-4 flex justify-between items-center">
              <span className="text-textsecondary text-sm">Saldo anterior ao sistema</span>
              <div className="flex items-center gap-2">
                <span className="text-textprimary font-medium">{formatBRL(faturaAberta.valor_inicial)}</span>
                <button onClick={() => { setValorInicial(String(faturaAberta.valor_inicial)); setShowEditarInicial(true) }}
                  className="text-textsecondary hover:text-indigo transition-colors">
                  <Pencil size={14} />
                </button>
              </div>
            </div>
          ) : (
            <button onClick={() => { setValorInicial(''); setShowEditarInicial(true) }}
              className="w-full border border-dashed border-border hover:border-indigo text-textsecondary hover:text-indigo rounded-xl px-4 py-3 text-sm transition-colors mb-4 text-left">
              + Informar saldo acumulado antes de usar o sistema
            </button>
          )}

          {/* Compras da fatura */}
          {comprasAbertas.length > 0 ? (
            <div className="space-y-2 mb-4">
              {comprasAbertas.map(c => (
                <div key={c.id} className="flex items-center justify-between py-2 border-b border-border/40 gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-textprimary truncate">{c.descricao}</p>
                    <p className="text-xs text-textsecondary">
                      {new Date(c.data + 'T00:00:00').toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <p className="text-red font-medium text-sm">{formatBRL(c.valor)}</p>
                    <button
                      onClick={() => setEditandoCompra(c)}
                      className="text-textsecondary hover:text-indigo transition-colors">
                      <Pencil size={13} />
                    </button>
                    <button
                      onClick={() => handleExcluirCompra(c)}
                      className="text-textsecondary hover:text-red transition-colors">
                      <X size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-textsecondary text-sm mb-4">Nenhuma compra registrada neste ciclo</p>
          )}

          {/* Botão fechar fatura */}
          {!faturaFechada && (
            <button onClick={() => setShowFecharFatura(true)}
              className="w-full border border-yellow/30 text-yellow hover:bg-yellow/10 py-2.5 rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2">
              <Lock size={14} /> Fechar fatura (dia {cartao.dia_fechamento} chegou)
            </button>
          )}
        </div>
      )}

      {/* Histórico */}
      {historico.length > 0 && (
        <div className="bg-surface border border-border rounded-2xl p-5 md:p-6">
          <div className="flex items-center gap-2 mb-4">
            <History size={16} className="text-indigo" />
            <p className="text-textprimary font-medium">Histórico de Faturas</p>
            {tendencia !== null && (
              <span className={`ml-auto text-xs px-2 py-1 rounded-full ${
                tendencia > 0 ? 'bg-red/15 text-red' : 'bg-green/15 text-green'
              }`}>
                {tendencia > 0 ? '▲' : '▼'} {Math.abs(tendencia).toFixed(0)}%
              </span>
            )}
          </div>
          {dadosGrafico.length > 1 && (
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={dadosGrafico}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2A2D3A" />
                <XAxis dataKey="mes" stroke="#64748B" tick={{ fontSize: 10 }} />
                <YAxis stroke="#64748B" tick={{ fontSize: 10 }} tickFormatter={v => `R$${v}`} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1A1D27', border: '1px solid #2A2D3A', borderRadius: '12px' }}
                  formatter={v => formatBRL(v)} />
                <Line type="monotone" dataKey="valor" stroke="#EF4444" strokeWidth={2} dot={{ fill: '#EF4444', r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
          <div className="mt-4 space-y-2">
            {historico.slice(0, 6).map(f => (
              <div key={f.id} className="flex items-center justify-between py-2 border-b border-border/40">
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={14} className="text-green" />
                  <span className="text-sm text-textprimary">{mesesNome[f.mes - 1]}/{f.ano}</span>
                  <span className="text-xs text-textsecondary">
                    {f.data_pagamento ? new Date(f.data_pagamento + 'T00:00:00').toLocaleDateString('pt-BR') : '—'}
                  </span>
                </div>
                <span className="text-sm font-medium text-textprimary">{formatBRL(f.valor_pago)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal: Editar valor inicial */}
      {showEditarInicial && (
        <div className="fixed inset-0 bg-black/60 flex items-end md:items-center justify-center z-50">
          <div className="bg-surface border border-border rounded-t-2xl md:rounded-2xl p-6 md:p-8 w-full md:max-w-md">
            <h2 className="font-display text-xl font-bold text-textprimary mb-2">Valor da fatura</h2>
            <p className="text-textsecondary text-sm mb-6">
              Informe o total já acumulado nesta fatura (compras feitas antes de usar o sistema).
            </p>
            <div>
              <label className="text-textsecondary text-sm mb-1 block">Valor (R$)</label>
              <input
                type="number"
                value={valorInicial}
                onChange={e => setValorInicial(e.target.value)}
                className="w-full bg-bg border border-border rounded-xl px-4 py-3 text-textprimary focus:outline-none focus:border-indigo text-lg"
                placeholder="0,00"
                autoFocus
              />
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowEditarInicial(false)}
                className="flex-1 border border-border text-textsecondary py-3 rounded-xl text-sm">Cancelar</button>
              <button onClick={handleEditarInicial} disabled={saving}
                className="flex-1 bg-indigo text-white py-3 rounded-xl text-sm font-medium disabled:opacity-50">
                {saving ? 'Salvando...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Fechar fatura */}
      {showFecharFatura && (
        <div className="fixed inset-0 bg-black/60 flex items-end md:items-center justify-center z-50">
          <div className="bg-surface border border-border rounded-t-2xl md:rounded-2xl p-6 md:p-8 w-full md:max-w-md">
            <h2 className="font-display text-xl font-bold text-textprimary mb-2">Fechar fatura</h2>
            <p className="text-textsecondary text-sm mb-4">
              Ao fechar, a fatura trava em <strong className="text-textprimary">{formatBRL(totalFaturaAberta)}</strong>.
              Novas compras entrarão na próxima fatura.
            </p>
            <div className="bg-yellow/10 border border-yellow/20 rounded-xl px-4 py-3 mb-6">
              <p className="text-yellow text-xs">
                ⚠ Só feche quando o ciclo de {cartao.dia_fechamento} de cada mês chegar.
                Depois de fechar, use "Pagar Fatura" quando efetuar o pagamento.
              </p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowFecharFatura(false)}
                className="flex-1 border border-border text-textsecondary py-3 rounded-xl text-sm">Cancelar</button>
              <button onClick={handleFecharFatura} disabled={saving}
                className="flex-1 bg-yellow hover:bg-yellow/90 text-black py-3 rounded-xl text-sm font-medium disabled:opacity-50">
                {saving ? 'Fechando...' : 'Fechar Fatura'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Pagar fatura */}
      {showPagar && (
        <div className="fixed inset-0 bg-black/60 flex items-end md:items-center justify-center z-50">
          <div className="bg-surface border border-border rounded-t-2xl md:rounded-2xl p-6 md:p-8 w-full md:max-w-md">
            <h2 className="font-display text-xl font-bold text-textprimary mb-2">Pagar Fatura</h2>
            <p className="text-textsecondary text-sm mb-4">
              Desconta de <strong className="text-textprimary">{cartao?.conta?.nome}</strong> e move pro histórico.
            </p>
            <div className="bg-bg rounded-xl px-4 py-3 mb-4 flex justify-between">
              <span className="text-textsecondary text-sm">Total</span>
              <span className="text-red font-display font-bold">{formatBRL(totalFaturaFechada || totalFaturaAberta)}</span>
            </div>
            <div>
              <label className="text-textsecondary text-sm mb-1 block">Data do pagamento</label>
              <input type="date" value={dataPagamento} onChange={e => setDataPagamento(e.target.value)}
                className="w-full bg-bg border border-border rounded-xl px-4 py-3 text-textprimary focus:outline-none focus:border-indigo" />
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowPagar(false)}
                className="flex-1 border border-border text-textsecondary py-3 rounded-xl text-sm">Cancelar</button>
              <button onClick={handlePagarFatura} disabled={saving}
                className="flex-1 bg-green hover:bg-green/90 text-white py-3 rounded-xl text-sm font-medium disabled:opacity-50">
                {saving ? 'Processando...' : 'Confirmar Pagamento'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Editar compra da fatura */}
      {editandoCompra && (
        <div className="fixed inset-0 bg-black/60 flex items-end md:items-center justify-center z-50">
          <div className="bg-surface border border-border rounded-t-2xl md:rounded-2xl p-6 md:p-8 w-full md:max-w-md">
            <h2 className="font-display text-xl font-bold text-textprimary mb-6">Editar Compra</h2>
            <div className="space-y-4">
              <div>
                <label className="text-textsecondary text-sm mb-1 block">Descrição</label>
                <input
                  value={formCompra.descricao}
                  onChange={e => setFormCompra({ ...formCompra, descricao: e.target.value })}
                  className="w-full bg-bg border border-border rounded-xl px-4 py-3 text-textprimary focus:outline-none focus:border-indigo"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-textsecondary text-sm mb-1 block">Valor (R$)</label>
                  <input
                    type="number"
                    value={formCompra.valor}
                    onChange={e => setFormCompra({ ...formCompra, valor: e.target.value })}
                    className="w-full bg-bg border border-border rounded-xl px-4 py-3 text-textprimary focus:outline-none focus:border-indigo"
                  />
                </div>
                <div>
                  <label className="text-textsecondary text-sm mb-1 block">Data da compra</label>
                  <input
                    type="date"
                    value={formCompra.data}
                    onChange={e => setFormCompra({ ...formCompra, data: e.target.value })}
                    className="w-full bg-bg border border-border rounded-xl px-4 py-3 text-textprimary focus:outline-none focus:border-indigo"
                  />
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setEditandoCompra(null)}
                className="flex-1 border border-border text-textsecondary py-3 rounded-xl text-sm">Cancelar</button>
              <button onClick={handleSalvarCompra} disabled={saving}
                className="flex-1 bg-indigo text-white py-3 rounded-xl text-sm font-medium disabled:opacity-50">
                {saving ? 'Salvando...' : 'Atualizar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Novo cartão */}
      {showNovoCartao && (
        <div className="fixed inset-0 bg-black/60 flex items-end md:items-center justify-center z-50">
          <div className="bg-surface border border-border rounded-t-2xl md:rounded-2xl p-6 md:p-8 w-full md:max-w-md">
            <h2 className="font-display text-xl font-bold text-textprimary mb-6">Novo Cartão</h2>
            <div className="space-y-4">
              <div>
                <label className="text-textsecondary text-sm mb-1 block">Nome</label>
                <input value={setupForm.nome} onChange={e => setSetupForm({ ...setupForm, nome: e.target.value })}
                  className="w-full bg-bg border border-border rounded-xl px-4 py-3 text-textprimary focus:outline-none focus:border-indigo"
                  placeholder="Ex: XP Investimentos" />
              </div>
              <div>
                <label className="text-textsecondary text-sm mb-1 block">Dia de fechamento</label>
                <input type="number" min="1" max="31" value={setupForm.dia_fechamento}
                  onChange={e => setSetupForm({ ...setupForm, dia_fechamento: e.target.value })}
                  className="w-full bg-bg border border-border rounded-xl px-4 py-3 text-textprimary focus:outline-none focus:border-indigo" />
              </div>
              <div>
                <label className="text-textsecondary text-sm mb-1 block">Conta para pagamento</label>
                <select value={setupForm.conta_pagamento_id}
                  onChange={e => setSetupForm({ ...setupForm, conta_pagamento_id: e.target.value })}
                  className="w-full bg-bg border border-border rounded-xl px-4 py-3 text-textprimary focus:outline-none focus:border-indigo">
                  <option value="">Selecione...</option>
                  {contas.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowNovoCartao(false)}
                className="flex-1 border border-border text-textsecondary py-3 rounded-xl text-sm">Cancelar</button>
              <button onClick={async () => {
                setSaving(true)
                await supabase.from('cartoes').insert({
                  user_id: user.id,
                  nome: setupForm.nome,
                  dia_fechamento: parseInt(setupForm.dia_fechamento),
                  conta_pagamento_id: setupForm.conta_pagamento_id || null
                })
                setShowNovoCartao(false)
                recarregar()
                setSaving(false)
              }} disabled={saving || !setupForm.nome}
                className="flex-1 bg-indigo text-white py-3 rounded-xl text-sm font-medium disabled:opacity-50">
                {saving ? 'Salvando...' : 'Cadastrar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

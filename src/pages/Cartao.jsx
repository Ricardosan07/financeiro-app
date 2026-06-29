import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useCartao } from '../hooks/useCartao'
import { CreditCard, Plus, Pencil, X } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'

const formatBRL = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0)
const mesesNome = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

export default function Cartao() {
  const { user } = useAuth()
  const [cartaoSelecionadoId, setCartaoSelecionadoId] = useState(null)
  const { cartoes, cartao, faturaAtual, comprasFatura, historico, loading, recarregar } = useCartao(cartaoSelecionadoId)

  const [showPagar, setShowPagar] = useState(false)
  const [showNovoCartao, setShowNovoCartao] = useState(false)
  const [showEditarInicial, setShowEditarInicial] = useState(false)
  const [editandoCompra, setEditandoCompra] = useState(null)
  const [formCompra, setFormCompra] = useState({ descricao: '', valor: '', data: '' })
  const [tipoPagamento, setTipoPagamento] = useState('total')
  const [valorParcial, setValorParcial] = useState('')
  const [dataPagamento, setDataPagamento] = useState(new Date().toISOString().split('T')[0])
  const [valorInicial, setValorInicial] = useState('')
  const [setupForm, setSetupForm] = useState({ nome: '', dia_fechamento: '27', conta_pagamento_id: '' })
  const [contas, setContas] = useState([])
  const [saving, setSaving] = useState(false)

  const carregarContas = async () => {
    const { data } = await supabase.from('contas').select('*').eq('user_id', user.id).eq('ativo', true)
    setContas(data || [])
  }

  useEffect(() => {
    if (editandoCompra) {
      setFormCompra({ descricao: editandoCompra.descricao, valor: String(editandoCompra.valor), data: editandoCompra.data })
    }
  }, [editandoCompra])

  const handlePagar = async () => {
    if (!faturaAtual) return
    setSaving(true)

    const valorPago = tipoPagamento === 'total'
      ? faturaAtual.total
      : parseFloat(valorParcial) || 0

    if (valorPago <= 0) { setSaving(false); return }

    const saldoRestante = faturaAtual.total - valorPago

    if (saldoRestante <= 0.01) {
      await supabase.from('faturas').update({
        status: 'paga',
        data_pagamento: dataPagamento,
        valor_pago: valorPago
      }).eq('id', faturaAtual.id)
    } else {
      await supabase.from('faturas').update({
        valor_inicial: saldoRestante,
        data_pagamento: dataPagamento,
      }).eq('id', faturaAtual.id)
    }

    if (cartao?.conta_pagamento_id) {
      const { data: conta } = await supabase
        .from('contas').select('saldo_atual').eq('id', cartao.conta_pagamento_id).single()
      if (conta) {
        await supabase.from('contas').update({
          saldo_atual: Number(conta.saldo_atual) - valorPago
        }).eq('id', cartao.conta_pagamento_id)
      }

      await supabase.from('lancamentos').insert({
        user_id: user.id,
        data: dataPagamento,
        descricao: `Pagamento fatura ${cartao.nome}${tipoPagamento === 'parcial' ? ' (parcial)' : ''}`,
        valor: valorPago,
        tipo: 'saida',
        conta_id: cartao.conta_pagamento_id
      })
    }

    setShowPagar(false)
    setValorParcial('')
    setTipoPagamento('total')
    recarregar()
    setSaving(false)
  }

  const handleEditarInicial = async () => {
    if (!faturaAtual) return
    setSaving(true)
    await supabase.from('faturas').update({
      valor_inicial: parseFloat(valorInicial.replace(',', '.')) || 0
    }).eq('id', faturaAtual.id)
    setShowEditarInicial(false)
    setValorInicial('')
    recarregar()
    setSaving(false)
  }

  const handleExcluirCompra = async (compra) => {
    if (!confirm(`Excluir "${compra.descricao}"?`)) return
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

  const dadosGrafico = [
    ...historico.slice().reverse().map(f => ({
      mes: `${mesesNome[f.mes - 1]}/${String(f.ano).slice(2)}`,
      valor: Number(f.valor_pago || f.valor_inicial || 0),
      pago: true
    })),
    faturaAtual ? {
      mes: `${mesesNome[(faturaAtual.mes || new Date().getMonth() + 1) - 1]}/${String(faturaAtual.ano || new Date().getFullYear()).slice(2)}`,
      valor: faturaAtual.total || 0,
      pago: false
    } : null
  ].filter(Boolean)

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <p className="text-textsecondary">Carregando...</p>
    </div>
  )

  if (!cartao) return (
    <div>
      <h1 className="font-display text-xl font-bold text-textprimary flex items-center gap-2 mb-8">
        <CreditCard size={20} className="text-indigo" /> Cartão de Crédito
      </h1>
      <div className="bg-surface border border-border rounded-2xl p-12 text-center">
        <CreditCard size={40} className="text-textsecondary mx-auto mb-4" />
        <p className="text-textprimary font-medium mb-4">Nenhum cartão cadastrado</p>
        <button onClick={() => { carregarContas(); setShowNovoCartao(true) }}
          className="bg-indigo text-white px-6 py-3 rounded-xl text-sm font-medium">
          Cadastrar Cartão
        </button>
      </div>

      {showNovoCartao && (
        <div className="fixed inset-0 bg-black/60 flex items-end md:items-center justify-center z-50">
          <div className="bg-surface border border-border rounded-t-2xl md:rounded-2xl p-6 w-full md:max-w-md">
            <h2 className="font-display text-xl font-bold text-textprimary mb-6">Cadastrar Cartão</h2>
            <div className="space-y-4">
              <div>
                <label className="text-textsecondary text-sm mb-1 block">Nome</label>
                <input value={setupForm.nome} onChange={e => setSetupForm({ ...setupForm, nome: e.target.value })}
                  className="w-full bg-bg border border-border rounded-xl px-4 py-3 text-textprimary focus:outline-none focus:border-indigo"
                  placeholder="Ex: Nubank, XP..." />
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
                  user_id: user.id, nome: setupForm.nome,
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

  return (
    <div className="pb-24">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="font-display text-xl font-bold text-textprimary flex items-center gap-2">
            <CreditCard size={18} className="text-indigo" /> {cartao.nome}
          </h1>
          <p className="text-textsecondary text-xs mt-0.5">Fecha dia {cartao.dia_fechamento}</p>
        </div>
        <button onClick={() => { carregarContas(); setShowNovoCartao(true) }}
          className="hidden md:flex items-center gap-1 border border-border text-textsecondary px-3 py-2 rounded-xl text-xs">
          <Plus size={12} /> Novo cartão
        </button>
      </div>

      {/* Seletor de cartões */}
      {cartoes.length > 1 && (
        <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
          {cartoes.map(c => (
            <button key={c.id} onClick={() => setCartaoSelecionadoId(c.id)}
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

      {/* Card principal da fatura */}
      {faturaAtual && (
        <div className="bg-surface border border-border rounded-2xl p-5 mb-4">
          <p className="text-textsecondary text-xs mb-1">Fatura atual</p>
          <p className="font-display text-4xl font-bold text-textprimary mb-3">
            {formatBRL(faturaAtual.total)}
          </p>

          <div className="flex gap-4 mb-4">
            <div>
              <p className="text-textsecondary text-xs">Vencimento</p>
              <p className="text-textprimary text-sm font-medium">{faturaAtual.vencimento}</p>
            </div>
            <div>
              <p className="text-textsecondary text-xs">Fechamento</p>
              <p className="text-textprimary text-sm font-medium">{faturaAtual.fechamento}</p>
            </div>
          </div>

          {dadosGrafico.length > 1 && (
            <div className="mb-4">
              <ResponsiveContainer width="100%" height={100}>
                <BarChart data={dadosGrafico} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                  <XAxis dataKey="mes" tick={{ fontSize: 9, fill: '#64748B' }} axisLine={false} tickLine={false} />
                  <YAxis hide />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1A1D27', border: '1px solid #2A2D3A', borderRadius: '8px', fontSize: '12px' }}
                    formatter={v => formatBRL(v)} />
                  <Bar dataKey="valor" radius={[4, 4, 0, 0]}>
                    {dadosGrafico.map((entry, i) => (
                      <Cell key={i} fill={entry.pago ? '#6366F1' : '#EF4444'} opacity={entry.pago ? 0.6 : 1} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="flex gap-4 justify-center text-xs text-textsecondary mt-1">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-indigo/60 inline-block" /> Pago</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-red inline-block" /> Atual</span>
              </div>
            </div>
          )}

          {/* Saldo anterior ao sistema */}
          {Number(faturaAtual.valor_inicial) > 0 ? (
            <div className="flex justify-between items-center bg-bg rounded-xl px-4 py-2.5 mb-3">
              <span className="text-textsecondary text-xs">Saldo anterior</span>
              <div className="flex items-center gap-2">
                <span className="text-textprimary text-sm font-medium">{formatBRL(faturaAtual.valor_inicial)}</span>
                <button onClick={() => { setValorInicial(String(faturaAtual.valor_inicial)); setShowEditarInicial(true) }}
                  className="text-textsecondary hover:text-indigo">
                  <Pencil size={12} />
                </button>
              </div>
            </div>
          ) : (
            <button onClick={() => { setValorInicial(''); setShowEditarInicial(true) }}
              className="w-full border border-dashed border-border hover:border-indigo text-textsecondary hover:text-indigo rounded-xl px-4 py-2.5 text-xs transition-colors mb-3 text-left">
              + Informar saldo anterior ao sistema
            </button>
          )}

          {/* Lista de compras */}
          {comprasFatura.length > 0 ? (
            <div className="divide-y divide-border/40">
              {comprasFatura.map(c => (
                <div key={c.id} className="flex items-center justify-between py-3 gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-textprimary truncate">{c.descricao}</p>
                    <p className="text-xs text-textsecondary">
                      {new Date(c.data + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <p className="text-red font-medium text-sm">{formatBRL(c.valor)}</p>
                    <button onClick={() => setEditandoCompra(c)} className="text-textsecondary hover:text-indigo">
                      <Pencil size={13} />
                    </button>
                    <button onClick={() => handleExcluirCompra(c)} className="text-textsecondary hover:text-red">
                      <X size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-textsecondary text-sm text-center py-4">Nenhuma compra neste ciclo ainda</p>
          )}
        </div>
      )}

      {/* Botão Pagar Fatura — fixo no fundo */}
      {faturaAtual && faturaAtual.total > 0 && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-bg border-t border-border md:relative md:border-0 md:p-0 md:bg-transparent z-20">
          <button onClick={() => setShowPagar(true)}
            className="w-full bg-indigo hover:bg-indigo/90 text-white py-4 rounded-2xl font-display font-bold text-lg transition-colors">
            Pagar Fatura
          </button>
        </div>
      )}

      {/* Modal: Pagar Fatura */}
      {showPagar && faturaAtual && (
        <div className="fixed inset-0 bg-black/60 flex items-end md:items-center justify-center z-50">
          <div className="bg-surface border border-border rounded-t-2xl md:rounded-2xl p-6 w-full md:max-w-md">
            <h2 className="font-display text-xl font-bold text-textprimary mb-1">Pagar Fatura</h2>
            <p className="text-textsecondary text-sm mb-6">Total: <strong className="text-textprimary">{formatBRL(faturaAtual.total)}</strong></p>

            <div className="grid grid-cols-2 gap-2 mb-4">
              <button onClick={() => setTipoPagamento('total')}
                className={`py-3 rounded-xl text-sm font-medium transition-colors ${
                  tipoPagamento === 'total' ? 'bg-indigo/15 text-indigo border border-indigo/30' : 'border border-border text-textsecondary'
                }`}>
                Pagar total
              </button>
              <button onClick={() => setTipoPagamento('parcial')}
                className={`py-3 rounded-xl text-sm font-medium transition-colors ${
                  tipoPagamento === 'parcial' ? 'bg-indigo/15 text-indigo border border-indigo/30' : 'border border-border text-textsecondary'
                }`}>
                Valor parcial
              </button>
            </div>

            {tipoPagamento === 'total' ? (
              <div className="bg-bg rounded-xl px-4 py-3 mb-4 flex justify-between">
                <span className="text-textsecondary text-sm">Valor</span>
                <span className="text-indigo font-display font-bold">{formatBRL(faturaAtual.total)}</span>
              </div>
            ) : (
              <div className="mb-4">
                <label className="text-textsecondary text-sm mb-1 block">Valor a pagar (R$)</label>
                <input type="number" value={valorParcial} onChange={e => setValorParcial(e.target.value)}
                  className="w-full bg-bg border border-border rounded-xl px-4 py-3 text-textprimary focus:outline-none focus:border-indigo text-lg"
                  placeholder="0,00" autoFocus />
                {valorParcial && parseFloat(valorParcial) < faturaAtual.total && (
                  <p className="text-textsecondary text-xs mt-2">
                    Saldo restante: <span className="text-yellow font-medium">{formatBRL(faturaAtual.total - parseFloat(valorParcial))}</span> — permanece na fatura
                  </p>
                )}
              </div>
            )}

            <div className="mb-6">
              <label className="text-textsecondary text-sm mb-1 block">Data do pagamento</label>
              <input type="date" value={dataPagamento} onChange={e => setDataPagamento(e.target.value)}
                className="w-full bg-bg border border-border rounded-xl px-4 py-3 text-textprimary focus:outline-none focus:border-indigo" />
            </div>

            <div className="flex gap-3">
              <button onClick={() => setShowPagar(false)}
                className="flex-1 border border-border text-textsecondary py-3 rounded-xl text-sm">Cancelar</button>
              <button onClick={handlePagar} disabled={saving || (tipoPagamento === 'parcial' && !valorParcial)}
                className="flex-1 bg-indigo text-white py-3 rounded-xl text-sm font-medium disabled:opacity-50">
                {saving ? 'Processando...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Saldo anterior */}
      {showEditarInicial && (
        <div className="fixed inset-0 bg-black/60 flex items-end md:items-center justify-center z-50">
          <div className="bg-surface border border-border rounded-t-2xl md:rounded-2xl p-6 w-full md:max-w-md">
            <h2 className="font-display text-xl font-bold text-textprimary mb-2">Saldo anterior</h2>
            <p className="text-textsecondary text-sm mb-4">Informe o saldo devedor antes de começar a usar o sistema.</p>
            <input type="number" value={valorInicial} onChange={e => setValorInicial(e.target.value)}
              className="w-full bg-bg border border-border rounded-xl px-4 py-3 text-textprimary focus:outline-none focus:border-indigo text-lg mb-6"
              placeholder="0,00" autoFocus />
            <div className="flex gap-3">
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

      {/* Modal: Editar compra */}
      {editandoCompra && (
        <div className="fixed inset-0 bg-black/60 flex items-end md:items-center justify-center z-50">
          <div className="bg-surface border border-border rounded-t-2xl md:rounded-2xl p-6 w-full md:max-w-md">
            <h2 className="font-display text-xl font-bold text-textprimary mb-6">Editar Compra</h2>
            <div className="space-y-4">
              <div>
                <label className="text-textsecondary text-sm mb-1 block">Descrição</label>
                <input value={formCompra.descricao} onChange={e => setFormCompra({ ...formCompra, descricao: e.target.value })}
                  className="w-full bg-bg border border-border rounded-xl px-4 py-3 text-textprimary focus:outline-none focus:border-indigo" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-textsecondary text-sm mb-1 block">Valor (R$)</label>
                  <input type="number" value={formCompra.valor} onChange={e => setFormCompra({ ...formCompra, valor: e.target.value })}
                    className="w-full bg-bg border border-border rounded-xl px-4 py-3 text-textprimary focus:outline-none focus:border-indigo" />
                </div>
                <div>
                  <label className="text-textsecondary text-sm mb-1 block">Data</label>
                  <input type="date" value={formCompra.data} onChange={e => setFormCompra({ ...formCompra, data: e.target.value })}
                    className="w-full bg-bg border border-border rounded-xl px-4 py-3 text-textprimary focus:outline-none focus:border-indigo" />
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

      {/* Modal: Novo Cartão */}
      {showNovoCartao && (
        <div className="fixed inset-0 bg-black/60 flex items-end md:items-center justify-center z-50">
          <div className="bg-surface border border-border rounded-t-2xl md:rounded-2xl p-6 w-full md:max-w-md">
            <h2 className="font-display text-xl font-bold text-textprimary mb-6">Novo Cartão</h2>
            <div className="space-y-4">
              <div>
                <label className="text-textsecondary text-sm mb-1 block">Nome</label>
                <input value={setupForm.nome} onChange={e => setSetupForm({ ...setupForm, nome: e.target.value })}
                  className="w-full bg-bg border border-border rounded-xl px-4 py-3 text-textprimary focus:outline-none focus:border-indigo"
                  placeholder="Ex: Nubank, XP..." />
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
                  user_id: user.id, nome: setupForm.nome,
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

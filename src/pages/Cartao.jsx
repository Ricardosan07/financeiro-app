import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useCartao } from '../hooks/useCartao'
import { CreditCard, Plus, Pencil, X, ChevronLeft, ChevronRight } from 'lucide-react'

const formatBRL = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0)

const mesesNome = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
const mesesAbrev = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

function formatDataExtenso(dataStr) {
  if (!dataStr) return ''
  const partes = dataStr.split('/')
  if (partes.length !== 3) return dataStr
  const dia = parseInt(partes[0])
  const mes = parseInt(partes[1]) - 1
  const ano = partes[2]
  return `${dia} de ${mesesNome[mes]}`
}

function formatDataCompra(dataStr) {
  if (!dataStr) return ''
  const dt = new Date(dataStr + 'T00:00:00')
  return `${String(dt.getDate()).padStart(2, '0')} ${mesesAbrev[dt.getMonth()].toUpperCase()}`
}

export default function Cartao() {
  const { user } = useAuth()
  const [cartaoSelecionadoId, setCartaoSelecionadoId] = useState(null)
  const { cartoes, cartao, faturaAtual, comprasFatura, historico, futurasFaturas, loading, recarregar } = useCartao(cartaoSelecionadoId)

  const [showPagar, setShowPagar] = useState(false)
  const [showNovoCartao, setShowNovoCartao] = useState(false)
  const [showEditarInicial, setShowEditarInicial] = useState(false)
  const [editandoCompra, setEditandoCompra] = useState(null)
  const [formCompra, setFormCompra] = useState({ descricao: '', valor: '', data: '' })
  const [tipoPagamento, setTipoPagamento] = useState('total')
  const [valorParcial, setValorParcial] = useState('')
  const [dataPagamento, setDataPagamento] = useState(new Date().toISOString().split('T')[0])
  const [valorInicial, setValorInicial] = useState('')
  const [dataVencimento, setDataVencimento] = useState('')
  const [setupForm, setSetupForm] = useState({ nome: '', dia_fechamento: '27', conta_pagamento_id: '' })
  const [contas, setContas] = useState([])
  const [saving, setSaving] = useState(false)
  const [mesSelecionado, setMesSelecionado] = useState(null)
  const graficoRef = useRef(null)

  const carregarContas = async () => {
    const { data } = await supabase.from('contas').select('*').eq('user_id', user.id).eq('ativo', true)
    setContas(data || [])
  }

  useEffect(() => {
    if (editandoCompra) {
      setFormCompra({ descricao: editandoCompra.descricao, valor: String(editandoCompra.valor), data: editandoCompra.data })
    }
  }, [editandoCompra])

  const dadosGrafico = [
    ...([...historico].reverse().map(f => ({
      mes: `${mesesAbrev[f.mes - 1]} ${String(f.ano).slice(2)}`,
      valor: Number(f.valor_pago || f.valor_inicial || 0),
      atual: false,
      futuro: false,
      id: f.id
    }))),
    ...(faturaAtual ? [{
      mes: `${mesesAbrev[(faturaAtual.mes || new Date().getMonth() + 1) - 1]} ${String(faturaAtual.ano || new Date().getFullYear()).slice(2)}`,
      valor: faturaAtual.total || 0,
      atual: true,
      futuro: false,
      id: 'atual'
    }] : []),
    ...(futurasFaturas || []).filter(f => f.total > 0).slice(0, 4).map(f => ({
      mes: `${mesesAbrev[f.mes - 1]} ${String(f.ano).slice(2)}`,
      valor: f.total,
      atual: false,
      futuro: true,
      id: `futuro-${f.mes}-${f.ano}`
    }))
  ]

  while (dadosGrafico.length < 6) {
    dadosGrafico.unshift({ mes: '—', valor: 0, atual: false, futuro: false, id: `vazio-${dadosGrafico.length}` })
  }

  const maxValor = Math.max(...dadosGrafico.map(d => d.valor), 1)
  const mesSelecionadoAtual = mesSelecionado || dadosGrafico[dadosGrafico.length - 1]?.id

  const handlePagar = async () => {
    if (!faturaAtual) return
    setSaving(true)

    const valorPago = tipoPagamento === 'total'
      ? faturaAtual.total
      : parseFloat(valorParcial) || 0

    if (valorPago <= 0) { setSaving(false); return }

    const saldoRestante = Math.max(0, faturaAtual.total - valorPago)

    if (saldoRestante <= 0.01) {
      await supabase.from('faturas').update({
        status: 'paga', data_pagamento: dataPagamento, valor_pago: valorPago
      }).eq('id', faturaAtual.id)
    } else {
      await supabase.from('faturas').update({
        valor_inicial: saldoRestante, data_pagamento: dataPagamento,
      }).eq('id', faturaAtual.id)
    }

    if (cartao?.conta_pagamento_id) {
      const { data: conta } = await supabase.from('contas').select('saldo_atual').eq('id', cartao.conta_pagamento_id).single()
      if (conta) {
        await supabase.from('contas').update({ saldo_atual: Number(conta.saldo_atual) - valorPago }).eq('id', cartao.conta_pagamento_id)
      }
      await supabase.from('lancamentos').insert({
        user_id: user.id, data: dataPagamento,
        descricao: `Pagamento fatura ${cartao.nome}${tipoPagamento === 'parcial' ? ' (parcial)' : ''}`,
        valor: valorPago, tipo: 'saida', conta_id: cartao.conta_pagamento_id
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
      valor_inicial: parseFloat(valorInicial.replace(',', '.')) || 0,
      data_vencimento: dataVencimento || null
    }).eq('id', faturaAtual.id)
    setShowEditarInicial(false)
    setValorInicial('')
    setDataVencimento('')
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
                  placeholder="Ex: Nubank" />
              </div>
              <div>
                <label className="text-textsecondary text-sm mb-1 block">Dia de fechamento</label>
                <input type="number" min="1" max="31" value={setupForm.dia_fechamento}
                  onChange={e => setSetupForm({ ...setupForm, dia_fechamento: e.target.value })}
                  className="w-full bg-bg border border-border rounded-xl px-4 py-3 text-textprimary focus:outline-none focus:border-indigo" />
              </div>
              <div>
                <label className="text-textsecondary text-sm mb-1 block">Conta de pagamento</label>
                <select value={setupForm.conta_pagamento_id}
                  onChange={e => setSetupForm({ ...setupForm, conta_pagamento_id: e.target.value })}
                  className="w-full bg-bg border border-border rounded-xl px-4 py-3 text-textprimary focus:outline-none focus:border-indigo">
                  <option value="">Selecione...</option>
                  {contas.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowNovoCartao(false)} className="flex-1 border border-border text-textsecondary py-3 rounded-xl text-sm">Cancelar</button>
              <button onClick={async () => {
                setSaving(true)
                await supabase.from('cartoes').insert({ user_id: user.id, nome: setupForm.nome, dia_fechamento: parseInt(setupForm.dia_fechamento), conta_pagamento_id: setupForm.conta_pagamento_id || null })
                setShowNovoCartao(false); recarregar(); setSaving(false)
              }} disabled={saving || !setupForm.nome} className="flex-1 bg-indigo text-white py-3 rounded-xl text-sm font-medium disabled:opacity-50">
                {saving ? 'Salvando...' : 'Cadastrar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )

  return (
    <div className="pb-28">
      {/* Header com seletor de cartões */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="font-display text-xl font-bold text-textprimary flex items-center gap-2">
          <CreditCard size={18} className="text-indigo" /> {cartao.nome}
        </h1>
        <button onClick={() => { carregarContas(); setShowNovoCartao(true) }}
          className="hidden md:flex items-center gap-1 border border-border text-textsecondary px-3 py-2 rounded-xl text-xs">
          <Plus size={12} /> Novo
        </button>
      </div>

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

      {/* GRÁFICO DE BARRAS — estilo Nubank */}
      <div className="bg-surface border border-border rounded-2xl p-5 mb-4">
        <p className="text-indigo text-xs font-semibold mb-1">Fatura atual</p>

        <p className="font-display text-4xl font-bold text-textprimary mb-1">
          {formatBRL(faturaAtual?.total || 0)}
        </p>

        <div className="flex gap-4 mb-5">
          <div>
            <p className="text-textsecondary text-xs">Vencimento</p>
            <p className="text-textprimary text-sm font-medium">
              {faturaAtual?.data_vencimento
                ? new Date(faturaAtual.data_vencimento + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
                : faturaAtual ? formatDataExtenso(faturaAtual.vencimento) : '—'}
            </p>
          </div>
          <div>
            <p className="text-textsecondary text-xs">Fechamento</p>
            <p className="text-textprimary text-sm font-medium">
              {faturaAtual ? formatDataExtenso(faturaAtual.fechamento) : '—'}
            </p>
          </div>
        </div>

        {/* Gráfico de barras arredondadas scrollável */}
        <div className="overflow-x-auto" ref={graficoRef}>
          <div className="flex items-end gap-3 h-24 min-w-max px-1 pb-1">
            {dadosGrafico.map((d, i) => {
              const altura = d.valor > 0 ? Math.max((d.valor / maxValor) * 80, 8) : 4
              const selecionado = mesSelecionadoAtual === d.id
              return (
                <div key={d.id} className="flex flex-col items-center gap-1 cursor-pointer"
                  onClick={() => setMesSelecionado(d.id)}>
                  <div className="flex items-end" style={{ height: '80px' }}>
                    <div
                      className="transition-all duration-200"
                      style={{
                        width: '28px',
                        height: `${altura}px`,
                        borderRadius: '6px 6px 4px 4px',
                        backgroundColor: d.atual
                          ? '#6366F1'
                          : selecionado
                          ? '#6366F1'
                          : d.futuro
                          ? '#6366F140'
                          : d.valor > 0 ? '#6366F180' : '#2A2D3A',
                        opacity: d.valor === 0 ? 0.3 : 1
                      }}
                    />
                  </div>
                  <p className="text-xs whitespace-nowrap" style={{
                    color: (d.atual || selecionado) ? '#6366F1' : '#64748B',
                    fontWeight: (d.atual || selecionado) ? '600' : '400',
                    fontSize: '10px'
                  }}>
                    {d.mes}
                  </p>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* LISTA DE COMPRAS — estilo Nubank */}
      <div className="bg-surface border border-border rounded-2xl overflow-hidden mb-4">
        {Number(faturaAtual?.valor_inicial) > 0 && (
          <div className="flex items-center justify-between px-5 py-4 border-b border-border/50">
            <div>
              <p className="text-sm text-textprimary">Saldo anterior</p>
              <p className="text-xs text-textsecondary">Acumulado antes do sistema</p>
            </div>
            <div className="flex items-center gap-2">
              <p className="text-red font-medium">{formatBRL(faturaAtual.valor_inicial)}</p>
              <button onClick={() => {
                setValorInicial(String(faturaAtual.valor_inicial))
                setDataVencimento(faturaAtual.data_vencimento || '')
                setShowEditarInicial(true)
              }}
                className="text-textsecondary hover:text-indigo">
                <Pencil size={13} />
              </button>
            </div>
          </div>
        )}

        {faturaAtual && Number(faturaAtual.valor_inicial) === 0 && comprasFatura.length === 0 && (
          <div className="px-5 py-4 border-b border-border/50">
            <button onClick={() => { setValorInicial(''); setDataVencimento(''); setShowEditarInicial(true) }}
              className="text-indigo text-sm hover:underline">
              + Informar saldo anterior ao sistema
            </button>
          </div>
        )}

        {comprasFatura.length > 0 ? (
          comprasFatura.map((c, i) => (
            <div key={c.id} className={`flex items-center px-5 py-4 gap-4 ${i < comprasFatura.length - 1 ? 'border-b border-border/30' : ''}`}>
              <div className="flex-shrink-0 text-center w-12">
                <p className="text-xs font-bold text-textsecondary leading-tight">
                  {formatDataCompra(c.data).split(' ')[0]}
                </p>
                <p className="text-xs text-textsecondary/70 leading-tight">
                  {formatDataCompra(c.data).split(' ')[1]}
                </p>
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-sm text-textprimary truncate">{c.descricao}</p>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                <p className="text-sm font-medium text-textprimary">{formatBRL(c.valor)}</p>
                {!c._isParcela && <>
                  <button onClick={() => setEditandoCompra(c)} className="text-textsecondary hover:text-indigo transition-colors">
                    <Pencil size={13} />
                  </button>
                  <button onClick={() => handleExcluirCompra(c)} className="text-textsecondary hover:text-red transition-colors">
                    <X size={13} />
                  </button>
                </>}
              </div>
            </div>
          ))
        ) : (
          <div className="px-5 py-8 text-center">
            <p className="text-textsecondary text-sm">Nenhuma compra neste ciclo</p>
            <p className="text-textsecondary text-xs mt-1">Lançamentos no crédito aparecem aqui</p>
          </div>
        )}
      </div>

      {/* Botão Pagar Fatura — fixo no fundo */}
      {faturaAtual && faturaAtual.total > 0 && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-bg/95 backdrop-blur border-t border-border md:relative md:border-0 md:p-0 md:bg-transparent md:backdrop-blur-none z-20">
          <button onClick={() => setShowPagar(true)}
            className="w-full bg-indigo hover:bg-indigo/90 text-white py-4 rounded-2xl font-display font-bold text-lg transition-colors shadow-lg shadow-indigo/20">
            Pagar Fatura · {formatBRL(faturaAtual.total)}
          </button>
        </div>
      )}

      {/* Modal: Pagar Fatura */}
      {showPagar && faturaAtual && (
        <div className="fixed inset-0 bg-black/60 flex items-end md:items-center justify-center z-50">
          <div className="bg-surface border border-border rounded-t-2xl md:rounded-2xl p-6 w-full md:max-w-md">
            <h2 className="font-display text-xl font-bold text-textprimary mb-1">Pagar Fatura</h2>
            <p className="text-textsecondary text-sm mb-5">
              Total: <strong className="text-textprimary">{formatBRL(faturaAtual.total)}</strong>
            </p>

            <div className="grid grid-cols-2 gap-2 mb-4">
              {['total', 'parcial'].map(t => (
                <button key={t} onClick={() => setTipoPagamento(t)}
                  className={`py-3 rounded-xl text-sm font-medium transition-colors ${
                    tipoPagamento === t
                      ? 'bg-indigo/15 text-indigo border border-indigo/30'
                      : 'border border-border text-textsecondary'
                  }`}>
                  {t === 'total' ? 'Pagar total' : 'Valor parcial'}
                </button>
              ))}
            </div>

            {tipoPagamento === 'total' ? (
              <div className="bg-bg rounded-xl px-4 py-3 mb-4 flex justify-between items-center">
                <span className="text-textsecondary text-sm">Valor</span>
                <span className="text-indigo font-display font-bold text-xl">{formatBRL(faturaAtual.total)}</span>
              </div>
            ) : (
              <div className="mb-4">
                <label className="text-textsecondary text-sm mb-1 block">Valor a pagar (R$)</label>
                <input type="number" value={valorParcial} onChange={e => setValorParcial(e.target.value)}
                  className="w-full bg-bg border border-border rounded-xl px-4 py-3 text-textprimary focus:outline-none focus:border-indigo text-lg mb-2"
                  placeholder="0,00" autoFocus />
                {valorParcial && parseFloat(valorParcial) < faturaAtual.total && (
                  <div className="bg-yellow/10 border border-yellow/20 rounded-xl px-4 py-2.5">
                    <p className="text-yellow text-xs">
                      Saldo restante <strong>{formatBRL(faturaAtual.total - parseFloat(valorParcial))}</strong> permanece na fatura
                    </p>
                  </div>
                )}
              </div>
            )}

            <div className="mb-5">
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

      {/* Modal: Editar valor inicial */}
      {showEditarInicial && (
        <div className="fixed inset-0 bg-black/60 flex items-end md:items-center justify-center z-50">
          <div className="bg-surface border border-border rounded-t-2xl md:rounded-2xl p-6 w-full md:max-w-md">
            <h2 className="font-display text-xl font-bold text-textprimary mb-2">Valor da fatura atual</h2>
            <p className="text-textsecondary text-sm mb-5">
              Informe o total acumulado nesta fatura antes de usar o sistema.
              Daqui pra frente, cada compra no crédito vai acumular automaticamente.
            </p>

            <div className="space-y-4">
              <div>
                <label className="text-textsecondary text-sm mb-1 block">Valor total da fatura (R$)</label>
                <input
                  type="number"
                  value={valorInicial}
                  onChange={e => setValorInicial(e.target.value)}
                  className="w-full bg-bg border border-border rounded-xl px-4 py-3 text-textprimary focus:outline-none focus:border-indigo text-lg"
                  placeholder="0,00"
                  autoFocus
                />
              </div>

              <div>
                <label className="text-textsecondary text-sm mb-1 block">Data de vencimento</label>
                <input
                  type="date"
                  value={dataVencimento}
                  onChange={e => setDataVencimento(e.target.value)}
                  className="w-full bg-bg border border-border rounded-xl px-4 py-3 text-textprimary focus:outline-none focus:border-indigo"
                />
                <p className="text-textsecondary text-xs mt-1">
                  Ex: 05/07/2026 — quando essa fatura vence no banco
                </p>
              </div>

              {valorInicial && dataVencimento && (
                <div className="bg-indigo/10 border border-indigo/20 rounded-xl px-4 py-3">
                  <p className="text-textsecondary text-xs mb-1">Como vai aparecer na projeção</p>
                  <p className="text-indigo text-sm font-medium">
                    -{formatBRL(parseFloat(valorInicial) || 0)} no dia {new Date(dataVencimento + 'T00:00:00').toLocaleDateString('pt-BR')}
                  </p>
                </div>
              )}
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={() => { setShowEditarInicial(false); setValorInicial(''); setDataVencimento('') }}
                className="flex-1 border border-border text-textsecondary py-3 rounded-xl text-sm">
                Cancelar
              </button>
              <button onClick={handleEditarInicial} disabled={saving || !valorInicial}
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
                <label className="text-textsecondary text-sm mb-1 block">Conta de pagamento</label>
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
                setShowNovoCartao(false); recarregar(); setSaving(false)
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

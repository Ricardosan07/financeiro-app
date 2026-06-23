import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useCartao } from '../hooks/useCartao'
import { CreditCard, CheckCircle2, TrendingDown, TrendingUp, History, Lock, Plus } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

const formatBRL = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0)
const mesesNome = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

export default function Cartao() {
  const { user } = useAuth()
  const [cartaoSelecionadoId, setCartaoSelecionadoId] = useState(null)
  const { cartoes, cartao, faturaAberta, faturaFechada, historico, comprasAbertas, loading, recarregar } = useCartao(cartaoSelecionadoId)
  const [showSetup, setShowSetup] = useState(false)
  const [showNovoCartao, setShowNovoCartao] = useState(false)
  const [showPagar, setShowPagar] = useState(false)
  const [showDefinirInicial, setShowDefinirInicial] = useState(false)
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

  const handleDefinirInicial = async () => {
    if (!faturaAberta) return
    setSaving(true)
    await supabase.from('faturas').update({ valor_inicial: parseFloat(valorInicial) || 0 }).eq('id', faturaAberta.id)
    setShowDefinirInicial(false)
    setValorInicial('')
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

  const calcularTotalFatura = (fatura) => {
    if (!fatura) return 0
    const compras = fatura.id === faturaAberta?.id ? comprasAbertas : []
    const totalCompras = compras.reduce((sum, c) => sum + Number(c.valor), 0)
    return Number(fatura.valor_inicial || 0) + totalCompras
  }

  const totalFaturaAberta = calcularTotalFatura(faturaAberta)
  const totalFaturaFechada = faturaFechada ? Number(faturaFechada.valor_pago || 0) || calcularTotalFatura(faturaFechada) : 0

  const dadosGrafico = [...historico].reverse().slice(-6).map(f => ({
    mes: `${mesesNome[f.mes - 1]}/${f.ano}`,
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
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-display text-2xl font-bold text-textprimary flex items-center gap-2">
            <CreditCard size={22} className="text-indigo" /> Cartão de Crédito
          </h1>
          <p className="text-textsecondary text-sm mt-1">Gerencie sua fatura e elimine o crédito</p>
        </div>
      </div>
      <div className="bg-surface border border-border rounded-2xl p-12 text-center">
        <CreditCard size={40} className="text-textsecondary mx-auto mb-4" />
        <p className="text-textprimary font-medium mb-2">Nenhum cartão cadastrado</p>
        <p className="text-textsecondary text-sm mb-6">Cadastre seu cartão Nubank para começar a controlar a fatura</p>
        <button onClick={() => { carregarContas(); setShowSetup(true) }}
          className="bg-indigo hover:bg-indigo/90 text-white px-6 py-3 rounded-xl text-sm font-medium transition-colors">
          Cadastrar Cartão
        </button>
      </div>

      {showSetup && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <div className="bg-surface border border-border rounded-2xl p-8 w-full max-w-md">
            <h2 className="font-display text-xl font-bold text-textprimary mb-6">Cadastrar Cartão</h2>
            <div className="space-y-4">
              <div>
                <label className="text-textsecondary text-sm mb-1 block">Nome do cartão</label>
                <input value={setupForm.nome} onChange={e => setSetupForm({ ...setupForm, nome: e.target.value })}
                  className="w-full bg-bg border border-border rounded-xl px-4 py-3 text-textprimary focus:outline-none focus:border-indigo" />
              </div>
              <div>
                <label className="text-textsecondary text-sm mb-1 block">Dia de fechamento da fatura</label>
                <input type="number" min="1" max="31" value={setupForm.dia_fechamento}
                  onChange={e => setSetupForm({ ...setupForm, dia_fechamento: e.target.value })}
                  className="w-full bg-bg border border-border rounded-xl px-4 py-3 text-textprimary focus:outline-none focus:border-indigo" />
              </div>
              <div>
                <label className="text-textsecondary text-sm mb-1 block">Conta para pagamento da fatura</label>
                <select value={setupForm.conta_pagamento_id}
                  onChange={e => setSetupForm({ ...setupForm, conta_pagamento_id: e.target.value })}
                  className="w-full bg-bg border border-border rounded-xl px-4 py-3 text-textprimary focus:outline-none focus:border-indigo">
                  {contas.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowSetup(false)}
                className="flex-1 border border-border text-textsecondary py-3 rounded-xl text-sm font-medium">Cancelar</button>
              <button onClick={handleSetup} disabled={saving}
                className="flex-1 bg-indigo hover:bg-indigo/90 text-white py-3 rounded-xl text-sm font-medium disabled:opacity-50">
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
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-display text-2xl font-bold text-textprimary flex items-center gap-2">
            <CreditCard size={22} className="text-indigo" /> {cartao.nome}
          </h1>
          <p className="text-textsecondary text-sm mt-1">Fecha dia {cartao.dia_fechamento} · Pago em {cartao.conta?.nome}</p>
        </div>
        <button onClick={() => { carregarContas(); setSetupForm({ nome: '', dia_fechamento: '24', conta_pagamento_id: '' }); setShowNovoCartao(true) }}
          className="flex items-center gap-2 border border-border text-textsecondary hover:text-textprimary px-4 py-2 rounded-xl text-sm font-medium transition-colors">
          <Plus size={16} /> Novo cartão
        </button>
      </div>

      {cartoes.length > 1 && (
        <div className="flex gap-2 mb-6">
          {cartoes.map(c => (
            <button key={c.id}
              onClick={() => setCartaoSelecionadoId(c.id)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                (cartaoSelecionadoId || cartoes[0]?.id) === c.id
                  ? 'bg-indigo/15 text-indigo border border-indigo/30'
                  : 'border border-border text-textsecondary hover:text-textprimary'
              }`}>
              {c.nome} · Fecha dia {c.dia_fechamento}
            </button>
          ))}
        </div>
      )}

      {/* Fatura Fechada */}
      {faturaFechada && (
        <div className="bg-red/10 border border-red/30 rounded-2xl p-6 mb-6">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Lock size={16} className="text-red" />
              <p className="text-red font-medium">Fatura de {mesesNome[faturaFechada.mes - 1]}/{faturaFechada.ano} — Aguardando Pagamento</p>
            </div>
            <button onClick={() => setShowPagar(true)}
              className="flex items-center gap-2 bg-green hover:bg-green/90 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors">
              <CheckCircle2 size={15} /> Pagar Fatura
            </button>
          </div>
          <p className="font-display text-3xl font-bold text-red">{formatBRL(totalFaturaFechada)}</p>
        </div>
      )}

      {/* Fatura Aberta */}
      {faturaAberta && (
        <div className="bg-surface border border-border rounded-2xl p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-textsecondary text-sm">Fatura em Aberto — {mesesNome[faturaAberta.mes - 1]}/{faturaAberta.ano}</p>
              <p className="font-display text-4xl font-bold text-textprimary mt-1">{formatBRL(totalFaturaAberta)}</p>
            </div>
            <div className="text-right">
              {tendencia !== null && (
                <div className={`flex items-center gap-1 justify-end ${tendencia > 0 ? 'text-red' : 'text-green'}`}>
                  {tendencia > 0 ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
                  <span className="text-sm font-medium">{Math.abs(tendencia).toFixed(0)}% vs mês anterior</span>
                </div>
              )}
              <p className="text-textsecondary text-xs mt-1">Fecha dia {cartao.dia_fechamento}</p>
            </div>
          </div>

          {Number(faturaAberta.valor_inicial) > 0 ? (
            <div className="bg-bg rounded-xl px-4 py-3 mb-4 flex justify-between items-center">
              <span className="text-textsecondary text-sm">Saldo inicial (compras anteriores ao sistema)</span>
              <span className="text-textprimary font-medium">{formatBRL(faturaAberta.valor_inicial)}</span>
            </div>
          ) : (
            <button onClick={() => setShowDefinirInicial(true)}
              className="w-full border border-dashed border-border hover:border-indigo text-textsecondary hover:text-indigo rounded-xl px-4 py-3 text-sm transition-colors mb-4 text-left">
              + Informar saldo acumulado antes de começar a usar o sistema
            </button>
          )}

          {comprasAbertas.length > 0 ? (
            <div className="space-y-2">
              {comprasAbertas.map(c => (
                <div key={c.id} className="flex items-center justify-between py-2 border-b border-border/40">
                  <div>
                    <p className="text-sm text-textprimary">{c.descricao}</p>
                    <p className="text-xs text-textsecondary">{new Date(c.data + 'T00:00:00').toLocaleDateString('pt-BR')}</p>
                  </div>
                  <p className="text-red font-medium text-sm">{formatBRL(c.valor)}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-textsecondary text-sm">Nenhuma compra registrada neste ciclo ainda</p>
          )}
        </div>
      )}

      {/* Gráfico de histórico */}
      {historico.length > 0 && (
        <div className="bg-surface border border-border rounded-2xl p-6 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <History size={16} className="text-indigo" />
            <p className="text-textprimary font-medium">Histórico de Faturas</p>
            {tendencia !== null && (
              <span className={`ml-auto text-xs px-2 py-1 rounded-full ${
                tendencia > 0 ? 'bg-red/15 text-red' : 'bg-green/15 text-green'
              }`}>
                {tendencia > 0 ? '▲' : '▼'} {Math.abs(tendencia).toFixed(0)}% vs mês anterior
              </span>
            )}
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={dadosGrafico}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2A2D3A" />
              <XAxis dataKey="mes" stroke="#64748B" tick={{ fontSize: 11 }} />
              <YAxis stroke="#64748B" tick={{ fontSize: 11 }} tickFormatter={v => `R$${v}`} />
              <Tooltip
                contentStyle={{ backgroundColor: '#1A1D27', border: '1px solid #2A2D3A', borderRadius: '12px' }}
                formatter={v => formatBRL(v)} />
              <Line type="monotone" dataKey="valor" name="Fatura" stroke="#EF4444" strokeWidth={2} dot={{ fill: '#EF4444' }} />
            </LineChart>
          </ResponsiveContainer>
          <div className="mt-4 space-y-2">
            {historico.slice(0, 6).map(f => (
              <div key={f.id} className="flex items-center justify-between py-2 border-b border-border/40">
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={14} className="text-green" />
                  <span className="text-sm text-textprimary">{mesesNome[f.mes - 1]}/{f.ano}</span>
                  <span className="text-xs text-textsecondary">
                    Pago em {f.data_pagamento ? new Date(f.data_pagamento + 'T00:00:00').toLocaleDateString('pt-BR') : '—'}
                  </span>
                </div>
                <span className="text-sm font-medium text-textprimary">{formatBRL(f.valor_pago)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal: Definir saldo inicial */}
      {showDefinirInicial && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <div className="bg-surface border border-border rounded-2xl p-8 w-full max-w-md">
            <h2 className="font-display text-xl font-bold text-textprimary mb-2">Saldo inicial da fatura</h2>
            <p className="text-textsecondary text-sm mb-6">
              Informe o valor total já acumulado nesta fatura antes de começar a usar o sistema.
              As próximas compras serão somadas por cima desse valor.
            </p>
            <div>
              <label className="text-textsecondary text-sm mb-1 block">Valor acumulado até hoje (R$)</label>
              <input type="number" value={valorInicial} onChange={e => setValorInicial(e.target.value)}
                className="w-full bg-bg border border-border rounded-xl px-4 py-3 text-textprimary focus:outline-none focus:border-indigo"
                placeholder="0,00" autoFocus />
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowDefinirInicial(false)}
                className="flex-1 border border-border text-textsecondary py-3 rounded-xl text-sm font-medium">Cancelar</button>
              <button onClick={handleDefinirInicial} disabled={saving}
                className="flex-1 bg-indigo hover:bg-indigo/90 text-white py-3 rounded-xl text-sm font-medium disabled:opacity-50">
                {saving ? 'Salvando...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Pagar fatura */}
      {showPagar && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <div className="bg-surface border border-border rounded-2xl p-8 w-full max-w-md">
            <h2 className="font-display text-xl font-bold text-textprimary mb-2">Pagar Fatura</h2>
            <p className="text-textsecondary text-sm mb-6">
              O valor será descontado da conta <strong className="text-textprimary">{cartao?.conta?.nome}</strong> e a fatura irá para o histórico.
            </p>
            <div className="bg-bg rounded-xl px-4 py-3 mb-4 flex justify-between">
              <span className="text-textsecondary text-sm">Total a pagar</span>
              <span className="text-red font-display font-bold">{formatBRL(faturaFechada ? totalFaturaFechada : totalFaturaAberta)}</span>
            </div>
            <div>
              <label className="text-textsecondary text-sm mb-1 block">Data do pagamento</label>
              <input type="date" value={dataPagamento} onChange={e => setDataPagamento(e.target.value)}
                className="w-full bg-bg border border-border rounded-xl px-4 py-3 text-textprimary focus:outline-none focus:border-indigo" />
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowPagar(false)}
                className="flex-1 border border-border text-textsecondary py-3 rounded-xl text-sm font-medium">Cancelar</button>
              <button onClick={handlePagarFatura} disabled={saving}
                className="flex-1 bg-green hover:bg-green/90 text-white py-3 rounded-xl text-sm font-medium disabled:opacity-50">
                {saving ? 'Processando...' : 'Confirmar Pagamento'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Novo cartão */}
      {showNovoCartao && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <div className="bg-surface border border-border rounded-2xl p-8 w-full max-w-md">
            <h2 className="font-display text-xl font-bold text-textprimary mb-6">Cadastrar Novo Cartão</h2>
            <div className="space-y-4">
              <div>
                <label className="text-textsecondary text-sm mb-1 block">Nome do cartão</label>
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
                className="flex-1 border border-border text-textsecondary py-3 rounded-xl text-sm font-medium">Cancelar</button>
              <button onClick={async () => {
                setSaving(true)
                await supabase.from('cartoes').insert({
                  user_id: user.id,
                  nome: setupForm.nome,
                  dia_fechamento: parseInt(setupForm.dia_fechamento),
                  conta_pagamento_id: setupForm.conta_pagamento_id || null
                })
                setShowNovoCartao(false)
                setSetupForm({ nome: '', dia_fechamento: '24', conta_pagamento_id: '' })
                recarregar()
                setSaving(false)
              }} disabled={saving || !setupForm.nome}
                className="flex-1 bg-indigo hover:bg-indigo/90 text-white py-3 rounded-xl text-sm font-medium disabled:opacity-50">
                {saving ? 'Salvando...' : 'Cadastrar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

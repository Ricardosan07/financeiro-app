import { useState, useEffect } from 'react'
import { useConfiguracoes } from '../hooks/useConfiguracoes'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { Settings, User, Wallet, Calendar, Download, Info, Save, CheckCircle2 } from 'lucide-react'

const formatBRL = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0)

export default function Configuracoes() {
  const { user } = useAuth()
  const { config, loading, salvar } = useConfiguracoes()
  const [form, setForm] = useState(null)
  const [salvando, setSalvando] = useState(false)
  const [salvoOk, setSalvoOk] = useState(false)
  const [exportando, setExportando] = useState(false)
  const [periodoExport, setPeriodoExport] = useState('3meses')
  const [showConfirmReset, setShowConfirmReset] = useState(false)
  const [confirmTexto, setConfirmTexto] = useState('')
  const [resetando, setResetando] = useState(false)
  const [resetOk, setResetOk] = useState(false)
  const [zerarSaldos, setZerarSaldos] = useState(false)

  useEffect(() => {
    if (config && !form) setForm({ ...config })
  }, [config])

  const handleSalvar = async () => {
    setSalvando(true)
    const ok = await salvar(form)
    setSalvando(false)
    if (ok) {
      setSalvoOk(true)
      setTimeout(() => setSalvoOk(false), 3000)
    }
  }

  const handleExportarCSV = async () => {
    setExportando(true)

    const hoje = new Date()
    let dataInicio = new Date()

    if (periodoExport === '1mes') dataInicio.setMonth(hoje.getMonth() - 1)
    else if (periodoExport === '3meses') dataInicio.setMonth(hoje.getMonth() - 3)
    else if (periodoExport === '6meses') dataInicio.setMonth(hoje.getMonth() - 6)
    else if (periodoExport === '1ano') dataInicio.setFullYear(hoje.getFullYear() - 1)
    else dataInicio = new Date('2020-01-01')

    const { data: lancamentos } = await supabase
      .from('lancamentos')
      .select('data, descricao, tipo, valor, forma_pagamento, categorias(nome), conta:conta_id(nome)')
      .eq('user_id', user.id)
      .gte('data', dataInicio.toISOString().split('T')[0])
      .order('data', { ascending: false })

    if (!lancamentos || lancamentos.length === 0) {
      alert('Nenhum lançamento encontrado no período selecionado.')
      setExportando(false)
      return
    }

    const header = ['Data', 'Descrição', 'Tipo', 'Valor (R$)', 'Forma de Pagamento', 'Categoria', 'Conta']
    const linhas = lancamentos.map(l => [
      new Date(l.data + 'T00:00:00').toLocaleDateString('pt-BR'),
      `"${l.descricao}"`,
      l.tipo === 'entrada' ? 'Entrada' : l.tipo === 'saida' ? 'Saída' : 'Transferência',
      Number(l.valor).toFixed(2).replace('.', ','),
      l.forma_pagamento || '',
      l.categorias?.nome || '',
      l.conta?.nome || '',
    ])

    const csv = [header, ...linhas].map(row => row.join(';')).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `financeiro_lancamentos_${new Date().toISOString().split('T')[0]}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
    setExportando(false)
  }

  const handleReset = async () => {
    if (confirmTexto !== 'RESETAR') return
    setResetando(true)

    try {
      await supabase.from('lancamentos').delete().eq('user_id', user.id)
      await supabase.from('faturas').delete().eq('user_id', user.id)
      await supabase.from('parcelas').delete().eq('user_id', user.id)
      await supabase.from('lembretes').delete().eq('user_id', user.id)
      await supabase.from('objetivos').delete().eq('user_id', user.id)
      await supabase.from('fixos_status').delete().eq('user_id', user.id)

      if (zerarSaldos) {
        const { data: todasContas } = await supabase
          .from('contas').select('id').eq('user_id', user.id)
        if (todasContas) {
          for (const conta of todasContas) {
            await supabase.from('contas').update({ saldo_atual: 0 }).eq('id', conta.id)
          }
        }
      }

      setShowConfirmReset(false)
      setConfirmTexto('')
      setZerarSaldos(false)
      setResetOk(true)
      setTimeout(() => setResetOk(false), 4000)
    } catch (err) {
      alert('Erro ao resetar: ' + err.message)
    }

    setResetando(false)
  }

  if (loading || !form) return (
    <div className="flex items-center justify-center h-64">
      <p className="text-textsecondary">Carregando configurações...</p>
    </div>
  )

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-display text-2xl font-bold text-textprimary flex items-center gap-2">
            <Settings size={22} className="text-indigo" /> Configurações
          </h1>
          <p className="text-textsecondary text-sm mt-1">Personalize o sistema para sua realidade</p>
        </div>
        <button onClick={handleSalvar} disabled={salvando}
          className="flex items-center gap-2 bg-indigo hover:bg-indigo/90 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors disabled:opacity-50">
          {salvoOk ? <CheckCircle2 size={16} /> : <Save size={16} />}
          {salvando ? 'Salvando...' : salvoOk ? 'Salvo!' : 'Salvar alterações'}
        </button>
      </div>

      <div className="space-y-6">

        {/* Perfil */}
        <div className="bg-surface border border-border rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <User size={16} className="text-indigo" />
            <h2 className="font-display font-semibold text-textprimary">Perfil</h2>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-textsecondary text-sm mb-1 block">Seu nome</label>
              <input value={form.nome || ''} onChange={e => setForm({ ...form, nome: e.target.value })}
                className="w-full bg-bg border border-border rounded-xl px-4 py-3 text-textprimary focus:outline-none focus:border-indigo"
                placeholder="Como prefere ser chamado?" />
            </div>
            <div>
              <label className="text-textsecondary text-sm mb-1 block">E-mail</label>
              <input value={user?.email || ''} disabled
                className="w-full bg-bg border border-border rounded-xl px-4 py-3 text-textsecondary opacity-60 cursor-not-allowed" />
            </div>
          </div>
        </div>

        {/* Preferências Financeiras */}
        <div className="bg-surface border border-border rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <Wallet size={16} className="text-indigo" />
            <h2 className="font-display font-semibold text-textprimary">Preferências Financeiras</h2>
          </div>
          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="text-textsecondary text-sm mb-1 block">Alerta de saldo baixo (R$)</label>
              <input type="number" value={form.threshold_saldo_baixo}
                onChange={e => setForm({ ...form, threshold_saldo_baixo: parseFloat(e.target.value) || 0 })}
                className="w-full bg-bg border border-border rounded-xl px-4 py-3 text-textprimary focus:outline-none focus:border-indigo" />
              <p className="text-textsecondary text-xs mt-1">
                O Dashboard alerta quando o saldo livre cair abaixo de {formatBRL(form.threshold_saldo_baixo)}
              </p>
            </div>
            <div>
              <label className="text-textsecondary text-sm mb-1 block">Sugestão de aporte ao receber (%)</label>
              <input type="number" min="1" max="50" value={form.percentual_aporte}
                onChange={e => setForm({ ...form, percentual_aporte: parseFloat(e.target.value) || 10 })}
                className="w-full bg-bg border border-border rounded-xl px-4 py-3 text-textprimary focus:outline-none focus:border-indigo" />
              <p className="text-textsecondary text-xs mt-1">
                Ao registrar uma entrada, o sistema sugere guardar {form.percentual_aporte}% do valor
              </p>
            </div>
            <div>
              <label className="text-textsecondary text-sm mb-1 block">Meta de fatura do cartão (R$) — opcional</label>
              <input type="number" value={form.meta_fatura_credito || ''}
                onChange={e => setForm({ ...form, meta_fatura_credito: e.target.value ? parseFloat(e.target.value) : null })}
                className="w-full bg-bg border border-border rounded-xl px-4 py-3 text-textprimary focus:outline-none focus:border-indigo"
                placeholder="Ex: 500 (meta: fatura abaixo de R$500)" />
              <p className="text-textsecondary text-xs mt-1">
                O Dashboard avisará quando a fatura superar este valor
              </p>
            </div>
          </div>
        </div>

        {/* Dias de Recebimento */}
        <div className="bg-surface border border-border rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <Calendar size={16} className="text-indigo" />
            <h2 className="font-display font-semibold text-textprimary">Dias de Recebimento</h2>
          </div>
          <p className="text-textsecondary text-sm mb-4">
            Informe os dias do mês que você recebe. Usados nas dicas contextuais do sistema.
          </p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-textsecondary text-sm mb-1 block">1º recebimento — dia do mês</label>
              <input type="number" min="1" max="31" value={form.dia_recebimento_1}
                onChange={e => setForm({ ...form, dia_recebimento_1: parseInt(e.target.value) || 1 })}
                className="w-full bg-bg border border-border rounded-xl px-4 py-3 text-textprimary focus:outline-none focus:border-indigo" />
            </div>
            <div>
              <label className="text-textsecondary text-sm mb-1 block">2º recebimento — dia do mês (opcional)</label>
              <input type="number" min="1" max="31" value={form.dia_recebimento_2 || ''}
                onChange={e => setForm({ ...form, dia_recebimento_2: e.target.value ? parseInt(e.target.value) : null })}
                className="w-full bg-bg border border-border rounded-xl px-4 py-3 text-textprimary focus:outline-none focus:border-indigo"
                placeholder="Deixe vazio se não tiver" />
            </div>
          </div>
        </div>

        {/* Exportar Dados */}
        <div className="bg-surface border border-border rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <Download size={16} className="text-indigo" />
            <h2 className="font-display font-semibold text-textprimary">Exportar Dados</h2>
          </div>
          <p className="text-textsecondary text-sm mb-4">
            Baixe seus lançamentos em CSV para abrir no Excel ou Google Sheets.
          </p>
          <div className="flex items-end gap-4">
            <div className="flex-1">
              <label className="text-textsecondary text-sm mb-1 block">Período</label>
              <select value={periodoExport} onChange={e => setPeriodoExport(e.target.value)}
                className="w-full bg-bg border border-border rounded-xl px-4 py-3 text-textprimary focus:outline-none focus:border-indigo">
                <option value="1mes">Último mês</option>
                <option value="3meses">Últimos 3 meses</option>
                <option value="6meses">Últimos 6 meses</option>
                <option value="1ano">Último ano</option>
                <option value="tudo">Tudo</option>
              </select>
            </div>
            <button onClick={handleExportarCSV} disabled={exportando}
              className="flex items-center gap-2 bg-green hover:bg-green/90 text-white px-5 py-3 rounded-xl text-sm font-medium transition-colors disabled:opacity-50">
              <Download size={16} />
              {exportando ? 'Gerando...' : 'Baixar CSV'}
            </button>
          </div>
        </div>

        {/* Reset de Dados */}
        <div className="bg-surface border border-red/20 rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-red text-sm">⚠️</span>
            <h2 className="font-display font-semibold text-red">Zona de Perigo</h2>
          </div>
          <p className="text-textsecondary text-sm mb-4">
            Apaga todos os lançamentos, faturas, parcelas, lembretes e objetivos.
            Mantém contas, cartões, categorias, fixos e configurações.
          </p>

          {resetOk ? (
            <div className="bg-green/10 border border-green/20 rounded-xl px-4 py-3 text-green text-sm">
              ✅ Dados resetados com sucesso. Estrutura mantida.
            </div>
          ) : (
            <button
              onClick={() => setShowConfirmReset(true)}
              className="flex items-center gap-2 border border-red/30 text-red hover:bg-red/10 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors"
            >
              🗑️ Resetar dados de teste
            </button>
          )}
        </div>

        {/* Sobre */}
        <div className="bg-surface border border-border rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <Info size={16} className="text-textsecondary" />
            <h2 className="font-display font-semibold text-textprimary">Sobre</h2>
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-textsecondary">Sistema</span>
              <span className="text-textprimary">Financeiro App</span>
            </div>
            <div className="flex justify-between">
              <span className="text-textsecondary">Versão</span>
              <span className="text-textprimary">1.0.0</span>
            </div>
            <div className="flex justify-between">
              <span className="text-textsecondary">Banco de dados</span>
              <span className="text-textprimary">Supabase</span>
            </div>
            <div className="flex justify-between">
              <span className="text-textsecondary">Usuário</span>
              <span className="text-textprimary">{user?.email}</span>
            </div>
          </div>
        </div>

      </div>

      {/* Modal: Confirmar Reset */}
      {showConfirmReset && (
        <div className="fixed inset-0 bg-black/70 flex items-end md:items-center justify-center z-50">
          <div className="bg-surface border border-red/30 rounded-t-2xl md:rounded-2xl p-6 md:p-8 w-full md:max-w-md">
            <h2 className="font-display text-xl font-bold text-red mb-2">⚠️ Resetar dados</h2>
            <p className="text-textsecondary text-sm mb-4">
              Esta ação é <strong className="text-textprimary">irreversível</strong>. Todos os lançamentos,
              faturas, parcelas, lembretes e objetivos serão apagados permanentemente.
            </p>

            <div className="bg-red/10 border border-red/20 rounded-xl px-4 py-3 mb-4">
              <p className="text-red text-xs font-medium mb-1">O que será mantido:</p>
              <p className="text-textsecondary text-xs">✅ Contas e saldos · Cartões · Categorias · Fixos · Configurações</p>
              <p className="text-red text-xs font-medium mt-2 mb-1">O que será apagado:</p>
              <p className="text-textsecondary text-xs">❌ Lançamentos · Faturas · Parcelas · Lembretes · Objetivos</p>
            </div>

            <div className="flex items-center gap-2 mb-5">
              <input
                type="checkbox"
                id="zerarSaldos"
                checked={zerarSaldos}
                onChange={e => setZerarSaldos(e.target.checked)}
                className="w-4 h-4 accent-red"
              />
              <label htmlFor="zerarSaldos" className="text-textsecondary text-sm">
                Também zerar saldos das contas para R$ 0,00
              </label>
            </div>

            <div className="mb-5">
              <label className="text-textsecondary text-sm mb-2 block">
                Digite <strong className="text-red">RESETAR</strong> para confirmar
              </label>
              <input
                value={confirmTexto}
                onChange={e => setConfirmTexto(e.target.value)}
                className="w-full bg-bg border border-red/30 rounded-xl px-4 py-3 text-textprimary focus:outline-none focus:border-red font-mono"
                placeholder="RESETAR"
                autoFocus
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => { setShowConfirmReset(false); setConfirmTexto(''); setZerarSaldos(false) }}
                className="flex-1 border border-border text-textsecondary py-3 rounded-xl text-sm"
              >
                Cancelar
              </button>
              <button
                onClick={handleReset}
                disabled={confirmTexto !== 'RESETAR' || resetando}
                className="flex-1 bg-red hover:bg-red/90 text-white py-3 rounded-xl text-sm font-medium transition-colors disabled:opacity-30"
              >
                {resetando ? 'Resetando...' : 'Confirmar Reset'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

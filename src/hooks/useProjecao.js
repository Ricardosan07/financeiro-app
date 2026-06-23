import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { calcularProjecao } from '../lib/projecao'

export function useProjecao(diasFuturos = 90) {
  const { user } = useAuth()
  const [projecao, setProjecao] = useState([])
  const [saldoInicial, setSaldoInicial] = useState(0)
  const [loading, setLoading] = useState(true)

  const carregar = async () => {
    setLoading(true)

    const { data: contas } = await supabase
      .from('contas')
      .select('saldo_atual, categoria_conta')
      .eq('user_id', user.id)
      .eq('ativo', true)

    const contasLivres = (contas || []).filter(c => c.categoria_conta === 'livre' || !c.categoria_conta)
    const saldo = contasLivres.reduce((sum, c) => sum + Number(c.saldo_atual), 0)
    setSaldoInicial(saldo)

    const hoje = new Date()
    hoje.setHours(0, 0, 0, 0)
    const fim = new Date(hoje)
    fim.setDate(fim.getDate() + diasFuturos)

    const dataInicioStr = hoje.toISOString().split('T')[0]
    const dataFimStr = fim.toISOString().split('T')[0]

    // Buscar TODOS os lançamentos (não filtrar por data ainda, pois recorrentes não têm data fixa)
    const { data: todosLancamentos } = await supabase
      .from('lancamentos')
      .select('*, contaOrigem:conta_id(categoria_conta), contaDestino:conta_destino_id(categoria_conta)')
      .eq('user_id', user.id)

    // Separar: avulsos (com data, dentro do período) vs recorrentes (repetem todo mês)
    const lancamentosAvulsos = (todosLancamentos || [])
      .filter(l => !l.recorrente && l.data >= dataInicioStr && l.data <= dataFimStr)
      .map(l => ({
        ...l,
        contaOrigemCategoria: l.contaOrigem?.categoria_conta,
        contaDestinoCategoria: l.contaDestino?.categoria_conta
      }))

    const lancamentosRecorrentes = (todosLancamentos || [])
      .filter(l => l.recorrente)
      .map(l => ({
        ...l,
        contaOrigemCategoria: l.contaOrigem?.categoria_conta,
        contaDestinoCategoria: l.contaDestino?.categoria_conta
      }))

    const { data: fixos } = await supabase
      .from('fixos')
      .select('*')
      .eq('user_id', user.id)
      .eq('ativo', true)

    const { data: parcelas } = await supabase
      .from('parcelas')
      .select('*')
      .eq('user_id', user.id)
      .eq('ativo', true)

    // Buscar fatura fechada do cartão para incluir como compromisso pendente na projeção
    const { data: faturasFechadas } = await supabase
      .from('faturas')
      .select('*, cartao:cartao_id(nome, conta_pagamento_id)')
      .eq('user_id', user.id)
      .eq('status', 'fechada')

    const amanha = new Date(hoje)
    amanha.setDate(amanha.getDate() + 1)
    const amanhaStr = amanha.toISOString().split('T')[0]

    const lancamentosFatura = (faturasFechadas || []).map(f => ({
      data: amanhaStr,
      descricao: `Fatura ${f.cartao?.nome || 'Cartão'} (a pagar)`,
      valor: Number(f.valor_pago || 0),
      tipo: 'saida',
      contaOrigemCategoria: 'livre'
    }))

    const todosLancamentosAvulsos = [...lancamentosAvulsos, ...lancamentosFatura]

    const resultado = calcularProjecao(
      saldo,
      todosLancamentosAvulsos,
      fixos || [],
      parcelas || [],
      hoje,
      fim,
      lancamentosRecorrentes
    )

    setProjecao(resultado)
    setLoading(false)
  }

  useEffect(() => {
    if (user) carregar()
  }, [user, diasFuturos])

  return { projecao, saldoInicial, loading, recarregar: carregar }
}

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

    // Usar componentes locais para evitar drift UTC (ex: UTC-3 → meia-noite local = 03:00 UTC)
    const agora = new Date()
    const dLocalStr = (d) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

    const hoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate())
    const amanha = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() + 1)
    const fim = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() + diasFuturos)

    // Hoje e passado já estão contabilizados no saldo real — buscar só lançamentos futuros
    const dataAmanha = dLocalStr(amanha)
    const dataFimStr = dLocalStr(fim)

    // Lançamentos avulsos futuros — exclui compras no crédito já vinculadas à fatura
    // (a fatura aparece como compromisso separado, evitando dupla contagem)
    const { data: avulsosRaw } = await supabase
      .from('lancamentos')
      .select('*, contaOrigem:conta_id(categoria_conta), contaDestino:conta_destino_id(categoria_conta)')
      .eq('user_id', user.id)
      .eq('recorrente', false)
      .gte('data', dataAmanha)
      .or('forma_pagamento.neq.credito,forma_pagamento.is.null')
      .is('fatura_id', null)

    const lancamentosAvulsos = (avulsosRaw || []).map(l => ({
      ...l,
      contaOrigemCategoria: l.contaOrigem?.categoria_conta,
      contaDestinoCategoria: l.contaDestino?.categoria_conta
    }))

    const { data: recorrentesRaw } = await supabase
      .from('lancamentos')
      .select('*, contaOrigem:conta_id(categoria_conta), contaDestino:conta_destino_id(categoria_conta)')
      .eq('user_id', user.id)
      .eq('recorrente', true)

    const lancamentosRecorrentes = (recorrentesRaw || []).map(l => ({
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

    // Buscar faturas para incluir na projeção
    const { data: todasFaturas } = await supabase
      .from('faturas')
      .select('*, cartao:cartao_id(nome, conta_pagamento_id, dia_fechamento)')
      .eq('user_id', user.id)
      .in('status', ['aberta', 'fechada'])

    const lancamentosFatura = []

    const hojeRef = agora
    const diaHoje = agora.getDate()

    for (const fatura of (todasFaturas || [])) {
      let totalFatura = Number(fatura.valor_inicial || 0)

      if (fatura.status === 'aberta') {
        // Só projetar a fatura do ciclo atual — faturas pré-criadas para meses futuros
        // serão cobertas pela projeção de parcelas abaixo, evitando duplicatas
        const diaFechamento = fatura.cartao?.dia_fechamento || 27
        let mesCicloAtual = hojeRef.getMonth() + 1
        let anoCicloAtual = hojeRef.getFullYear()
        if (diaHoje > diaFechamento) {
          mesCicloAtual += 1
          if (mesCicloAtual > 12) { mesCicloAtual = 1; anoCicloAtual += 1 }
        }
        if (fatura.mes !== mesCicloAtual || fatura.ano !== anoCicloAtual) continue

        const { data: compras } = await supabase
          .from('lancamentos')
          .select('valor')
          .eq('fatura_id', fatura.id)
        totalFatura += (compras || []).reduce((s, c) => s + Number(c.valor), 0)
      } else {
        totalFatura = Number(fatura.valor_pago || fatura.valor_inicial || 0)
      }

      if (totalFatura <= 0) continue

      let dataProjetada
      if (fatura.status === 'fechada') {
        dataProjetada = dataAmanha
      } else {
        // Vencimento = dia 05 do mês seguinte ao mês da FATURA (não de hoje)
        let mesVenc = fatura.mes + 1
        let anoVenc = fatura.ano
        if (mesVenc > 12) { mesVenc = 1; anoVenc += 1 }
        dataProjetada = `${anoVenc}-${String(mesVenc).padStart(2, '0')}-05`
      }

      if (dataProjetada < dataAmanha) continue

      lancamentosFatura.push({
        data: dataProjetada,
        descricao: `Fatura ${fatura.cartao?.nome || 'Cartão'} (${fatura.status === 'fechada' ? 'a pagar' : 'vencimento previsto'})`,
        valor: totalFatura,
        tipo: 'saida',
        contaOrigemCategoria: 'livre',
        origem: 'fatura'
      })
    }

    // Projetar meses futuros de parcelas no crédito por cartão
    // Cobre os meses 2-N de compras parceladas (não há faturas pré-criadas após a correção)
    const cartoesComFaturaAberta = new Map()
    ;(todasFaturas || []).filter(f => f.status === 'aberta').forEach(f => {
      if (!cartoesComFaturaAberta.has(f.cartao_id)) {
        cartoesComFaturaAberta.set(f.cartao_id, f.cartao)
      }
    })

    for (const [cartaoId, cartaoInfo] of cartoesComFaturaAberta) {
      const parcelasCartao = (parcelas || []).filter(p => p.cartao_id === cartaoId && p.ativo)
      if (parcelasCartao.length === 0) continue

      const diaFechamento = cartaoInfo?.dia_fechamento || 27
      let mesCicloAtual = hojeRef.getMonth() + 1
      let anoCicloAtual = hojeRef.getFullYear()
      if (diaHoje > diaFechamento) {
        mesCicloAtual += 1
        if (mesCicloAtual > 12) { mesCicloAtual = 1; anoCicloAtual += 1 }
      }

      for (let offset = 1; offset <= 13; offset++) {
        let mesFuturo = mesCicloAtual + offset
        let anoFuturo = anoCicloAtual
        while (mesFuturo > 12) { mesFuturo -= 12; anoFuturo += 1 }

        const totalParcelasMes = parcelasCartao.reduce((sum, p) => {
          if (!p.ativo) return sum
          if (anoFuturo < p.ano_inicio || (anoFuturo === p.ano_inicio && mesFuturo < p.mes_inicio)) return sum
          if (anoFuturo > p.ano_fim || (anoFuturo === p.ano_fim && mesFuturo > p.mes_fim)) return sum
          return sum + Number(p.valor_parcela)
        }, 0)

        if (totalParcelasMes <= 0) continue

        let mesVenc = mesFuturo + 1
        let anoVenc = anoFuturo
        if (mesVenc > 12) { mesVenc = 1; anoVenc += 1 }
        const dataVencimento = `${anoVenc}-${String(mesVenc).padStart(2, '0')}-05`

        if (dataVencimento < dataAmanha || dataVencimento > dataFimStr) continue

        lancamentosFatura.push({
          data: dataVencimento,
          descricao: `Fatura ${cartaoInfo?.nome || 'Cartão'} (parcelas previstas)`,
          valor: totalParcelasMes,
          tipo: 'saida',
          contaOrigemCategoria: 'livre',
          origem: 'fatura'
        })
      }
    }

    const todosLancamentosAvulsos = [...lancamentosAvulsos, ...lancamentosFatura]

    // Parcelas de cartão de crédito são projetadas acima via faturas — excluir do calcularProjecao
    const parcelasParaProjecao = (parcelas || []).filter(p => !(p.forma === 'cartao' && p.cartao_id))

    const resultado = calcularProjecao(
      saldo,
      todosLancamentosAvulsos,
      fixos || [],
      parcelasParaProjecao,
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

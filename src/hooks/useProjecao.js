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

    // Hoje e passado já estão contabilizados no saldo real — buscar só lançamentos futuros
    const amanha = new Date(hoje)
    amanha.setDate(amanha.getDate() + 1)
    const dataAmanha = amanha.toISOString().split('T')[0]

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

    for (const fatura of (todasFaturas || [])) {
      let totalFatura = Number(fatura.valor_inicial || 0)

      if (fatura.status === 'aberta') {
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
        // Vencimento = dia 05 do mês seguinte ao fechamento (padrão Nubank/maioria dos cartões)
        const diaFechamento = fatura.cartao?.dia_vencimento || fatura.cartao?.dia_fechamento || 27
        const hojeRef = new Date()
        let mesVenc = hojeRef.getMonth() + 1
        let anoVenc = hojeRef.getFullYear()

        // Avança para o mês seguinte ao fechamento
        mesVenc += 1
        if (mesVenc > 12) { mesVenc = 1; anoVenc += 1 }

        // Vencimento sempre dia 05 do mês seguinte
        dataProjetada = `${anoVenc}-${String(mesVenc).padStart(2, '0')}-05`
      }

      lancamentosFatura.push({
        data: dataProjetada,
        descricao: `Fatura ${fatura.cartao?.nome || 'Cartão'} (${fatura.status === 'fechada' ? 'a pagar' : 'vencimento previsto'})`,
        valor: totalFatura,
        tipo: 'saida',
        contaOrigemCategoria: 'livre'
      })
    }

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

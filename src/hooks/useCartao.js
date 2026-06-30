import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

export function useCartao(cartaoIdSelecionado = null) {
  const { user } = useAuth()
  const [cartoes, setCartoes] = useState([])
  const [cartao, setCartao] = useState(null)
  const [faturaAtual, setFaturaAtual] = useState(null)
  const [comprasFatura, setComprasFatura] = useState([])
  const [historico, setHistorico] = useState([])
  const [futurasFaturas, setFuturasFaturas] = useState([])
  const [loading, setLoading] = useState(true)

  const hoje = new Date()

  const getMesFaturaAtual = (diaFechamento) => {
    const dia = hoje.getDate()
    let mes = hoje.getMonth() + 1
    let ano = hoje.getFullYear()
    if (dia > diaFechamento) {
      mes += 1
      if (mes > 12) { mes = 1; ano += 1 }
    }
    return { mes, ano }
  }

  const getVencimento = (mes, ano) => {
    let mesVenc = mes + 1
    let anoVenc = ano
    if (mesVenc > 12) { mesVenc = 1; anoVenc += 1 }
    return `05/${String(mesVenc).padStart(2, '0')}/${anoVenc}`
  }

  const getFechamento = (diaFechamento, mes, ano) => {
    return `${String(diaFechamento).padStart(2, '0')}/${String(mes).padStart(2, '0')}/${ano}`
  }

  const carregar = async () => {
    setLoading(true)

    const { data: listaCartoes } = await supabase
      .from('cartoes')
      .select('*, conta:conta_pagamento_id(nome, saldo_atual)')
      .eq('user_id', user.id)
      .eq('ativo', true)

    setCartoes(listaCartoes || [])

    const cartaoAlvo = cartaoIdSelecionado
      ? listaCartoes?.find(c => c.id === cartaoIdSelecionado)
      : listaCartoes?.[0]

    if (!cartaoAlvo) { setLoading(false); return }
    setCartao(cartaoAlvo)

    const { mes, ano } = getMesFaturaAtual(cartaoAlvo.dia_fechamento)

    let { data: fatura } = await supabase
      .from('faturas')
      .select('*')
      .eq('cartao_id', cartaoAlvo.id)
      .eq('mes', mes)
      .eq('ano', ano)
      .maybeSingle()

    if (!fatura) {
      const { data: novaFatura } = await supabase
        .from('faturas')
        .upsert({ user_id: user.id, cartao_id: cartaoAlvo.id, mes, ano, status: 'aberta', valor_inicial: 0 }, { onConflict: 'cartao_id,mes,ano' })
        .select()
      fatura = novaFatura?.[0] || null
    }

    if (fatura) {
      fatura.vencimento = getVencimento(mes, ano)
      fatura.fechamento = getFechamento(cartaoAlvo.dia_fechamento, mes, ano)

      const { data: compras } = await supabase
        .from('lancamentos')
        .select('*, parcela_id')
        .eq('fatura_id', fatura.id)
        .order('data', { ascending: false })

      const totalCompras = (compras || []).reduce((s, c) => s + Number(c.valor), 0)

      // Incluir parcelas de crédito ativas neste mês (ex.: lançamentos antigos sem lancamento vinculado)
      const { data: parcelasCartao } = await supabase
        .from('parcelas')
        .select('*')
        .eq('user_id', user.id)
        .eq('cartao_id', cartaoAlvo.id)
        .eq('ativo', true)

      // Dedup por parcela_id (FK exata) — evita falso positivo por descrição idêntica
      const parcelasComLancamento = new Set(
        (compras || []).map(c => c.parcela_id).filter(Boolean)
      )

      const parcelasNestesMes = (parcelasCartao || []).filter(p => {
        if (ano < p.ano_inicio || (ano === p.ano_inicio && mes < p.mes_inicio)) return false
        if (ano > p.ano_fim || (ano === p.ano_fim && mes > p.mes_fim)) return false
        return !parcelasComLancamento.has(p.id)
      })

      const totalParcelas = parcelasNestesMes.reduce((s, p) => s + Number(p.valor_parcela), 0)
      fatura.total = Number(fatura.valor_inicial || 0) + totalCompras + totalParcelas

      const parcelasComoCompras = parcelasNestesMes.map(p => ({
        id: `parcela-${p.id}`,
        descricao: p.descricao,
        valor: p.valor_parcela,
        data: `${ano}-${String(mes).padStart(2, '0')}-05`,
        tipo: 'saida',
        forma_pagamento: 'credito',
        _isParcela: true
      }))

      // Calcular faturas futuras previstas (para o gráfico)
      const futuras = []
      for (let i = 1; i <= 5; i++) {
        let mesFuturo = mes + i
        let anoFuturo = ano
        while (mesFuturo > 12) { mesFuturo -= 12; anoFuturo += 1 }
        const totalF = (parcelasCartao || []).reduce((sum, p) => {
          if (!p.ativo) return sum
          if (anoFuturo < p.ano_inicio || (anoFuturo === p.ano_inicio && mesFuturo < p.mes_inicio)) return sum
          if (anoFuturo > p.ano_fim || (anoFuturo === p.ano_fim && mesFuturo > p.mes_fim)) return sum
          return sum + Number(p.valor_parcela)
        }, 0)
        futuras.push({ mes: mesFuturo, ano: anoFuturo, total: totalF, status: 'prevista' })
      }
      setFuturasFaturas(futuras)

      setFaturaAtual(fatura)
      setComprasFatura([...(compras || []), ...parcelasComoCompras])
    }

    const { data: hist } = await supabase
      .from('faturas')
      .select('*')
      .eq('cartao_id', cartaoAlvo.id)
      .in('status', ['paga', 'fechada'])
      .order('ano', { ascending: false })
      .order('mes', { ascending: false })
      .limit(6)

    setHistorico(hist || [])
    setLoading(false)
  }

  useEffect(() => { if (user) carregar() }, [user, cartaoIdSelecionado])

  return { cartoes, cartao, faturaAtual, comprasFatura, historico, futurasFaturas, loading, recarregar: carregar }
}

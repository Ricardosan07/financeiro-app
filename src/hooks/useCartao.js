import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

export function useCartao(cartaoIdSelecionado = null) {
  const { user } = useAuth()
  const [cartoes, setCartoes] = useState([])
  const [cartao, setCartao] = useState(null)
  const [faturaAberta, setFaturaAberta] = useState(null)
  const [faturaFechada, setFaturaFechada] = useState(null)
  const [historico, setHistorico] = useState([])
  const [comprasAbertas, setComprasAbertas] = useState([])
  const [loading, setLoading] = useState(true)

  const hoje = new Date()

  const getMesFatura = (dataCompra, diaFechamento) => {
    const dt = new Date(dataCompra + 'T00:00:00')
    const dia = dt.getDate()
    let mes = dt.getMonth() + 1
    let ano = dt.getFullYear()
    if (dia > diaFechamento) {
      mes += 1
      if (mes > 12) { mes = 1; ano += 1 }
    }
    return { mes, ano }
  }

  const carregarCartoes = async () => {
    const { data } = await supabase
      .from('cartoes')
      .select('*, conta:conta_pagamento_id(nome, saldo_atual)')
      .eq('user_id', user.id)
      .eq('ativo', true)
    setCartoes(data || [])
    return data || []
  }

  const carregarFaturas = async (c) => {
    if (!c) return

    const { mes: mesAtual, ano: anoAtual } = getMesFatura(
      hoje.toISOString().split('T')[0],
      c.dia_fechamento
    )

    const { data: todasFaturas } = await supabase
      .from('faturas')
      .select('*')
      .eq('user_id', user.id)
      .eq('cartao_id', c.id)
      .order('ano', { ascending: false })
      .order('mes', { ascending: false })

    const faturas = todasFaturas || []

    let fAberta = faturas.find(f => f.mes === mesAtual && f.ano === anoAtual && f.status === 'aberta')
    if (!fAberta) {
      const { data: novaFatura } = await supabase
        .from('faturas')
        .upsert({
          user_id: user.id,
          cartao_id: c.id,
          mes: mesAtual,
          ano: anoAtual,
          status: 'aberta',
          valor_inicial: 0
        }, { onConflict: 'cartao_id,mes,ano' })
        .select()
      fAberta = novaFatura?.[0] || null
    }

    setFaturaAberta(fAberta)
    setFaturaFechada(faturas.find(f => f.status === 'fechada') || null)
    setHistorico(faturas.filter(f => f.status === 'paga'))

    if (fAberta) {
      const { data: compras } = await supabase
        .from('lancamentos')
        .select('*')
        .eq('user_id', user.id)
        .eq('fatura_id', fAberta.id)
        .order('data', { ascending: false })
      setComprasAbertas(compras || [])
    } else {
      setComprasAbertas([])
    }
  }

  const carregar = async () => {
    setLoading(true)
    const lista = await carregarCartoes()
    const alvo = cartaoIdSelecionado
      ? lista.find(c => c.id === cartaoIdSelecionado)
      : lista[0]
    setCartao(alvo || null)
    if (alvo) await carregarFaturas(alvo)
    setLoading(false)
  }

  useEffect(() => { if (user) carregar() }, [user, cartaoIdSelecionado])

  return { cartoes, cartao, faturaAberta, faturaFechada, historico, comprasAbertas, loading, recarregar: carregar, getMesFatura }
}

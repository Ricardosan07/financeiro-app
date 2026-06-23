import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

export function useDashboardData() {
  const { user } = useAuth()
  const [gastosPorCategoria, setGastosPorCategoria] = useState([])
  const [historicoSaldo, setHistoricoSaldo] = useState([])
  const [reservas, setReservas] = useState([])
  const [objetivosAtivos, setObjetivosAtivos] = useState([])
  const [dica, setDica] = useState(null)
  const [loading, setLoading] = useState(true)

  const hoje = new Date()
  const mesAtual = hoje.getMonth() + 1
  const anoAtual = hoje.getFullYear()

  const carregar = async () => {
    setLoading(true)

    // 1. Gastos por categoria no mês atual
    const inicioMes = `${anoAtual}-${String(mesAtual).padStart(2, '0')}-01`
    const fimMes = new Date(anoAtual, mesAtual, 0).toISOString().split('T')[0]

    const { data: lancamentosMes } = await supabase
      .from('lancamentos')
      .select('valor, tipo, categorias(nome, cor)')
      .eq('user_id', user.id)
      .eq('tipo', 'saida')
      .gte('data', inicioMes)
      .lte('data', fimMes)
      .eq('recorrente', false)

    const agrupado = {}
    ;(lancamentosMes || []).forEach(l => {
      const nome = l.categorias?.nome || 'Sem categoria'
      const cor = l.categorias?.cor || '#64748B'
      if (!agrupado[nome]) agrupado[nome] = { nome, cor, valor: 0 }
      agrupado[nome].valor += Number(l.valor)
    })
    const categoriasList = Object.values(agrupado).sort((a, b) => b.valor - a.valor)
    setGastosPorCategoria(categoriasList)

    // 2. Histórico de saldo mês a mês (últimos 6 meses)
    const seisAtras = new Date(hoje)
    seisAtras.setMonth(seisAtras.getMonth() - 5)
    const inicioHistorico = `${seisAtras.getFullYear()}-${String(seisAtras.getMonth() + 1).padStart(2, '0')}-01`

    const { data: contasLivres } = await supabase
      .from('contas')
      .select('saldo_atual')
      .eq('user_id', user.id)
      .eq('ativo', true)
      .eq('categoria_conta', 'livre')

    const saldoAtual = (contasLivres || []).reduce((s, c) => s + Number(c.saldo_atual), 0)

    const { data: lancamentosHistorico } = await supabase
      .from('lancamentos')
      .select('data, valor, tipo')
      .eq('user_id', user.id)
      .neq('tipo', 'transferencia')
      .eq('recorrente', false)
      .gte('data', inicioHistorico)
      .order('data', { ascending: false })

    const mesesNome = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
    let saldoReconstruido = saldoAtual
    const historicoMeses = []

    for (let i = 0; i < 6; i++) {
      const mes = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1)
      const mesNum = mes.getMonth() + 1
      const anoNum = mes.getFullYear()
      const label = `${mesesNome[mesNum - 1]}/${String(anoNum).slice(2)}`

      if (i === 0) {
        historicoMeses.unshift({ mes: label, saldo: Math.round(saldoAtual) })
      } else {
        const lancMes = (lancamentosHistorico || []).filter(l => {
          const dt = new Date(l.data + 'T00:00:00')
          return dt.getMonth() + 1 === (i === 0 ? mesAtual : mesNum + 1 > 12 ? 1 : mesNum + 1) &&
                 dt.getFullYear() === anoNum
        })
        lancMes.forEach(l => {
          if (l.tipo === 'entrada') saldoReconstruido -= Number(l.valor)
          else if (l.tipo === 'saida') saldoReconstruido += Number(l.valor)
        })
        historicoMeses.unshift({ mes: label, saldo: Math.round(saldoReconstruido) })
      }
    }

    setHistoricoSaldo(historicoMeses)

    // 3. Reservas com meta
    const { data: todasContas } = await supabase
      .from('contas')
      .select('nome, saldo_atual, meta_valor, proposito, categoria_conta')
      .eq('user_id', user.id)
      .eq('ativo', true)
      .eq('categoria_conta', 'reserva')
      .not('meta_valor', 'is', null)

    setReservas(todasContas || [])

    // 4. Objetivos ativos
    const { data: objetivosData } = await supabase
      .from('objetivos')
      .select('*, conta:conta_id(nome, saldo_atual)')
      .eq('user_id', user.id)
      .eq('ativo', true)
      .eq('concluido', false)
      .order('data_alvo', { ascending: true })

    setObjetivosAtivos(objetivosData || [])

    // 5. Gerar dica contextual
    const dicaGerada = await gerarDica(user.id, {
      saldoAtual,
      gastosPorCategoria: categoriasList,
      reservas: todasContas || []
    })
    setDica(dicaGerada)

    setLoading(false)
  }

  const gerarDica = async (userId, dados) => {
    const dicas = []

    if (dados.saldoAtual < 200) {
      dicas.push({
        tipo: 'alerta',
        icone: '⚠️',
        titulo: 'Saldo crítico',
        texto: `Seu saldo livre está em R$${dados.saldoAtual.toFixed(2)}. Evite qualquer gasto não essencial até o próximo recebimento.`
      })
    }

    const { data: faturas } = await supabase
      .from('faturas')
      .select('*, cartao:cartao_id(nome)')
      .eq('user_id', userId)
      .eq('status', 'aberta')

    if (faturas?.length > 0) {
      const maiorFatura = faturas.reduce((max, f) => Number(f.valor_inicial) > Number(max.valor_inicial) ? f : max, faturas[0])
      const valorFatura = Number(maiorFatura.valor_inicial)
      if (valorFatura > dados.saldoAtual) {
        dicas.push({
          tipo: 'alerta',
          icone: '💳',
          titulo: 'Fatura maior que saldo',
          texto: `Sua fatura do ${maiorFatura.cartao?.nome || 'cartão'} (R$${valorFatura.toFixed(2)}) está maior que seu saldo livre. Planeje o pagamento com antecedência.`
        })
      }
    }

    const { data: fixos } = await supabase
      .from('fixos')
      .select('*')
      .eq('user_id', userId)
      .eq('ativo', true)
      .not('data_fim', 'is', null)

    fixos?.forEach(f => {
      if (!f.data_fim) return
      const fim = new Date(f.data_fim)
      const agora = new Date()
      const mesesRestantes = (fim.getFullYear() - agora.getFullYear()) * 12 + (fim.getMonth() - agora.getMonth())
      if (mesesRestantes > 0 && mesesRestantes <= 6) {
        dicas.push({
          tipo: 'conquista',
          icone: '🎯',
          titulo: `${f.descricao} quase quitado!`,
          texto: `Faltam apenas ${mesesRestantes} meses para terminar o ${f.descricao}. Em ${fim.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })} você libera R$${Number(f.valor).toFixed(2)}/mês.`
        })
      }
    })

    dados.reservas.forEach(r => {
      if (r.meta_valor && Number(r.saldo_atual) / Number(r.meta_valor) < 0.2) {
        dicas.push({
          tipo: 'dica',
          icone: '🛡️',
          titulo: 'Reserva de emergência baixa',
          texto: `Sua ${r.nome} está em ${Math.round((Number(r.saldo_atual) / Number(r.meta_valor)) * 100)}% da meta. Tente aportar um pouco quando receber no dia 02.`
        })
      }
    })

    if (dados.gastosPorCategoria.length > 0) {
      const maior = dados.gastosPorCategoria[0]
      const total = dados.gastosPorCategoria.reduce((s, c) => s + c.valor, 0)
      const pct = Math.round((maior.valor / total) * 100)
      if (pct > 40) {
        dicas.push({
          tipo: 'insight',
          icone: '📊',
          titulo: `${maior.nome} concentra ${pct}% dos gastos`,
          texto: `Neste mês, ${pct}% dos seus gastos variáveis foram em ${maior.nome} (R$${maior.valor.toFixed(2)}). Vale verificar se há oportunidade de redução.`
        })
      }
    }

    const { data: ultimoLancamento } = await supabase
      .from('lancamentos')
      .select('data')
      .eq('user_id', userId)
      .eq('recorrente', false)
      .order('criado_em', { ascending: false })
      .limit(1)

    if (ultimoLancamento?.length > 0) {
      const ultimaData = new Date(ultimoLancamento[0].data + 'T00:00:00')
      const diasSemLancar = Math.floor((new Date() - ultimaData) / (1000 * 60 * 60 * 24))
      if (diasSemLancar > 5) {
        dicas.push({
          tipo: 'lembrete',
          icone: '📝',
          titulo: `${diasSemLancar} dias sem lançamentos`,
          texto: `Você não registra gastos há ${diasSemLancar} dias. Seus registros ajudam a manter a projeção precisa.`
        })
      }
    }

    const prioridade = ['alerta', 'conquista', 'dica', 'insight', 'lembrete']
    for (const tipo of prioridade) {
      const encontrada = dicas.find(d => d.tipo === tipo)
      if (encontrada) return encontrada
    }

    return {
      tipo: 'ok',
      icone: '✅',
      titulo: 'Tudo sob controle',
      texto: 'Nenhum alerta no momento. Continue registrando seus gastos para manter a projeção precisa.'
    }
  }

  useEffect(() => { if (user) carregar() }, [user])

  return { gastosPorCategoria, historicoSaldo, reservas, objetivosAtivos, dica, loading, recarregar: carregar }
}

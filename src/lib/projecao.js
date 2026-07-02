/**
 * Motor de Projeção de Saldo
 * Calcula o saldo projetado para cada dia futuro com base em:
 * - Saldo inicial (soma das contas livres)
 * - Lançamentos avulsos (entrada/saída/transferência)
 * - Lançamentos recorrentes (transferências fixas)
 * - Fixos recorrentes (saídas programadas por dia do mês)
 * - Parcelas (saídas distribuídas mensalmente)
 *
 * REGRA: Receitas futuras NÃO entram na projeção.
 * Receita só impacta quando o usuário lança manualmente.
 */

export function gerarDias(dataInicio, dataFim) {
  const dias = []
  const atual = new Date(dataInicio)
  const fim = new Date(dataFim)

  while (atual <= fim) {
    dias.push(new Date(atual))
    atual.setDate(atual.getDate() + 1)
  }

  return dias
}

export function dataStr(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function fixoAtivoNaData(fixo, data) {
  const dataFixoInicio = new Date(fixo.data_inicio)
  const dataFixoFim = fixo.data_fim ? new Date(fixo.data_fim) : null

  if (data < dataFixoInicio) return false
  if (dataFixoFim && data > dataFixoFim) return false

  return data.getDate() === fixo.dia_vencimento
}

function parcelaAtivaNoMes(parcela, ano, mes, hoje) {
  let anoInicioEfetivo = parcela.ano_inicio
  let mesInicioEfetivo = parcela.mes_inicio

  const primeiroDiaMesInicio = new Date(parcela.ano_inicio, parcela.mes_inicio - 1, 1)
  const hojeSemHora = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate())

  if (primeiroDiaMesInicio < hojeSemHora &&
      primeiroDiaMesInicio.getMonth() === hojeSemHora.getMonth() &&
      primeiroDiaMesInicio.getFullYear() === hojeSemHora.getFullYear()) {
    mesInicioEfetivo = parcela.mes_inicio + 1
    anoInicioEfetivo = parcela.ano_inicio
    if (mesInicioEfetivo > 12) {
      mesInicioEfetivo = 1
      anoInicioEfetivo += 1
    }
  }

  const totalMesesAjustado = (mesInicioEfetivo - 1) + (parcela.num_parcelas - 1)
  const mesFimEfetivo = (totalMesesAjustado % 12) + 1
  const anoFimEfetivo = anoInicioEfetivo + Math.floor(totalMesesAjustado / 12)

  if (ano < anoInicioEfetivo) return false
  if (ano > anoFimEfetivo) return false
  if (ano === anoInicioEfetivo && mes < mesInicioEfetivo) return false
  if (ano === anoFimEfetivo && mes > mesFimEfetivo) return false
  return true
}

function processarTransferencia(l, saldoAcumulado, eventos) {
  const catOrigem = l.contaOrigemCategoria || 'livre'
  const catDestino = l.contaDestinoCategoria || 'livre'

  if (catOrigem === 'livre' && catDestino !== 'livre') {
    saldoAcumulado -= Number(l.valor)
    eventos.push({ tipo: 'saida', descricao: `${l.descricao} (transferência)`, valor: Number(l.valor), origem: 'transferencia' })
  } else if (catOrigem !== 'livre' && catDestino === 'livre') {
    saldoAcumulado += Number(l.valor)
    eventos.push({ tipo: 'entrada', descricao: `${l.descricao} (resgate)`, valor: Number(l.valor), origem: 'transferencia' })
  } else {
    eventos.push({ tipo: 'transferencia', descricao: `${l.descricao} (transferência)`, valor: Number(l.valor), origem: 'transferencia' })
  }
  return saldoAcumulado
}

export function calcularProjecao(saldoInicial, lancamentos, fixos, parcelas, dataInicio, dataFim, lancamentosRecorrentes = []) {
  const dias = gerarDias(dataInicio, dataFim)
  const resultado = []
  let saldoAcumulado = saldoInicial

  const lancamentosPorData = {}
  lancamentos.forEach(l => {
    const key = l.data
    if (!lancamentosPorData[key]) lancamentosPorData[key] = []
    lancamentosPorData[key].push(l)
  })

  for (const dia of dias) {
    const key = dataStr(dia)
    const ano = dia.getFullYear()
    const mes = dia.getMonth() + 1
    const diaMes = dia.getDate()
    const eventos = []

    // 1. Lançamentos avulsos do dia (entrada, saída ou transferência única)
    const lDia = lancamentosPorData[key] || []
    lDia.forEach(l => {
      if (l.tipo === 'transferencia') {
        saldoAcumulado = processarTransferencia(l, saldoAcumulado, eventos)
      } else {
        const impacto = l.tipo === 'entrada' ? Number(l.valor) : -Number(l.valor)
        saldoAcumulado += impacto
        eventos.push({ tipo: l.tipo, descricao: l.descricao, valor: Number(l.valor), origem: 'lancamento' })
      }
    })

    // 2. Fixos recorrentes que vencem neste dia
    fixos.filter(f => f.ativo && fixoAtivoNaData(f, dia)).forEach(f => {
      saldoAcumulado -= Number(f.valor)
      eventos.push({ tipo: 'saida', descricao: f.descricao, valor: Number(f.valor), origem: 'fixo' })
    })

    // 2.5 Lançamentos recorrentes (transferências fixas, ex: dia 15 todo mês)
    lancamentosRecorrentes.filter(l => l.recorrente && l.dia_recorrencia === diaMes).forEach(l => {
      if (l.tipo === 'transferencia') {
        saldoAcumulado = processarTransferencia(l, saldoAcumulado, eventos)
      } else {
        const impacto = l.tipo === 'entrada' ? Number(l.valor) : -Number(l.valor)
        saldoAcumulado += impacto
        eventos.push({ tipo: l.tipo, descricao: `${l.descricao} (recorrente)`, valor: Number(l.valor), origem: 'lancamento_recorrente' })
      }
    })

    // 3. Parcelas que vencem neste dia (usa dia_pagamento se disponível, senão dia 1)
    parcelas.filter(p => {
      if (!p.ativo) return false
      const diaPagamento = p.dia_pagamento || 1
      if (diaMes !== diaPagamento) return false
      return parcelaAtivaNoMes(p, ano, mes, dataInicio)
    }).forEach(p => {
      saldoAcumulado -= Number(p.valor_parcela)
      eventos.push({ tipo: 'saida', descricao: `${p.descricao} (parcela)`, valor: Number(p.valor_parcela), origem: 'parcela' })
    })

    resultado.push({ data: key, dataObj: new Date(dia), saldo: saldoAcumulado, eventos })
  }

  return resultado
}

export function statusSaldo(saldo) {
  if (saldo < 0) return 'negativo'
  if (saldo < 500) return 'critico'
  if (saldo < 1500) return 'alerta'
  return 'ok'
}

export function corSaldo(saldo) {
  const status = statusSaldo(saldo)
  if (status === 'negativo') return '#EF4444'
  if (status === 'critico') return '#EF4444'
  if (status === 'alerta') return '#EAB308'
  return '#22C55E'
}

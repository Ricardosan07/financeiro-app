import { calcularProjecao } from './projecao'

/**
 * Simula o impacto de uma nova compra na projeção de saldo.
 * Retorna duas séries: "antes" (projeção atual) e "depois" (com a compra simulada).
 */
export function simularCompra({ saldoInicial, lancamentos, fixos, parcelas, dataInicio, dataFim, compraSimulada }) {
  const projecaoAntes = calcularProjecao(saldoInicial, lancamentos, fixos, parcelas, dataInicio, dataFim)

  let parcelasSimuladas = [...parcelas]
  let lancamentosSimulados = [...lancamentos]

  if (compraSimulada.parcelado) {
    const valorParcela = compraSimulada.valor / compraSimulada.numParcelas
    const totalMesesAjustado = (compraSimulada.mesInicio - 1) + (compraSimulada.numParcelas - 1)
    const mesFim = (totalMesesAjustado % 12) + 1
    const anoFim = compraSimulada.anoInicio + Math.floor(totalMesesAjustado / 12)

    parcelasSimuladas.push({
      id: 'simulacao',
      descricao: compraSimulada.descricao,
      valor_total: compraSimulada.valor,
      num_parcelas: compraSimulada.numParcelas,
      valor_parcela: valorParcela,
      mes_inicio: compraSimulada.mesInicio,
      ano_inicio: compraSimulada.anoInicio,
      mes_fim: mesFim,
      ano_fim: anoFim,
      ativo: true
    })
  } else {
    lancamentosSimulados.push({
      data: dataInicio.toISOString().split('T')[0],
      descricao: compraSimulada.descricao,
      valor: compraSimulada.valor,
      tipo: 'saida'
    })
  }

  const projecaoDepois = calcularProjecao(saldoInicial, lancamentosSimulados, fixos, parcelasSimuladas, dataInicio, dataFim)

  const menorSaldoAntes = projecaoAntes.reduce((min, d) => d.saldo < min ? d.saldo : min, Infinity)
  const menorSaldoDepois = projecaoDepois.reduce((min, d) => d.saldo < min ? d.saldo : min, Infinity)

  const primeiroDiaNegativoAntes = projecaoAntes.find(d => d.saldo < 0)
  const primeiroDiaNegativoDepois = projecaoDepois.find(d => d.saldo < 0)

  let statusCenario
  if (primeiroDiaNegativoAntes) {
    statusCenario = 'ja_estava_negativo'
  } else if (primeiroDiaNegativoDepois) {
    statusCenario = 'compra_leva_ao_negativo'
  } else {
    statusCenario = 'seguro'
  }

  return {
    antes: projecaoAntes,
    depois: projecaoDepois,
    menorSaldoAntes,
    menorSaldoDepois,
    diferenca: menorSaldoDepois - menorSaldoAntes,
    primeiroDiaNegativoAntes: primeiroDiaNegativoAntes?.data || null,
    primeiroDiaNegativoDepois: primeiroDiaNegativoDepois?.data || null,
    statusCenario
  }
}

import { useState } from 'react'
import { useProjecao } from '../hooks/useProjecao'
import { corSaldo, statusSaldo } from '../lib/projecao'
import { ChevronLeft, ChevronRight } from 'lucide-react'

const formatBRL = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
const mesesNome = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
const diasSemana = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb']

export default function VisaoMensal() {
  const { projecao, loading } = useProjecao(365)
  const [mesOffset, setMesOffset] = useState(0)
  const [diaSelecionado, setDiaSelecionado] = useState(null)

  const hoje = new Date()
  const mesAlvo = new Date(hoje.getFullYear(), hoje.getMonth() + mesOffset, 1)
  const anoAlvo = mesAlvo.getFullYear()
  const mesAlvoNum = mesAlvo.getMonth() + 1

  const diasDoMes = projecao.filter(d => {
    const dt = new Date(d.data + 'T00:00:00')
    return dt.getFullYear() === anoAlvo && (dt.getMonth() + 1) === mesAlvoNum
  })

  const primeiroDiaMes = new Date(anoAlvo, mesAlvoNum - 1, 1).getDay()
  const totalDiasNoMes = new Date(anoAlvo, mesAlvoNum, 0).getDate()

  const getDadosDia = (numDia) => {
    const dateStr = `${anoAlvo}-${String(mesAlvoNum).padStart(2, '0')}-${String(numDia).padStart(2, '0')}`
    return projecao.find(d => d.data === dateStr)
  }

  const hojeStr = hoje.toISOString().split('T')[0]
  const diaDetalhe = diaSelecionado ? getDadosDia(diaSelecionado) : null

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <p className="text-textsecondary">Calculando projeção...</p>
    </div>
  )

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-display text-2xl font-bold text-textprimary">Visão Mensal</h1>
        <div className="flex items-center gap-4">
          <button onClick={() => { setMesOffset(m => m - 1); setDiaSelecionado(null) }}
            className="p-2 rounded-xl border border-border text-textsecondary hover:text-textprimary transition-colors">
            <ChevronLeft size={18} />
          </button>
          <span className="font-display font-semibold text-textprimary min-w-[180px] text-center">
            {mesesNome[mesAlvoNum - 1]} {anoAlvo}
          </span>
          <button onClick={() => { setMesOffset(m => m + 1); setDiaSelecionado(null) }}
            className="p-2 rounded-xl border border-border text-textsecondary hover:text-textprimary transition-colors">
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      {/* CALENDÁRIO VISUAL */}
      <div className="bg-surface border border-border rounded-2xl p-6 mb-6">
        <div className="grid grid-cols-7 gap-1 mb-2">
          {diasSemana.map(d => (
            <div key={d} className="text-center text-textsecondary text-xs font-medium py-2">{d}</div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: primeiroDiaMes }).map((_, i) => (
            <div key={`empty-${i}`} className="h-14" />
          ))}

          {Array.from({ length: totalDiasNoMes }).map((_, i) => {
            const numDia = i + 1
            const dadosDia = getDadosDia(numDia)
            const dateStr = `${anoAlvo}-${String(mesAlvoNum).padStart(2, '0')}-${String(numDia).padStart(2, '0')}`
            const isHoje = dateStr === hojeStr
            const isSelecionado = diaSelecionado === numDia
            const temEventos = dadosDia && dadosDia.eventos.length > 0

            let bgColor = 'bg-white/5'
            if (dadosDia) {
              const saldo = dadosDia.saldo
              if (saldo < 0) bgColor = 'bg-red/20'
              else if (saldo < 200) bgColor = 'bg-red/10'
              else if (saldo < 500) bgColor = 'bg-yellow/15'
              else if (saldo < 1000) bgColor = 'bg-yellow/10'
              else if (saldo < 2000) bgColor = 'bg-green/8'
              else bgColor = 'bg-green/15'
            }

            let borderColor = 'border-transparent'
            if (isHoje) borderColor = 'border-indigo'
            if (isSelecionado) borderColor = 'border-white'

            return (
              <button key={numDia}
                onClick={() => setDiaSelecionado(isSelecionado ? null : numDia)}
                className={`h-14 rounded-xl border ${bgColor} ${borderColor} flex flex-col items-center justify-center transition-all hover:opacity-80`}>
                <span className={`text-sm font-medium ${isHoje ? 'text-indigo' : 'text-textprimary'}`}>
                  {numDia}
                </span>
                {temEventos && (
                  <span className="w-1 h-1 rounded-full bg-current opacity-60 mt-0.5" />
                )}
              </button>
            )
          })}
        </div>

        <div className="flex gap-4 mt-4 justify-end">
          {[
            { cor: 'bg-green/15', label: 'Acima de R$2k' },
            { cor: 'bg-yellow/10', label: 'R$200–R$1k' },
            { cor: 'bg-red/15', label: 'Abaixo de R$200' },
          ].map(l => (
            <div key={l.label} className="flex items-center gap-1.5">
              <span className={`w-3 h-3 rounded-sm ${l.cor}`} />
              <span className="text-textsecondary text-xs">{l.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Detalhe do dia selecionado */}
      {diaSelecionado && diaDetalhe && (
        <div className="bg-surface border border-indigo/30 rounded-2xl p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <p className="font-display font-semibold text-textprimary">
              Dia {diaSelecionado} de {mesesNome[mesAlvoNum - 1]}
            </p>
            <p className="font-display font-bold text-xl" style={{ color: corSaldo(diaDetalhe.saldo) }}>
              {formatBRL(diaDetalhe.saldo)}
            </p>
          </div>
          {diaDetalhe.eventos.length > 0 ? (
            <div className="space-y-2">
              {diaDetalhe.eventos.map((ev, j) => (
                <div key={j} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${ev.tipo === 'entrada' ? 'bg-green' : ev.tipo === 'saida' ? 'bg-red' : 'bg-indigo'}`} />
                    <span className="text-sm text-textprimary">{ev.descricao}</span>
                  </div>
                  <span className={`text-sm font-medium ${ev.tipo === 'entrada' ? 'text-green' : 'text-red'}`}>
                    {ev.tipo === 'entrada' ? '+' : ev.tipo === 'saida' ? '-' : ''}{formatBRL(ev.valor)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-textsecondary text-sm">Nenhum evento neste dia</p>
          )}
        </div>
      )}

      {/* TABELA */}
      <div className="bg-surface border border-border rounded-2xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left px-6 py-4 text-textsecondary text-sm font-medium w-20">Dia</th>
              <th className="text-left px-6 py-4 text-textsecondary text-sm font-medium">Eventos</th>
              <th className="text-right px-6 py-4 text-textsecondary text-sm font-medium">Saldo do Dia</th>
            </tr>
          </thead>
          <tbody>
            {diasDoMes.map(dia => {
              const dt = new Date(dia.data + 'T00:00:00')
              const isHoje = dia.data === hojeStr
              const cor = corSaldo(dia.saldo)
              const status = statusSaldo(dia.saldo)

              return (
                <tr key={dia.data}
                  className={`border-b border-border/40 transition-colors cursor-pointer ${
                    isHoje ? 'bg-indigo/10' : diaSelecionado === dt.getDate() ? 'bg-white/5' : 'hover:bg-white/5'
                  }`}
                  onClick={() => setDiaSelecionado(dt.getDate() === diaSelecionado ? null : dt.getDate())}>
                  <td className="px-6 py-3">
                    <span className={`font-display font-bold text-lg ${isHoje ? 'text-indigo' : 'text-textsecondary'}`}>
                      {String(dt.getDate()).padStart(2, '0')}
                    </span>
                    {isHoje && <span className="ml-2 text-xs text-indigo font-medium">hoje</span>}
                  </td>
                  <td className="px-6 py-3">
                    {dia.eventos.length > 0 ? (
                      <div className="space-y-1">
                        {dia.eventos.map((ev, j) => (
                          <div key={j} className="flex items-center gap-2">
                            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${ev.tipo === 'entrada' ? 'bg-green' : ev.tipo === 'saida' ? 'bg-red' : 'bg-indigo'}`} />
                            <span className="text-sm text-textsecondary">{ev.descricao}</span>
                            <span className={`text-sm font-medium ml-auto ${ev.tipo === 'entrada' ? 'text-green' : 'text-red'}`}>
                              {ev.tipo === 'entrada' ? '+' : ev.tipo === 'saida' ? '-' : ''}{formatBRL(ev.valor)}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <span className="text-textsecondary/40 text-sm">—</span>
                    )}
                  </td>
                  <td className="px-6 py-3 text-right">
                    <span className="font-display font-bold text-lg" style={{ color: cor }}>
                      {formatBRL(dia.saldo)}
                    </span>
                    {status === 'negativo' && (
                      <span className="ml-2 text-xs bg-red/20 text-red px-2 py-0.5 rounded-full">risco</span>
                    )}
                  </td>
                </tr>
              )
            })}
            {diasDoMes.length === 0 && (
              <tr><td colSpan={3} className="px-6 py-12 text-center text-textsecondary">
                Período fora do alcance da projeção (365 dias)
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

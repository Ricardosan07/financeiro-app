import { useProjecao } from '../hooks/useProjecao'
import { useDashboardData } from '../hooks/useDashboardData'
import { useConfig } from '../contexts/ConfigContext'
import { corSaldo } from '../lib/projecao'
import { TrendingDown, AlertTriangle, Calendar, Wallet, RefreshCw } from 'lucide-react'
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  LineChart, Line, XAxis, YAxis, CartesianGrid
} from 'recharts'

const formatBRL = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0)

const CORES_GRAFICO = ['#6366F1', '#22C55E', '#EAB308', '#EF4444', '#EC4899', '#06B6D4', '#8B5CF6', '#64748B']

function saldoEmDias(projecao, dias) {
  if (!projecao.length) return null
  const alvo = new Date()
  alvo.setDate(alvo.getDate() + dias)
  const str = alvo.toISOString().split('T')[0]
  const encontrado = projecao.find(d => d.data === str)
  return encontrado ? encontrado.saldo : projecao[projecao.length - 1]?.saldo
}

function calcularPodeGastar(saldoInicial, projecao) {
  const hoje = new Date()
  const limite = new Date()
  limite.setDate(limite.getDate() + 30)
  const compromissos30dias = projecao
    .filter(d => {
      const dt = new Date(d.data + 'T00:00:00')
      return dt > hoje && dt <= limite
    })
    .reduce((total, d) => {
      return total + d.eventos.filter(e => e.tipo === 'saida').reduce((s, e) => s + e.valor, 0)
    }, 0)
  return saldoInicial - compromissos30dias
}

const corDica = {
  alerta: 'bg-red/10 border-red/30 text-red',
  conquista: 'bg-green/10 border-green/30 text-green',
  dica: 'bg-indigo/10 border-indigo/30 text-indigo',
  insight: 'bg-yellow/10 border-yellow/30 text-yellow',
  lembrete: 'bg-surface border-border text-textsecondary',
  ok: 'bg-green/10 border-green/30 text-green',
}

export default function Dashboard() {
  const { projecao, saldoInicial, loading: loadingProjecao } = useProjecao(90)
  const { gastosPorCategoria, historicoSaldo, reservas, objetivosAtivos, dica, loading: loadingData, recarregar } = useDashboardData()
  const { threshold_saldo_baixo, nome } = useConfig()

  const saldo30 = saldoEmDias(projecao, 30)
  const saldo60 = saldoEmDias(projecao, 60)
  const saldo90 = saldoEmDias(projecao, 90)
  const menorSaldo = projecao.reduce((min, d) => d.saldo < min ? d.saldo : min, Infinity)
  const hojeStr = new Date().toISOString().split('T')[0]
  const diaCritico = projecao.find(d => d.data !== hojeStr && d.saldo < 500)
  const podeGastar = calcularPodeGastar(saldoInicial, projecao)

  const compromissosMes = projecao
    .filter(d => {
      const dt = new Date(d.data + 'T00:00:00')
      const hoje = new Date()
      return dt.getMonth() === hoje.getMonth() && dt.getFullYear() === hoje.getFullYear()
    })
    .reduce((total, d) => total + d.eventos.filter(e => e.tipo === 'saida').reduce((s, e) => s + e.valor, 0), 0)

  const pctComprometido = saldoInicial > 0 ? Math.round((compromissosMes / saldoInicial) * 100) : 0

  const proximosEventos = projecao
    .filter(d => d.data >= hojeStr && d.eventos.length > 0)
    .slice(0, 6)
    .flatMap(d => d.eventos.map(e => ({ ...e, data: d.data })))

  const loading = loadingProjecao || loadingData

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <p className="text-textsecondary">Carregando dashboard...</p>
    </div>
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-textprimary">
            {nome ? `Olá, ${nome.split(' ')[0]} 👋` : 'Dashboard'}
          </h1>
          <p className="text-textsecondary text-sm mt-1">Projeção baseada em compromissos reais</p>
        </div>
        <button onClick={recarregar} className="text-textsecondary hover:text-textprimary transition-colors p-2 rounded-xl hover:bg-white/5">
          <RefreshCw size={16} />
        </button>
      </div>

      {/* DICA CONTEXTUAL */}
      {dica && (
        <div className={`border rounded-2xl p-4 ${corDica[dica.tipo]}`}>
          <div className="flex items-start gap-3">
            <span className="text-xl">{dica.icone}</span>
            <div>
              <p className="font-medium text-sm">{dica.titulo}</p>
              <p className="text-xs mt-0.5 opacity-80">{dica.texto}</p>
            </div>
          </div>
        </div>
      )}

      {/* Saldo e quanto pode gastar */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-surface border border-border rounded-2xl p-6">
          <p className="text-textsecondary text-sm mb-2">Saldo Livre Hoje</p>
          <p className="font-display text-4xl font-bold" style={{ color: corSaldo(saldoInicial) }}>
            {formatBRL(saldoInicial)}
          </p>
          <p className="text-textsecondary text-xs mt-2">Soma das contas livres</p>
          {saldoInicial < threshold_saldo_baixo && (
            <p className="text-red text-xs mt-2 bg-red/10 border border-red/20 rounded-lg px-3 py-1.5">
              ⚠ Abaixo de {formatBRL(threshold_saldo_baixo)}
            </p>
          )}
        </div>

        <div className={`border rounded-2xl p-6 ${podeGastar >= 0 ? 'bg-indigo/10 border-indigo/30' : 'bg-red/10 border-red/30'}`}>
          <div className="flex items-center gap-2 mb-2">
            <Wallet size={14} className={podeGastar >= 0 ? 'text-indigo' : 'text-red'} />
            <p className="text-textsecondary text-xs">Posso gastar hoje</p>
          </div>
          <p className={`font-display text-4xl font-bold ${podeGastar >= 0 ? 'text-indigo' : 'text-red'}`}>
            {formatBRL(Math.max(0, podeGastar))}
          </p>
          <p className="text-textsecondary text-xs mt-2">sem comprometer os próx. 30 dias</p>
        </div>
      </div>

      {/* Projeção futura */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Daqui 30 dias', valor: saldo30 },
          { label: 'Daqui 60 dias', valor: saldo60 },
          { label: 'Daqui 90 dias', valor: saldo90 },
        ].map(({ label, valor }) => (
          <div key={label} className="bg-surface border border-border rounded-2xl p-5">
            <p className="text-textsecondary text-xs mb-2">{label}</p>
            <p className="font-display text-xl font-bold" style={{ color: valor !== null ? corSaldo(valor) : '#64748B' }}>
              {valor !== null ? formatBRL(valor) : '—'}
            </p>
          </div>
        ))}
      </div>

      {/* Gastos por categoria + Histórico de saldo */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-surface border border-border rounded-2xl p-6">
          <p className="text-textprimary font-medium mb-4">Gastos este mês por categoria</p>
          {gastosPorCategoria.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie
                    data={gastosPorCategoria}
                    dataKey="valor"
                    nameKey="nome"
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={2}
                  >
                    {gastosPorCategoria.map((entry, index) => (
                      <Cell key={entry.nome} fill={entry.cor || CORES_GRAFICO[index % CORES_GRAFICO.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1A1D27', border: '1px solid #2A2D3A', borderRadius: '12px' }}
                    formatter={(v) => formatBRL(v)}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2 mt-2">
                {gastosPorCategoria.slice(0, 4).map((cat, i) => {
                  const total = gastosPorCategoria.reduce((s, c) => s + c.valor, 0)
                  const pct = Math.round((cat.valor / total) * 100)
                  return (
                    <div key={cat.nome} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: cat.cor || CORES_GRAFICO[i % CORES_GRAFICO.length] }} />
                        <span className="text-xs text-textsecondary">{cat.nome}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-textprimary">{formatBRL(cat.valor)}</span>
                        <span className="text-xs text-textsecondary">{pct}%</span>
                      </div>
                    </div>
                  )
                })}
                {gastosPorCategoria.length > 4 && (
                  <p className="text-textsecondary text-xs">+{gastosPorCategoria.length - 4} outras categorias</p>
                )}
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-40">
              <p className="text-textsecondary text-sm">Nenhum gasto registrado este mês</p>
            </div>
          )}
        </div>

        <div className="bg-surface border border-border rounded-2xl p-6">
          <p className="text-textprimary font-medium mb-4">Saldo livre — últimos 6 meses</p>
          {historicoSaldo.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={historicoSaldo}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2A2D3A" />
                <XAxis dataKey="mes" stroke="#64748B" tick={{ fontSize: 11 }} />
                <YAxis stroke="#64748B" tick={{ fontSize: 10 }} tickFormatter={v => `R$${v}`} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1A1D27', border: '1px solid #2A2D3A', borderRadius: '12px' }}
                  formatter={v => formatBRL(v)}
                />
                <Line
                  type="monotone"
                  dataKey="saldo"
                  name="Saldo Livre"
                  stroke="#6366F1"
                  strokeWidth={2}
                  dot={{ fill: '#6366F1', r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-40">
              <p className="text-textsecondary text-sm">Histórico insuficiente</p>
            </div>
          )}
        </div>
      </div>

      {/* Progresso das reservas */}
      {reservas.length > 0 && (
        <div className="bg-surface border border-border rounded-2xl p-6">
          <p className="text-textprimary font-medium mb-4">Progresso das Reservas</p>
          <div className="grid grid-cols-2 gap-4">
            {reservas.map(r => {
              const pct = Math.min(100, Math.round((Number(r.saldo_atual) / Number(r.meta_valor)) * 100))
              const cor = pct >= 100 ? '#22C55E' : pct >= 50 ? '#EAB308' : '#6366F1'
              return (
                <div key={r.nome} className="space-y-2">
                  <div className="flex justify-between items-center">
                    <p className="text-sm text-textprimary">{r.nome}</p>
                    <p className="text-sm font-bold" style={{ color: cor }}>{pct}%</p>
                  </div>
                  <div className="w-full bg-border rounded-full h-2">
                    <div className="h-2 rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: cor }} />
                  </div>
                  <div className="flex justify-between text-xs text-textsecondary">
                    <span>{formatBRL(r.saldo_atual)}</span>
                    <span>meta: {formatBRL(r.meta_valor)}</span>
                  </div>
                  {r.proposito && <p className="text-xs text-textsecondary italic">{r.proposito}</p>}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Objetivos */}
      {objetivosAtivos.length > 0 && (
        <div className="bg-surface border border-border rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <p className="text-textprimary font-medium">Objetivos</p>
            <a href="/objetivos" className="text-indigo text-xs hover:underline">Ver todos</a>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {objetivosAtivos.slice(0, 4).map(o => {
              const pct = Math.min(100, Math.round((Number(o.valor_atual) / Number(o.valor_alvo)) * 100))
              const cor = pct >= 100 ? '#22C55E' : pct >= 50 ? '#EAB308' : '#6366F1'
              const hoje = new Date()
              const meses = o.data_alvo
                ? Math.max(1, (new Date(o.data_alvo).getFullYear() - hoje.getFullYear()) * 12 + (new Date(o.data_alvo).getMonth() - hoje.getMonth()))
                : null
              const mensalidade = meses ? Math.max(0, (Number(o.valor_alvo) - Number(o.valor_atual)) / meses) : null
              return (
                <div key={o.id} className="space-y-2">
                  <div className="flex justify-between items-center">
                    <p className="text-sm text-textprimary truncate">{o.nome}</p>
                    <p className="text-sm font-bold ml-2 flex-shrink-0" style={{ color: cor }}>{pct}%</p>
                  </div>
                  <div className="w-full bg-border rounded-full h-2">
                    <div className="h-2 rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: cor }} />
                  </div>
                  <div className="flex justify-between text-xs text-textsecondary">
                    <span>{formatBRL(o.valor_atual)} / {formatBRL(o.valor_alvo)}</span>
                    {mensalidade !== null && <span className="text-indigo">{formatBRL(mensalidade)}/mês</span>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Alertas */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-surface border border-border rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-2">
            <TrendingDown size={15} className="text-red" />
            <p className="text-textsecondary text-sm">Menor saldo projetado</p>
          </div>
          <p className="font-display text-xl font-bold" style={{ color: corSaldo(menorSaldo) }}>
            {menorSaldo === Infinity ? '—' : formatBRL(menorSaldo)}
          </p>
        </div>
        <div className="bg-surface border border-border rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle size={15} className="text-yellow" />
            <p className="text-textsecondary text-sm">Primeiro dia crítico</p>
          </div>
          {diaCritico ? (
            <p className="font-display text-xl font-bold text-yellow">
              {new Date(diaCritico.data + 'T00:00:00').toLocaleDateString('pt-BR')}
            </p>
          ) : (
            <p className="font-display text-xl font-bold text-green">Nenhum</p>
          )}
        </div>
      </div>

      {/* Comprometimento */}
      {saldoInicial > 0 && (
        <div className="bg-surface border border-border rounded-2xl p-5">
          <div className="flex items-end justify-between mb-2">
            <p className="text-textprimary text-sm font-medium">Comprometimento do mês</p>
            <p className={`font-display font-bold text-lg ${pctComprometido > 80 ? 'text-red' : pctComprometido > 50 ? 'text-yellow' : 'text-green'}`}>
              {pctComprometido}%
            </p>
          </div>
          <div className="w-full bg-border rounded-full h-2 mb-1">
            <div className={`h-2 rounded-full transition-all ${pctComprometido > 80 ? 'bg-red' : pctComprometido > 50 ? 'bg-yellow' : 'bg-green'}`}
              style={{ width: `${Math.min(100, pctComprometido)}%` }} />
          </div>
          <p className="text-textsecondary text-xs">{formatBRL(compromissosMes)} em compromissos fixos este mês</p>
        </div>
      )}

      {/* Próximos Compromissos */}
      {proximosEventos.length > 0 && (
        <div className="bg-surface border border-border rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <Calendar size={15} className="text-indigo" />
            <p className="text-textprimary font-medium">Próximos Compromissos</p>
          </div>
          <div className="space-y-3">
            {proximosEventos.map((ev, i) => (
              <div key={i} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className={`w-2 h-2 rounded-full ${ev.tipo === 'entrada' ? 'bg-green' : 'bg-red'}`} />
                  <span className="text-sm text-textprimary">{ev.descricao}</span>
                  <span className="text-xs text-textsecondary">
                    {new Date(ev.data + 'T00:00:00').toLocaleDateString('pt-BR')}
                  </span>
                </div>
                <span className={`text-sm font-medium ${ev.tipo === 'entrada' ? 'text-green' : 'text-red'}`}>
                  {ev.tipo === 'entrada' ? '+' : '-'}{formatBRL(ev.valor)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

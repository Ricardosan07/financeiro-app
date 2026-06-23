import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useProjecao } from '../hooks/useProjecao'
import { simularCompra } from '../lib/simulador'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts'
import { Calculator, CheckCircle2, AlertTriangle } from 'lucide-react'

const formatBRL = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
const meses = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

export default function Simulador() {
  const { user } = useAuth()
  const hoje = new Date()
  const { saldoInicial, recarregar } = useProjecao(180)

  const [form, setForm] = useState({
    descricao: '', valor: '', parcelado: true, numParcelas: '1',
    mesInicio: String(hoje.getMonth() + 1), anoInicio: String(hoje.getFullYear())
  })
  const [resultado, setResultado] = useState(null)
  const [salvando, setSalvando] = useState(false)

  const rodarSimulacao = async () => {
    if (!form.descricao || !form.valor) return

    const { data: lancamentos } = await supabase.from('lancamentos').select('*').eq('user_id', user.id)
    const { data: fixos } = await supabase.from('fixos').select('*').eq('user_id', user.id).eq('ativo', true)
    const { data: parcelas } = await supabase.from('parcelas').select('*').eq('user_id', user.id).eq('ativo', true)

    const fim = new Date(hoje)
    fim.setDate(fim.getDate() + 180)

    const sim = simularCompra({
      saldoInicial,
      lancamentos: lancamentos || [],
      fixos: fixos || [],
      parcelas: parcelas || [],
      dataInicio: hoje,
      dataFim: fim,
      compraSimulada: {
        descricao: form.descricao,
        valor: parseFloat(form.valor),
        parcelado: form.parcelado,
        numParcelas: form.parcelado ? parseInt(form.numParcelas) : 1,
        mesInicio: parseInt(form.mesInicio),
        anoInicio: parseInt(form.anoInicio)
      }
    })

    setResultado(sim)
  }

  const confirmarCompra = async () => {
    setSalvando(true)
    if (form.parcelado && parseInt(form.numParcelas) > 1) {
      const valorParcela = parseFloat(form.valor) / parseInt(form.numParcelas)
      const totalMesesAjustado = (parseInt(form.mesInicio) - 1) + (parseInt(form.numParcelas) - 1)
      const mesFim = (totalMesesAjustado % 12) + 1
      const anoFim = parseInt(form.anoInicio) + Math.floor(totalMesesAjustado / 12)

      await supabase.from('parcelas').insert({
        descricao: form.descricao,
        valor_total: parseFloat(form.valor),
        num_parcelas: parseInt(form.numParcelas),
        valor_parcela: valorParcela,
        mes_inicio: parseInt(form.mesInicio),
        ano_inicio: parseInt(form.anoInicio),
        mes_fim: mesFim,
        ano_fim: anoFim,
        user_id: user.id
      })
    } else {
      await supabase.from('lancamentos').insert({
        data: hoje.toISOString().split('T')[0],
        descricao: form.descricao,
        valor: parseFloat(form.valor),
        tipo: 'saida',
        user_id: user.id
      })
    }

    setResultado(null)
    setForm({ descricao: '', valor: '', parcelado: true, numParcelas: '1', mesInicio: String(hoje.getMonth() + 1), anoInicio: String(hoje.getFullYear()) })
    recarregar()
    setSalvando(false)
  }

  const dadosGrafico = resultado ? resultado.antes.map((d, i) => ({
    data: new Date(d.data + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
    antes: Math.round(d.saldo),
    depois: Math.round(resultado.depois[i]?.saldo ?? d.saldo)
  })).filter((_, i) => i % 3 === 0) : []

  return (
    <div>
      <div className="mb-8">
        <h1 className="font-display text-2xl font-bold text-textprimary flex items-center gap-2">
          <Calculator size={22} className="text-indigo" /> Simulador de Compra
        </h1>
        <p className="text-textsecondary text-sm mt-1">Veja o impacto antes de confirmar</p>
      </div>

      {/* Formulário */}
      <div className="bg-surface border border-border rounded-2xl p-6 mb-6">
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="text-textsecondary text-sm mb-1 block">O que você quer comprar?</label>
            <input value={form.descricao} onChange={e => setForm({ ...form, descricao: e.target.value })}
              className="w-full bg-bg border border-border rounded-xl px-4 py-3 text-textprimary focus:outline-none focus:border-indigo"
              placeholder="Ex: Notebook novo" />
          </div>
          <div>
            <label className="text-textsecondary text-sm mb-1 block">Valor total (R$)</label>
            <input type="number" value={form.valor} onChange={e => setForm({ ...form, valor: e.target.value })}
              className="w-full bg-bg border border-border rounded-xl px-4 py-3 text-textprimary focus:outline-none focus:border-indigo"
              placeholder="0,00" />
          </div>
        </div>

        <div className="flex gap-2 mb-4">
          <button onClick={() => setForm({ ...form, parcelado: false, numParcelas: '1' })}
            className={`flex-1 py-3 rounded-xl text-sm font-medium transition-colors ${
              !form.parcelado ? 'bg-indigo/15 text-indigo border border-indigo/30' : 'border border-border text-textsecondary'
            }`}>
            À vista
          </button>
          <button onClick={() => setForm({ ...form, parcelado: true })}
            className={`flex-1 py-3 rounded-xl text-sm font-medium transition-colors ${
              form.parcelado ? 'bg-indigo/15 text-indigo border border-indigo/30' : 'border border-border text-textsecondary'
            }`}>
            Parcelado
          </button>
        </div>

        {form.parcelado && (
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div>
              <label className="text-textsecondary text-sm mb-1 block">Nº de parcelas</label>
              <input type="number" min="1" max="60" value={form.numParcelas}
                onChange={e => setForm({ ...form, numParcelas: e.target.value })}
                className="w-full bg-bg border border-border rounded-xl px-4 py-3 text-textprimary focus:outline-none focus:border-indigo" />
            </div>
            <div>
              <label className="text-textsecondary text-sm mb-1 block">Mês início</label>
              <select value={form.mesInicio} onChange={e => setForm({ ...form, mesInicio: e.target.value })}
                className="w-full bg-bg border border-border rounded-xl px-4 py-3 text-textprimary focus:outline-none focus:border-indigo">
                {meses.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="text-textsecondary text-sm mb-1 block">Ano início</label>
              <input type="number" value={form.anoInicio} onChange={e => setForm({ ...form, anoInicio: e.target.value })}
                className="w-full bg-bg border border-border rounded-xl px-4 py-3 text-textprimary focus:outline-none focus:border-indigo" />
            </div>
          </div>
        )}

        {form.parcelado && form.valor && form.numParcelas && (
          <div className="bg-indigo/10 border border-indigo/20 rounded-xl px-4 py-3 mb-4">
            <p className="text-textsecondary text-xs">Valor por parcela</p>
            <p className="text-indigo font-display font-bold text-xl">
              {formatBRL(parseFloat(form.valor) / parseInt(form.numParcelas))}
            </p>
          </div>
        )}

        <button onClick={rodarSimulacao} disabled={!form.descricao || !form.valor}
          className="w-full bg-indigo hover:bg-indigo/90 text-white py-3 rounded-xl text-sm font-medium transition-colors disabled:opacity-50">
          Simular Impacto
        </button>
      </div>

      {/* Resultado */}
      {resultado && (
        <>
          {(() => {
            const config = {
              ja_estava_negativo: {
                cor: 'yellow',
                icone: AlertTriangle,
                titulo: 'Sua projeção já estava negativa antes desta compra',
                corClasse: 'bg-yellow/10 border-yellow/30 text-yellow'
              },
              compra_leva_ao_negativo: {
                cor: 'red',
                icone: AlertTriangle,
                titulo: 'Esta compra vai te colocar no negativo',
                corClasse: 'bg-red/10 border-red/30 text-red'
              },
              seguro: {
                cor: 'green',
                icone: CheckCircle2,
                titulo: 'Esta compra não compromete seu saldo (nos próximos 180 dias)',
                corClasse: 'bg-green/10 border-green/30 text-green'
              }
            }
            const c = config[resultado.statusCenario]
            const Icone = c.icone

            return (
              <div className={`border rounded-2xl p-6 mb-6 ${c.corClasse}`}>
                <div className="flex items-center gap-2 mb-2">
                  <Icone size={18} />
                  <p className="font-medium">{c.titulo}</p>
                </div>
                <p className="text-textsecondary text-sm">
                  Seu menor saldo projetado {resultado.diferenca < 0 ? 'cai' : 'permanece em'} de{' '}
                  <strong className="text-textprimary">{formatBRL(resultado.menorSaldoAntes)}</strong>
                  {resultado.diferenca < 0 && (
                    <> para <strong className={c.cor === 'green' ? 'text-green' : `text-${c.cor}`}>{formatBRL(resultado.menorSaldoDepois)}</strong></>
                  )}
                </p>

                {resultado.statusCenario === 'compra_leva_ao_negativo' && resultado.primeiroDiaNegativoDepois && (
                  <p className="text-textsecondary text-sm mt-1">
                    Você entraria no negativo em{' '}
                    <strong className="text-red">
                      {new Date(resultado.primeiroDiaNegativoDepois + 'T00:00:00').toLocaleDateString('pt-BR')}
                    </strong>
                  </p>
                )}

                {resultado.statusCenario === 'ja_estava_negativo' && resultado.primeiroDiaNegativoAntes && (
                  <p className="text-textsecondary text-sm mt-1">
                    Sua projeção já ficava negativa em{' '}
                    <strong className="text-yellow">
                      {new Date(resultado.primeiroDiaNegativoAntes + 'T00:00:00').toLocaleDateString('pt-BR')}
                    </strong>
                    {' '}— independente desta compra
                  </p>
                )}
              </div>
            )
          })()}

          <div className="bg-surface border border-border rounded-2xl p-6 mb-6">
            <p className="text-textprimary font-medium mb-4">Comparativo: Antes vs. Depois</p>
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={dadosGrafico}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2A2D3A" />
                <XAxis dataKey="data" stroke="#64748B" tick={{ fontSize: 11 }} />
                <YAxis stroke="#64748B" tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}`} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1A1D27', border: '1px solid #2A2D3A', borderRadius: '12px' }}
                  formatter={(value) => formatBRL(value)}
                />
                <Legend />
                <ReferenceLine y={0} stroke="#EF4444" strokeDasharray="4 4" />
                <Line type="monotone" dataKey="antes" name="Sem a compra" stroke="#64748B" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="depois" name="Com a compra" stroke="#6366F1" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="flex gap-3">
            <button onClick={() => setResultado(null)}
              className="flex-1 border border-border text-textsecondary hover:text-textprimary py-3 rounded-xl text-sm font-medium transition-colors">
              Descartar Simulação
            </button>
            <button onClick={confirmarCompra} disabled={salvando}
              className="flex-1 bg-indigo hover:bg-indigo/90 text-white py-3 rounded-xl text-sm font-medium transition-colors disabled:opacity-50">
              {salvando ? 'Confirmando...' : 'Confirmar e Registrar'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

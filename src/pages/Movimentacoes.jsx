import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useCategorias } from '../hooks/useCategorias'
import { useConfig } from '../contexts/ConfigContext'
import { Plus, Trash2, Pencil, ArrowUpCircle, ArrowDownCircle, ArrowRightLeft } from 'lucide-react'
import FAB from '../components/FAB'

const formatBRL = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
const formatData = (d) => new Date(d + 'T00:00:00').toLocaleDateString('pt-BR')

const formasPagamento = [
  { valor: 'pix', label: 'Pix' },
  { valor: 'debito', label: 'Débito' },
  { valor: 'dinheiro', label: 'Dinheiro' },
  { valor: 'credito', label: 'Crédito' },
]

export default function Movimentacoes() {
  const { user } = useAuth()
  const { categorias } = useCategorias()
  const { percentual_aporte } = useConfig()
  const [movimentacoes, setMovimentacoes] = useState([])
  const [contas, setContas] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [filtroTipo, setFiltroTipo] = useState('todos')
  const [editandoId, setEditandoId] = useState(null)
  const [showDicaAporte, setShowDicaAporte] = useState(false)
  const [dadosDicaAporte, setDadosDicaAporte] = useState(null)

  const vazio = {
    data: new Date().toISOString().split('T')[0],
    descricao: '', categoria_id: '', valor: '', tipo: 'saida',
    forma_pagamento: 'pix', conta_id: '', conta_destino_id: '',
    recorrente: false, dia_recorrencia: '15'
  }
  const [form, setForm] = useState(vazio)

  const fetchMovimentacoes = async () => {
    const { data } = await supabase
      .from('lancamentos')
      .select('*, categorias(nome), conta:conta_id(nome), contaDestino:conta_destino_id(nome)')
      .eq('user_id', user.id)
      .order('data', { ascending: false })
      .limit(150)
    setMovimentacoes(data || [])
  }

  const fetchContas = async () => {
    const { data } = await supabase.from('contas').select('*').eq('user_id', user.id).eq('ativo', true)
    setContas(data || [])
    if (data && data.length > 0 && !form.conta_id) {
      setForm(f => ({ ...f, conta_id: data[0].id }))
    }
  }

  useEffect(() => { fetchMovimentacoes(); fetchContas() }, [])

  const resetForm = () => {
    setForm({ ...vazio, conta_id: contas[0]?.id || '' })
    setEditandoId(null)
    setShowForm(false)
  }

  const handleSave = async () => {
    setLoading(true)

    const payload = {
      data: form.recorrente ? new Date().toISOString().split('T')[0] : form.data,
      descricao: form.descricao,
      valor: parseFloat(form.valor),
      tipo: form.tipo,
      categoria_id: form.tipo !== 'transferencia' ? (form.categoria_id || null) : null,
      forma_pagamento: form.tipo === 'saida' ? form.forma_pagamento : null,
      conta_id: form.conta_id,
      conta_destino_id: form.tipo === 'transferencia' ? form.conta_destino_id : null,
      recorrente: form.tipo === 'transferencia' ? form.recorrente : false,
      dia_recorrencia: (form.tipo === 'transferencia' && form.recorrente) ? parseInt(form.dia_recorrencia) : null,
    }

    let error
    let novoLancamentoId = null

    if (editandoId) {
      const result = await supabase.from('lancamentos').update(payload).eq('id', editandoId)
      error = result.error
    } else {
      const result = await supabase.from('lancamentos').insert({ ...payload, user_id: user.id }).select('id')
      error = result.error
      if (!error && result.data?.length > 0) {
        novoLancamentoId = result.data[0].id
      }
    }

    if (error) {
      alert('Erro ao salvar: ' + error.message)
      setLoading(false)
      return
    }

    // Atualizar saldos das contas
    if (!editandoId && !payload.recorrente) {
      if (payload.tipo === 'entrada') {
        const { data: conta } = await supabase.from('contas').select('saldo_atual').eq('id', payload.conta_id).single()
        if (conta) await supabase.from('contas').update({ saldo_atual: Number(conta.saldo_atual) + payload.valor }).eq('id', payload.conta_id)

      } else if (payload.tipo === 'saida') {
        if (payload.forma_pagamento === 'credito') {
          if (novoLancamentoId) {
            const { data: cartoes } = await supabase
              .from('cartoes').select('*').eq('user_id', user.id).eq('ativo', true).limit(1)

            if (cartoes && cartoes.length > 0) {
              const cartao = cartoes[0]
              const dt = new Date(payload.data + 'T00:00:00')
              const dia = dt.getDate()
              let mes = dt.getMonth() + 1
              let ano = dt.getFullYear()

              if (dia > cartao.dia_fechamento) {
                mes += 1
                if (mes > 12) { mes = 1; ano += 1 }
              }

              const { data: faturaExistente } = await supabase
                .from('faturas')
                .select('id, status')
                .eq('cartao_id', cartao.id)
                .eq('mes', mes)
                .eq('ano', ano)
                .single()

              let faturaId = faturaExistente?.id

              if (!faturaId) {
                const { data: novaFatura } = await supabase
                  .from('faturas')
                  .insert({ user_id: user.id, cartao_id: cartao.id, mes, ano, status: 'aberta', valor_inicial: 0 })
                  .select('id')
                if (novaFatura?.length > 0) faturaId = novaFatura[0].id
              }

              if (faturaId) {
                await supabase.from('lancamentos').update({ cartao_id: cartao.id, fatura_id: faturaId }).eq('id', novoLancamentoId)
              }
            }
          }
        } else {
          const { data: conta } = await supabase.from('contas').select('saldo_atual').eq('id', payload.conta_id).single()
          if (conta) await supabase.from('contas').update({ saldo_atual: Number(conta.saldo_atual) - payload.valor }).eq('id', payload.conta_id)
        }

      } else if (payload.tipo === 'transferencia') {
        const { data: contaOrigem } = await supabase.from('contas').select('saldo_atual').eq('id', payload.conta_id).single()
        const { data: contaDestino } = await supabase.from('contas').select('saldo_atual').eq('id', payload.conta_destino_id).single()
        if (contaOrigem) await supabase.from('contas').update({ saldo_atual: Number(contaOrigem.saldo_atual) - payload.valor }).eq('id', payload.conta_id)
        if (contaDestino) await supabase.from('contas').update({ saldo_atual: Number(contaDestino.saldo_atual) + payload.valor }).eq('id', payload.conta_destino_id)
      }
    }

    const foiEntrada = payload.tipo === 'entrada' && !payload.recorrente && payload.valor >= 500
    resetForm()
    fetchMovimentacoes()
    fetchContas()
    setLoading(false)

    if (foiEntrada) {
      const { data: reservasComMeta } = await supabase
        .from('contas')
        .select('nome, saldo_atual, meta_valor')
        .eq('user_id', user.id)
        .eq('ativo', true)
        .eq('categoria_conta', 'reserva')
        .not('meta_valor', 'is', null)

      const { data: objetivosPendentes } = await supabase
        .from('objetivos')
        .select('nome, valor_alvo, valor_atual')
        .eq('user_id', user.id)
        .eq('ativo', true)
        .eq('concluido', false)
        .limit(3)

      const reservaEmergencia = reservasComMeta?.find(r => r.nome.toLowerCase().includes('emergencia') || r.nome.toLowerCase().includes('emergência'))
      const pctEmergencia = reservaEmergencia
        ? Math.round((Number(reservaEmergencia.saldo_atual) / Number(reservaEmergencia.meta_valor)) * 100)
        : 100

      const sugestaoAporte = Math.round(payload.valor * ((percentual_aporte || 10) / 100))

      if (pctEmergencia < 100 || (objetivosPendentes && objetivosPendentes.length > 0)) {
        setDadosDicaAporte({
          valorEntrada: payload.valor,
          sugestaoAporte,
          reservaEmergencia: pctEmergencia < 100 ? { ...reservaEmergencia, pct: pctEmergencia } : null,
          objetivos: objetivosPendentes || []
        })
        setShowDicaAporte(true)
      }
    }
  }

  const handleEdit = (m) => {
    setForm({
      data: m.data,
      descricao: m.descricao,
      categoria_id: m.categoria_id || '',
      valor: String(m.valor),
      tipo: m.tipo,
      forma_pagamento: m.forma_pagamento || 'pix',
      conta_id: m.conta_id,
      conta_destino_id: m.conta_destino_id || '',
      recorrente: m.recorrente || false,
      dia_recorrencia: m.dia_recorrencia ? String(m.dia_recorrencia) : '15'
    })
    setEditandoId(m.id)
    setShowForm(true)
  }

  const handleDelete = async (m) => {
    await supabase.from('lancamentos').delete().eq('id', m.id)
    // Reverter impacto no saldo se não for recorrente (já foi aplicado na hora)
    if (!m.recorrente) {
      if (m.tipo === 'entrada') {
        const conta = contas.find(c => c.id === m.conta_id)
        if (conta) await supabase.from('contas').update({ saldo_atual: Number(conta.saldo_atual) - Number(m.valor) }).eq('id', m.conta_id)
      } else if (m.tipo === 'saida') {
        const conta = contas.find(c => c.id === m.conta_id)
        if (conta) await supabase.from('contas').update({ saldo_atual: Number(conta.saldo_atual) + Number(m.valor) }).eq('id', m.conta_id)
      } else if (m.tipo === 'transferencia') {
        const { data: contaOrigem } = await supabase
          .from('contas').select('saldo_atual').eq('id', m.conta_id).single()
        const { data: contaDestino } = await supabase
          .from('contas').select('saldo_atual').eq('id', m.conta_destino_id).single()
        if (contaOrigem) {
          await supabase.from('contas')
            .update({ saldo_atual: Number(contaOrigem.saldo_atual) + Number(m.valor) })
            .eq('id', m.conta_id)
        }
        if (contaDestino) {
          await supabase.from('contas')
            .update({ saldo_atual: Number(contaDestino.saldo_atual) - Number(m.valor) })
            .eq('id', m.conta_destino_id)
        }
      }
    }
    fetchMovimentacoes()
    fetchContas()
  }

  const categoriasFiltradas = categorias.filter(c => c.tipo === form.tipo)
  const movimentacoesFiltradas = filtroTipo === 'todos' ? movimentacoes : movimentacoes.filter(m => m.tipo === filtroTipo)

  const iconePorTipo = { entrada: ArrowUpCircle, saida: ArrowDownCircle, transferencia: ArrowRightLeft }
  const corPorTipo = { entrada: 'text-green', saida: 'text-red', transferencia: 'text-indigo' }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-display text-2xl font-bold text-textprimary">Movimentações</h1>
          <p className="text-textsecondary text-sm mt-1">Entradas, saídas e transferências</p>
        </div>
        <button onClick={() => setShowForm(true)}
          className="hidden md:flex items-center gap-2 bg-indigo hover:bg-indigo/90 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors">
          <Plus size={16} /> Nova Movimentação
        </button>
      </div>

      <div className="flex gap-2 mb-4">
        {['todos', 'entrada', 'saida', 'transferencia'].map(t => (
          <button key={t} onClick={() => setFiltroTipo(t)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
              filtroTipo === t ? 'bg-indigo/15 text-indigo' : 'text-textsecondary hover:text-textprimary'
            }`}>
            {t === 'todos' ? 'Todas' : t === 'entrada' ? 'Entradas' : t === 'saida' ? 'Saídas' : 'Transferências'}
          </button>
        ))}
      </div>

      <div className="bg-surface border border-border rounded-2xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left px-3 md:px-6 py-3 md:py-4 text-textsecondary text-xs md:text-sm font-medium">Data</th>
              <th className="text-left px-3 md:px-6 py-3 md:py-4 text-textsecondary text-xs md:text-sm font-medium">Descrição</th>
              <th className="hidden md:table-cell text-left px-6 py-4 text-textsecondary text-sm font-medium">Conta</th>
              <th className="text-right px-3 md:px-6 py-3 md:py-4 text-textsecondary text-xs md:text-sm font-medium">Valor</th>
              <th className="px-3 md:px-6 py-3 md:py-4"></th>
            </tr>
          </thead>
          <tbody>
            {movimentacoesFiltradas.map(m => {
              const Icone = iconePorTipo[m.tipo]
              return (
                <tr key={m.id} className="border-b border-border/50 hover:bg-white/5 transition-colors">
                  <td className="px-3 md:px-6 py-3 md:py-4 text-textsecondary text-xs md:text-sm">
                    {m.recorrente ? `Todo dia ${m.dia_recorrencia}` : formatData(m.data)}
                  </td>
                  <td className="px-3 md:px-6 py-3 md:py-4 text-textprimary">
                    <div className="flex items-center gap-1 md:gap-2">
                      <Icone size={14} className={corPorTipo[m.tipo]} />
                      <span className="text-xs md:text-sm truncate max-w-[120px] md:max-w-none">{m.descricao}</span>
                      {m.categorias?.nome && <span className="hidden md:inline text-textsecondary text-xs">· {m.categorias.nome}</span>}
                    </div>
                  </td>
                  <td className="hidden md:table-cell px-6 py-4 text-textsecondary text-sm">
                    {m.tipo === 'transferencia' ? `${m.conta?.nome} → ${m.contaDestino?.nome}` : m.conta?.nome}
                  </td>
                  <td className={`px-3 md:px-6 py-3 md:py-4 text-right text-xs md:text-sm font-medium ${corPorTipo[m.tipo]}`}>
                    {m.tipo === 'entrada' ? '+' : m.tipo === 'saida' ? '-' : ''}{formatBRL(m.valor)}
                  </td>
                  <td className="px-3 md:px-6 py-3 md:py-4 text-right">
                    <div className="flex gap-2 justify-end">
                      <button onClick={() => handleEdit(m)} className="text-textsecondary hover:text-indigo transition-colors">
                        <Pencil size={15} />
                      </button>
                      <button onClick={() => handleDelete(m)} className="text-textsecondary hover:text-red transition-colors">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
            {movimentacoesFiltradas.length === 0 && (
              <tr><td colSpan={5} className="px-6 py-12 text-center text-textsecondary">Nenhuma movimentação encontrada</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/60 flex items-end md:items-center justify-center z-50">
          <div className="bg-surface border border-border rounded-t-2xl md:rounded-2xl p-6 md:p-8 w-full md:max-w-md max-h-[90vh] overflow-y-auto">
            <h2 className="font-display text-xl font-bold text-textprimary mb-6">
              {editandoId ? 'Editar Movimentação' : 'Nova Movimentação'}
            </h2>

            <div className="grid grid-cols-3 gap-2 mb-4">
              <button onClick={() => setForm({ ...form, tipo: 'saida', categoria_id: '' })}
                className={`py-3 rounded-xl text-sm font-medium transition-colors ${
                  form.tipo === 'saida' ? 'bg-red/15 text-red border border-red/30' : 'border border-border text-textsecondary'
                }`}>
                Saída
              </button>
              <button onClick={() => setForm({ ...form, tipo: 'entrada', categoria_id: '' })}
                className={`py-3 rounded-xl text-sm font-medium transition-colors ${
                  form.tipo === 'entrada' ? 'bg-green/15 text-green border border-green/30' : 'border border-border text-textsecondary'
                }`}>
                Entrada
              </button>
              <button onClick={() => setForm({ ...form, tipo: 'transferencia', categoria_id: '' })}
                className={`py-3 rounded-xl text-sm font-medium transition-colors ${
                  form.tipo === 'transferencia' ? 'bg-indigo/15 text-indigo border border-indigo/30' : 'border border-border text-textsecondary'
                }`}>
                Transferência
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-textsecondary text-sm mb-1 block">Descrição</label>
                <input value={form.descricao} onChange={e => setForm({ ...form, descricao: e.target.value })}
                  className="w-full bg-bg border border-border rounded-xl px-4 py-3 text-textprimary focus:outline-none focus:border-indigo"
                  placeholder={form.tipo === 'transferencia' ? 'Ex: Resgate da reserva' : 'Ex: Mercado, Salário...'} />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-textsecondary text-sm mb-1 block">Valor (R$)</label>
                  <input type="number" value={form.valor} onChange={e => setForm({ ...form, valor: e.target.value })}
                    className="w-full bg-bg border border-border rounded-xl px-4 py-3 text-textprimary focus:outline-none focus:border-indigo"
                    placeholder="0,00" />
                </div>
                {form.tipo !== 'transferencia' || !form.recorrente ? (
                  <div>
                    <label className="text-textsecondary text-sm mb-1 block">Data</label>
                    <input type="date" value={form.data} onChange={e => setForm({ ...form, data: e.target.value })}
                      className="w-full bg-bg border border-border rounded-xl px-4 py-3 text-textprimary focus:outline-none focus:border-indigo" />
                  </div>
                ) : <div />}
              </div>

              {form.tipo !== 'transferencia' && (
                <div>
                  <label className="text-textsecondary text-sm mb-1 block">Categoria</label>
                  <select value={form.categoria_id} onChange={e => setForm({ ...form, categoria_id: e.target.value })}
                    className="w-full bg-bg border border-border rounded-xl px-4 py-3 text-textprimary focus:outline-none focus:border-indigo">
                    <option value="">Selecione...</option>
                    {categoriasFiltradas.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                  </select>
                </div>
              )}

              {form.tipo === 'saida' && (
                <div>
                  <label className="text-textsecondary text-sm mb-1 block">Forma de pagamento</label>
                  <select value={form.forma_pagamento} onChange={e => setForm({ ...form, forma_pagamento: e.target.value })}
                    className="w-full bg-bg border border-border rounded-xl px-4 py-3 text-textprimary focus:outline-none focus:border-indigo">
                    {formasPagamento.map(f => <option key={f.valor} value={f.valor}>{f.label}</option>)}
                  </select>
                  {form.forma_pagamento === 'credito' && (
                    <p className="text-indigo text-xs mt-2">💳 Compra vinculada à fatura do cartão — não desconta saldo da conta.</p>
                  )}
                </div>
              )}

              <div>
                <label className="text-textsecondary text-sm mb-1 block">{form.tipo === 'transferencia' ? 'Conta de origem' : 'Conta'}</label>
                <select value={form.conta_id} onChange={e => setForm({ ...form, conta_id: e.target.value })}
                  className="w-full bg-bg border border-border rounded-xl px-4 py-3 text-textprimary focus:outline-none focus:border-indigo">
                  {contas.map(c => <option key={c.id} value={c.id}>{c.nome} ({c.categoria_conta})</option>)}
                </select>
              </div>

              {form.tipo === 'transferencia' && (
                <>
                  <div>
                    <label className="text-textsecondary text-sm mb-1 block">Conta de destino</label>
                    <select value={form.conta_destino_id} onChange={e => setForm({ ...form, conta_destino_id: e.target.value })}
                      className="w-full bg-bg border border-border rounded-xl px-4 py-3 text-textprimary focus:outline-none focus:border-indigo">
                      <option value="">Selecione...</option>
                      {contas.map(c => <option key={c.id} value={c.id}>{c.nome} ({c.categoria_conta})</option>)}
                    </select>
                  </div>

                  <div className="flex gap-2">
                    <button onClick={() => setForm({ ...form, recorrente: false })}
                      className={`flex-1 py-3 rounded-xl text-sm font-medium transition-colors ${
                        !form.recorrente ? 'bg-indigo/15 text-indigo border border-indigo/30' : 'border border-border text-textsecondary'
                      }`}>
                      Única vez
                    </button>
                    <button onClick={() => setForm({ ...form, recorrente: true })}
                      className={`flex-1 py-3 rounded-xl text-sm font-medium transition-colors ${
                        form.recorrente ? 'bg-indigo/15 text-indigo border border-indigo/30' : 'border border-border text-textsecondary'
                      }`}>
                      Recorrente
                    </button>
                  </div>

                  {form.recorrente && (
                    <div>
                      <label className="text-textsecondary text-sm mb-1 block">Dia do mês</label>
                      <input type="number" min="1" max="31" value={form.dia_recorrencia}
                        onChange={e => setForm({ ...form, dia_recorrencia: e.target.value })}
                        className="w-full bg-bg border border-border rounded-xl px-4 py-3 text-textprimary focus:outline-none focus:border-indigo" />
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={resetForm}
                className="flex-1 border border-border text-textsecondary hover:text-textprimary py-3 rounded-xl text-sm font-medium transition-colors">
                Cancelar
              </button>
              <button onClick={handleSave}
                disabled={loading || !form.descricao || !form.valor || !form.conta_id || (form.tipo === 'transferencia' && !form.conta_destino_id)}
                className="flex-1 bg-indigo hover:bg-indigo/90 text-white py-3 rounded-xl text-sm font-medium transition-colors disabled:opacity-50">
                {loading ? 'Salvando...' : editandoId ? 'Atualizar' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Modal: Dica de Aporte */}
      {showDicaAporte && dadosDicaAporte && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <div className="bg-surface border border-green/30 rounded-2xl p-8 w-full max-w-md">
            <div className="text-center mb-6">
              <span className="text-4xl">💰</span>
              <h2 className="font-display text-xl font-bold text-textprimary mt-3">Entrada registrada!</h2>
              <p className="text-textsecondary text-sm mt-1">Que tal guardar parte agora?</p>
            </div>

            <div className="bg-bg rounded-xl p-4 mb-4">
              <p className="text-textsecondary text-xs mb-1">Sugestão de aporte (10% da entrada)</p>
              <p className="font-display text-3xl font-bold text-green">
                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(dadosDicaAporte.sugestaoAporte)}
              </p>
            </div>

            {dadosDicaAporte.reservaEmergencia && (
              <div className="mb-3 bg-indigo/10 border border-indigo/20 rounded-xl px-4 py-3">
                <p className="text-indigo text-xs font-medium">🛡️ Reserva de Emergência</p>
                <p className="text-textsecondary text-xs mt-0.5">
                  Está em {dadosDicaAporte.reservaEmergencia.pct}% da meta — um bom momento pra reforçar
                </p>
              </div>
            )}

            {dadosDicaAporte.objetivos.length > 0 && (
              <div className="mb-4 space-y-2">
                {dadosDicaAporte.objetivos.slice(0, 2).map(o => {
                  const pct = Math.round((Number(o.valor_atual) / Number(o.valor_alvo)) * 100)
                  return (
                    <div key={o.nome} className="bg-yellow/10 border border-yellow/20 rounded-xl px-4 py-3">
                      <p className="text-yellow text-xs font-medium">🎯 {o.nome}</p>
                      <p className="text-textsecondary text-xs mt-0.5">{pct}% do objetivo atingido</p>
                    </div>
                  )
                })}
              </div>
            )}

            <p className="text-textsecondary text-xs text-center mb-4">
              Guarde agora em Movimentações → Transferência para a caixinha desejada
            </p>

            <button onClick={() => setShowDicaAporte(false)}
              className="w-full bg-indigo hover:bg-indigo/90 text-white py-3 rounded-xl text-sm font-medium transition-colors">
              Entendido
            </button>
          </div>
        </div>
      )}
      <FAB onClick={() => setShowForm(true)} label="Nova Movimentação" />
    </div>
  )
}

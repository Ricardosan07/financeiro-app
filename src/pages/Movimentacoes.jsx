import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useCategorias } from '../hooks/useCategorias'
import { useConfig } from '../contexts/ConfigContext'
import { Plus, Trash2, Pencil, ArrowUpCircle, ArrowDownCircle, ArrowRightLeft, ChevronDown, ChevronRight } from 'lucide-react'
import FAB from '../components/FAB'

const formatBRL = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
const formatData = (d) => new Date(d + 'T00:00:00').toLocaleDateString('pt-BR')

// Data local sem conversão UTC — evita adiantar um dia para fusos UTC-
const dataHojeLocal = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

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

  const [cartoes, setCartoes] = useState([])

  const vazio = {
    data: dataHojeLocal(),
    descricao: '', categoria_id: '', valor: '', tipo: 'saida',
    forma_pagamento: 'pix', conta_id: '', conta_destino_id: '',
    recorrente: false, dia_recorrencia: '15',
    num_parcelas: '1',
    cartao_id: ''
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
      const contaLivreDefault = data.find(c => c.categoria_conta === 'livre')?.id || data[0].id
      setForm(f => ({ ...f, conta_id: contaLivreDefault }))
    }
  }

  const fetchCartoes = async () => {
    const { data } = await supabase
      .from('cartoes')
      .select('*')
      .eq('user_id', user.id)
      .eq('ativo', true)
    setCartoes(data || [])
  }

  useEffect(() => { fetchMovimentacoes(); fetchContas(); fetchCartoes() }, [])

  const resetForm = () => {
    const contaLivreDefault = contas.find(c => c.categoria_conta === 'livre')?.id || contas[0]?.id || ''
    setForm({
      ...vazio,
      conta_id: contaLivreDefault,
      num_parcelas: '1'
    })
    setEditandoId(null)
    setShowForm(false)
  }

  const handleSave = async () => {
    setLoading(true)

    const payload = {
      data: form.recorrente ? dataHojeLocal() : form.data,
      descricao: form.descricao,
      valor: parseFloat(form.valor),
      tipo: form.tipo,
      categoria_id: form.tipo !== 'transferencia' ? (form.categoria_id || null) : null,
      forma_pagamento: form.tipo === 'saida' ? form.forma_pagamento : null,
      // Se crédito, conta_id será a conta de pagamento do cartão (definida depois de buscar o cartão)
      conta_id: form.tipo === 'transferencia' ? form.conta_id
        : form.forma_pagamento === 'credito' ? null
        : form.conta_id,
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
      // Lançamentos futuros NÃO atualizam saldo_atual — entram apenas na projeção
      const dataHoje = dataHojeLocal()
      if (payload.tipo === 'entrada' && payload.data <= dataHoje) {
        const { data: conta } = await supabase.from('contas').select('saldo_atual').eq('id', payload.conta_id).single()
        if (conta) await supabase.from('contas').update({ saldo_atual: Number(conta.saldo_atual) + payload.valor }).eq('id', payload.conta_id)

      } else if (payload.tipo === 'saida') {
        // Crédito: NÃO desconta saldo — vincula à fatura e distribui parcelas pelos meses seguintes
        if (payload.forma_pagamento === 'credito') {
          if (novoLancamentoId) {
            // Usar cartão selecionado no formulário, ou buscar o primeiro ativo
            let cartaoUsado = null

            if (form.cartao_id) {
              const { data: cartaoSelecionado } = await supabase
                .from('cartoes').select('*').eq('id', form.cartao_id).single()
              cartaoUsado = cartaoSelecionado
            }

            if (!cartaoUsado) {
              const { data: cartoesAtivos } = await supabase
                .from('cartoes').select('*').eq('user_id', user.id).eq('ativo', true).limit(1)
              cartaoUsado = cartoesAtivos?.[0] || null
            }

            if (cartaoUsado) {
              // Atualizar conta_id para a conta de pagamento do cartão
              await supabase.from('lancamentos').update({
                conta_id: cartaoUsado.conta_pagamento_id
              }).eq('id', novoLancamentoId)

              const cartao = cartaoUsado
              const numParcelas = parseInt(form.num_parcelas) || 1
              const valorParcela = numParcelas > 1
                ? payload.valor / numParcelas
                : payload.valor

              const dt = new Date(payload.data + 'T00:00:00')
              const dia = dt.getDate()
              let mesBase = dt.getMonth() + 1
              let anoBase = dt.getFullYear()
              if (dia > cartao.dia_fechamento) {
                mesBase += 1
                if (mesBase > 12) { mesBase = 1; anoBase += 1 }
              }

              const getOuCriarFatura = async (mes, ano) => {
                // maybeSingle() retorna null sem erro quando não encontra resultado
                const { data: fExistente } = await supabase
                  .from('faturas').select('id')
                  .eq('cartao_id', cartao.id).eq('mes', mes).eq('ano', ano)
                  .maybeSingle()
                if (fExistente) return fExistente.id

                const { data: novaF, error: errF } = await supabase
                  .from('faturas')
                  .insert({ user_id: user.id, cartao_id: cartao.id, mes, ano, status: 'aberta', valor_inicial: 0 })
                  .select('id')
                  .maybeSingle()
                return novaF?.id || null
              }

              // 1ª parcela: atualizar o lançamento já criado com o valor da parcela
              const faturaId1 = await getOuCriarFatura(mesBase, anoBase)
              if (faturaId1) {
                await supabase.from('lancamentos').update({
                  cartao_id: cartao.id,
                  fatura_id: faturaId1,
                  valor: valorParcela,
                  descricao: numParcelas > 1
                    ? `${payload.descricao} (1/${numParcelas})`
                    : payload.descricao
                }).eq('id', novoLancamentoId)
              }

              // Para parceladas: registrar no módulo Parcelas para projeção dos meses futuros
              // (meses 2-N são projetados via useProjecao a partir da tabela parcelas, não via lancamentos individuais)
              if (numParcelas > 1) {
                const totalMesesOffset = (mesBase - 1) + (numParcelas - 1)
                const mesFim = (totalMesesOffset % 12) + 1
                const anoFim = anoBase + Math.floor(totalMesesOffset / 12)

                const { data: novaParcela } = await supabase.from('parcelas').insert({
                  user_id: user.id,
                  descricao: payload.descricao,
                  valor_total: payload.valor,
                  num_parcelas: numParcelas,
                  valor_parcela: valorParcela,
                  mes_inicio: mesBase,
                  ano_inicio: anoBase,
                  mes_fim: mesFim,
                  ano_fim: anoFim,
                  dia_pagamento: 5,
                  forma: 'cartao',
                  cartao_id: cartao.id,
                  ativo: true
                }).select('id').maybeSingle()

                // Vincular o lançamento da 1ª parcela ao registro de parcela pelo ID
                // (evita dedup frágil por descrição em useCartao)
                if (novaParcela?.id && novoLancamentoId) {
                  await supabase.from('lancamentos')
                    .update({ parcela_id: novaParcela.id })
                    .eq('id', novoLancamentoId)
                }
              }
            }
          }
        } else if (payload.data <= dataHoje) {
          const { data: conta } = await supabase.from('contas').select('saldo_atual').eq('id', payload.conta_id).single()
          if (conta) await supabase.from('contas').update({ saldo_atual: Number(conta.saldo_atual) - payload.valor }).eq('id', payload.conta_id)
        }

      } else if (payload.tipo === 'transferencia' && payload.data <= dataHoje) {
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
      dia_recorrencia: m.dia_recorrencia ? String(m.dia_recorrencia) : '15',
      cartao_id: m.cartao_id || ''
    })
    setEditandoId(m.id)
    setShowForm(true)
  }

  const handleDelete = async (m) => {
    await supabase.from('lancamentos').delete().eq('id', m.id)
    // Reverter impacto no saldo se não for recorrente (já foi aplicado na hora)
    if (!m.recorrente && m.data <= dataHojeLocal()) {
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

  const [expandidos, setExpandidos] = useState(new Set())

  const categoriasFiltradas = categorias.filter(c => c.tipo === form.tipo)
  const movimentacoesFiltradas = filtroTipo === 'todos' ? movimentacoes : movimentacoes.filter(m => m.tipo === filtroTipo)

  const iconePorTipo = { entrada: ArrowUpCircle, saida: ArrowDownCircle, transferencia: ArrowRightLeft }
  const corPorTipo = { entrada: 'text-green', saida: 'text-red', transferencia: 'text-indigo' }

  // Agrupar visualmente lançamentos do mesmo parcela_id numa única linha expansível
  const movimentacoesAgrupadas = (() => {
    const result = []
    const gruposMapa = {}
    for (const m of movimentacoesFiltradas) {
      if (m.parcela_id) {
        if (!gruposMapa[m.parcela_id]) {
          gruposMapa[m.parcela_id] = {
            _grupo: true,
            parcela_id: m.parcela_id,
            descricao: m.descricao.replace(/ \(\d+\/\d+\)$/, ''),
            valor_parcela: m.valor,
            conta: m.conta,
            tipo: m.tipo,
            items: []
          }
          result.push(gruposMapa[m.parcela_id])
        }
        gruposMapa[m.parcela_id].items.push(m)
      } else {
        result.push(m)
      }
    }
    return result
  })()

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
            {movimentacoesAgrupadas.map((item) => {
              if (item._grupo) {
                const expandido = expandidos.has(item.parcela_id)
                const Icone = iconePorTipo[item.tipo]
                const toggleGrupo = () => setExpandidos(prev => {
                  const n = new Set(prev)
                  n.has(item.parcela_id) ? n.delete(item.parcela_id) : n.add(item.parcela_id)
                  return n
                })
                return (
                  <React.Fragment key={`grupo-${item.parcela_id}`}>
                    <tr className="border-b border-border/50 bg-indigo/5 hover:bg-indigo/10 transition-colors cursor-pointer" onClick={toggleGrupo}>
                      <td className="px-3 md:px-6 py-3 md:py-4 text-textsecondary text-xs md:text-sm">
                        {item.items[0] ? formatData(item.items[0].data) : '—'}
                      </td>
                      <td className="px-3 md:px-6 py-3 md:py-4 text-textprimary">
                        <div className="flex items-center gap-1 md:gap-2">
                          <Icone size={14} className={corPorTipo[item.tipo]} />
                          <span className="text-xs md:text-sm truncate max-w-[90px] md:max-w-none">{item.descricao}</span>
                          <span className="text-xs bg-indigo/15 text-indigo px-2 py-0.5 rounded-full flex-shrink-0">
                            {item.items.length}x parcelado
                          </span>
                          {expandido
                            ? <ChevronDown size={13} className="text-textsecondary flex-shrink-0" />
                            : <ChevronRight size={13} className="text-textsecondary flex-shrink-0" />}
                        </div>
                      </td>
                      <td className="hidden md:table-cell px-6 py-4 text-textsecondary text-sm">{item.conta?.nome}</td>
                      <td className={`px-3 md:px-6 py-3 md:py-4 text-right text-xs md:text-sm font-medium ${corPorTipo[item.tipo]}`}>
                        -{formatBRL(item.valor_parcela)}/mês
                      </td>
                      <td className="px-3 md:px-6 py-3 md:py-4" />
                    </tr>
                    {expandido && item.items.map(m => (
                      <tr key={m.id} className="border-b border-border/30 hover:bg-white/5 transition-colors">
                        <td className="pl-6 md:pl-10 pr-3 md:pr-6 py-2 md:py-3 text-textsecondary text-xs">{formatData(m.data)}</td>
                        <td className="px-3 md:px-6 py-2 md:py-3">
                          <span className="text-xs text-textsecondary pl-2 md:pl-4">{m.descricao}</span>
                        </td>
                        <td className="hidden md:table-cell px-6 py-2 md:py-3 text-textsecondary text-xs">{m.conta?.nome}</td>
                        <td className="px-3 md:px-6 py-2 md:py-3 text-right text-xs font-medium text-red">
                          -{formatBRL(m.valor)}
                        </td>
                        <td className="px-3 md:px-6 py-2 md:py-3 text-right">
                          <div className="flex gap-2 justify-end">
                            <button onClick={e => { e.stopPropagation(); handleEdit(m) }} className="text-textsecondary hover:text-indigo transition-colors">
                              <Pencil size={13} />
                            </button>
                            <button onClick={e => { e.stopPropagation(); handleDelete(m) }} className="text-textsecondary hover:text-red transition-colors">
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </React.Fragment>
                )
              }

              const Icone = iconePorTipo[item.tipo]
              return (
                <tr key={item.id} className="border-b border-border/50 hover:bg-white/5 transition-colors">
                  <td className="px-3 md:px-6 py-3 md:py-4 text-textsecondary text-xs md:text-sm">
                    {item.recorrente ? `Todo dia ${item.dia_recorrencia}` : formatData(item.data)}
                  </td>
                  <td className="px-3 md:px-6 py-3 md:py-4 text-textprimary">
                    <div className="flex items-center gap-1 md:gap-2">
                      <Icone size={14} className={corPorTipo[item.tipo]} />
                      <span className="text-xs md:text-sm truncate max-w-[120px] md:max-w-none">{item.descricao}</span>
                      {item.categorias?.nome && <span className="hidden md:inline text-textsecondary text-xs">· {item.categorias.nome}</span>}
                    </div>
                  </td>
                  <td className="hidden md:table-cell px-6 py-4 text-textsecondary text-sm">
                    {item.tipo === 'transferencia' ? `${item.conta?.nome} → ${item.contaDestino?.nome}` : item.conta?.nome}
                  </td>
                  <td className={`px-3 md:px-6 py-3 md:py-4 text-right text-xs md:text-sm font-medium ${corPorTipo[item.tipo]}`}>
                    {item.tipo === 'entrada' ? '+' : item.tipo === 'saida' ? '-' : ''}{formatBRL(item.valor)}
                  </td>
                  <td className="px-3 md:px-6 py-3 md:py-4 text-right">
                    <div className="flex gap-2 justify-end">
                      <button onClick={() => handleEdit(item)} className="text-textsecondary hover:text-indigo transition-colors">
                        <Pencil size={15} />
                      </button>
                      <button onClick={() => handleDelete(item)} className="text-textsecondary hover:text-red transition-colors">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
            {movimentacoesAgrupadas.length === 0 && (
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
                <>
                  <div>
                    <label className="text-textsecondary text-sm mb-1 block">Forma de pagamento</label>
                    <select value={form.forma_pagamento} onChange={e => setForm({ ...form, forma_pagamento: e.target.value, num_parcelas: '1' })}
                      className="w-full bg-bg border border-border rounded-xl px-4 py-3 text-textprimary focus:outline-none focus:border-indigo">
                      {formasPagamento.map(f => <option key={f.valor} value={f.valor}>{f.label}</option>)}
                    </select>
                  </div>

                  {form.forma_pagamento === 'credito' && (
                    <div>
                      <label className="text-textsecondary text-sm mb-1 block">Número de parcelas</label>
                      <div className="flex gap-2 flex-wrap">
                        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'].map(n => (
                          <button
                            key={n}
                            type="button"
                            onClick={() => setForm({ ...form, num_parcelas: n })}
                            className={`w-10 h-10 rounded-xl text-sm font-medium transition-colors ${
                              form.num_parcelas === n
                                ? 'bg-indigo text-white'
                                : 'bg-bg border border-border text-textsecondary hover:border-indigo'
                            }`}
                          >
                            {n}
                          </button>
                        ))}
                        <input
                          type="number"
                          min="1"
                          max="60"
                          placeholder="+"
                          className="w-14 h-10 rounded-xl text-sm text-center bg-bg border border-border text-textsecondary focus:outline-none focus:border-indigo"
                          onChange={e => setForm({ ...form, num_parcelas: e.target.value })}
                        />
                      </div>
                      {parseInt(form.num_parcelas) > 1 && form.valor && (
                        <div className="mt-2 bg-indigo/10 border border-indigo/20 rounded-xl px-4 py-3">
                          <p className="text-textsecondary text-xs">Valor por parcela</p>
                          <p className="text-indigo font-display font-bold text-lg">
                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(parseFloat(form.valor) / parseInt(form.num_parcelas))}
                          </p>
                          <p className="text-textsecondary text-xs mt-1">
                            Uma parcela entra na fatura deste mês. As demais entram nos meses seguintes.
                          </p>
                        </div>
                      )}
                      {parseInt(form.num_parcelas) === 1 && (
                        <p className="text-textsecondary text-xs mt-2">💳 À vista no crédito — entra na fatura deste mês.</p>
                      )}
                    </div>
                  )}
                </>
              )}

              {/* Campo Conta (débito/pix/transferência) ou Cartão (crédito) */}
              {form.tipo !== 'transferencia' && form.forma_pagamento === 'credito' ? (
                <div>
                  <label className="text-textsecondary text-sm mb-1 block">Cartão</label>
                  <select
                    value={form.cartao_id || ''}
                    onChange={e => setForm({ ...form, cartao_id: e.target.value })}
                    className="w-full bg-bg border border-border rounded-xl px-4 py-3 text-textprimary focus:outline-none focus:border-indigo"
                  >
                    <option value="">Selecione o cartão...</option>
                    {cartoes.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.nome} · Fecha dia {c.dia_fechamento}
                      </option>
                    ))}
                  </select>
                  {cartoes.length === 0 && (
                    <p className="text-yellow text-xs mt-1">
                      ⚠ Nenhum cartão cadastrado. Vá em Cartão → + Novo para cadastrar.
                    </p>
                  )}
                </div>
              ) : (
                <div>
                  <label className="text-textsecondary text-sm mb-1 block">{form.tipo === 'transferencia' ? 'Conta de origem' : 'Conta'}</label>
                  <select value={form.conta_id} onChange={e => setForm({ ...form, conta_id: e.target.value })}
                    className="w-full bg-bg border border-border rounded-xl px-4 py-3 text-textprimary focus:outline-none focus:border-indigo">
                    {contas
                      .filter(c => form.tipo === 'transferencia' || c.categoria_conta === 'livre' || c.categoria_conta === 'reserva')
                      .map(c => <option key={c.id} value={c.id}>{c.nome} ({c.categoria_conta})</option>)}
                  </select>
                </div>
              )}

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

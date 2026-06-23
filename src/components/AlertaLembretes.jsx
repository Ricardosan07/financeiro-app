import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { Bell, X, ArrowRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

export default function AlertaLembretes() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [lembretesVencidos, setLembretesVencidos] = useState([])
  const [fechado, setFechado] = useState(false)

  useEffect(() => {
    if (!user) return
    const hoje = new Date().toISOString().split('T')[0]
    supabase
      .from('lembretes')
      .select('id, descricao, data, valor')
      .eq('user_id', user.id)
      .eq('concluido', false)
      .lt('data', hoje)
      .order('data', { ascending: true })
      .then(({ data }) => {
        if (data && data.length > 0) setLembretesVencidos(data)
      })
  }, [user])

  if (fechado || lembretesVencidos.length === 0) return null

  const formatData = (d) => new Date(d + 'T00:00:00').toLocaleDateString('pt-BR')
  const formatBRL = (v) => v ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v) : null

  return (
    <div className="bg-red/10 border border-red/30 rounded-2xl p-4 mb-4">
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3 flex-1">
          <Bell size={18} className="text-red flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-red font-medium text-sm">
              {lembretesVencidos.length === 1
                ? '1 lembrete vencido'
                : `${lembretesVencidos.length} lembretes vencidos`}
            </p>
            <div className="mt-2 space-y-1">
              {lembretesVencidos.slice(0, 3).map(l => (
                <div key={l.id} className="flex items-center gap-2 text-xs text-textsecondary">
                  <span className="w-1 h-1 rounded-full bg-red flex-shrink-0" />
                  <span className="text-textprimary">{l.descricao}</span>
                  <span>·</span>
                  <span className="text-red">{formatData(l.data)}</span>
                  {l.valor && <span>· {formatBRL(l.valor)}</span>}
                </div>
              ))}
              {lembretesVencidos.length > 3 && (
                <p className="text-xs text-textsecondary">+{lembretesVencidos.length - 3} outros</p>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 ml-4">
          <button onClick={() => navigate('/agenda')}
            className="flex items-center gap-1 text-red text-xs font-medium hover:underline">
            Ver agenda <ArrowRight size={12} />
          </button>
          <button onClick={() => setFechado(true)}
            className="text-textsecondary hover:text-textprimary transition-colors">
            <X size={16} />
          </button>
        </div>
      </div>
    </div>
  )
}

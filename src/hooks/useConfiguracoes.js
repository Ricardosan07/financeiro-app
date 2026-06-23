import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

const DEFAULTS = {
  nome: '',
  threshold_saldo_baixo: 500,
  percentual_aporte: 10,
  dia_recebimento_1: 2,
  dia_recebimento_2: 15,
  meta_fatura_credito: null,
}

export function useConfiguracoes() {
  const { user } = useAuth()
  const [config, setConfig] = useState(DEFAULTS)
  const [loading, setLoading] = useState(true)

  const carregar = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('configuracoes')
      .select('*')
      .eq('user_id', user.id)
      .single()

    if (data) setConfig({ ...DEFAULTS, ...data })
    else setConfig(DEFAULTS)
    setLoading(false)
  }

  const salvar = async (novaConfig) => {
    const payload = { ...novaConfig, user_id: user.id, atualizado_em: new Date().toISOString() }
    const { error } = await supabase
      .from('configuracoes')
      .upsert(payload, { onConflict: 'user_id' })

    if (!error) {
      setConfig(novaConfig)
      return true
    }
    return false
  }

  useEffect(() => { if (user) carregar() }, [user])

  return { config, loading, salvar, recarregar: carregar }
}

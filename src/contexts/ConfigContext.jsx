import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthContext'

const ConfigContext = createContext({
  threshold_saldo_baixo: 500,
  percentual_aporte: 10,
  dia_recebimento_1: 2,
  dia_recebimento_2: 15,
  meta_fatura_credito: null,
  nome: '',
})

export function ConfigProvider({ children }) {
  const { user } = useAuth()
  const [config, setConfig] = useState({
    threshold_saldo_baixo: 500,
    percentual_aporte: 10,
    dia_recebimento_1: 2,
    dia_recebimento_2: 15,
    meta_fatura_credito: null,
    nome: '',
  })

  useEffect(() => {
    if (!user) return
    supabase
      .from('configuracoes')
      .select('*')
      .eq('user_id', user.id)
      .single()
      .then(({ data }) => { if (data) setConfig(prev => ({ ...prev, ...data })) })
  }, [user])

  return <ConfigContext.Provider value={config}>{children}</ConfigContext.Provider>
}

export const useConfig = () => useContext(ConfigContext)

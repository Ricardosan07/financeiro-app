import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { categoriasPadrao } from '../lib/categoriasPadrao'

export function useCategorias() {
  const { user } = useAuth()
  const [categorias, setCategorias] = useState([])
  const [loading, setLoading] = useState(true)

  const carregar = async () => {
    setLoading(true)
    let { data } = await supabase.from('categorias').select('*').eq('user_id', user.id).order('nome')

    if (!data || data.length === 0) {
      const inserts = categoriasPadrao.map(c => ({ ...c, user_id: user.id }))
      await supabase.from('categorias').insert(inserts)
      const result = await supabase.from('categorias').select('*').eq('user_id', user.id).order('nome')
      data = result.data
    }

    setCategorias(data || [])
    setLoading(false)
  }

  useEffect(() => { if (user) carregar() }, [user])

  return { categorias, loading, recarregar: carregar }
}

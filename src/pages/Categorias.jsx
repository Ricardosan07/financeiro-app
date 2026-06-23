import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useCategorias } from '../hooks/useCategorias'
import { Plus, Trash2, Pencil } from 'lucide-react'

const coresDisponiveis = ['#6366F1', '#22C55E', '#EF4444', '#EAB308', '#EC4899', '#06B6D4', '#8B5CF6', '#64748B']

export default function Categorias() {
  const { user } = useAuth()
  const { categorias, recarregar } = useCategorias()
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [editandoId, setEditandoId] = useState(null)
  const [form, setForm] = useState({ nome: '', tipo: 'saida', grupo: '', cor: coresDisponiveis[0] })

  const resetForm = () => {
    setForm({ nome: '', tipo: 'saida', grupo: '', cor: coresDisponiveis[0] })
    setEditandoId(null)
    setShowForm(false)
  }

  const handleSave = async () => {
    setLoading(true)
    const payload = { nome: form.nome, tipo: form.tipo, grupo: form.grupo || null, cor: form.cor }

    let error
    if (editandoId) {
      const result = await supabase.from('categorias').update(payload).eq('id', editandoId)
      error = result.error
    } else {
      const result = await supabase.from('categorias').insert({ ...payload, user_id: user.id })
      error = result.error
    }

    if (error) {
      alert('Erro ao salvar categoria: ' + error.message)
      setLoading(false)
      return
    }

    resetForm()
    recarregar()
    setLoading(false)
  }

  const handleEdit = (c) => {
    setForm({ nome: c.nome, tipo: c.tipo, grupo: c.grupo || '', cor: c.cor || coresDisponiveis[0] })
    setEditandoId(c.id)
    setShowForm(true)
  }

  const handleDelete = async (id) => {
    if (!confirm('Excluir esta categoria? Lançamentos antigos vão ficar sem categoria.')) return
    await supabase.from('categorias').delete().eq('id', id)
    recarregar()
  }

  const entradas = categorias.filter(c => c.tipo === 'entrada')
  const saidas = categorias.filter(c => c.tipo === 'saida')

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-display text-2xl font-bold text-textprimary">Categorias</h1>
          <p className="text-textsecondary text-sm mt-1">Organize suas entradas e saídas</p>
        </div>
        <button onClick={() => setShowForm(true)}
          className="flex items-center gap-2 bg-indigo hover:bg-indigo/90 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors">
          <Plus size={16} /> Nova Categoria
        </button>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div>
          <h2 className="text-textsecondary text-sm font-medium mb-3">Saídas</h2>
          <div className="space-y-2">
            {saidas.map(c => (
              <div key={c.id} className="bg-surface border border-border rounded-xl px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="w-3 h-3 rounded-full" style={{ backgroundColor: c.cor || '#6366F1' }} />
                  <span className="text-textprimary text-sm">{c.nome}</span>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => handleEdit(c)} className="text-textsecondary hover:text-indigo transition-colors">
                    <Pencil size={14} />
                  </button>
                  <button onClick={() => handleDelete(c.id)} className="text-textsecondary hover:text-red transition-colors">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div>
          <h2 className="text-textsecondary text-sm font-medium mb-3">Entradas</h2>
          <div className="space-y-2">
            {entradas.map(c => (
              <div key={c.id} className="bg-surface border border-border rounded-xl px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="w-3 h-3 rounded-full" style={{ backgroundColor: c.cor || '#22C55E' }} />
                  <span className="text-textprimary text-sm">{c.nome}</span>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => handleEdit(c)} className="text-textsecondary hover:text-indigo transition-colors">
                    <Pencil size={14} />
                  </button>
                  <button onClick={() => handleDelete(c.id)} className="text-textsecondary hover:text-red transition-colors">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/60 flex items-end md:items-center justify-center z-50">
          <div className="bg-surface border border-border rounded-t-2xl md:rounded-2xl p-6 md:p-8 w-full md:max-w-md max-h-[90vh] overflow-y-auto">
            <h2 className="font-display text-xl font-bold text-textprimary mb-6">
              {editandoId ? 'Editar Categoria' : 'Nova Categoria'}
            </h2>
            <div className="space-y-4">
              <div>
                <label className="text-textsecondary text-sm mb-1 block">Nome</label>
                <input value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })}
                  className="w-full bg-bg border border-border rounded-xl px-4 py-3 text-textprimary focus:outline-none focus:border-indigo"
                  placeholder="Ex: Pet, Educação, Assinaturas..." />
              </div>
              <div className="flex gap-2">
                <button onClick={() => setForm({ ...form, tipo: 'saida' })}
                  className={`flex-1 py-3 rounded-xl text-sm font-medium transition-colors ${
                    form.tipo === 'saida' ? 'bg-red/15 text-red border border-red/30' : 'border border-border text-textsecondary'
                  }`}>
                  Saída
                </button>
                <button onClick={() => setForm({ ...form, tipo: 'entrada' })}
                  className={`flex-1 py-3 rounded-xl text-sm font-medium transition-colors ${
                    form.tipo === 'entrada' ? 'bg-green/15 text-green border border-green/30' : 'border border-border text-textsecondary'
                  }`}>
                  Entrada
                </button>
              </div>
              <div>
                <label className="text-textsecondary text-sm mb-1 block">Cor</label>
                <div className="flex gap-2 flex-wrap">
                  {coresDisponiveis.map(cor => (
                    <button key={cor} onClick={() => setForm({ ...form, cor })}
                      className={`w-8 h-8 rounded-full transition-transform ${form.cor === cor ? 'scale-110 ring-2 ring-white' : ''}`}
                      style={{ backgroundColor: cor }} />
                  ))}
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={resetForm}
                className="flex-1 border border-border text-textsecondary hover:text-textprimary py-3 rounded-xl text-sm font-medium transition-colors">
                Cancelar
              </button>
              <button onClick={handleSave} disabled={loading || !form.nome}
                className="flex-1 bg-indigo hover:bg-indigo/90 text-white py-3 rounded-xl text-sm font-medium transition-colors disabled:opacity-50">
                {loading ? 'Salvando...' : editandoId ? 'Atualizar' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

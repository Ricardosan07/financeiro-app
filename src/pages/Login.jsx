import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'

export default function Login() {
  const { signIn, signUp } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSignUp, setIsSignUp] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = isSignUp ? await signUp(email, password) : await signIn(email, password)
    if (error) setError(error.message)
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="font-display text-3xl font-bold text-textprimary">Financeiro</h1>
          <p className="text-textsecondary mt-2">Controle real. Sem ilusões.</p>
        </div>

        <div className="bg-surface border border-border rounded-2xl p-8">
          <h2 className="font-display text-xl font-semibold text-textprimary mb-6">
            {isSignUp ? 'Criar conta' : 'Entrar'}
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-textsecondary text-sm mb-1 block">E-mail</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full bg-bg border border-border rounded-xl px-4 py-3 text-textprimary focus:outline-none focus:border-indigo transition-colors"
                placeholder="seu@email.com"
                required
              />
            </div>
            <div>
              <label className="text-textsecondary text-sm mb-1 block">Senha</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full bg-bg border border-border rounded-xl px-4 py-3 text-textprimary focus:outline-none focus:border-indigo transition-colors"
                placeholder="••••••••"
                required
              />
            </div>

            {error && (
              <p className="text-red text-sm bg-red/10 border border-red/20 rounded-lg px-4 py-3">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-indigo hover:bg-indigo/90 text-white font-semibold py-3 rounded-xl transition-colors disabled:opacity-50"
            >
              {loading ? 'Aguarde...' : isSignUp ? 'Criar conta' : 'Entrar'}
            </button>
          </form>

          <p className="text-textsecondary text-sm text-center mt-6">
            {isSignUp ? 'Já tem conta?' : 'Não tem conta?'}{' '}
            <button
              onClick={() => setIsSignUp(!isSignUp)}
              className="text-indigo hover:underline"
            >
              {isSignUp ? 'Entrar' : 'Criar conta'}
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}

import { NavLink } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { LayoutDashboard, CreditCard, ArrowLeftRight, Repeat, Building2, Settings, LogOut, CalendarDays, Calculator, Tag, Layers, Bell, Target } from 'lucide-react'

const links = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/simulador', icon: Calculator, label: 'Simulador' },
  { to: '/cartao', icon: CreditCard, label: 'Cartão' },
  { to: '/mensal', icon: CalendarDays, label: 'Visão Mensal' },
  { to: '/movimentacoes', icon: ArrowLeftRight, label: 'Movimentações' },
  { to: '/agenda', icon: Bell, label: 'Agenda' },
  { to: '/objetivos', icon: Target, label: 'Objetivos' },
  { to: '/parcelas', icon: Layers, label: 'Parcelas' },
  { to: '/fixos', icon: Repeat, label: 'Fixos' },
  { to: '/categorias', icon: Tag, label: 'Categorias' },
  { to: '/contas', icon: Building2, label: 'Contas' },
  { to: '/configuracoes', icon: Settings, label: 'Configurações' },
]

export default function Sidebar() {
  const { signOut } = useAuth()
  return (
    <aside className="w-64 bg-surface border-r border-border flex flex-col min-h-screen">
      <div className="p-6 border-b border-border">
        <h1 className="font-display text-xl font-bold text-textprimary">Financeiro</h1>
        <p className="text-textsecondary text-xs mt-1">Controle real. Sem ilusões.</p>
      </div>
      <nav className="flex-1 p-4 space-y-1">
        {links.map(({ to, icon: Icon, label }) => (
          <NavLink key={to} to={to} end={to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors ${
                isActive ? 'bg-indigo/15 text-indigo' : 'text-textsecondary hover:text-textprimary hover:bg-white/5'
              }`}>
            <Icon size={18} />
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="p-4 border-t border-border">
        <button onClick={signOut}
          className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm text-textsecondary hover:text-red hover:bg-red/10 transition-colors w-full">
          <LogOut size={18} />
          Sair
        </button>
      </div>
    </aside>
  )
}

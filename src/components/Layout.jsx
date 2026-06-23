import { useState } from 'react'
import Sidebar from './Sidebar'
import AlertaLembretes from './AlertaLembretes'
import { Menu } from 'lucide-react'

export default function Layout({ children }) {
  const [drawerAberto, setDrawerAberto] = useState(false)

  return (
    <div className="flex min-h-screen bg-bg">
      {/* Sidebar desktop — visível apenas em md+ */}
      <div className="hidden md:flex md:w-64 md:flex-shrink-0">
        <Sidebar onNavegar={() => {}} />
      </div>

      {/* Overlay mobile */}
      {drawerAberto && (
        <div
          className="fixed inset-0 bg-black/60 z-40 md:hidden"
          onClick={() => setDrawerAberto(false)}
        />
      )}

      {/* Drawer mobile */}
      <div className={`fixed top-0 left-0 h-full w-72 z-50 transform transition-transform duration-300 md:hidden ${
        drawerAberto ? 'translate-x-0' : '-translate-x-full'
      }`}>
        <Sidebar onNavegar={() => setDrawerAberto(false)} />
      </div>

      {/* Área principal */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header mobile */}
        <header className="md:hidden flex items-center justify-between px-4 py-3 border-b border-border bg-surface sticky top-0 z-30">
          <button
            onClick={() => setDrawerAberto(true)}
            className="p-2 text-textsecondary hover:text-textprimary transition-colors rounded-xl hover:bg-white/5"
          >
            <Menu size={22} />
          </button>
          <span className="font-display font-bold text-textprimary">Financeiro</span>
          <div className="w-10" />
        </header>

        {/* Conteúdo */}
        <main className="flex-1 p-4 md:p-8 overflow-auto">
          <AlertaLembretes />
          {children}
        </main>
      </div>
    </div>
  )
}

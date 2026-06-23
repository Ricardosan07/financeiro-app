import Sidebar from './Sidebar'
import AlertaLembretes from './AlertaLembretes'

export default function Layout({ children }) {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 p-8 overflow-auto">
        <AlertaLembretes />
        {children}
      </main>
    </div>
  )
}

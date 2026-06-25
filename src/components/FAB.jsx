import { Plus } from 'lucide-react'

export default function FAB({ onClick, label }) {
  return (
    <>
      <button
        onClick={onClick}
        className="fixed bottom-6 right-4 z-30 md:hidden flex items-center gap-2 bg-indigo hover:bg-indigo/90 text-white pl-4 pr-5 py-3.5 rounded-full shadow-lg shadow-indigo/30 transition-all active:scale-95"
        aria-label={label}
      >
        <Plus size={20} />
        <span className="text-sm font-medium">{label}</span>
      </button>
      <div className="h-20 md:hidden" />
    </>
  )
}

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { ConfigProvider } from './contexts/ConfigContext'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Contas from './pages/Contas'
import Fixos from './pages/Fixos'
import Parcelas from './pages/Parcelas'
import VisaoMensal from './pages/VisaoMensal'
import Movimentacoes from './pages/Movimentacoes'
import Categorias from './pages/Categorias'
import Simulador from './pages/Simulador'
import Cartao from './pages/Cartao'
import Agenda from './pages/Agenda'
import Objetivos from './pages/Objetivos'
import Configuracoes from './pages/Configuracoes'

function PrivateRoute({ children }) {
  const { user } = useAuth()
  return user ? <Layout>{children}</Layout> : <Navigate to="/login" />
}

function AppRoutes() {
  const { user } = useAuth()
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" /> : <Login />} />
      <Route path="/" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
      <Route path="/contas" element={<PrivateRoute><Contas /></PrivateRoute>} />
      <Route path="/fixos" element={<PrivateRoute><Fixos /></PrivateRoute>} />
      <Route path="/parcelas" element={<PrivateRoute><Parcelas /></PrivateRoute>} />
      <Route path="/mensal" element={<PrivateRoute><VisaoMensal /></PrivateRoute>} />
      <Route path="/movimentacoes" element={<PrivateRoute><Movimentacoes /></PrivateRoute>} />
      <Route path="/categorias" element={<PrivateRoute><Categorias /></PrivateRoute>} />
      <Route path="/simulador" element={<PrivateRoute><Simulador /></PrivateRoute>} />
      <Route path="/cartao" element={<PrivateRoute><Cartao /></PrivateRoute>} />
      <Route path="/agenda" element={<PrivateRoute><Agenda /></PrivateRoute>} />
      <Route path="/objetivos" element={<PrivateRoute><Objetivos /></PrivateRoute>} />
      <Route path="/configuracoes" element={<PrivateRoute><Configuracoes /></PrivateRoute>} />
    </Routes>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <ConfigProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </ConfigProvider>
    </AuthProvider>
  )
}

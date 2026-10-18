import { Route, Routes } from 'react-router-dom'
import Layout from './components/Layout.tsx'
import CardPage from './pages/CardPage.tsx'
import Dashboard from './pages/Dashboard.tsx'
import PurchasePage from './pages/PurchasePage.tsx'

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="purchases/:orderId" element={<PurchasePage />} />
        <Route path="card" element={<CardPage />} />
        <Route path="*" element={<Dashboard />} />
      </Route>
    </Routes>
  )
}

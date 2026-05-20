import { Routes, Route, Navigate } from 'react-router-dom';
import { DashboardLayout } from '@/layouts/DashboardLayout';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import LoginPage from '@/pages/LoginPage';
import DashboardPage from '@/pages/DashboardPage';
import UsersPage from '@/pages/UsersPage';
import CategoriesPage from '@/pages/CategoriesPage';
import ProductsPage from '@/pages/ProductsPage';
import ProductPromosPage from '@/pages/ProductPromosPage';
import StockPage from '@/pages/StockPage';
import PosPage from '@/pages/PosPage';
import SalesPage from '@/pages/SalesPage';
import SaleDetailPage from '@/pages/SaleDetailPage';
import ReportsPage from '@/pages/ReportsPage';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <DashboardLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="pos" element={<ProtectedRoute roles={['admin', 'kasir']}><PosPage /></ProtectedRoute>} />
        <Route path="sales" element={<ProtectedRoute roles={['admin', 'kasir']}><SalesPage /></ProtectedRoute>} />
        <Route path="sales/:id" element={<ProtectedRoute roles={['admin', 'kasir']}><SaleDetailPage /></ProtectedRoute>} />
        <Route path="users" element={<ProtectedRoute roles={['admin']}><UsersPage /></ProtectedRoute>} />
        <Route path="categories" element={<ProtectedRoute roles={['admin']}><CategoriesPage /></ProtectedRoute>} />
        <Route path="products" element={<ProtectedRoute roles={['admin']}><ProductsPage /></ProtectedRoute>} />
        <Route path="product-promos" element={<ProtectedRoute roles={['admin']}><ProductPromosPage /></ProtectedRoute>} />
        <Route path="stock" element={<ProtectedRoute roles={['admin']}><StockPage /></ProtectedRoute>} />
        <Route path="reports" element={<ProtectedRoute roles={['admin']}><ReportsPage /></ProtectedRoute>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

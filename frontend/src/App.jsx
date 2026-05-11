import { Routes, Route, Navigate } from 'react-router-dom';
import { DashboardLayout } from '@/layouts/DashboardLayout';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import LoginPage from '@/pages/LoginPage';
import DashboardPage from '@/pages/DashboardPage';
import BranchesPage from '@/pages/BranchesPage';
import UsersPage from '@/pages/UsersPage';
import CategoriesPage from '@/pages/CategoriesPage';
import UnitsPage from '@/pages/UnitsPage';
import ProductsPage from '@/pages/ProductsPage';
import StockCentralPage from '@/pages/StockCentralPage';
import StockBranchPage from '@/pages/StockBranchPage';
import TransfersPage from '@/pages/TransfersPage';
import PosPage from '@/pages/PosPage';
import SalesPage from '@/pages/SalesPage';
import SaleDetailPage from '@/pages/SaleDetailPage';
import CustomersPage from '@/pages/CustomersPage';
import ResellersPage from '@/pages/ResellersPage';
import AttendancePage from '@/pages/AttendancePage';
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
        <Route path="pos" element={<PosPage />} />
        <Route path="sales" element={<SalesPage />} />
        <Route path="sales/:id" element={<SaleDetailPage />} />
        <Route path="branches" element={<ProtectedRoute roles={['super_admin', 'admin_cabang']}><BranchesPage /></ProtectedRoute>} />
        <Route path="users" element={<ProtectedRoute roles={['super_admin', 'admin_cabang']}><UsersPage /></ProtectedRoute>} />
        <Route path="categories" element={<ProtectedRoute roles={['super_admin', 'admin_cabang']}><CategoriesPage /></ProtectedRoute>} />
        <Route path="units" element={<ProtectedRoute roles={['super_admin', 'admin_cabang']}><UnitsPage /></ProtectedRoute>} />
        <Route path="products" element={<ProtectedRoute roles={['super_admin', 'admin_cabang']}><ProductsPage /></ProtectedRoute>} />
        <Route path="stock-central" element={<ProtectedRoute roles={['super_admin', 'admin_cabang']}><StockCentralPage /></ProtectedRoute>} />
        <Route path="stock-branch" element={<StockBranchPage />} />
        <Route path="transfers" element={<ProtectedRoute roles={['super_admin', 'admin_cabang', 'kasir']}><TransfersPage /></ProtectedRoute>} />
        <Route path="customers" element={<ProtectedRoute roles={['super_admin', 'admin_cabang', 'kasir']}><CustomersPage /></ProtectedRoute>} />
        <Route path="resellers" element={<ProtectedRoute roles={['super_admin', 'admin_cabang', 'kasir']}><ResellersPage /></ProtectedRoute>} />
        <Route path="attendance" element={<ProtectedRoute roles={['super_admin', 'admin_cabang', 'karyawan', 'kasir']}><AttendancePage /></ProtectedRoute>} />
        <Route path="reports" element={<ProtectedRoute roles={['super_admin', 'admin_cabang']}><ReportsPage /></ProtectedRoute>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

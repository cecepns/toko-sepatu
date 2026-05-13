import { useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Store,
  Users,
  Package,
  Ruler,
  Tags,
  Warehouse,
  ArrowLeftRight,
  ShoppingCart,
  Receipt,
  Building2,
  ClipboardList,
  LogOut,
  Menu,
  X,
  BarChart3,
  Clock,
  Radio,
  Smartphone,
  Banknote,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { ROLES } from '@/utils/constants';
import logoImg from '@/assets/logo.png';

const nav = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, roles: ['super_admin', 'admin_cabang', 'kasir', 'karyawan'] },
  { to: '/pos', label: 'POS', icon: ShoppingCart, roles: ['super_admin', 'admin_cabang', 'kasir'] },
  { to: '/sales', label: 'Riwayat Transaksi', icon: Receipt, roles: ['super_admin', 'admin_cabang', 'kasir'] },
  { to: '/sales/wallet', label: 'Penjualan kanal', icon: Smartphone, roles: ['super_admin', 'admin_cabang', 'kasir'] },
  { to: '/branches', label: 'Cabang', icon: Building2, roles: ['super_admin', 'admin_cabang'] },
  { to: '/users', label: 'Pengguna', icon: Users, roles: ['super_admin', 'admin_cabang'] },
  { to: '/categories', label: 'Kategori', icon: Tags, roles: ['super_admin', 'admin_cabang'] },
  { to: '/units', label: 'Satuan', icon: Ruler, roles: ['super_admin', 'admin_cabang'] },
  { to: '/products', label: 'Produk', icon: Package, roles: ['super_admin', 'admin_cabang'] },
  { to: '/wallet-channels', label: 'Kanal aplikasi', icon: Radio, roles: ['super_admin', 'admin_cabang'] },
  { to: '/wallet-channel-products', label: 'Produk kanal', icon: Smartphone, roles: ['super_admin', 'admin_cabang'] },
  { to: '/wallet-branch-saldo', label: 'Saldo kanal cabang', icon: Banknote, roles: ['super_admin', 'admin_cabang'] },
  { to: '/stock-central', label: 'Stok Pusat', icon: Warehouse, roles: ['super_admin', 'admin_cabang'] },
  { to: '/stock-branch', label: 'Stok Cabang', icon: Store, roles: ['super_admin', 'admin_cabang', 'kasir'] },
  { to: '/transfers', label: 'Transfer Stok', icon: ArrowLeftRight, roles: ['super_admin', 'admin_cabang', 'kasir'] },
  { to: '/resellers', label: 'Reseller', icon: Users, roles: ['super_admin', 'admin_cabang', 'kasir'] },
  { to: '/attendance', label: 'Absensi', icon: Clock, roles: ['super_admin', 'admin_cabang', 'karyawan', 'kasir'] },
  { to: '/reports', label: 'Laporan', icon: BarChart3, roles: ['super_admin', 'admin_cabang'] },
];

function filterNav(role) {
  return nav.filter((n) => n.roles.includes(role) || role === ROLES.SUPER_ADMIN);
}

export function DashboardLayout() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const items = filterNav(user?.role_slug || '');

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const linkClass = ({ isActive }) =>
    `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
      isActive ? 'bg-brand-600 text-white shadow-md shadow-brand-600/25' : 'text-slate-600 hover:bg-slate-100'
    }`;

  return (
    <div className="min-h-screen bg-slate-50">
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex h-screen w-64 flex-col transform border-r border-slate-200 bg-white transition-transform duration-200 lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex min-h-[4.25rem] items-center justify-between gap-2 border-b border-slate-100 px-3 py-2.5">
          <Link to="/" className="min-w-0 flex-1" onClick={() => setOpen(false)}>
            <img src={logoImg} alt="MAGFIRAH CELL" className="h-11 w-full max-w-[13.5rem] object-contain object-left" />
          </Link>
          <button type="button" className="rounded-lg p-2 text-slate-500 lg:hidden" onClick={() => setOpen(false)}>
            <X className="h-5 w-5" />
          </button>
        </div>
        <nav className="scrollbar-thin min-h-0 flex-1 space-y-1 overflow-y-auto p-3">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={linkClass}
              onClick={() => setOpen(false)}
              end={item.to === '/' || item.to === '/sales'}
            >
              <item.icon className="h-5 w-5 shrink-0" />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-slate-100 bg-white p-3">
          <div className="mb-2 truncate rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
            <div className="font-semibold text-slate-900">{user?.full_name}</div>
            <div>{user?.role_name}</div>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <LogOut className="h-4 w-4" /> Keluar
          </button>
        </div>
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-slate-200 bg-white/90 px-4 backdrop-blur">
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 p-2 text-slate-700 lg:hidden"
            onClick={() => setOpen(true)}
          >
            <Menu className="h-5 w-5" />
            <span className="text-sm font-medium">Menu</span>
          </button>
          <div className="hidden text-sm text-slate-500 lg:block">
            <ClipboardList className="mr-2 inline h-4 w-4" />
            {user?.branch?.name || 'Semua cabang'}
          </div>
          <div className="text-xs text-slate-400">{new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</div>
        </header>
        <main className="p-4 sm:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>

      {open && (
        <button type="button" className="fixed inset-0 z-30 bg-slate-900/40 lg:hidden" aria-label="tutup menu" onClick={() => setOpen(false)} />
      )}
    </div>
  );
}

import { useEffect, useState } from 'react';
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
  CalendarClock,
  Percent,
  Radio,
  Smartphone,
  Banknote,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { ROLES } from '@/utils/constants';
import logoImg from '@/assets/logo.png';
import { Modal } from '@/components/Modal';
import { formatCurrency } from '@/utils/format';
import { productPromoService } from '@/services/productPromoService';

const PROMO_AFTER_LOGIN_FLAG = 'promo_popup_after_login_v1';

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
  { to: '/product-promos', label: 'Promo', icon: Percent, roles: ['super_admin', 'admin_cabang'] },
  { to: '/wallet-channels', label: 'Kanal aplikasi', icon: Radio, roles: ['super_admin', 'admin_cabang'] },
  { to: '/wallet-channel-products', label: 'Produk kanal', icon: Smartphone, roles: ['super_admin', 'admin_cabang'] },
  { to: '/wallet-branch-saldo', label: 'Saldo kanal cabang', icon: Banknote, roles: ['super_admin', 'admin_cabang'] },
  { to: '/stock-central', label: 'Stok Pusat', icon: Warehouse, roles: ['super_admin', 'admin_cabang'] },
  { to: '/stock-branch', label: 'Stok Cabang', icon: Store, roles: ['super_admin', 'admin_cabang', 'kasir'] },
  { to: '/transfers', label: 'Transfer Stok', icon: ArrowLeftRight, roles: ['super_admin', 'admin_cabang', 'kasir'] },
  { to: '/resellers', label: 'Reseller', icon: Users, roles: ['super_admin', 'admin_cabang', 'kasir'] },
  { to: '/attendance', label: 'Absensi', icon: Clock, roles: ['super_admin', 'admin_cabang', 'karyawan', 'kasir'] },
  { to: '/work-shifts', label: 'Shift kerja', icon: CalendarClock, roles: ['super_admin', 'admin_cabang'] },
  { to: '/reports', label: 'Laporan', icon: BarChart3, roles: ['super_admin', 'admin_cabang'] },
];

function filterNav(role) {
  return nav.filter((n) => n.roles.includes(role) || role === ROLES.SUPER_ADMIN);
}

export function DashboardLayout() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [promoModalOpen, setPromoModalOpen] = useState(false);
  const [promosToday, setPromosToday] = useState([]);
  const navigate = useNavigate();
  const items = filterNav(user?.role_slug || '');

  useEffect(() => {
    const role = user?.role_slug;
    if (role !== 'kasir' && role !== 'karyawan') return;
    let show = false;
    try {
      show = sessionStorage.getItem(PROMO_AFTER_LOGIN_FLAG) === '1';
    } catch {
      /* */
    }
    if (!show) return;
    (async () => {
      try {
        const res = await productPromoService.todayPopup();
        try {
          sessionStorage.removeItem(PROMO_AFTER_LOGIN_FLAG);
        } catch {
          /* */
        }
        const list = res?.data?.promos ?? [];
        if (Array.isArray(list) && list.length) {
          setPromosToday(list);
          setPromoModalOpen(true);
        }
      } catch {
        try {
          sessionStorage.removeItem(PROMO_AFTER_LOGIN_FLAG);
        } catch {
          /* */
        }
      }
    })();
  }, [user?.role_slug, user?.id]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const closePromoModal = () => setPromoModalOpen(false);

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

      <Modal
        open={promoModalOpen}
        title="Promo hari ini"
        onClose={closePromoModal}
      >
        <p className="mb-3 text-sm text-slate-600">
          Harga POS untuk produk berikut menggunakan harga promo sampai masa berlaku selesai.
        </p>
        <div className="max-h-[50vh] space-y-2 overflow-y-auto pr-1">
          {promosToday.map((p) => (
            <div key={p.id} className="rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2.5 text-sm">
              <div className="font-semibold text-slate-900">{p.product_name}</div>
              <div className="mt-1 font-mono text-xs text-slate-500">{p.product_sku}</div>
              <div className="mt-1.5 tabular-nums text-slate-800">
                Ecer <strong>{formatCurrency(p.promo_retail_price)}</strong>
                {' · Grosir '}
                <strong>
                  {p.promo_wholesale_price != null && p.promo_wholesale_price !== ''
                    ? formatCurrency(p.promo_wholesale_price)
                    : formatCurrency(p.promo_retail_price)}
                </strong>
              </div>
              <div className="mt-1 text-[11px] text-slate-500">
                {String(p.valid_from || '').slice(0, 10)} s/d {String(p.valid_until || '').slice(0, 10)}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 flex justify-end border-t border-slate-100 pt-3">
          <button
            type="button"
            onClick={closePromoModal}
            className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white"
          >
            Mengerti
          </button>
        </div>
      </Modal>
    </div>
  );
}

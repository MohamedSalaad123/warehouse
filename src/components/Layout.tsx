import {
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowUpFromLine,
  BarChart3,
  Bell,
  Boxes,
  ClipboardCheck,
  Globe,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  Search,
  Settings as SettingsIcon,
  SlidersHorizontal,
  Truck,
  Users,
  Warehouse as WarehouseIcon,
  X,
} from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { t } from '../i18n/translations';
import { apiRequest } from '../lib/api';
import type { AuthUser, CompanySettings, LanguageCode, NotificationItem } from '../types/wms';
import { OfflineIndicator } from './OfflineIndicator';
import { PWAInstallButton } from './PWAInstallButton';
import { Modal } from './ui/Common';

export type NavSection =
  | 'dashboard'
  | 'warehouses'
  | 'products'
  | 'inventory'
  | 'stock-in'
  | 'stock-out'
  | 'transfers'
  | 'adjustments'
  | 'stock-count'
  | 'suppliers'
  | 'employees'
  | 'reports'
  | 'notifications'
  | 'settings';

interface LayoutProps {
  user: AuthUser;
  settings: CompanySettings | null;
  lang: LanguageCode;
  activeNav: NavSection;
  unreadNotifications: number;
  notifications: NotificationItem[];
  onNavigate: (nav: NavSection) => void;
  onChangeLang: (lang: LanguageCode) => void;
  onLogout: () => void;
  onToast: (type: 'success' | 'error' | 'info', text: string) => void;
  onRefreshNotifications: () => void;
  children: React.ReactNode;
}

export function Layout({
  user,
  settings,
  lang,
  activeNav,
  unreadNotifications,
  notifications,
  onNavigate,
  onChangeLang,
  onLogout,
  onToast,
  onRefreshNotifications,
  children,
}: LayoutProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [pwModalOpen, setPwModalOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [pwSaving, setPwSaving] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);

  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    const q = searchQuery.trim();
    if (q.length < 2) {
      setSearchResults(null);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await apiRequest(`/api/search?q=${encodeURIComponent(q)}`);
        setSearchResults(res);
        setSearchOpen(true);
      } catch {
        // ignore search errors
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const navItems: Array<{ id: NavSection; label: string; icon: React.ReactNode; visible: boolean }> = [
    { id: 'dashboard', label: t(lang, 'navDashboard'), icon: <LayoutDashboard className="w-4 h-4" />, visible: true },
    { id: 'warehouses', label: t(lang, 'navWarehouses'), icon: <WarehouseIcon className="w-4 h-4" />, visible: true },
    { id: 'products', label: t(lang, 'navProducts'), icon: <Package className="w-4 h-4" />, visible: true },
    { id: 'inventory', label: t(lang, 'navInventory'), icon: <Boxes className="w-4 h-4" />, visible: true },
    {
      id: 'stock-in',
      label: t(lang, 'navStockIn'),
      icon: <ArrowDownToLine className="w-4 h-4" />,
      visible: user.permissions.stockIn || user.role === 'ACCOUNTANT' || user.role === 'GENERAL_MANAGER' || user.role === 'SUPER_ADMIN',
    },
    {
      id: 'stock-out',
      label: t(lang, 'navStockOut'),
      icon: <ArrowUpFromLine className="w-4 h-4" />,
      visible: user.permissions.stockOut || user.role === 'ACCOUNTANT' || user.role === 'GENERAL_MANAGER' || user.role === 'SUPER_ADMIN',
    },
    { id: 'transfers', label: t(lang, 'navTransfers'), icon: <ArrowLeftRight className="w-4 h-4" />, visible: true },
    {
      id: 'adjustments',
      label: t(lang, 'navAdjustments'),
      icon: <SlidersHorizontal className="w-4 h-4" />,
      visible: user.permissions.stockAdjustment || user.role === 'GENERAL_MANAGER' || user.role === 'SUPER_ADMIN' || user.role === 'ACCOUNTANT',
    },
    {
      id: 'stock-count',
      label: t(lang, 'navStockCount'),
      icon: <ClipboardCheck className="w-4 h-4" />,
      visible: user.permissions.stockCount || user.permissions.approveStockCount || user.role === 'SUPER_ADMIN' || user.role === 'GENERAL_MANAGER',
    },
    { id: 'suppliers', label: t(lang, 'navSuppliers'), icon: <Truck className="w-4 h-4" />, visible: true },
    {
      id: 'employees',
      label: t(lang, 'navEmployees'),
      icon: <Users className="w-4 h-4" />,
      visible: user.permissions.manageEmployees || user.role === 'SUPER_ADMIN' || user.role === 'GENERAL_MANAGER' || user.role === 'WAREHOUSE_MANAGER',
    },
    { id: 'reports', label: t(lang, 'navReports'), icon: <BarChart3 className="w-4 h-4" />, visible: true },
    { id: 'notifications', label: t(lang, 'navNotifications'), icon: <Bell className="w-4 h-4" />, visible: true },
    {
      id: 'settings',
      label: t(lang, 'navSettings'),
      icon: <SettingsIcon className="w-4 h-4" />,
      visible: user.permissions.manageSettings || user.role === 'SUPER_ADMIN',
    },
  ];

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwSaving(true);
    try {
      await apiRequest('/api/auth/change-password', {
        method: 'POST',
        body: { currentPassword, newPassword },
      });
      onToast('success', lang === 'so' ? 'Furaha sirta waa la beddelay' : 'Password updated successfully');
      setPwModalOpen(false);
      setCurrentPassword('');
      setNewPassword('');
    } catch (err: any) {
      onToast('error', err.message);
    } finally {
      setPwSaving(false);
    }
  };

  const companyDisplayName = settings?.companyName || 'Khayre Warehouse Management System';
  const companyLogoUrl = settings?.companyLogo || '/src/assets/images/khayre_wms_emblem_1795764682289.jpg';

  const SidebarContent = () => (
    <div className="flex flex-col h-full bg-[#0F1E36] text-slate-200 select-none">
      <div className="h-16 px-5 flex items-center gap-3 border-b border-slate-800/80 shrink-0">
        {!logoFailed ? (
          <img
            src={companyLogoUrl}
            alt={companyDisplayName}
            referrerPolicy="no-referrer"
            onError={() => setLogoFailed(true)}
            className="w-8 h-8 rounded object-cover bg-white p-0.5 shrink-0"
          />
        ) : (
          <div className="w-8 h-8 rounded bg-[#1E4E79] flex items-center justify-center shrink-0">
            <WarehouseIcon className="w-4 h-4 text-white" />
          </div>
        )}
        <span className="font-display font-bold text-sm text-white truncate">
          {companyDisplayName}
        </span>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
        {navItems
          .filter((item) => item.visible)
          .map((item) => {
            const active = activeNav === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  onNavigate(item.id);
                  setMobileMenuOpen(false);
                }}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-[#1E4E79] text-white'
                    : 'text-slate-300 hover:bg-slate-800/70 hover:text-white'
                }`}
              >
                <span className="flex items-center gap-3 min-w-0">
                  <span className="shrink-0">{item.icon}</span>
                  <span className="truncate">{item.label}</span>
                </span>
                {item.id === 'notifications' && unreadNotifications > 0 && (
                  <span className="text-xs font-mono tabular-nums text-sky-300 font-semibold">
                    {unreadNotifications}
                  </span>
                )}
              </button>
            );
          })}
      </nav>

      <div className="p-4 border-t border-slate-800/80 text-xs text-slate-400">
        <p className="font-semibold text-slate-200 truncate">{user.fullName}</p>
        <p className="mt-0.5 truncate">{user.role.replace(/_/g, ' ')}</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex bg-slate-50 text-slate-900">
      {/* Desktop Left Sidebar */}
      <aside className="hidden lg:block w-64 shrink-0 border-r border-slate-200 no-print">
        <div className="sticky top-0 h-screen">
          <SidebarContent />
        </div>
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex no-print">
          <div className="fixed inset-0 bg-slate-950/60" onClick={() => setMobileMenuOpen(false)} />
          <div className="relative w-64 max-w-[80vw] h-full z-10">
            <SidebarContent />
            <button
              type="button"
              onClick={() => setMobileMenuOpen(false)}
              className="absolute top-4 right-3 p-1.5 text-slate-300 hover:text-white"
              aria-label="Close navigation"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Navigation Bar */}
        <header className="sticky top-0 z-30 h-16 bg-white border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between gap-4 no-print">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 text-slate-600 hover:text-slate-900 rounded-md hover:bg-slate-100 shrink-0"
              aria-label="Open menu"
            >
              <Menu className="w-5 h-5" />
            </button>

            {/* Global Search */}
            <div ref={searchRef} className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => searchResults && setSearchOpen(true)}
                placeholder={t(lang, 'globalSearchPlaceholder')}
                className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-md focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#1E4E79]/25 focus:border-[#1E4E79]"
              />
              {searchOpen && searchResults && (
                <div className="absolute left-0 right-0 mt-1.5 bg-white border border-slate-200 rounded-md shadow-lg z-40 max-h-96 overflow-y-auto divide-y divide-slate-100 text-xs">
                  {searchResults.warehouses?.length > 0 && (
                    <div className="p-2">
                      <p className="px-2 py-1 font-semibold text-slate-500">{t(lang, 'navWarehouses')}</p>
                      {searchResults.warehouses.map((w: any) => (
                        <button
                          key={w._id}
                          type="button"
                          onClick={() => {
                            onNavigate('warehouses');
                            setSearchOpen(false);
                          }}
                          className="w-full text-left px-2 py-1.5 rounded hover:bg-slate-50 flex justify-between"
                        >
                          <span className="font-medium text-slate-900">{w.name}</span>
                          <span className="font-mono text-slate-500">{w.code}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {searchResults.products?.length > 0 && (
                    <div className="p-2">
                      <p className="px-2 py-1 font-semibold text-slate-500">{t(lang, 'navProducts')}</p>
                      {searchResults.products.map((p: any) => (
                        <button
                          key={p._id}
                          type="button"
                          onClick={() => {
                            onNavigate('products');
                            setSearchOpen(false);
                          }}
                          className="w-full text-left px-2 py-1.5 rounded hover:bg-slate-50 flex justify-between"
                        >
                          <span className="font-medium text-slate-900">{p.name}</span>
                          <span className="font-mono text-slate-500">{p.sku}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {searchResults.transactions?.length > 0 && (
                    <div className="p-2">
                      <p className="px-2 py-1 font-semibold text-slate-500">{t(lang, 'stockLedger')}</p>
                      {searchResults.transactions.map((tx: any) => (
                        <button
                          key={tx._id}
                          type="button"
                          onClick={() => {
                            onNavigate(tx.movementType === 'STOCK_OUT' ? 'stock-out' : 'stock-in');
                            setSearchOpen(false);
                          }}
                          className="w-full text-left px-2 py-1.5 rounded hover:bg-slate-50 flex justify-between"
                        >
                          <span className="font-mono text-slate-900">{tx.transactionNumber}</span>
                          <span className="text-slate-500">{tx.movementType}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {searchResults.transfers?.length > 0 && (
                    <div className="p-2">
                      <p className="px-2 py-1 font-semibold text-slate-500">{t(lang, 'navTransfers')}</p>
                      {searchResults.transfers.map((tr: any) => (
                        <button
                          key={tr._id}
                          type="button"
                          onClick={() => {
                            onNavigate('transfers');
                            setSearchOpen(false);
                          }}
                          className="w-full text-left px-2 py-1.5 rounded hover:bg-slate-50 flex justify-between"
                        >
                          <span className="font-mono text-slate-900">{tr.transferNumber}</span>
                          <span className="text-slate-500">{tr.status}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {!searchResults.warehouses?.length &&
                    !searchResults.products?.length &&
                    !searchResults.transactions?.length &&
                    !searchResults.transfers?.length && (
                      <div className="p-4 text-center text-slate-500">{t(lang, 'noData')}</div>
                    )}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <PWAInstallButton lang={lang} />

            {/* Language Selector */}
            <div className="flex items-center border border-slate-200 rounded-md overflow-hidden bg-slate-50">
              <span className="px-2 text-slate-500 hidden sm:inline">
                <Globe className="w-3.5 h-3.5" />
              </span>
              <button
                type="button"
                onClick={() => onChangeLang('so')}
                className={`px-2.5 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
                  lang === 'so' ? 'bg-[#1E4E79] text-white' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                SO
              </button>
              <button
                type="button"
                onClick={() => onChangeLang('en')}
                className={`px-2.5 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
                  lang === 'en' ? 'bg-[#1E4E79] text-white' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                EN
              </button>
            </div>

            {/* Notification Bell */}
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setNotifOpen(!notifOpen);
                  setProfileOpen(false);
                  onRefreshNotifications();
                }}
                className="relative p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors"
                aria-label="Notifications"
              >
                <Bell className="w-5 h-5" />
                {unreadNotifications > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center text-[10px] font-mono font-bold bg-[#1E4E79] text-white rounded-full">
                    {unreadNotifications > 99 ? '99+' : unreadNotifications}
                  </span>
                )}
              </button>

              {notifOpen && (
                <div className="absolute right-0 mt-2 w-80 bg-white border border-slate-200 rounded-lg shadow-lg z-40 overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between bg-slate-50">
                    <span className="text-xs font-semibold text-slate-900">{t(lang, 'navNotifications')}</span>
                    <button
                      type="button"
                      onClick={() => {
                        setNotifOpen(false);
                        onNavigate('notifications');
                      }}
                      className="text-xs font-medium text-[#1E4E79] hover:underline"
                    >
                      {t(lang, 'view')}
                    </button>
                  </div>
                  <div className="max-h-72 overflow-y-auto divide-y divide-slate-100">
                    {notifications.slice(0, 5).map((n) => (
                      <div key={n._id} className={`px-4 py-3 text-xs ${n.isRead ? 'bg-white' : 'bg-sky-50/40'}`}>
                        <p className="font-semibold text-slate-900">{n.title}</p>
                        <p className="text-slate-600 mt-0.5 leading-snug">{n.message}</p>
                      </div>
                    ))}
                    {notifications.length === 0 && (
                      <p className="px-4 py-6 text-center text-xs text-slate-500">{t(lang, 'noData')}</p>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* User Profile Menu */}
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setProfileOpen(!profileOpen);
                  setNotifOpen(false);
                }}
                className="flex items-center gap-2.5 pl-2 pr-3 py-1.5 rounded-md border border-slate-200 hover:bg-slate-50 transition-colors"
              >
                <div className="w-7 h-7 rounded bg-[#0F1E36] text-white flex items-center justify-center text-xs font-bold shrink-0">
                  {user.fullName
                    .split(' ')
                    .map((s) => s[0])
                    .join('')
                    .slice(0, 2)
                    .toUpperCase()}
                </div>
                <div className="hidden md:block text-left">
                  <p className="text-xs font-semibold text-slate-900 leading-tight max-w-[130px] truncate">
                    {user.fullName}
                  </p>
                  <p className="text-[11px] text-slate-500 leading-tight">{user.role.replace(/_/g, ' ')}</p>
                </div>
              </button>

              {profileOpen && (
                <div className="absolute right-0 mt-2 w-56 bg-white border border-slate-200 rounded-lg shadow-lg z-40 py-1 text-sm">
                  <div className="px-4 py-2.5 border-b border-slate-100">
                    <p className="font-semibold text-slate-900 truncate">{user.fullName}</p>
                    <p className="text-xs text-slate-500 truncate">{user.email}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setProfileOpen(false);
                      setPwModalOpen(true);
                    }}
                    className="w-full px-4 py-2 text-left text-xs font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                  >
                    <KeyRound className="w-3.5 h-3.5" />
                    {t(lang, 'changePassword')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setProfileOpen(false);
                      onLogout();
                    }}
                    className="w-full px-4 py-2 text-left text-xs font-medium text-red-700 hover:bg-red-50 flex items-center gap-2"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    {t(lang, 'signOut')}
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1440px] w-full mx-auto">
          <OfflineIndicator lang={lang} />
          {children}
        </main>
      </div>

      {/* Change Password Modal */}
      <Modal
        open={pwModalOpen}
        title={t(lang, 'changePassword')}
        onClose={() => setPwModalOpen(false)}
        maxWidth="max-w-md"
      >
        <form onSubmit={handlePasswordChange} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              {t(lang, 'currentPassword')}
            </label>
            <input
              type="password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              {t(lang, 'newPassword')}
            </label>
            <input
              type="password"
              required
              minLength={6}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setPwModalOpen(false)}
              className="px-4 py-2 text-sm border border-slate-300 rounded-md text-slate-700 hover:bg-slate-50"
            >
              {t(lang, 'cancel')}
            </button>
            <button
              type="submit"
              disabled={pwSaving}
              className="px-4 py-2 text-sm font-medium bg-[#1E4E79] text-white rounded-md hover:bg-[#163A5C]"
            >
              {pwSaving ? t(lang, 'loading') : t(lang, 'save')}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

import React, { useCallback, useEffect, useState } from 'react';
import { AuthScreen } from './components/AuthScreen';
import { Layout, type NavSection } from './components/Layout';
import { ToastBanner, type ToastMessage } from './components/ui/Common';
import { apiRequest, setAuthToken } from './lib/api';
import type { AuthUser, CompanySettings, LanguageCode, NotificationItem } from './types/wms';
import { AdjustmentsView, StockCountView } from './views/AdjustmentsAndCountView';
import { DashboardView } from './views/DashboardView';
import { InventoryView } from './views/InventoryView';
import { NotificationsView } from './views/NotificationsView';
import { ProductsView } from './views/ProductsView';
import { ReportsView } from './views/ReportsView';
import { SettingsView } from './views/SettingsView';
import { StockInOutView } from './views/StockInOutView';
import { EmployeesView, SuppliersView } from './views/SuppliersAndEmployeesView';
import { TransfersView } from './views/TransfersView';
import { WarehousesView } from './views/WarehousesView';

export default function App() {
  const [booting, setBooting] = useState(true);
  const [initialized, setInitialized] = useState(true);
  const [companyMeta, setCompanyMeta] = useState({ name: 'Khayre Warehouse Management System', logo: '' });
  const [lang, setLang] = useState<LanguageCode>('so');

  const [user, setUser] = useState<AuthUser | null>(null);
  const [settings, setSettings] = useState<CompanySettings | null>(null);
  const [activeNav, setActiveNav] = useState<NavSection>('dashboard');
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const pushToast = useCallback((type: ToastMessage['type'], text: string) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((prev) => [...prev, { id, type, text }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    apiRequest('/api/auth/status')
      .then((res) => {
        setInitialized(Boolean(res.initialized));
        setCompanyMeta({
          name: res.companyName || 'Khayre Warehouse Management System',
          logo: res.companyLogo || '',
        });
        if (res.defaultLanguage === 'en' || res.defaultLanguage === 'so') {
          setLang(res.defaultLanguage);
        }
      })
      .catch(() => {})
      .finally(() => setBooting(false));
  }, []);

  const refreshNotifications = useCallback(async () => {
    try {
      const res = await apiRequest('/api/notifications');
      setNotifications(res.data || []);
      setUnreadCount(res.unreadCount || 0);
    } catch {
      // ignore
    }
  }, []);

  const loadSessionContext = useCallback(async () => {
    try {
      const [settingsRes] = await Promise.all([apiRequest('/api/settings'), refreshNotifications()]);
      if (settingsRes?.data) {
        setSettings(settingsRes.data);
        if (settingsRes.data.language) setLang(settingsRes.data.language);
      }
    } catch {
      // ignore
    }
  }, [refreshNotifications]);

  useEffect(() => {
    if (user) {
      loadSessionContext();
    }
  }, [user, loadSessionContext]);

  const handleLogout = () => {
    setAuthToken(null);
    setUser(null);
    setActiveNav('dashboard');
  };

  if (booting) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-sm text-slate-600">
        Khayre Warehouse Management System...
      </div>
    );
  }

  if (!user) {
    return (
      <>
        <AuthScreen
          initialized={initialized}
          companyName={companyMeta.name}
          companyLogo={companyMeta.logo}
          lang={lang}
          onChangeLang={setLang}
          onAuthenticated={(authUser) => {
            setInitialized(true);
            setUser(authUser);
          }}
        />
        <ToastBanner toasts={toasts} onDismiss={dismissToast} />
      </>
    );
  }

  const dateFormat = settings?.dateFormat || 'YYYY-MM-DD';
  const companyName = settings?.companyName || companyMeta.name;

  return (
    <>
      <Layout
        user={user}
        settings={settings}
        lang={lang}
        activeNav={activeNav}
        unreadNotifications={unreadCount}
        notifications={notifications}
        onNavigate={setActiveNav}
        onChangeLang={setLang}
        onLogout={handleLogout}
        onToast={pushToast}
        onRefreshNotifications={refreshNotifications}
      >
        {activeNav === 'dashboard' && (
          <DashboardView user={user} lang={lang} dateFormat={dateFormat} onToast={pushToast} />
        )}
        {activeNav === 'warehouses' && (
          <WarehousesView user={user} lang={lang} dateFormat={dateFormat} onToast={pushToast} />
        )}
        {activeNav === 'products' && (
          <ProductsView user={user} lang={lang} dateFormat={dateFormat} onToast={pushToast} />
        )}
        {activeNav === 'inventory' && <InventoryView user={user} lang={lang} onToast={pushToast} />}
        {activeNav === 'stock-in' && (
          <StockInOutView
            mode="IN"
            user={user}
            lang={lang}
            dateFormat={dateFormat}
            companyName={companyName}
            onToast={pushToast}
          />
        )}
        {activeNav === 'stock-out' && (
          <StockInOutView
            mode="OUT"
            user={user}
            lang={lang}
            dateFormat={dateFormat}
            companyName={companyName}
            onToast={pushToast}
          />
        )}
        {activeNav === 'transfers' && (
          <TransfersView user={user} lang={lang} dateFormat={dateFormat} onToast={pushToast} />
        )}
        {activeNav === 'adjustments' && (
          <AdjustmentsView user={user} lang={lang} dateFormat={dateFormat} onToast={pushToast} />
        )}
        {activeNav === 'stock-count' && (
          <StockCountView user={user} lang={lang} dateFormat={dateFormat} onToast={pushToast} />
        )}
        {activeNav === 'suppliers' && (
          <SuppliersView user={user} lang={lang} dateFormat={dateFormat} onToast={pushToast} />
        )}
        {activeNav === 'employees' && <EmployeesView user={user} lang={lang} onToast={pushToast} />}
        {activeNav === 'reports' && (
          <ReportsView user={user} lang={lang} dateFormat={dateFormat} onToast={pushToast} />
        )}
        {activeNav === 'notifications' && (
          <NotificationsView
            lang={lang}
            dateFormat={dateFormat}
            notifications={notifications}
            onRefresh={refreshNotifications}
            onToast={pushToast}
          />
        )}
        {activeNav === 'settings' && (
          <SettingsView
            lang={lang}
            onSettingsUpdated={(updated) => {
              setSettings(updated);
              setLang(updated.language);
            }}
            onToast={pushToast}
          />
        )}
      </Layout>

      <ToastBanner toasts={toasts} onDismiss={dismissToast} />
    </>
  );
}

import React, { useEffect, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { t } from '../i18n/translations';
import { apiRequest, formatCurrency, formatDate, formatNumber } from '../lib/api';
import type { AuthUser, LanguageCode, Warehouse } from '../types/wms';
import { EmptyState } from '../components/ui/Common';

const CHART_COLORS = ['#1E4E79', '#2E7D9B', '#0F1E36', '#4B8BBE', '#64748B', '#0284C7'];

export function DashboardView({
  user,
  lang,
  dateFormat,
  onToast,
}: {
  user: AuthUser;
  lang: LanguageCode;
  dateFormat: 'YYYY-MM-DD' | 'DD/MM/YYYY' | 'MM/DD/YYYY';
  onToast: (type: 'success' | 'error' | 'info', text: string) => void;
}) {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [warehouseId, setWarehouseId] = useState('ALL');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);

  const loadDashboard = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (warehouseId && warehouseId !== 'ALL') params.set('warehouseId', warehouseId);
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);
      const [dashRes, whRes] = await Promise.all([
        apiRequest(`/api/dashboard?${params.toString()}`),
        apiRequest('/api/warehouses'),
      ]);
      setData(dashRes);
      setWarehouses(whRes.data || []);
    } catch (err: any) {
      onToast('error', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, [warehouseId, startDate, endDate]);

  const kpis = data?.kpis || {};
  const charts = data?.charts || {};

  const kpiCards = [
    { label: t(lang, 'totalWarehouses'), value: formatNumber(kpis.totalWarehouses ?? 0) },
    { label: t(lang, 'activeWarehouses'), value: formatNumber(kpis.activeWarehouses ?? 0) },
    { label: t(lang, 'totalProducts'), value: formatNumber(kpis.totalProducts ?? 0) },
    { label: t(lang, 'totalStockQty'), value: formatNumber(kpis.totalStockQuantity ?? 0) },
    ...(user.permissions.viewValuation
      ? [{ label: t(lang, 'totalInventoryValue'), value: formatCurrency(kpis.totalInventoryValue ?? 0) }]
      : []),
    { label: t(lang, 'stockInToday'), value: formatNumber(kpis.totalStockInToday ?? 0) },
    { label: t(lang, 'stockOutToday'), value: formatNumber(kpis.totalStockOutToday ?? 0) },
    {
      label: t(lang, 'lowStockProducts'),
      value: formatNumber(kpis.lowStockProducts ?? 0),
      tone: (kpis.lowStockProducts ?? 0) > 0 ? 'text-amber-700' : 'text-slate-900',
    },
    {
      label: t(lang, 'outOfStockProducts'),
      value: formatNumber(kpis.outOfStockProducts ?? 0),
      tone: (kpis.outOfStockProducts ?? 0) > 0 ? 'text-red-700' : 'text-slate-900',
    },
    { label: t(lang, 'pendingTransfers'), value: formatNumber(kpis.pendingTransfers ?? 0) },
    { label: t(lang, 'totalEmployees'), value: formatNumber(kpis.totalEmployees ?? 0) },
  ];

  return (
    <div className="space-y-6">
      {/* Header & Filters */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">{t(lang, 'navDashboard')}</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {lang === 'so'
              ? 'Xogta tooska ah ee dhammaan bakhaarada iyo kaydka shirkadda'
              : 'Real-time operational metrics across company warehouses and inventory'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <select
            value={warehouseId}
            onChange={(e) => setWarehouseId(e.target.value)}
            className="px-3 py-2 text-xs font-medium bg-white border border-slate-300 rounded-md focus:outline-none focus:border-[#1E4E79]"
          >
            <option value="ALL">{t(lang, 'allWarehouses')}</option>
            {warehouses.map((w) => (
              <option key={w._id} value={w._id}>
                {w.name} ({w.code})
              </option>
            ))}
          </select>

          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            aria-label={t(lang, 'dateFrom')}
            className="px-3 py-2 text-xs bg-white border border-slate-300 rounded-md"
          />
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            aria-label={t(lang, 'dateTo')}
            className="px-3 py-2 text-xs bg-white border border-slate-300 rounded-md"
          />
        </div>
      </div>

      {/* KPI Metrics Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
        {kpiCards.map((card) => (
          <div key={card.label} className="bg-white border border-slate-200 rounded-lg p-4">
            <p className="text-xs font-medium text-slate-500 truncate">{card.label}</p>
            <p className={`mt-2 text-xl font-bold font-mono tabular-nums ${card.tone || 'text-slate-900'}`}>
              {loading ? '—' : card.value}
            </p>
          </div>
        ))}
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 1. Stock In vs Stock Out */}
        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <h3 className="text-sm font-semibold text-slate-900 mb-4">{t(lang, 'chartStockInVsOut')}</h3>
          <div className="h-64">
            {charts.stockInVsOut?.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={charts.stockInVsOut}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#64748B' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#64748B' }} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="stockIn" name={t(lang, 'navStockIn')} fill="#1E4E79" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="stockOut" name={t(lang, 'navStockOut')} fill="#64748B" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-slate-400">
                {t(lang, 'noData')}
              </div>
            )}
          </div>
        </div>

        {/* 2. Inventory Distribution by Warehouse */}
        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <h3 className="text-sm font-semibold text-slate-900 mb-4">{t(lang, 'chartWhDistribution')}</h3>
          <div className="h-64">
            {charts.warehouseDistribution?.some((w: any) => w.quantity > 0) ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={charts.warehouseDistribution.filter((w: any) => w.quantity > 0)}
                    dataKey="quantity"
                    nameKey="warehouseName"
                    cx="50%"
                    cy="50%"
                    outerRadius={88}
                    label={({ name, percent }) => `${name} (${((percent ?? 0) * 100).toFixed(0)}%)`}
                  >
                    {charts.warehouseDistribution.map((_: any, idx: number) => (
                      <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-slate-400">
                {t(lang, 'noData')}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 3. Top 10 Products by Stock Quantity */}
        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <h3 className="text-sm font-semibold text-slate-900 mb-4">{t(lang, 'chartTopProducts')}</h3>
          <div className="h-64">
            {charts.topProducts?.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={charts.topProducts} layout="vertical" margin={{ left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis type="number" tick={{ fontSize: 11, fill: '#64748B' }} />
                  <YAxis dataKey="name" type="category" width={110} tick={{ fontSize: 11, fill: '#334155' }} />
                  <Tooltip />
                  <Bar dataKey="quantity" name={t(lang, 'quantity')} fill="#1E4E79" radius={[0, 3, 3, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-slate-400">
                {t(lang, 'noData')}
              </div>
            )}
          </div>
        </div>

        {/* 4. Monthly Stock Movement */}
        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <h3 className="text-sm font-semibold text-slate-900 mb-4">{t(lang, 'chartMonthlyMovement')}</h3>
          <div className="h-64">
            {charts.monthlyMovement?.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={charts.monthlyMovement}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#64748B' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#64748B' }} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Area
                    type="monotone"
                    dataKey="inbound"
                    name={t(lang, 'navStockIn')}
                    stroke="#1E4E79"
                    fill="#1E4E79"
                    fillOpacity={0.18}
                  />
                  <Area
                    type="monotone"
                    dataKey="outbound"
                    name={t(lang, 'navStockOut')}
                    stroke="#475569"
                    fill="#475569"
                    fillOpacity={0.12}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-slate-400">
                {t(lang, 'noData')}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 5. Warehouse Inventory Valuation + Recent Movements */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {user.permissions.viewValuation && (
          <div className="bg-white border border-slate-200 rounded-lg p-5">
            <h3 className="text-sm font-semibold text-slate-900 mb-4">{t(lang, 'chartWhValuation')}</h3>
            <div className="h-64">
              {charts.warehouseValuation?.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={charts.warehouseValuation}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748B' }} />
                    <YAxis tick={{ fontSize: 11, fill: '#64748B' }} />
                    <Tooltip formatter={(val: any) => formatCurrency(Number(val))} />
                    <Bar dataKey="value" name={t(lang, 'totalValue')} fill="#0F1E36" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-xs text-slate-400">
                  {t(lang, 'noData')}
                </div>
              )}
            </div>
          </div>
        )}

        <div className={`bg-white border border-slate-200 rounded-lg overflow-hidden ${user.permissions.viewValuation ? '' : 'lg:col-span-2'}`}>
          <div className="px-5 py-4 border-b border-slate-200">
            <h3 className="text-sm font-semibold text-slate-900">{t(lang, 'recentMovements')}</h3>
          </div>
          {data?.recentTransactions?.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                  <tr>
                    <th className="text-left px-4 py-2.5 font-semibold">{t(lang, 'txNumber')}</th>
                    <th className="text-left px-4 py-2.5 font-semibold">{t(lang, 'product')}</th>
                    <th className="text-left px-4 py-2.5 font-semibold">{t(lang, 'warehouse')}</th>
                    <th className="text-right px-4 py-2.5 font-semibold">{t(lang, 'quantity')}</th>
                    <th className="text-left px-4 py-2.5 font-semibold">{t(lang, 'date')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.recentTransactions.map((tx: any) => (
                    <tr key={tx._id} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5 font-mono text-slate-800">{tx.transactionNumber}</td>
                      <td className="px-4 py-2.5 text-slate-900 font-medium">{tx.productName}</td>
                      <td className="px-4 py-2.5 text-slate-600">{tx.warehouseName}</td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums font-semibold">
                        {tx.movementType.includes('IN') ? '+' : '-'}
                        {formatNumber(tx.quantity)}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-slate-500">
                        {formatDate(tx.transactionDate, dateFormat)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-6">
              <EmptyState title={t(lang, 'noData')} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

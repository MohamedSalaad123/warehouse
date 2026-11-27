import { ChevronDown, ChevronRight, Search } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { t } from '../i18n/translations';
import { apiRequest, formatCurrency, formatNumber } from '../lib/api';
import type { AuthUser, Category, LanguageCode, Warehouse } from '../types/wms';
import { EmptyState, PaginationBar, StatusLabel, TableSkeleton } from '../components/ui/Common';

export function InventoryView({
  user,
  lang,
  onToast,
}: {
  user: AuthUser;
  lang: LanguageCode;
  onToast: (type: 'success' | 'error' | 'info', text: string) => void;
}) {
  const [viewMode, setViewMode] = useState<'warehouse' | 'global'>('warehouse');
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [warehouseId, setWarehouseId] = useState('ALL');
  const [categoryId, setCategoryId] = useState('ALL');
  const [stockStatus, setStockStatus] = useState('ALL');
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [expandedProductId, setExpandedProductId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ view: viewMode });
      if (warehouseId !== 'ALL') params.set('warehouseId', warehouseId);
      if (categoryId !== 'ALL') params.set('categoryId', categoryId);
      if (stockStatus !== 'ALL') params.set('stockStatus', stockStatus);
      if (search) params.set('search', search);

      const [invRes, whRes, catRes] = await Promise.all([
        apiRequest(`/api/inventory?${params.toString()}`),
        apiRequest('/api/warehouses'),
        apiRequest('/api/categories'),
      ]);
      setRows(invRes.data || []);
      setWarehouses(whRes.data || []);
      setCategories(catRes.data || []);
    } catch (err: any) {
      onToast('error', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [viewMode, warehouseId, categoryId, stockStatus, search]);

  const statusLabel = (s: string) => {
    if (s === 'IN_STOCK') return t(lang, 'inStock');
    if (s === 'LOW_STOCK') return t(lang, 'lowStock');
    return t(lang, 'outOfStock');
  };

  const pageSize = 15;
  const paged = rows.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">{t(lang, 'navInventory')}</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {lang === 'so'
              ? 'La soco tirada diyaarka ah, qiimaha kaydka, iyo heerka bakhaar kasta'
              : 'Live stock quantities, Moving Weighted Average costs, and status across all warehouses'}
          </p>
        </div>

        {/* View Mode Switch */}
        <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-md w-fit">
          <button
            type="button"
            onClick={() => {
              setViewMode('warehouse');
              setPage(1);
            }}
            className={`px-3 py-1.5 text-xs font-semibold rounded transition-colors whitespace-nowrap ${
              viewMode === 'warehouse' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {t(lang, 'warehouseView')}
          </button>
          <button
            type="button"
            onClick={() => {
              setViewMode('global');
              setPage(1);
            }}
            className={`px-3 py-1.5 text-xs font-semibold rounded transition-colors whitespace-nowrap ${
              viewMode === 'global' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {t(lang, 'globalView')}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder={t(lang, 'search')}
            className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-slate-300 rounded-md"
          />
        </div>

        {viewMode === 'warehouse' && (
          <select
            value={warehouseId}
            onChange={(e) => {
              setWarehouseId(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 text-sm bg-white border border-slate-300 rounded-md"
          >
            <option value="ALL">{t(lang, 'allWarehouses')}</option>
            {warehouses.map((w) => (
              <option key={w._id} value={w._id}>
                {w.name}
              </option>
            ))}
          </select>
        )}

        <select
          value={categoryId}
          onChange={(e) => {
            setCategoryId(e.target.value);
            setPage(1);
          }}
          className="px-3 py-2 text-sm bg-white border border-slate-300 rounded-md"
        >
          <option value="ALL">{t(lang, 'all')} ({t(lang, 'category')})</option>
          {categories.map((c) => (
            <option key={c._id} value={c._id}>
              {c.name}
            </option>
          ))}
        </select>

        <select
          value={stockStatus}
          onChange={(e) => {
            setStockStatus(e.target.value);
            setPage(1);
          }}
          className="px-3 py-2 text-sm bg-white border border-slate-300 rounded-md"
        >
          <option value="ALL">{t(lang, 'all')} ({t(lang, 'status')})</option>
          <option value="IN_STOCK">{t(lang, 'inStock')}</option>
          <option value="LOW_STOCK">{t(lang, 'lowStock')}</option>
          <option value="OUT_OF_STOCK">{t(lang, 'outOfStock')}</option>
        </select>
      </div>

      {loading ? (
        <TableSkeleton cols={7} />
      ) : rows.length === 0 ? (
        <EmptyState title={t(lang, 'noData')} />
      ) : viewMode === 'warehouse' ? (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold">{t(lang, 'productName')}</th>
                  <th className="text-left px-4 py-3 font-semibold">{t(lang, 'sku')}</th>
                  <th className="text-left px-4 py-3 font-semibold">{t(lang, 'warehouse')}</th>
                  <th className="text-right px-4 py-3 font-semibold">{t(lang, 'availableQty')}</th>
                  <th className="text-right px-4 py-3 font-semibold">{t(lang, 'reservedQty')}</th>
                  <th className="text-right px-4 py-3 font-semibold">{t(lang, 'minStockLevel')}</th>
                  {user.permissions.viewValuation && (
                    <>
                      <th className="text-right px-4 py-3 font-semibold">{t(lang, 'purchasePrice')}</th>
                      <th className="text-right px-4 py-3 font-semibold">{t(lang, 'totalValue')}</th>
                    </>
                  )}
                  <th className="text-left px-4 py-3 font-semibold">{t(lang, 'status')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paged.map((r) => (
                  <tr key={r._id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-900">{r.productName}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-600">{r.productSku}</td>
                    <td className="px-4 py-3 text-slate-700">{r.warehouseName}</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums font-semibold">
                      {formatNumber(r.availableQuantity)} {r.unit}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-500">
                      {formatNumber(r.reservedQuantity)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-500">
                      {formatNumber(r.minimumStockLevel)}
                    </td>
                    {user.permissions.viewValuation && (
                      <>
                        <td className="px-4 py-3 text-right font-mono tabular-nums">{formatCurrency(r.purchasePrice)}</td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums font-semibold">
                          {formatCurrency(r.totalValue)}
                        </td>
                      </>
                    )}
                    <td className="px-4 py-3">
                      <StatusLabel status={r.stockStatus} label={statusLabel(r.stockStatus)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <PaginationBar
            page={page}
            totalItems={rows.length}
            pageSize={pageSize}
            onPageChange={setPage}
            prevLabel={t(lang, 'previous')}
            nextLabel={t(lang, 'next')}
          />
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="w-8 px-3 py-3" />
                  <th className="text-left px-4 py-3 font-semibold">{t(lang, 'productName')}</th>
                  <th className="text-left px-4 py-3 font-semibold">{t(lang, 'sku')}</th>
                  <th className="text-left px-4 py-3 font-semibold">{t(lang, 'category')}</th>
                  <th className="text-right px-4 py-3 font-semibold">{t(lang, 'totalStockQty')}</th>
                  {user.permissions.viewValuation && (
                    <th className="text-right px-4 py-3 font-semibold">{t(lang, 'totalValue')}</th>
                  )}
                  <th className="text-left px-4 py-3 font-semibold">{t(lang, 'status')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paged.map((r) => {
                  const pid = r.product._id;
                  const isExp = expandedProductId === pid;
                  return (
                    <React.Fragment key={pid}>
                      <tr
                        onClick={() => setExpandedProductId(isExp ? null : pid)}
                        className="hover:bg-slate-50 cursor-pointer"
                      >
                        <td className="px-3 py-3 text-slate-500">
                          {isExp ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        </td>
                        <td className="px-4 py-3 font-medium text-slate-900">{r.product.name}</td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-600">{r.product.sku}</td>
                        <td className="px-4 py-3 text-slate-600">{r.product.categoryName}</td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums font-semibold">
                          {formatNumber(r.totalAvailable)} {r.product.unit}
                        </td>
                        {user.permissions.viewValuation && (
                          <td className="px-4 py-3 text-right font-mono tabular-nums font-semibold">
                            {formatCurrency(r.totalValue)}
                          </td>
                        )}
                        <td className="px-4 py-3">
                          <StatusLabel status={r.stockStatus} label={statusLabel(r.stockStatus)} />
                        </td>
                      </tr>
                      {isExp && (
                        <tr className="bg-slate-50/70">
                          <td colSpan={user.permissions.viewValuation ? 7 : 6} className="px-8 py-3">
                            {r.warehouseBreakdown.length === 0 ? (
                              <p className="text-xs text-slate-500">{t(lang, 'noData')}</p>
                            ) : (
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                {r.warehouseBreakdown.map((wb: any) => (
                                  <div
                                    key={wb.warehouseId}
                                    className="bg-white border border-slate-200 rounded px-3 py-2 text-xs flex justify-between items-center"
                                  >
                                    <div>
                                      <p className="font-semibold text-slate-800">{wb.warehouseName}</p>
                                      <p className="font-mono text-slate-500">{wb.warehouseCode}</p>
                                    </div>
                                    <div className="text-right">
                                      <p className="font-mono font-bold text-slate-900">
                                        {formatNumber(wb.availableQuantity)} {r.product.unit}
                                      </p>
                                      {user.permissions.viewValuation && (
                                        <p className="font-mono text-slate-500">{formatCurrency(wb.totalValue)}</p>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          <PaginationBar
            page={page}
            totalItems={rows.length}
            pageSize={pageSize}
            onPageChange={setPage}
            prevLabel={t(lang, 'previous')}
            nextLabel={t(lang, 'next')}
          />
        </div>
      )}
    </div>
  );
}

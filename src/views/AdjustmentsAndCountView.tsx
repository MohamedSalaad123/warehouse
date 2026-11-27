import { Check, Eye, Plus, XCircle } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { t } from '../i18n/translations';
import { apiRequest, formatDate, formatNumber } from '../lib/api';
import type {
  AdjustmentType,
  AuthUser,
  LanguageCode,
  Product,
  StockAdjustment,
  StockCount,
  Warehouse,
} from '../types/wms';
import { EmptyState, Modal, PaginationBar, StatusLabel, TableSkeleton } from '../components/ui/Common';

export function AdjustmentsView({
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
  const [rows, setRows] = useState<StockAdjustment[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(1);

  const [form, setForm] = useState({
    warehouseId: '',
    productId: '',
    adjustmentType: 'INCREASE' as AdjustmentType,
    adjustmentQuantity: 1,
    reason: '',
  });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [adjRes, whRes, prodRes] = await Promise.all([
        apiRequest('/api/adjustments'),
        apiRequest('/api/warehouses'),
        apiRequest('/api/products'),
      ]);
      setRows(adjRes.data || []);
      setWarehouses((whRes.data || []).filter((w: Warehouse) => w.status === 'ACTIVE'));
      setProducts((prodRes.data || []).filter((p: Product) => p.status === 'ACTIVE'));
    } catch (err: any) {
      onToast('error', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await apiRequest('/api/adjustments', {
        method: 'POST',
        idempotent: true,
        body: form,
      });
      onToast('success', lang === 'so' ? 'Sixitaanka kaydka waa la keydiyay' : 'Stock adjustment applied');
      setOpen(false);
      load();
    } catch (err: any) {
      onToast('error', err.message);
    } finally {
      setSaving(false);
    }
  };

  const pageSize = 12;
  const paged = rows.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">{t(lang, 'navAdjustments')}</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {lang === 'so'
              ? 'Sax farqiga kaydka, alaabta halaabantay, ama luntay oo leh diiwaan joogto ah'
              : 'Authorize inventory corrections, damaged stock, and loss write-offs with permanent audit logs'}
          </p>
        </div>

        {user.permissions.stockAdjustment && (
          <button
            type="button"
            onClick={() => {
              setForm({
                warehouseId: user.assignedWarehouseId || warehouses[0]?._id || '',
                productId: products[0]?._id || '',
                adjustmentType: 'INCREASE',
                adjustmentQuantity: 1,
                reason: '',
              });
              setOpen(true);
            }}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#1E4E79] hover:bg-[#163A5C] rounded-md whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4" />
            {t(lang, 'newAdjustment')}
          </button>
        )}
      </div>

      {loading ? (
        <TableSkeleton cols={7} />
      ) : rows.length === 0 ? (
        <EmptyState title={t(lang, 'noData')} />
      ) : (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold">#</th>
                  <th className="text-left px-4 py-3 font-semibold">{t(lang, 'warehouse')}</th>
                  <th className="text-left px-4 py-3 font-semibold">{t(lang, 'product')}</th>
                  <th className="text-left px-4 py-3 font-semibold">{t(lang, 'adjustmentType')}</th>
                  <th className="text-right px-4 py-3 font-semibold">{t(lang, 'previousQty')}</th>
                  <th className="text-right px-4 py-3 font-semibold">{t(lang, 'adjustmentQty')}</th>
                  <th className="text-right px-4 py-3 font-semibold">{t(lang, 'newQty')}</th>
                  <th className="text-left px-4 py-3 font-semibold">{t(lang, 'reason')}</th>
                  <th className="text-left px-4 py-3 font-semibold">{t(lang, 'date')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paged.map((r) => (
                  <tr key={r._id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-mono text-xs">{r.adjustmentNumber}</td>
                    <td className="px-4 py-3">{r.warehouseName}</td>
                    <td className="px-4 py-3 font-medium text-slate-900">{r.productName}</td>
                    <td className="px-4 py-3 text-xs">{r.adjustmentType.replace(/_/g, ' ')}</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">{formatNumber(r.previousQuantity)}</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums font-semibold">
                      {r.adjustmentQuantity > 0 ? `+${r.adjustmentQuantity}` : r.adjustmentQuantity}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums font-semibold">
                      {formatNumber(r.newQuantity)}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600 max-w-xs truncate">{r.reason}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">
                      {formatDate(r.adjustmentDate, dateFormat)}
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
      )}

      <Modal open={open} title={t(lang, 'newAdjustment')} onClose={() => setOpen(false)}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">{t(lang, 'warehouse')} *</label>
              <select
                required
                value={form.warehouseId}
                onChange={(e) => setForm({ ...form, warehouseId: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
              >
                <option value="">—</option>
                {warehouses.map((w) => (
                  <option key={w._id} value={w._id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">{t(lang, 'product')} *</label>
              <select
                required
                value={form.productId}
                onChange={(e) => setForm({ ...form, productId: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
              >
                <option value="">—</option>
                {products.map((p) => (
                  <option key={p._id} value={p._id}>
                    {p.name} ({p.sku})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">{t(lang, 'adjustmentType')} *</label>
              <select
                value={form.adjustmentType}
                onChange={(e) => setForm({ ...form, adjustmentType: e.target.value as AdjustmentType })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
              >
                <option value="INCREASE">Increase Stock</option>
                <option value="DECREASE">Decrease Stock</option>
                <option value="DAMAGED">Damaged Stock</option>
                <option value="LOST">Lost Stock</option>
                <option value="PHYSICAL_COUNT_CORRECTION">Physical Count Correction</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">{t(lang, 'quantity')} *</label>
              <input
                type="number"
                min="1"
                required
                value={form.adjustmentQuantity}
                onChange={(e) => setForm({ ...form, adjustmentQuantity: Number(e.target.value) })}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-md"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">{t(lang, 'reason')} *</label>
            <textarea
              rows={2}
              required
              value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
            />
          </div>
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setOpen(false)} className="px-4 py-2 text-sm border border-slate-300 rounded-md">
              {t(lang, 'cancel')}
            </button>
            <button type="submit" disabled={saving} className="px-4 py-2 text-sm font-medium bg-[#1E4E79] text-white rounded-md">
              {saving ? t(lang, 'loading') : t(lang, 'save')}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

export function StockCountView({
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
  const [counts, setCounts] = useState<StockCount[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [invByWhProd, setInvByWhProd] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);

  const [createOpen, setCreateOpen] = useState(false);
  const [selectedWh, setSelectedWh] = useState('');
  const [countItems, setCountItems] = useState<
    Array<{ productId: string; systemQuantity: number; countedQuantity: number; reason: string }>
  >([]);
  const [notes, setNotes] = useState('');
  const [detailCount, setDetailCount] = useState<StockCount | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [cntRes, whRes, prodRes, invRes] = await Promise.all([
        apiRequest('/api/stock-counts'),
        apiRequest('/api/warehouses'),
        apiRequest('/api/products'),
        apiRequest('/api/inventory?view=warehouse'),
      ]);
      setCounts(cntRes.data || []);
      setWarehouses((whRes.data || []).filter((w: Warehouse) => w.status === 'ACTIVE'));
      setProducts((prodRes.data || []).filter((p: Product) => p.status === 'ACTIVE'));

      const map = new Map<string, number>();
      for (const r of invRes.data || []) {
        map.set(`${r.warehouseId}:${r.productId}`, Number(r.availableQuantity || 0));
      }
      setInvByWhProd(map);
    } catch (err: any) {
      onToast('error', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const populateForWarehouse = (whId: string) => {
    setSelectedWh(whId);
    const rows = products.map((p) => {
      const sysQty = invByWhProd.get(`${whId}:${p._id}`) ?? 0;
      return {
        productId: p._id,
        systemQuantity: sysQty,
        countedQuantity: sysQty,
        reason: '',
      };
    });
    setCountItems(rows);
  };

  const handleCreateCount = async (submitForApproval: boolean) => {
    try {
      await apiRequest('/api/stock-counts', {
        method: 'POST',
        body: {
          warehouseId: selectedWh,
          items: countItems,
          notes,
          submitForApproval,
        },
      });
      onToast('success', lang === 'so' ? 'Tirinta kaydka waa la keydiyay' : 'Physical stock count saved');
      setCreateOpen(false);
      load();
    } catch (err: any) {
      onToast('error', err.message);
    }
  };

  const handleAction = async (id: string, action: 'submit' | 'approve' | 'reject') => {
    try {
      await apiRequest(`/api/stock-counts/${id}/${action}`, { method: 'POST', idempotent: true });
      onToast('success', lang === 'so' ? 'Waa la fuliyay' : `Stock count ${action}ed`);
      load();
    } catch (err: any) {
      onToast('error', err.message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">{t(lang, 'navStockCount')}</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {lang === 'so'
              ? 'Tirinta rasmiga ah ee bakhaarka; kaydku isma beddelayo ilaa la oggolaado'
              : 'Physical inventory reconciliation; warehouse stock updates only after manager approval'}
          </p>
        </div>
        {user.permissions.stockCount && (
          <button
            type="button"
            onClick={() => {
              const whId = user.assignedWarehouseId || warehouses[0]?._id || '';
              populateForWarehouse(whId);
              setNotes('');
              setCreateOpen(true);
            }}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#1E4E79] hover:bg-[#163A5C] rounded-md whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4" />
            {t(lang, 'newStockCount')}
          </button>
        )}
      </div>

      {loading ? (
        <TableSkeleton cols={6} />
      ) : counts.length === 0 ? (
        <EmptyState title={t(lang, 'noData')} />
      ) : (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold">#</th>
                  <th className="text-left px-4 py-3 font-semibold">{t(lang, 'warehouse')}</th>
                  <th className="text-right px-4 py-3 font-semibold">{t(lang, 'navProducts')}</th>
                  <th className="text-left px-4 py-3 font-semibold">{t(lang, 'date')}</th>
                  <th className="text-left px-4 py-3 font-semibold">{t(lang, 'status')}</th>
                  <th className="text-right px-4 py-3 font-semibold">{t(lang, 'actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {counts.map((c) => (
                  <tr key={c._id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-mono text-xs">{c.countNumber}</td>
                    <td className="px-4 py-3 font-medium text-slate-900">{c.warehouseName}</td>
                    <td className="px-4 py-3 text-right font-mono">{c.items.length}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">
                      {formatDate(c.countDate, dateFormat)}
                    </td>
                    <td className="px-4 py-3">
                      <StatusLabel status={c.status} />
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setDetailCount(c)}
                          className="p-1.5 text-slate-600 hover:text-[#1E4E79] rounded hover:bg-slate-100"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        {c.status === 'DRAFT' && user.permissions.stockCount && (
                          <button
                            type="button"
                            onClick={() => handleAction(c._id, 'submit')}
                            className="px-2.5 py-1 text-xs font-medium bg-[#1E4E79] text-white rounded"
                          >
                            {t(lang, 'submitApproval')}
                          </button>
                        )}
                        {c.status === 'SUBMITTED' && user.permissions.approveStockCount && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleAction(c._id, 'approve')}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-emerald-700 text-white rounded"
                            >
                              <Check className="w-3 h-3" />
                              {t(lang, 'approve')}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleAction(c._id, 'reject')}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-red-600 text-white rounded"
                            >
                              <XCircle className="w-3 h-3" />
                              {t(lang, 'reject')}
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* New Stock Count Modal */}
      <Modal
        open={createOpen}
        title={t(lang, 'newStockCount')}
        onClose={() => setCreateOpen(false)}
        maxWidth="max-w-4xl"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">{t(lang, 'warehouse')} *</label>
              <select
                value={selectedWh}
                onChange={(e) => populateForWarehouse(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
              >
                {warehouses.map((w) => (
                  <option key={w._id} value={w._id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">{t(lang, 'notes')}</label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
              />
            </div>
          </div>

          <div className="border border-slate-200 rounded-md overflow-x-auto max-h-80">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-3 py-2 font-semibold">{t(lang, 'product')}</th>
                  <th className="text-right px-3 py-2 font-semibold">{t(lang, 'systemQty')}</th>
                  <th className="text-right px-3 py-2 font-semibold">{t(lang, 'countedQty')}</th>
                  <th className="text-right px-3 py-2 font-semibold">{t(lang, 'difference')}</th>
                  <th className="text-left px-3 py-2 font-semibold">{t(lang, 'reason')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {countItems.map((item, idx) => {
                  const p = products.find((pr) => pr._id === item.productId);
                  const diff = item.countedQuantity - item.systemQuantity;
                  return (
                    <tr key={item.productId}>
                      <td className="px-3 py-2 font-medium text-slate-900">
                        {p?.name} <span className="font-mono text-slate-400">({p?.sku})</span>
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">{item.systemQuantity}</td>
                      <td className="px-3 py-2 text-right">
                        <input
                          type="number"
                          min="0"
                          value={item.countedQuantity}
                          onChange={(e) => {
                            const next = [...countItems];
                            next[idx] = { ...next[idx], countedQuantity: Math.max(0, Number(e.target.value)) };
                            setCountItems(next);
                          }}
                          className="w-24 px-2 py-1 text-right font-mono border border-slate-300 rounded"
                        />
                      </td>
                      <td
                        className={`px-3 py-2 text-right font-mono font-semibold ${
                          diff === 0 ? 'text-slate-500' : diff > 0 ? 'text-emerald-700' : 'text-red-700'
                        }`}
                      >
                        {diff > 0 ? `+${diff}` : diff}
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          value={item.reason}
                          onChange={(e) => {
                            const next = [...countItems];
                            next[idx] = { ...next[idx], reason: e.target.value };
                            setCountItems(next);
                          }}
                          placeholder="Optional variance note"
                          className="w-full px-2 py-1 border border-slate-300 rounded"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setCreateOpen(false)} className="px-4 py-2 text-sm border border-slate-300 rounded-md">
              {t(lang, 'cancel')}
            </button>
            <button
              type="button"
              onClick={() => handleCreateCount(false)}
              className="px-4 py-2 text-sm font-medium border border-[#1E4E79] text-[#1E4E79] rounded-md"
            >
              {t(lang, 'saveDraft')}
            </button>
            <button
              type="button"
              onClick={() => handleCreateCount(true)}
              className="px-4 py-2 text-sm font-medium bg-[#1E4E79] text-white rounded-md"
            >
              {t(lang, 'submitApproval')}
            </button>
          </div>
        </div>
      </Modal>

      {/* Stock Count Detail Modal */}
      <Modal
        open={Boolean(detailCount)}
        title={detailCount ? `${detailCount.countNumber} — ${detailCount.warehouseName}` : ''}
        onClose={() => setDetailCount(null)}
        maxWidth="max-w-3xl"
      >
        {detailCount && (
          <div className="border border-slate-200 rounded-md overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-3 py-2 font-semibold">{t(lang, 'product')}</th>
                  <th className="text-right px-3 py-2 font-semibold">{t(lang, 'systemQty')}</th>
                  <th className="text-right px-3 py-2 font-semibold">{t(lang, 'countedQty')}</th>
                  <th className="text-right px-3 py-2 font-semibold">{t(lang, 'difference')}</th>
                  <th className="text-left px-3 py-2 font-semibold">{t(lang, 'reason')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {detailCount.items.map((item, i) => (
                  <tr key={i}>
                    <td className="px-3 py-2 font-medium">{item.productName}</td>
                    <td className="px-3 py-2 text-right font-mono">{item.systemQuantity}</td>
                    <td className="px-3 py-2 text-right font-mono">{item.countedQuantity}</td>
                    <td className="px-3 py-2 text-right font-mono font-semibold">
                      {item.difference > 0 ? `+${item.difference}` : item.difference}
                    </td>
                    <td className="px-3 py-2 text-slate-600">{item.reason || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Modal>
    </div>
  );
}

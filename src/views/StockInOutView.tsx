import { Check, Edit2, Eye, FileSpreadsheet, Plus, Printer, Search } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { t } from '../i18n/translations';
import {
  apiRequest,
  downloadAuthenticatedFile,
  formatCurrency,
  formatDate,
  formatNumber,
} from '../lib/api';
import type {
  AuthUser,
  LanguageCode,
  Product,
  StockTransaction,
  Supplier,
  Warehouse,
} from '../types/wms';
import {
  ConfirmDialog,
  EmptyState,
  Modal,
  PaginationBar,
  StatusLabel,
  TableSkeleton,
} from '../components/ui/Common';

export function StockInOutView({
  mode,
  user,
  lang,
  dateFormat,
  companyName,
  onToast,
}: {
  mode: 'IN' | 'OUT';
  user: AuthUser;
  lang: LanguageCode;
  dateFormat: 'YYYY-MM-DD' | 'DD/MM/YYYY' | 'MM/DD/YYYY';
  companyName: string;
  onToast: (type: 'success' | 'error' | 'info', text: string) => void;
}) {
  const endpoint = mode === 'IN' ? '/api/stock-in' : '/api/stock-out';
  const canCreate = mode === 'IN' ? user.permissions.stockIn : user.permissions.stockOut;

  const [transactions, setTransactions] = useState<StockTransaction[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [inventoryMap, setInventoryMap] = useState<Map<string, number>>(new Map());

  const [loading, setLoading] = useState(true);
  const [warehouseFilter, setWarehouseFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const [formOpen, setFormOpen] = useState(false);
  const [editingDraft, setEditingDraft] = useState<StockTransaction | null>(null);
  const [form, setForm] = useState({
    warehouseId: '',
    productId: '',
    quantity: 1,
    purchasePrice: 0,
    supplierId: '',
    invoiceNumber: '',
    destinationCustomer: '',
    referenceNumber: '',
    reason: '',
    notes: '',
    attachmentName: '',
  });
  const [saving, setSaving] = useState(false);

  const [confirmTarget, setConfirmTarget] = useState<StockTransaction | null>(null);
  const [voucherTx, setVoucherTx] = useState<StockTransaction | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (warehouseFilter !== 'ALL') params.set('warehouseId', warehouseFilter);
      if (statusFilter !== 'ALL') params.set('status', statusFilter);
      if (search) params.set('search', search);

      const [txRes, whRes, prodRes, supRes, invRes] = await Promise.all([
        apiRequest(`${endpoint}?${params.toString()}`),
        apiRequest('/api/warehouses'),
        apiRequest('/api/products'),
        mode === 'IN' ? apiRequest('/api/suppliers') : Promise.resolve({ data: [] }),
        apiRequest('/api/inventory?view=warehouse'),
      ]);

      setTransactions(txRes.data || []);
      setWarehouses((whRes.data || []).filter((w: Warehouse) => w.status === 'ACTIVE'));
      setProducts((prodRes.data || []).filter((p: Product) => p.status === 'ACTIVE'));
      setSuppliers(supRes.data || []);

      const map = new Map<string, number>();
      for (const row of invRes.data || []) {
        map.set(`${row.warehouseId}:${row.productId}`, Number(row.availableQuantity || 0));
      }
      setInventoryMap(map);
    } catch (err: any) {
      onToast('error', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [mode, warehouseFilter, statusFilter, search]);

  const openCreate = () => {
    setEditingDraft(null);
    const defaultWh = user.assignedWarehouseId || warehouses[0]?._id || '';
    const defaultProd = products[0];
    setForm({
      warehouseId: defaultWh,
      productId: defaultProd?._id || '',
      quantity: 1,
      purchasePrice: defaultProd?.purchasePrice || 0,
      supplierId: '',
      invoiceNumber: '',
      destinationCustomer: '',
      referenceNumber: '',
      reason: '',
      notes: '',
      attachmentName: '',
    });
    setFormOpen(true);
  };

  const openEditDraft = (tx: StockTransaction) => {
    setEditingDraft(tx);
    setForm({
      warehouseId: tx.warehouseId,
      productId: tx.productId,
      quantity: tx.quantity,
      purchasePrice: tx.unitPrice || 0,
      supplierId: tx.supplierId || '',
      invoiceNumber: tx.invoiceNumber || '',
      destinationCustomer: tx.destinationCustomer || '',
      referenceNumber: tx.referenceNumber || '',
      reason: tx.reason || '',
      notes: tx.notes || '',
      attachmentName: tx.attachmentName || '',
    });
    setFormOpen(true);
  };

  const selectedProduct = products.find((p) => p._id === form.productId);
  const availableStock = inventoryMap.get(`${form.warehouseId}:${form.productId}`) ?? 0;

  const submitForm = async (confirmImmediately: boolean) => {
    setSaving(true);
    try {
      if (editingDraft) {
        await apiRequest(`${endpoint}/${editingDraft._id}`, {
          method: 'PUT',
          body: form,
        });
        if (confirmImmediately) {
          await apiRequest(`${endpoint}/${editingDraft._id}/confirm`, {
            method: 'POST',
            idempotent: true,
          });
        }
      } else {
        await apiRequest(endpoint, {
          method: 'POST',
          idempotent: confirmImmediately,
          body: { ...form, confirmImmediately },
        });
      }
      onToast(
        'success',
        confirmImmediately
          ? lang === 'so'
            ? 'Xawaaladda waa la xaqiijiyay kaydkana waa la cusboonaysiiyay'
            : 'Transaction confirmed and inventory updated'
          : lang === 'so'
          ? 'Qabyada waa la keydiyay'
          : 'Draft saved'
      );
      setFormOpen(false);
      load();
    } catch (err: any) {
      onToast('error', err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmTx = async () => {
    if (!confirmTarget) return;
    try {
      await apiRequest(`${endpoint}/${confirmTarget._id}/confirm`, {
        method: 'POST',
        idempotent: true,
      });
      onToast(
        'success',
        lang === 'so' ? 'Waa la xaqiijiyay' : 'Transaction confirmed and inventory updated'
      );
      setConfirmTarget(null);
      load();
    } catch (err: any) {
      onToast('error', err.message);
      setConfirmTarget(null);
    }
  };

  const pageSize = 12;
  const paged = transactions.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">
            {mode === 'IN' ? t(lang, 'navStockIn') : t(lang, 'navStockOut')}
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {mode === 'IN'
              ? lang === 'so'
                ? 'Diiwaangeli oo xaqiiji alaabta soo galaysa bakhaarada'
                : 'Receive inventory into warehouses and update Moving Weighted Average Cost'
              : lang === 'so'
              ? 'Bixi alaabta iyadoo la hubinayo in kayd ku filan jiro'
              : 'Issue stock from warehouses with negative-inventory prevention'}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {user.permissions.exportReports && (
            <button
              type="button"
              onClick={() =>
                downloadAuthenticatedFile(
                  `/api/reports/${mode === 'IN' ? 'stock-in' : 'stock-out'}/export`,
                  `khayre-${mode === 'IN' ? 'stock-in' : 'stock-out'}.xlsx`
                )
              }
              className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-md whitespace-nowrap"
            >
              <FileSpreadsheet className="w-4 h-4" />
              {t(lang, 'exportExcel')}
            </button>
          )}
          {canCreate && (
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#1E4E79] hover:bg-[#163A5C] rounded-md whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              {mode === 'IN' ? t(lang, 'newStockIn') : t(lang, 'newStockOut')}
            </button>
          )}
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
        <select
          value={warehouseFilter}
          onChange={(e) => {
            setWarehouseFilter(e.target.value);
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
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          className="px-3 py-2 text-sm bg-white border border-slate-300 rounded-md"
        >
          <option value="ALL">{t(lang, 'all')}</option>
          <option value="DRAFT">{t(lang, 'draft')}</option>
          <option value="CONFIRMED">{t(lang, 'confirmed')}</option>
        </select>
      </div>

      {loading ? (
        <TableSkeleton cols={7} />
      ) : transactions.length === 0 ? (
        <EmptyState
          title={t(lang, 'noData')}
          actionLabel={canCreate ? (mode === 'IN' ? t(lang, 'newStockIn') : t(lang, 'newStockOut')) : undefined}
          onAction={canCreate ? openCreate : undefined}
        />
      ) : (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold">{t(lang, 'txNumber')}</th>
                  <th className="text-left px-4 py-3 font-semibold">{t(lang, 'warehouse')}</th>
                  <th className="text-left px-4 py-3 font-semibold">{t(lang, 'product')}</th>
                  <th className="text-right px-4 py-3 font-semibold">{t(lang, 'quantity')}</th>
                  {user.permissions.viewValuation && (
                    <th className="text-right px-4 py-3 font-semibold">{t(lang, 'totalValue')}</th>
                  )}
                  <th className="text-left px-4 py-3 font-semibold">
                    {mode === 'IN' ? t(lang, 'supplier') : t(lang, 'destinationCustomer')}
                  </th>
                  <th className="text-left px-4 py-3 font-semibold">{t(lang, 'date')}</th>
                  <th className="text-left px-4 py-3 font-semibold">{t(lang, 'status')}</th>
                  <th className="text-right px-4 py-3 font-semibold">{t(lang, 'actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paged.map((tx) => (
                  <tr key={tx._id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-mono text-xs text-slate-800">{tx.transactionNumber}</td>
                    <td className="px-4 py-3 text-slate-700">{tx.warehouseName}</td>
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {tx.productName} <span className="font-mono text-xs text-slate-400">({tx.productSku})</span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums font-semibold">
                      {formatNumber(tx.quantity)} {tx.unit}
                    </td>
                    {user.permissions.viewValuation && (
                      <td className="px-4 py-3 text-right font-mono tabular-nums">
                        {formatCurrency(tx.totalAmount)}
                      </td>
                    )}
                    <td className="px-4 py-3 text-slate-600">
                      {mode === 'IN' ? tx.supplierName || tx.invoiceNumber || '—' : tx.destinationCustomer || '—'}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">
                      {formatDate(tx.transactionDate, dateFormat)}
                    </td>
                    <td className="px-4 py-3">
                      <StatusLabel
                        status={tx.status}
                        label={tx.status === 'CONFIRMED' ? t(lang, 'confirmed') : t(lang, 'draft')}
                      />
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setVoucherTx(tx)}
                          className="p-1.5 text-slate-600 hover:text-[#1E4E79] rounded hover:bg-slate-100"
                          title={t(lang, 'printReceipt')}
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        {tx.status === 'DRAFT' && canCreate && (
                          <>
                            {mode === 'IN' && (
                              <button
                                type="button"
                                onClick={() => openEditDraft(tx)}
                                className="p-1.5 text-slate-600 hover:text-[#1E4E79] rounded hover:bg-slate-100"
                                title={t(lang, 'edit')}
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => setConfirmTarget(tx)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-white bg-emerald-700 hover:bg-emerald-800 rounded"
                            >
                              <Check className="w-3.5 h-3.5" />
                              {t(lang, 'confirmTx')}
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
          <PaginationBar
            page={page}
            totalItems={transactions.length}
            pageSize={pageSize}
            onPageChange={setPage}
            prevLabel={t(lang, 'previous')}
            nextLabel={t(lang, 'next')}
          />
        </div>
      )}

      {/* Create / Edit Modal */}
      <Modal
        open={formOpen}
        title={mode === 'IN' ? t(lang, 'newStockIn') : t(lang, 'newStockOut')}
        onClose={() => setFormOpen(false)}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submitForm(mode === 'OUT');
          }}
          className="space-y-4"
        >
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
                    {w.name} ({w.code})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">{t(lang, 'product')} *</label>
              <select
                required
                value={form.productId}
                onChange={(e) => {
                  const p = products.find((pr) => pr._id === e.target.value);
                  setForm({
                    ...form,
                    productId: e.target.value,
                    purchasePrice: p?.purchasePrice ?? form.purchasePrice,
                  });
                }}
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
          </div>

          {mode === 'OUT' && form.warehouseId && form.productId && (
            <div className="px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-md flex justify-between text-xs">
              <span className="text-slate-600">{t(lang, 'availableQty')}:</span>
              <span className="font-mono font-bold text-slate-900">
                {formatNumber(availableStock)} {selectedProduct?.unit || ''}
              </span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {t(lang, 'quantity')} ({selectedProduct?.unit || t(lang, 'unit')}) *
              </label>
              <input
                type="number"
                min="1"
                max={mode === 'OUT' ? availableStock : undefined}
                required
                value={form.quantity}
                onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-md"
              />
            </div>

            {mode === 'IN' ? (
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">{t(lang, 'purchasePrice')} *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  value={form.purchasePrice}
                  onChange={(e) => setForm({ ...form, purchasePrice: Number(e.target.value) })}
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-md"
                />
              </div>
            ) : (
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {t(lang, 'destinationCustomer')} *
                </label>
                <input
                  type="text"
                  required
                  value={form.destinationCustomer}
                  onChange={(e) => setForm({ ...form, destinationCustomer: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
                />
              </div>
            )}
          </div>

          {mode === 'IN' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">{t(lang, 'supplier')}</label>
                <select
                  value={form.supplierId}
                  onChange={(e) => setForm({ ...form, supplierId: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
                >
                  <option value="">—</option>
                  {suppliers.map((s) => (
                    <option key={s._id} value={s._id}>
                      {s.companyName} ({s.name})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">{t(lang, 'invoiceNumber')}</label>
                <input
                  type="text"
                  value={form.invoiceNumber}
                  onChange={(e) => setForm({ ...form, invoiceNumber: e.target.value })}
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-md"
                />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">{t(lang, 'referenceNumber')}</label>
                <input
                  type="text"
                  value={form.referenceNumber}
                  onChange={(e) => setForm({ ...form, referenceNumber: e.target.value })}
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-md"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">{t(lang, 'reason')} *</label>
                <input
                  type="text"
                  required
                  value={form.reason}
                  onChange={(e) => setForm({ ...form, reason: e.target.value })}
                  placeholder="Sales Dispatch / Project Issue"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">{t(lang, 'notes')}</label>
            <textarea
              rows={2}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
            />
          </div>

          <div className="flex flex-wrap justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setFormOpen(false)}
              className="px-4 py-2 text-sm border border-slate-300 rounded-md text-slate-700"
            >
              {t(lang, 'cancel')}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => submitForm(false)}
              className="px-4 py-2 text-sm font-medium border border-[#1E4E79] text-[#1E4E79] rounded-md hover:bg-slate-50"
            >
              {t(lang, 'saveDraft')}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => submitForm(true)}
              className="px-4 py-2 text-sm font-medium bg-[#1E4E79] text-white rounded-md hover:bg-[#163A5C]"
            >
              {saving ? t(lang, 'loading') : t(lang, 'confirmNow')}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(confirmTarget)}
        title={t(lang, 'confirmTx')}
        message={
          lang === 'so'
            ? `Ma xaqiijinaysaa ${confirmTarget?.transactionNumber}? Xaqiijinta kadib tirada kaydka bakhaarka si toos ah ayay isu beddelaysaa.`
            : `Confirm ${confirmTarget?.transactionNumber}? This permanently commits the stock ledger entry and updates warehouse inventory.`
        }
        confirmLabel={t(lang, 'confirmTx')}
        cancelLabel={t(lang, 'cancel')}
        onConfirm={handleConfirmTx}
        onCancel={() => setConfirmTarget(null)}
      />

      {/* Receipt / Voucher Print Modal */}
      <Modal
        open={Boolean(voucherTx)}
        title={voucherTx ? `${voucherTx.transactionNumber}` : ''}
        onClose={() => setVoucherTx(null)}
        maxWidth="max-w-lg"
      >
        {voucherTx && (
          <div className="space-y-4 text-sm">
            <div className="border-b border-slate-200 pb-3 flex justify-between items-start">
              <div>
                <h4 className="font-display font-bold text-slate-900">{companyName}</h4>
                <p className="text-xs text-slate-500">
                  {mode === 'IN' ? 'Stock In Receipt' : 'Stock Out Voucher'}
                </p>
              </div>
              <span className="font-mono text-xs font-bold text-slate-900">{voucherTx.transactionNumber}</span>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <p className="text-slate-500">{t(lang, 'warehouse')}</p>
                <p className="font-semibold text-slate-900">{voucherTx.warehouseName}</p>
              </div>
              <div>
                <p className="text-slate-500">{t(lang, 'date')}</p>
                <p className="font-mono text-slate-900">{formatDate(voucherTx.transactionDate, dateFormat)}</p>
              </div>
              <div>
                <p className="text-slate-500">{t(lang, 'product')}</p>
                <p className="font-semibold text-slate-900">{voucherTx.productName} ({voucherTx.productSku})</p>
              </div>
              <div>
                <p className="text-slate-500">{t(lang, 'quantity')}</p>
                <p className="font-mono font-bold text-slate-900">
                  {formatNumber(voucherTx.quantity)} {voucherTx.unit}
                </p>
              </div>
              {user.permissions.viewValuation && (
                <div>
                  <p className="text-slate-500">{t(lang, 'totalValue')}</p>
                  <p className="font-mono font-semibold text-slate-900">{formatCurrency(voucherTx.totalAmount)}</p>
                </div>
              )}
              <div>
                <p className="text-slate-500">{t(lang, 'status')}</p>
                <StatusLabel status={voucherTx.status} />
              </div>
            </div>

            {voucherTx.notes && (
              <div className="text-xs bg-slate-50 p-3 rounded border border-slate-200">
                <p className="text-slate-500 mb-0.5">{t(lang, 'notes')}</p>
                <p className="text-slate-800">{voucherTx.notes}</p>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2 no-print">
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium bg-[#1E4E79] text-white rounded-md hover:bg-[#163A5C]"
              >
                <Printer className="w-4 h-4" />
                {t(lang, 'printReceipt')}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

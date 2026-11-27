import { ArrowRight, Check, Eye, PackageCheck, Plus, Search, Send, Truck, XCircle } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { t } from '../i18n/translations';
import { apiRequest, formatDate, formatNumber } from '../lib/api';
import type { AuthUser, LanguageCode, Product, StockTransfer, Warehouse } from '../types/wms';
import { EmptyState, Modal, PaginationBar, StatusLabel, TableSkeleton } from '../components/ui/Common';

export function TransfersView({
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
  const [transfers, setTransfers] = useState<StockTransfer[]>([]);
  const [allWarehouses, setAllWarehouses] = useState<Warehouse[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [inventoryMap, setInventoryMap] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({
    sourceWarehouseId: '',
    destinationWarehouseId: '',
    productId: '',
    quantity: 1,
    notes: '',
    saveAsDraft: false,
  });
  const [saving, setSaving] = useState(false);

  const [receiveTarget, setReceiveTarget] = useState<StockTransfer | null>(null);
  const [receiveForm, setReceiveForm] = useState({
    receivedQty: 0,
    damagedQty: 0,
    missingQty: 0,
    notes: '',
  });

  const [rejectTarget, setRejectTarget] = useState<StockTransfer | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const [detailTarget, setDetailTarget] = useState<StockTransfer | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'ALL') params.set('status', statusFilter);
      if (search) params.set('search', search);

      const [trRes, whRes, prodRes, invRes] = await Promise.all([
        apiRequest(`/api/transfers?${params.toString()}`),
        apiRequest('/api/warehouses?forTransfer=true'),
        apiRequest('/api/products'),
        apiRequest('/api/inventory?view=warehouse'),
      ]);

      setTransfers(trRes.data || []);
      setAllWarehouses((whRes.data || []).filter((w: Warehouse) => w.status === 'ACTIVE'));
      setProducts((prodRes.data || []).filter((p: Product) => p.status === 'ACTIVE'));

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
  }, [statusFilter, search]);

  const openCreate = () => {
    const srcDefault = user.assignedWarehouseId || allWarehouses[0]?._id || '';
    const dstDefault = allWarehouses.find((w) => w._id !== srcDefault)?._id || '';
    setForm({
      sourceWarehouseId: srcDefault,
      destinationWarehouseId: dstDefault,
      productId: products[0]?._id || '',
      quantity: 1,
      notes: '',
      saveAsDraft: false,
    });
    setCreateOpen(true);
  };

  const availableInSource = inventoryMap.get(`${form.sourceWarehouseId}:${form.productId}`) ?? 0;

  const handleCreate = async (saveAsDraft: boolean) => {
    setSaving(true);
    try {
      await apiRequest('/api/transfers', {
        method: 'POST',
        idempotent: true,
        body: { ...form, saveAsDraft },
      });
      onToast('success', lang === 'so' ? 'Codsiga wareejinta waa la sameeyay' : 'Transfer request created');
      setCreateOpen(false);
      load();
    } catch (err: any) {
      onToast('error', err.message);
    } finally {
      setSaving(false);
    }
  };

  const runAction = async (id: string, action: 'submit' | 'approve' | 'dispatch' | 'cancel', body?: any) => {
    try {
      await apiRequest(`/api/transfers/${id}/${action}`, {
        method: 'POST',
        idempotent: true,
        body,
      });
      onToast('success', lang === 'so' ? 'Hawsha waa la fuliyay' : `Transfer ${action} successful`);
      load();
    } catch (err: any) {
      onToast('error', err.message);
    }
  };

  const openReceiveModal = (tr: StockTransfer) => {
    const remaining =
      Number(tr.dispatchedQuantity || tr.quantity) -
      Number(tr.receivedQuantity || 0) -
      Number(tr.damagedQuantity || 0) -
      Number(tr.missingQuantity || 0);
    setReceiveTarget(tr);
    setReceiveForm({
      receivedQty: remaining,
      damagedQty: 0,
      missingQty: 0,
      notes: '',
    });
  };

  const handleReceive = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!receiveTarget) return;
    try {
      await apiRequest(`/api/transfers/${receiveTarget._id}/receive`, {
        method: 'POST',
        idempotent: true,
        body: receiveForm,
      });
      onToast('success', lang === 'so' ? 'Alaabta wareejinta waa la helay' : 'Transfer receipt recorded');
      setReceiveTarget(null);
      load();
    } catch (err: any) {
      onToast('error', err.message);
    }
  };

  const handleReject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectTarget) return;
    try {
      await apiRequest(`/api/transfers/${rejectTarget._id}/reject`, {
        method: 'POST',
        body: { reason: rejectReason },
      });
      onToast('info', lang === 'so' ? 'Wareejinta waa la diiday' : 'Transfer rejected');
      setRejectTarget(null);
      setRejectReason('');
      load();
    } catch (err: any) {
      onToast('error', err.message);
    }
  };

  const canActOnSource = (tr: StockTransfer) =>
    !user.assignedWarehouseId || user.assignedWarehouseId === tr.sourceWarehouseId || ['SUPER_ADMIN', 'GENERAL_MANAGER'].includes(user.role);

  const canActOnDest = (tr: StockTransfer) =>
    !user.assignedWarehouseId || user.assignedWarehouseId === tr.destinationWarehouseId || ['SUPER_ADMIN', 'GENERAL_MANAGER'].includes(user.role);

  const pageSize = 10;
  const paged = transfers.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">{t(lang, 'navTransfers')}</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {lang === 'so'
              ? 'U wareeji alaabta bakhaar ilaa bakhaar adigoo raacaya oggolaanshaha iyo xaqiijinta'
              : 'Atomic inter-warehouse stock transfers with approval, dispatch, and partial receipt tracking'}
          </p>
        </div>

        {user.permissions.createTransfer && (
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#1E4E79] hover:bg-[#163A5C] rounded-md whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4" />
            {t(lang, 'newTransfer')}
          </button>
        )}
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
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          className="px-3 py-2 text-sm bg-white border border-slate-300 rounded-md"
        >
          <option value="ALL">{t(lang, 'all')}</option>
          <option value="DRAFT">Draft</option>
          <option value="PENDING_APPROVAL">Pending Approval</option>
          <option value="APPROVED">Approved</option>
          <option value="IN_TRANSIT">In Transit</option>
          <option value="PARTIALLY_RECEIVED">Partially Received</option>
          <option value="COMPLETED">Completed</option>
          <option value="REJECTED">Rejected</option>
          <option value="CANCELLED">Cancelled</option>
        </select>
      </div>

      {loading ? (
        <TableSkeleton cols={7} />
      ) : transfers.length === 0 ? (
        <EmptyState
          title={t(lang, 'noData')}
          actionLabel={user.permissions.createTransfer ? t(lang, 'newTransfer') : undefined}
          onAction={user.permissions.createTransfer ? openCreate : undefined}
        />
      ) : (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold">{t(lang, 'transferNumber')}</th>
                  <th className="text-left px-4 py-3 font-semibold">{t(lang, 'product')}</th>
                  <th className="text-left px-4 py-3 font-semibold">{t(lang, 'sourceWarehouse')} → {t(lang, 'destinationWarehouse')}</th>
                  <th className="text-right px-4 py-3 font-semibold">{t(lang, 'quantity')}</th>
                  <th className="text-right px-4 py-3 font-semibold">{t(lang, 'receivedQty')}</th>
                  <th className="text-left px-4 py-3 font-semibold">{t(lang, 'date')}</th>
                  <th className="text-left px-4 py-3 font-semibold">{t(lang, 'status')}</th>
                  <th className="text-right px-4 py-3 font-semibold">{t(lang, 'actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paged.map((tr) => (
                  <tr key={tr._id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-mono text-xs text-slate-800">{tr.transferNumber}</td>
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {tr.productName} <span className="font-mono text-xs text-slate-400">({tr.productSku})</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-700">
                      <span className="font-medium">{tr.sourceWarehouseName}</span>
                      <ArrowRight className="w-3 h-3 inline mx-1.5 text-slate-400" />
                      <span className="font-medium">{tr.destinationWarehouseName}</span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums font-semibold">
                      {formatNumber(tr.quantity)} {tr.unit}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-600">
                      {formatNumber(tr.receivedQuantity)} / {formatNumber(tr.quantity)}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">
                      {formatDate(tr.transferDate, dateFormat)}
                    </td>
                    <td className="px-4 py-3">
                      <StatusLabel status={tr.status} />
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setDetailTarget(tr)}
                          className="p-1.5 text-slate-600 hover:text-[#1E4E79] rounded hover:bg-slate-100"
                          title={t(lang, 'view')}
                        >
                          <Eye className="w-4 h-4" />
                        </button>

                        {tr.status === 'DRAFT' && user.permissions.createTransfer && canActOnSource(tr) && (
                          <button
                            type="button"
                            onClick={() => runAction(tr._id, 'submit')}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-[#1E4E79] text-white rounded hover:bg-[#163A5C]"
                          >
                            <Send className="w-3 h-3" />
                            {t(lang, 'submitApproval')}
                          </button>
                        )}

                        {tr.status === 'PENDING_APPROVAL' && user.permissions.approveTransfer && (
                          <>
                            <button
                              type="button"
                              onClick={() => runAction(tr._id, 'approve')}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-emerald-700 text-white rounded hover:bg-emerald-800"
                            >
                              <Check className="w-3 h-3" />
                              {t(lang, 'approve')}
                            </button>
                            <button
                              type="button"
                              onClick={() => setRejectTarget(tr)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-red-600 text-white rounded hover:bg-red-700"
                            >
                              <XCircle className="w-3 h-3" />
                              {t(lang, 'reject')}
                            </button>
                          </>
                        )}

                        {tr.status === 'APPROVED' && user.permissions.dispatchTransfer && canActOnSource(tr) && (
                          <button
                            type="button"
                            onClick={() => runAction(tr._id, 'dispatch')}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-[#0F1E36] text-white rounded hover:bg-slate-800"
                          >
                            <Truck className="w-3 h-3" />
                            {t(lang, 'dispatch')}
                          </button>
                        )}

                        {(tr.status === 'IN_TRANSIT' || tr.status === 'PARTIALLY_RECEIVED') &&
                          user.permissions.receiveTransfer &&
                          canActOnDest(tr) && (
                            <button
                              type="button"
                              onClick={() => openReceiveModal(tr)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-emerald-700 text-white rounded hover:bg-emerald-800"
                            >
                              <PackageCheck className="w-3 h-3" />
                              {t(lang, 'receive')}
                            </button>
                          )}

                        {['DRAFT', 'PENDING_APPROVAL', 'APPROVED'].includes(tr.status) &&
                          user.permissions.createTransfer && (
                            <button
                              type="button"
                              onClick={() => runAction(tr._id, 'cancel')}
                              className="px-2 py-1 text-xs text-slate-600 hover:text-red-600"
                            >
                              {t(lang, 'cancel')}
                            </button>
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
            totalItems={transfers.length}
            pageSize={pageSize}
            onPageChange={setPage}
            prevLabel={t(lang, 'previous')}
            nextLabel={t(lang, 'next')}
          />
        </div>
      )}

      {/* Create Transfer Modal */}
      <Modal open={createOpen} title={t(lang, 'newTransfer')} onClose={() => setCreateOpen(false)}>
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">{t(lang, 'sourceWarehouse')} *</label>
              <select
                value={form.sourceWarehouseId}
                onChange={(e) => setForm({ ...form, sourceWarehouseId: e.target.value })}
                disabled={Boolean(user.assignedWarehouseId)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md disabled:bg-slate-100"
              >
                <option value="">—</option>
                {allWarehouses.map((w) => (
                  <option key={w._id} value={w._id}>
                    {w.name} ({w.code})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {t(lang, 'destinationWarehouse')} *
              </label>
              <select
                value={form.destinationWarehouseId}
                onChange={(e) => setForm({ ...form, destinationWarehouseId: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
              >
                <option value="">—</option>
                {allWarehouses
                  .filter((w) => w._id !== form.sourceWarehouseId)
                  .map((w) => (
                    <option key={w._id} value={w._id}>
                      {w.name} ({w.code})
                    </option>
                  ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">{t(lang, 'product')} *</label>
              <select
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
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {t(lang, 'quantity')} ({t(lang, 'availableQty')}: {formatNumber(availableInSource)}) *
              </label>
              <input
                type="number"
                min="1"
                max={availableInSource}
                value={form.quantity}
                onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-md"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">{t(lang, 'notes')}</label>
            <textarea
              rows={2}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setCreateOpen(false)}
              className="px-4 py-2 text-sm border border-slate-300 rounded-md"
            >
              {t(lang, 'cancel')}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => handleCreate(true)}
              className="px-4 py-2 text-sm font-medium border border-[#1E4E79] text-[#1E4E79] rounded-md"
            >
              {t(lang, 'saveDraft')}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => handleCreate(false)}
              className="px-4 py-2 text-sm font-medium bg-[#1E4E79] text-white rounded-md hover:bg-[#163A5C]"
            >
              {saving ? t(lang, 'loading') : t(lang, 'submitApproval')}
            </button>
          </div>
        </div>
      </Modal>

      {/* Receive Transfer Modal (Supports Partial, Damaged, Missing) */}
      <Modal
        open={Boolean(receiveTarget)}
        title={receiveTarget ? `${t(lang, 'receive')}: ${receiveTarget.transferNumber}` : ''}
        onClose={() => setReceiveTarget(null)}
        maxWidth="max-w-lg"
      >
        {receiveTarget && (
          <form onSubmit={handleReceive} className="space-y-4">
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-md text-xs space-y-1">
              <p className="font-semibold text-slate-900">
                {receiveTarget.productName} ({receiveTarget.productSku})
              </p>
              <p className="text-slate-600">
                Dispatched: <span className="font-mono font-bold">{receiveTarget.dispatchedQuantity}</span> · Already
                accounted:{' '}
                <span className="font-mono font-bold">
                  {receiveTarget.receivedQuantity + receiveTarget.damagedQuantity + receiveTarget.missingQuantity}
                </span>
              </p>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">{t(lang, 'receivedQty')}</label>
                <input
                  type="number"
                  min="0"
                  required
                  value={receiveForm.receivedQty}
                  onChange={(e) => setReceiveForm({ ...receiveForm, receivedQty: Number(e.target.value) })}
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-md"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">{t(lang, 'damagedQty')}</label>
                <input
                  type="number"
                  min="0"
                  value={receiveForm.damagedQty}
                  onChange={(e) => setReceiveForm({ ...receiveForm, damagedQty: Number(e.target.value) })}
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-md"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">{t(lang, 'missingQty')}</label>
                <input
                  type="number"
                  min="0"
                  value={receiveForm.missingQty}
                  onChange={(e) => setReceiveForm({ ...receiveForm, missingQty: Number(e.target.value) })}
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-md"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">{t(lang, 'notes')}</label>
              <input
                type="text"
                value={receiveForm.notes}
                onChange={(e) => setReceiveForm({ ...receiveForm, notes: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setReceiveTarget(null)}
                className="px-4 py-2 text-sm border border-slate-300 rounded-md"
              >
                {t(lang, 'cancel')}
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-sm font-medium bg-emerald-700 text-white rounded-md hover:bg-emerald-800"
              >
                {t(lang, 'confirm')}
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* Reject Reason Modal */}
      <Modal
        open={Boolean(rejectTarget)}
        title={t(lang, 'reject')}
        onClose={() => setRejectTarget(null)}
        maxWidth="max-w-md"
      >
        <form onSubmit={handleReject} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">{t(lang, 'reason')} *</label>
            <input
              type="text"
              required
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
            />
          </div>
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setRejectTarget(null)}
              className="px-4 py-2 text-sm border border-slate-300 rounded-md"
            >
              {t(lang, 'cancel')}
            </button>
            <button type="submit" className="px-4 py-2 text-sm font-medium bg-red-600 text-white rounded-md">
              {t(lang, 'reject')}
            </button>
          </div>
        </form>
      </Modal>

      {/* Detail & Receipt History Modal */}
      <Modal
        open={Boolean(detailTarget)}
        title={detailTarget ? detailTarget.transferNumber : ''}
        onClose={() => setDetailTarget(null)}
      >
        {detailTarget && (
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pb-3 border-b border-slate-200">
              <div>
                <p className="text-slate-500">{t(lang, 'sourceWarehouse')}</p>
                <p className="font-semibold text-slate-900">{detailTarget.sourceWarehouseName}</p>
              </div>
              <div>
                <p className="text-slate-500">{t(lang, 'destinationWarehouse')}</p>
                <p className="font-semibold text-slate-900">{detailTarget.destinationWarehouseName}</p>
              </div>
              <div>
                <p className="text-slate-500">{t(lang, 'status')}</p>
                <StatusLabel status={detailTarget.status} />
              </div>
              <div>
                <p className="text-slate-500">{t(lang, 'receivedQty')}</p>
                <p className="font-mono font-semibold">{detailTarget.receivedQuantity}</p>
              </div>
              <div>
                <p className="text-slate-500">{t(lang, 'damagedQty')}</p>
                <p className="font-mono font-semibold">{detailTarget.damagedQuantity}</p>
              </div>
              <div>
                <p className="text-slate-500">{t(lang, 'missingQty')}</p>
                <p className="font-mono font-semibold">{detailTarget.missingQuantity}</p>
              </div>
            </div>

            <div>
              <h4 className="font-semibold text-slate-800 mb-2">Receipt History</h4>
              {detailTarget.receiptHistory?.length > 0 ? (
                <div className="space-y-2">
                  {detailTarget.receiptHistory.map((rh, idx) => (
                    <div key={idx} className="p-2.5 bg-slate-50 border border-slate-200 rounded flex justify-between">
                      <div>
                        <p className="font-medium text-slate-900">{rh.receivedByName}</p>
                        {rh.notes && <p className="text-slate-500">{rh.notes}</p>}
                      </div>
                      <div className="text-right font-mono">
                        <p>
                          +{rh.receivedQty} OK · {rh.damagedQty} DMG · {rh.missingQty} MISS
                        </p>
                        <p className="text-slate-400">{formatDate(rh.receivedAt, dateFormat)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-slate-500">{t(lang, 'noData')}</p>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

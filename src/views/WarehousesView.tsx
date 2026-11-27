import { Edit2, Eye, Plus, Power, Search, Trash2 } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { t } from '../i18n/translations';
import { apiRequest, formatCurrency, formatDate, formatNumber } from '../lib/api';
import type { AuthUser, EmployeeRecord, LanguageCode, Warehouse } from '../types/wms';
import { ConfirmDialog, EmptyState, Modal, PaginationBar, StatusLabel, TableSkeleton } from '../components/ui/Common';

export function WarehousesView({
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
  const [employees, setEmployees] = useState<EmployeeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [page, setPage] = useState(1);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Warehouse | null>(null);
  const [form, setForm] = useState({
    name: '',
    code: '',
    location: '',
    address: '',
    managerId: '',
    phone: '',
    description: '',
    status: 'ACTIVE' as 'ACTIVE' | 'INACTIVE',
  });
  const [saving, setSaving] = useState(false);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailData, setDetailData] = useState<any>(null);
  const [detailTab, setDetailTab] = useState<'inventory' | 'employees' | 'transactions'>('inventory');

  const [deleteTarget, setDeleteTarget] = useState<Warehouse | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (statusFilter !== 'ALL') params.set('status', statusFilter);
      const [whRes, empRes] = await Promise.all([
        apiRequest(`/api/warehouses?${params.toString()}`),
        user.permissions.manageEmployees ? apiRequest('/api/employees') : Promise.resolve({ data: [] }),
      ]);
      setWarehouses(whRes.data || []);
      setEmployees(empRes.data || []);
    } catch (err: any) {
      onToast('error', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [search, statusFilter]);

  const openCreate = () => {
    setEditing(null);
    setForm({
      name: '',
      code: '',
      location: '',
      address: '',
      managerId: '',
      phone: '',
      description: '',
      status: 'ACTIVE',
    });
    setFormOpen(true);
  };

  const openEdit = (w: Warehouse) => {
    setEditing(w);
    setForm({
      name: w.name,
      code: w.code,
      location: w.location,
      address: w.address || '',
      managerId: w.managerId || '',
      phone: w.phone || '',
      description: w.description || '',
      status: w.status,
    });
    setFormOpen(true);
  };

  const openDetail = async (id: string) => {
    try {
      const res = await apiRequest(`/api/warehouses/${id}`);
      setDetailData(res);
      setDetailTab('inventory');
      setDetailOpen(true);
    } catch (err: any) {
      onToast('error', err.message);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing) {
        await apiRequest(`/api/warehouses/${editing._id}`, { method: 'PUT', body: form });
        onToast('success', lang === 'so' ? 'Bakhaarka waa la cusboonaysiiyay' : 'Warehouse updated');
      } else {
        await apiRequest('/api/warehouses', { method: 'POST', body: form });
        onToast('success', lang === 'so' ? 'Bakhaar cusub waa la abuuray' : 'Warehouse created');
      }
      setFormOpen(false);
      load();
    } catch (err: any) {
      onToast('error', err.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (w: Warehouse) => {
    try {
      const next = w.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
      await apiRequest(`/api/warehouses/${w._id}/status`, { method: 'PATCH', body: { status: next } });
      onToast('success', lang === 'so' ? 'Xaaladda bakhaarka waa la beddelay' : 'Warehouse status updated');
      load();
    } catch (err: any) {
      onToast('error', err.message);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await apiRequest(`/api/warehouses/${deleteTarget._id}`, { method: 'DELETE' });
      onToast('success', lang === 'so' ? 'Bakhaarka waa la tirtiray' : 'Warehouse deleted');
      setDeleteTarget(null);
      load();
    } catch (err: any) {
      onToast('error', err.message);
      setDeleteTarget(null);
    }
  };

  const pageSize = 10;
  const paged = warehouses.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">{t(lang, 'navWarehouses')}</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {lang === 'so'
              ? 'Maamul bakhaarada shirkadda iyo kaydkooda madax-bannaan'
              : 'Create and manage unlimited company warehouses with independent inventory'}
          </p>
        </div>
        {user.permissions.manageWarehouses && (
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#1E4E79] hover:bg-[#163A5C] rounded-md whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4" />
            {t(lang, 'newWarehouse')}
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
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
          <option value="ACTIVE">{t(lang, 'active')}</option>
          <option value="INACTIVE">{t(lang, 'inactive')}</option>
        </select>
      </div>

      {loading ? (
        <TableSkeleton cols={7} />
      ) : warehouses.length === 0 ? (
        <EmptyState
          title={t(lang, 'noData')}
          actionLabel={user.permissions.manageWarehouses ? t(lang, 'newWarehouse') : undefined}
          onAction={user.permissions.manageWarehouses ? openCreate : undefined}
        />
      ) : (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold">{t(lang, 'warehouseName')}</th>
                  <th className="text-left px-4 py-3 font-semibold">{t(lang, 'warehouseCode')}</th>
                  <th className="text-left px-4 py-3 font-semibold">{t(lang, 'location')}</th>
                  <th className="text-left px-4 py-3 font-semibold">{t(lang, 'manager')}</th>
                  <th className="text-right px-4 py-3 font-semibold">{t(lang, 'quantity')}</th>
                  {user.permissions.viewValuation && (
                    <th className="text-right px-4 py-3 font-semibold">{t(lang, 'totalValue')}</th>
                  )}
                  <th className="text-left px-4 py-3 font-semibold">{t(lang, 'status')}</th>
                  <th className="text-right px-4 py-3 font-semibold">{t(lang, 'actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paged.map((w) => (
                  <tr key={w._id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-900">{w.name}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-600">{w.code}</td>
                    <td className="px-4 py-3 text-slate-600">{w.location}</td>
                    <td className="px-4 py-3 text-slate-600">{w.managerName || '—'}</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">{formatNumber(w.totalQuantity ?? 0)}</td>
                    {user.permissions.viewValuation && (
                      <td className="px-4 py-3 text-right font-mono tabular-nums">
                        {formatCurrency(w.totalValue ?? 0)}
                      </td>
                    )}
                    <td className="px-4 py-3">
                      <StatusLabel status={w.status} label={w.status === 'ACTIVE' ? t(lang, 'active') : t(lang, 'inactive')} />
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => openDetail(w._id)}
                          className="p-1.5 text-slate-600 hover:text-[#1E4E79] rounded hover:bg-slate-100"
                          title={t(lang, 'view')}
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        {user.permissions.manageWarehouses && (
                          <>
                            <button
                              type="button"
                              onClick={() => openEdit(w)}
                              className="p-1.5 text-slate-600 hover:text-[#1E4E79] rounded hover:bg-slate-100"
                              title={t(lang, 'edit')}
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => toggleStatus(w)}
                              className="p-1.5 text-slate-600 hover:text-amber-700 rounded hover:bg-slate-100"
                              title={w.status === 'ACTIVE' ? t(lang, 'deactivate') : t(lang, 'activate')}
                            >
                              <Power className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteTarget(w)}
                              className="p-1.5 text-slate-500 hover:text-red-600 rounded hover:bg-red-50"
                              title={t(lang, 'delete')}
                            >
                              <Trash2 className="w-4 h-4" />
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
            totalItems={warehouses.length}
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
        title={editing ? t(lang, 'edit') : t(lang, 'newWarehouse')}
        onClose={() => setFormOpen(false)}
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">{t(lang, 'warehouseName')} *</label>
              <input
                type="text"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">{t(lang, 'warehouseCode')} *</label>
              <input
                type="text"
                required
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                placeholder="WH-MOG-01"
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">{t(lang, 'location')} *</label>
              <input
                type="text"
                required
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">{t(lang, 'phone')}</label>
              <input
                type="text"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">{t(lang, 'manager')}</label>
              <select
                value={form.managerId}
                onChange={(e) => setForm({ ...form, managerId: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
              >
                <option value="">—</option>
                {employees.map((emp) => (
                  <option key={emp._id} value={emp._id}>
                    {emp.fullName} ({emp.employeeCode})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">{t(lang, 'status')}</label>
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as 'ACTIVE' | 'INACTIVE' })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
              >
                <option value="ACTIVE">{t(lang, 'active')}</option>
                <option value="INACTIVE">{t(lang, 'inactive')}</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">{t(lang, 'address')}</label>
            <input
              type="text"
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">{t(lang, 'description')}</label>
            <textarea
              rows={2}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setFormOpen(false)}
              className="px-4 py-2 text-sm border border-slate-300 rounded-md text-slate-700"
            >
              {t(lang, 'cancel')}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-sm font-medium bg-[#1E4E79] text-white rounded-md hover:bg-[#163A5C]"
            >
              {saving ? t(lang, 'loading') : t(lang, 'save')}
            </button>
          </div>
        </form>
      </Modal>

      {/* Warehouse Detail Modal */}
      <Modal
        open={detailOpen}
        title={detailData?.warehouse ? `${detailData.warehouse.name} (${detailData.warehouse.code})` : ''}
        onClose={() => setDetailOpen(false)}
        maxWidth="max-w-4xl"
      >
        {detailData && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pb-4 border-b border-slate-200 text-xs">
              <div>
                <p className="text-slate-500">{t(lang, 'location')}</p>
                <p className="font-semibold text-slate-900 mt-0.5">{detailData.warehouse.location}</p>
              </div>
              <div>
                <p className="text-slate-500">{t(lang, 'manager')}</p>
                <p className="font-semibold text-slate-900 mt-0.5">{detailData.warehouse.managerName || '—'}</p>
              </div>
              <div>
                <p className="text-slate-500">{t(lang, 'totalStockQty')}</p>
                <p className="font-mono font-semibold text-slate-900 mt-0.5">
                  {formatNumber(detailData.warehouse.totalQuantity)}
                </p>
              </div>
              {user.permissions.viewValuation && (
                <div>
                  <p className="text-slate-500">{t(lang, 'totalValue')}</p>
                  <p className="font-mono font-semibold text-slate-900 mt-0.5">
                    {formatCurrency(detailData.warehouse.totalStockValue)}
                  </p>
                </div>
              )}
            </div>

            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-md w-fit">
              {(['inventory', 'employees', 'transactions'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setDetailTab(tab)}
                  className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                    detailTab === tab ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab === 'inventory'
                    ? t(lang, 'navInventory')
                    : tab === 'employees'
                    ? t(lang, 'navEmployees')
                    : t(lang, 'stockLedger')}
                </button>
              ))}
            </div>

            {detailTab === 'inventory' && (
              <div className="overflow-x-auto border border-slate-200 rounded-md">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="text-left px-3 py-2 font-semibold">{t(lang, 'product')}</th>
                      <th className="text-left px-3 py-2 font-semibold">{t(lang, 'sku')}</th>
                      <th className="text-right px-3 py-2 font-semibold">{t(lang, 'availableQty')}</th>
                      {user.permissions.viewValuation && (
                        <th className="text-right px-3 py-2 font-semibold">{t(lang, 'totalValue')}</th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {detailData.inventory.map((item: any) => (
                      <tr key={item._id}>
                        <td className="px-3 py-2 font-medium text-slate-900">{item.productName}</td>
                        <td className="px-3 py-2 font-mono text-slate-500">{item.productSku}</td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums">
                          {formatNumber(item.availableQuantity)} {item.unit}
                        </td>
                        {user.permissions.viewValuation && (
                          <td className="px-3 py-2 text-right font-mono tabular-nums">
                            {formatCurrency(item.totalValue)}
                          </td>
                        )}
                      </tr>
                    ))}
                    {detailData.inventory.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-3 py-6 text-center text-slate-500">
                          {t(lang, 'noData')}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {detailTab === 'employees' && (
              <div className="overflow-x-auto border border-slate-200 rounded-md">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="text-left px-3 py-2 font-semibold">{t(lang, 'fullName')}</th>
                      <th className="text-left px-3 py-2 font-semibold">{t(lang, 'employeeId')}</th>
                      <th className="text-left px-3 py-2 font-semibold">{t(lang, 'position')}</th>
                      <th className="text-left px-3 py-2 font-semibold">{t(lang, 'status')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {detailData.employees.map((e: any) => (
                      <tr key={e._id}>
                        <td className="px-3 py-2 font-medium">{e.fullName}</td>
                        <td className="px-3 py-2 font-mono">{e.employeeCode}</td>
                        <td className="px-3 py-2">{e.position}</td>
                        <td className="px-3 py-2">
                          <StatusLabel status={e.accountStatus} />
                        </td>
                      </tr>
                    ))}
                    {detailData.employees.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-3 py-6 text-center text-slate-500">
                          {t(lang, 'noData')}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {detailTab === 'transactions' && (
              <div className="overflow-x-auto border border-slate-200 rounded-md">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="text-left px-3 py-2 font-semibold">{t(lang, 'txNumber')}</th>
                      <th className="text-left px-3 py-2 font-semibold">{t(lang, 'product')}</th>
                      <th className="text-left px-3 py-2 font-semibold">{t(lang, 'status')}</th>
                      <th className="text-right px-3 py-2 font-semibold">{t(lang, 'quantity')}</th>
                      <th className="text-left px-3 py-2 font-semibold">{t(lang, 'date')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {detailData.transactions.map((tx: any) => (
                      <tr key={tx._id}>
                        <td className="px-3 py-2 font-mono">{tx.transactionNumber}</td>
                        <td className="px-3 py-2">{tx.productName}</td>
                        <td className="px-3 py-2">{tx.movementType}</td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums">{formatNumber(tx.quantity)}</td>
                        <td className="px-3 py-2 font-mono">{formatDate(tx.transactionDate, dateFormat)}</td>
                      </tr>
                    ))}
                    {detailData.transactions.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-3 py-6 text-center text-slate-500">
                          {t(lang, 'noData')}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={t(lang, 'delete')}
        message={
          lang === 'so'
            ? `Ma hubtaa inaad tirtirto bakhaarka ${deleteTarget?.name}? (Bakhaar leh kayd ama taariikh lama tirtiri karo)`
            : `Delete warehouse ${deleteTarget?.name}? Warehouses containing stock or transaction history cannot be deleted.`
        }
        confirmLabel={t(lang, 'delete')}
        cancelLabel={t(lang, 'cancel')}
        danger
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

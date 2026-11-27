import { Edit2, Eye, Plus, Search } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { t } from '../i18n/translations';
import { apiRequest, formatCurrency, formatDate, formatNumber } from '../lib/api';
import type {
  AuthUser,
  EmployeeRecord,
  LanguageCode,
  Supplier,
  UserRole,
  Warehouse,
} from '../types/wms';
import { EmptyState, Modal, PaginationBar, StatusLabel, TableSkeleton } from '../components/ui/Common';

export function SuppliersView({
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
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [form, setForm] = useState({
    name: '',
    companyName: '',
    contactPerson: '',
    phone: '',
    email: '',
    address: '',
    notes: '',
    status: 'ACTIVE' as 'ACTIVE' | 'INACTIVE',
  });
  const [detailData, setDetailData] = useState<any>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await apiRequest(`/api/suppliers?search=${encodeURIComponent(search)}`);
      setSuppliers(res.data || []);
    } catch (err: any) {
      onToast('error', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [search]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editing) {
        await apiRequest(`/api/suppliers/${editing._id}`, { method: 'PUT', body: form });
        onToast('success', lang === 'so' ? 'Alaab-qeybiyaha waa la cusboonaysiiyay' : 'Supplier updated');
      } else {
        await apiRequest('/api/suppliers', { method: 'POST', body: form });
        onToast('success', lang === 'so' ? 'Alaab-qeybiye cusub waa la daray' : 'Supplier added');
      }
      setFormOpen(false);
      load();
    } catch (err: any) {
      onToast('error', err.message);
    }
  };

  const openDetail = async (id: string) => {
    try {
      const res = await apiRequest(`/api/suppliers/${id}`);
      setDetailData(res);
    } catch (err: any) {
      onToast('error', err.message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">{t(lang, 'navSuppliers')}</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {lang === 'so'
              ? 'Maamul alaab-qeybiyeyaasha, xiriirkooda, iyo taariikhda wax-iibsiga'
              : 'Manage suppliers, contact directories, and total purchase history'}
          </p>
        </div>
        {user.permissions.manageSuppliers && (
          <button
            type="button"
            onClick={() => {
              setEditing(null);
              setForm({
                name: '',
                companyName: '',
                contactPerson: '',
                phone: '',
                email: '',
                address: '',
                notes: '',
                status: 'ACTIVE',
              });
              setFormOpen(true);
            }}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#1E4E79] hover:bg-[#163A5C] rounded-md whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4" />
            {t(lang, 'newSupplier')}
          </button>
        )}
      </div>

      <div className="relative max-w-sm">
        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t(lang, 'search')}
          className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-slate-300 rounded-md"
        />
      </div>

      {loading ? (
        <TableSkeleton cols={6} />
      ) : suppliers.length === 0 ? (
        <EmptyState title={t(lang, 'noData')} />
      ) : (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold">{t(lang, 'company')}</th>
                  <th className="text-left px-4 py-3 font-semibold">{t(lang, 'contactPerson')}</th>
                  <th className="text-left px-4 py-3 font-semibold">{t(lang, 'phone')}</th>
                  <th className="text-left px-4 py-3 font-semibold">{t(lang, 'email')}</th>
                  {user.permissions.viewValuation && (
                    <th className="text-right px-4 py-3 font-semibold">{t(lang, 'totalValue')}</th>
                  )}
                  <th className="text-right px-4 py-3 font-semibold">{t(lang, 'actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {suppliers.map((s) => (
                  <tr key={s._id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {s.companyName} <span className="text-xs text-slate-500">({s.name})</span>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{s.contactPerson || '—'}</td>
                    <td className="px-4 py-3 font-mono text-xs">{s.phone || '—'}</td>
                    <td className="px-4 py-3 text-slate-600">{s.email || '—'}</td>
                    {user.permissions.viewValuation && (
                      <td className="px-4 py-3 text-right font-mono tabular-nums">
                        {formatCurrency(s.totalPurchaseValue ?? 0)}
                      </td>
                    )}
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => openDetail(s._id)}
                        className="p-1.5 text-slate-600 hover:text-[#1E4E79] rounded hover:bg-slate-100"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      {user.permissions.manageSuppliers && (
                        <button
                          type="button"
                          onClick={() => {
                            setEditing(s);
                            setForm({
                              name: s.name,
                              companyName: s.companyName,
                              contactPerson: s.contactPerson || '',
                              phone: s.phone || '',
                              email: s.email || '',
                              address: s.address || '',
                              notes: s.notes || '',
                              status: s.status,
                            });
                            setFormOpen(true);
                          }}
                          className="p-1.5 text-slate-600 hover:text-[#1E4E79] rounded hover:bg-slate-100"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal open={formOpen} title={editing ? t(lang, 'edit') : t(lang, 'newSupplier')} onClose={() => setFormOpen(false)}>
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">{t(lang, 'supplier')} *</label>
              <input
                type="text"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">{t(lang, 'company')} *</label>
              <input
                type="text"
                required
                value={form.companyName}
                onChange={(e) => setForm({ ...form, companyName: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">{t(lang, 'contactPerson')}</label>
              <input
                type="text"
                value={form.contactPerson}
                onChange={(e) => setForm({ ...form, contactPerson: e.target.value })}
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
              <label className="block text-xs font-semibold text-slate-700 mb-1">{t(lang, 'email')}</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
              />
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
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setFormOpen(false)} className="px-4 py-2 text-sm border border-slate-300 rounded-md">
              {t(lang, 'cancel')}
            </button>
            <button type="submit" className="px-4 py-2 text-sm font-medium bg-[#1E4E79] text-white rounded-md">
              {t(lang, 'save')}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={Boolean(detailData)}
        title={detailData?.supplier?.companyName || ''}
        onClose={() => setDetailData(null)}
        maxWidth="max-w-3xl"
      >
        {detailData && (
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-3 gap-4 pb-3 border-b border-slate-200">
              <div>
                <p className="text-slate-500">{t(lang, 'contactPerson')}</p>
                <p className="font-semibold">{detailData.supplier.contactPerson || '—'}</p>
              </div>
              <div>
                <p className="text-slate-500">{t(lang, 'phone')}</p>
                <p className="font-mono">{detailData.supplier.phone || '—'}</p>
              </div>
              {user.permissions.viewValuation && (
                <div>
                  <p className="text-slate-500">{t(lang, 'totalValue')}</p>
                  <p className="font-mono font-bold">{formatCurrency(detailData.supplier.totalPurchaseValue)}</p>
                </div>
              )}
            </div>

            <h4 className="font-semibold text-slate-800">Purchase History</h4>
            <div className="border border-slate-200 rounded-md overflow-x-auto max-h-64">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="text-left px-3 py-2">{t(lang, 'txNumber')}</th>
                    <th className="text-left px-3 py-2">{t(lang, 'product')}</th>
                    <th className="text-left px-3 py-2">{t(lang, 'warehouse')}</th>
                    <th className="text-right px-3 py-2">{t(lang, 'quantity')}</th>
                    <th className="text-left px-3 py-2">{t(lang, 'date')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {detailData.history.map((h: any) => (
                    <tr key={h._id}>
                      <td className="px-3 py-2 font-mono">{h.transactionNumber}</td>
                      <td className="px-3 py-2">{h.productName}</td>
                      <td className="px-3 py-2">{h.warehouseName}</td>
                      <td className="px-3 py-2 text-right font-mono">{formatNumber(h.quantity)}</td>
                      <td className="px-3 py-2 font-mono">{formatDate(h.transactionDate, dateFormat)}</td>
                    </tr>
                  ))}
                  {detailData.history.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-3 py-4 text-center text-slate-500">
                        {t(lang, 'noData')}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

export function EmployeesView({
  user,
  lang,
  onToast,
}: {
  user: AuthUser;
  lang: LanguageCode;
  onToast: (type: 'success' | 'error' | 'info', text: string) => void;
}) {
  const [employees, setEmployees] = useState<EmployeeRecord[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<EmployeeRecord | null>(null);
  const [form, setForm] = useState({
    fullName: '',
    employeeCode: '',
    phone: '',
    email: '',
    position: '',
    assignedWarehouseId: '',
    username: '',
    password: '',
    role: 'STOREKEEPER' as UserRole,
    accountStatus: 'ACTIVE' as 'ACTIVE' | 'INACTIVE',
  });

  const load = async () => {
    setLoading(true);
    try {
      const [empRes, whRes] = await Promise.all([
        apiRequest(`/api/employees?search=${encodeURIComponent(search)}`),
        apiRequest('/api/warehouses'),
      ]);
      setEmployees(empRes.data || []);
      setWarehouses(whRes.data || []);
    } catch (err: any) {
      onToast('error', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [search]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editing) {
        await apiRequest(`/api/employees/${editing._id}`, {
          method: 'PUT',
          body: {
            fullName: form.fullName,
            phone: form.phone,
            email: form.email,
            position: form.position,
            assignedWarehouseId: form.assignedWarehouseId || null,
            role: form.role,
            accountStatus: form.accountStatus,
            newPassword: form.password || undefined,
          },
        });
        onToast('success', lang === 'so' ? 'Shaqaalaha waa la cusboonaysiiyay' : 'Employee updated');
      } else {
        await apiRequest('/api/employees', { method: 'POST', body: form });
        onToast('success', lang === 'so' ? 'Shaqaale cusub waa la abuuray' : 'Employee account created');
      }
      setFormOpen(false);
      load();
    } catch (err: any) {
      onToast('error', err.message);
    }
  };

  const pageSize = 10;
  const paged = employees.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">{t(lang, 'navEmployees')}</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {lang === 'so'
              ? 'Maamul shaqaalaha, maamulayaasha bakhaarada, iyo oggolaanshaha doorka'
              : 'Manage employees, warehouse assignments, and role-based user accounts'}
          </p>
        </div>

        {user.permissions.manageEmployees && (
          <button
            type="button"
            onClick={() => {
              setEditing(null);
              setForm({
                fullName: '',
                employeeCode: `EMP-${String(employees.length + 1).padStart(4, '0')}`,
                phone: '',
                email: '',
                position: '',
                assignedWarehouseId: user.assignedWarehouseId || '',
                username: '',
                password: '',
                role: 'STOREKEEPER',
                accountStatus: 'ACTIVE',
              });
              setFormOpen(true);
            }}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#1E4E79] hover:bg-[#163A5C] rounded-md whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4" />
            {t(lang, 'newEmployee')}
          </button>
        )}
      </div>

      <div className="relative max-w-sm">
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

      {loading ? (
        <TableSkeleton cols={7} />
      ) : employees.length === 0 ? (
        <EmptyState title={t(lang, 'noData')} />
      ) : (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold">{t(lang, 'employeeId')}</th>
                  <th className="text-left px-4 py-3 font-semibold">{t(lang, 'fullName')}</th>
                  <th className="text-left px-4 py-3 font-semibold">{t(lang, 'position')}</th>
                  <th className="text-left px-4 py-3 font-semibold">{t(lang, 'role')}</th>
                  <th className="text-left px-4 py-3 font-semibold">{t(lang, 'assignedWarehouse')}</th>
                  <th className="text-left px-4 py-3 font-semibold">{t(lang, 'status')}</th>
                  <th className="text-right px-4 py-3 font-semibold">{t(lang, 'actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paged.map((emp) => (
                  <tr key={emp._id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-mono text-xs">{emp.employeeCode}</td>
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {emp.fullName}
                      <p className="text-xs text-slate-500">{emp.email}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{emp.position}</td>
                    <td className="px-4 py-3 text-xs font-medium text-slate-700">
                      {(emp.role || '—').replace(/_/g, ' ')}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{emp.assignedWarehouseName || 'All / HQ'}</td>
                    <td className="px-4 py-3">
                      <StatusLabel
                        status={emp.accountStatus}
                        label={emp.accountStatus === 'ACTIVE' ? t(lang, 'active') : t(lang, 'inactive')}
                      />
                    </td>
                    <td className="px-4 py-3 text-right">
                      {user.permissions.manageEmployees && (
                        <button
                          type="button"
                          onClick={() => {
                            setEditing(emp);
                            setForm({
                              fullName: emp.fullName,
                              employeeCode: emp.employeeCode,
                              phone: emp.phone || '',
                              email: emp.email,
                              position: emp.position,
                              assignedWarehouseId: emp.assignedWarehouseId || '',
                              username: emp.username || '',
                              password: '',
                              role: (emp.role as UserRole) || 'STOREKEEPER',
                              accountStatus: emp.accountStatus,
                            });
                            setFormOpen(true);
                          }}
                          className="p-1.5 text-slate-600 hover:text-[#1E4E79] rounded hover:bg-slate-100"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <PaginationBar
            page={page}
            totalItems={employees.length}
            pageSize={pageSize}
            onPageChange={setPage}
            prevLabel={t(lang, 'previous')}
            nextLabel={t(lang, 'next')}
          />
        </div>
      )}

      <Modal open={formOpen} title={editing ? t(lang, 'edit') : t(lang, 'newEmployee')} onClose={() => setFormOpen(false)}>
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">{t(lang, 'fullName')} *</label>
              <input
                type="text"
                required
                value={form.fullName}
                onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">{t(lang, 'employeeId')} *</label>
              <input
                type="text"
                required
                disabled={Boolean(editing)}
                value={form.employeeCode}
                onChange={(e) => setForm({ ...form, employeeCode: e.target.value.toUpperCase() })}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-md disabled:bg-slate-100"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">{t(lang, 'email')} *</label>
              <input
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
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
              <label className="block text-xs font-semibold text-slate-700 mb-1">{t(lang, 'position')} *</label>
              <input
                type="text"
                required
                value={form.position}
                onChange={(e) => setForm({ ...form, position: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">{t(lang, 'role')} *</label>
              <select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
              >
                {user.role === 'SUPER_ADMIN' && <option value="SUPER_ADMIN">Super Admin</option>}
                {(user.role === 'SUPER_ADMIN' || user.role === 'GENERAL_MANAGER') && (
                  <option value="GENERAL_MANAGER">General Manager</option>
                )}
                <option value="WAREHOUSE_MANAGER">Warehouse Manager</option>
                <option value="STOREKEEPER">Storekeeper</option>
                <option value="ACCOUNTANT">Accountant</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">{t(lang, 'assignedWarehouse')}</label>
              <select
                value={form.assignedWarehouseId}
                disabled={user.role === 'WAREHOUSE_MANAGER'}
                onChange={(e) => setForm({ ...form, assignedWarehouseId: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md disabled:bg-slate-100"
              >
                <option value="">All Warehouses (HQ)</option>
                {warehouses.map((w) => (
                  <option key={w._id} value={w._id}>
                    {w.name} ({w.code})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">{t(lang, 'status')}</label>
              <select
                value={form.accountStatus}
                onChange={(e) => setForm({ ...form, accountStatus: e.target.value as 'ACTIVE' | 'INACTIVE' })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
              >
                <option value="ACTIVE">{t(lang, 'active')}</option>
                <option value="INACTIVE">{t(lang, 'inactive')}</option>
              </select>
            </div>
            {!editing && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">{t(lang, 'username')} *</label>
                <input
                  type="text"
                  required
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
                />
              </div>
            )}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {editing ? 'Reset Password (optional)' : `${t(lang, 'password')} *`}
              </label>
              <input
                type="password"
                required={!editing}
                minLength={6}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="••••••"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setFormOpen(false)} className="px-4 py-2 text-sm border border-slate-300 rounded-md">
              {t(lang, 'cancel')}
            </button>
            <button type="submit" className="px-4 py-2 text-sm font-medium bg-[#1E4E79] text-white rounded-md">
              {t(lang, 'save')}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

import { Download, Save } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { t } from '../i18n/translations';
import { apiRequest, downloadAuthenticatedFile } from '../lib/api';
import type { CompanySettings, LanguageCode, RolePermissionSet, UserRole } from '../types/wms';

const ROLES: UserRole[] = [
  'SUPER_ADMIN',
  'GENERAL_MANAGER',
  'WAREHOUSE_MANAGER',
  'STOREKEEPER',
  'ACCOUNTANT',
];

const PERMISSION_KEYS: Array<keyof RolePermissionSet> = [
  'manageWarehouses',
  'manageProducts',
  'manageEmployees',
  'manageSuppliers',
  'stockIn',
  'stockOut',
  'createTransfer',
  'approveTransfer',
  'dispatchTransfer',
  'receiveTransfer',
  'stockAdjustment',
  'stockCount',
  'approveStockCount',
  'viewValuation',
  'exportReports',
  'manageSettings',
  'viewAuditLogs',
];

export function SettingsView({
  lang,
  onSettingsUpdated,
  onToast,
}: {
  lang: LanguageCode;
  onSettingsUpdated: (s: CompanySettings) => void;
  onToast: (type: 'success' | 'error' | 'info', text: string) => void;
}) {
  const [form, setForm] = useState<CompanySettings | null>(null);
  const [dbMode, setDbMode] = useState<'mongodb' | 'local'>('local');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiRequest('/api/settings')
      .then((res) => {
        setForm(res.data);
        setDbMode(res.dbStatus?.mode || 'local');
      })
      .catch((err) => onToast('error', err.message));
  }, []);

  if (!form) {
    return <div className="p-8 text-sm text-slate-500">{t(lang, 'loading')}</div>;
  }

  const togglePerm = (role: UserRole, perm: keyof RolePermissionSet) => {
    setForm({
      ...form,
      rolePermissions: {
        ...form.rolePermissions,
        [role]: {
          ...form.rolePermissions[role],
          [perm]: !form.rolePermissions[role][perm],
        },
      },
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await apiRequest('/api/settings', { method: 'PUT', body: form });
      onSettingsUpdated(res.data);
      onToast('success', lang === 'so' ? 'Dejinta nidaamka waa la keydiyay' : 'System settings saved');
    } catch (err: any) {
      onToast('error', err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSave} className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">{t(lang, 'navSettings')}</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {lang === 'so'
              ? 'Xogta shirkadda, luuqadda, xeerarka oggolaanshaha, iyo keydka xogta'
              : 'Company profile, localization, approval controls, RBAC permissions, and backups'}
          </p>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-[#1E4E79] text-white rounded-md hover:bg-[#163A5C] whitespace-nowrap shrink-0"
        >
          <Save className="w-4 h-4" />
          {saving ? t(lang, 'loading') : t(lang, 'save')}
        </button>
      </div>

      {/* General Settings */}
      <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-4">
        <h2 className="text-sm font-semibold text-slate-900">{t(lang, 'generalSettings')}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">{t(lang, 'companyName')}</label>
            <input
              type="text"
              value={form.companyName}
              onChange={(e) => setForm({ ...form, companyName: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">{t(lang, 'phone')}</label>
            <input
              type="text"
              value={form.companyPhone}
              onChange={(e) => setForm({ ...form, companyPhone: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">{t(lang, 'address')}</label>
            <input
              type="text"
              value={form.companyAddress}
              onChange={(e) => setForm({ ...form, companyAddress: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">{t(lang, 'languageLabel')}</label>
            <select
              value={form.language}
              onChange={(e) => setForm({ ...form, language: e.target.value as LanguageCode })}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
            >
              <option value="so">Soomaali (Primary)</option>
              <option value="en">English</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">{t(lang, 'dateFormatLabel')}</label>
            <select
              value={form.dateFormat}
              onChange={(e) => setForm({ ...form, dateFormat: e.target.value as any })}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
            >
              <option value="YYYY-MM-DD">YYYY-MM-DD</option>
              <option value="DD/MM/YYYY">DD/MM/YYYY</option>
              <option value="MM/DD/YYYY">MM/DD/YYYY</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">{t(lang, 'currencyLabel')}</label>
            <input
              type="text"
              disabled
              value="USD ($)"
              className="w-full px-3 py-2 text-sm border border-slate-200 bg-slate-50 rounded-md text-slate-500"
            />
          </div>
        </div>
      </div>

      {/* Approval & Notification Workflows */}
      <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-3">
        <h2 className="text-sm font-semibold text-slate-900">{t(lang, 'approvalWorkflows')}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <label className="flex items-center gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={form.requireTransferApproval}
              onChange={(e) => setForm({ ...form, requireTransferApproval: e.target.checked })}
              className="rounded border-slate-300"
            />
            <span>Require manager approval before warehouse transfer dispatch</span>
          </label>
          <label className="flex items-center gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={form.requireAdjustmentApproval}
              onChange={(e) => setForm({ ...form, requireAdjustmentApproval: e.target.checked })}
              className="rounded border-slate-300"
            />
            <span>Require manager approval for stock adjustments</span>
          </label>
          <label className="flex items-center gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={form.lowStockAlertsEnabled}
              onChange={(e) => setForm({ ...form, lowStockAlertsEnabled: e.target.checked })}
              className="rounded border-slate-300"
            />
            <span>Enable automatic Low Stock & Out of Stock alerts</span>
          </label>
          <label className="flex items-center gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={form.emailNotificationsEnabled}
              onChange={(e) => setForm({ ...form, emailNotificationsEnabled: e.target.checked })}
              className="rounded border-slate-300"
            />
            <span>Enable email notification dispatch</span>
          </label>
        </div>
      </div>

      {/* Role Permissions Matrix */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200">
          <h2 className="text-sm font-semibold text-slate-900">{t(lang, 'rolePermissions')}</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-2.5 font-semibold text-slate-700">Permission</th>
                {ROLES.map((r) => (
                  <th key={r} className="text-center px-3 py-2.5 font-semibold text-slate-700">
                    {r.replace(/_/g, ' ')}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {PERMISSION_KEYS.map((perm) => (
                <tr key={perm} className="hover:bg-slate-50">
                  <td className="px-4 py-2 font-medium text-slate-800 capitalize">
                    {perm.replace(/([A-Z])/g, ' $1')}
                  </td>
                  {ROLES.map((role) => (
                    <td key={role} className="px-3 py-2 text-center">
                      <input
                        type="checkbox"
                        disabled={role === 'SUPER_ADMIN'}
                        checked={Boolean(form.rolePermissions?.[role]?.[perm])}
                        onChange={() => togglePerm(role, perm)}
                        className="rounded border-slate-300"
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Database & Backup */}
      <div className="bg-white border border-slate-200 rounded-lg p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">{t(lang, 'databaseAndBackup')}</h2>
          <p className="text-xs text-slate-500 mt-1">
            {dbMode === 'mongodb'
              ? 'MongoDB Atlas connected via Mongoose (transactions enabled).'
              : 'Local persistent datastore active. Configure MONGODB_URI in environment secrets to connect MongoDB Atlas.'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => downloadAuthenticatedFile('/api/settings/backup', `khayre-wms-backup.json`)}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 rounded-md whitespace-nowrap shrink-0"
        >
          <Download className="w-4 h-4" />
          {t(lang, 'exportBackup')}
        </button>
      </div>
    </form>
  );
}

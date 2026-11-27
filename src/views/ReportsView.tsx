import { FileSpreadsheet, Printer } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { t } from '../i18n/translations';
import { apiRequest, downloadAuthenticatedFile, formatDate } from '../lib/api';
import type { AuthUser, Category, EmployeeRecord, LanguageCode, Product, Warehouse } from '../types/wms';
import { EmptyState, PaginationBar, TableSkeleton } from '../components/ui/Common';

const REPORT_TYPES = [
  { id: 'global-inventory', labelSo: 'Warbixinta Kaydka Guud', labelEn: '1. Global Inventory Report' },
  { id: 'warehouse-stock', labelSo: 'Warbixinta Kaydka Bakhaar Keliya', labelEn: '2. Individual Warehouse Stock Report' },
  { id: 'stock-in', labelSo: 'Warbixinta Alaabta Soo Gashay', labelEn: '3. Stock In Report' },
  { id: 'stock-out', labelSo: 'Warbixinta Alaabta Baxday', labelEn: '4. Stock Out Report' },
  { id: 'transfers', labelSo: 'Warbixinta Wareejinta Bakhaarada', labelEn: '5. Warehouse Transfer Report' },
  { id: 'low-stock', labelSo: 'Warbixinta Alaabta Yaraatay', labelEn: '6. Low Stock Report' },
  { id: 'out-of-stock', labelSo: 'Warbixinta Alaabta Dhamaatay', labelEn: '7. Out of Stock Report' },
  { id: 'valuation', labelSo: 'Warbixinta Qiimeynta Kaydka', labelEn: '8. Inventory Valuation Report' },
  { id: 'product-movement', labelSo: 'Warbixinta Dhaqdhaqaaqa Alaabta', labelEn: '9. Product Movement Report' },
  { id: 'employee-activity', labelSo: 'Warbixinta Hawlaha Shaqaalaha', labelEn: '10. Employee Activity Report' },
  { id: 'stock-counts', labelSo: 'Warbixinta Tirinta Kaydka', labelEn: '11. Physical Stock Count Report' },
  { id: 'adjustments', labelSo: 'Warbixinta Sixitaanka Kaydka', labelEn: '12. Stock Adjustment Report' },
];

export function ReportsView({
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
  const [section, setSection] = useState<'reports' | 'ledger' | 'audit'>('reports');
  const [reportType, setReportType] = useState('global-inventory');
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [employees, setEmployees] = useState<EmployeeRecord[]>([]);

  const [warehouseId, setWarehouseId] = useState('ALL');
  const [productId, setProductId] = useState('ALL');
  const [categoryId, setCategoryId] = useState('ALL');
  const [employeeId, setEmployeeId] = useState('ALL');
  const [transactionType, setTransactionType] = useState('ALL');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  useEffect(() => {
    Promise.all([
      apiRequest('/api/warehouses'),
      apiRequest('/api/products'),
      apiRequest('/api/categories'),
      user.permissions.manageEmployees ? apiRequest('/api/employees') : Promise.resolve({ data: [] }),
    ])
      .then(([wh, pr, cat, emp]) => {
        setWarehouses(wh.data || []);
        setProducts(pr.data || []);
        setCategories(cat.data || []);
        setEmployees(emp.data || []);
      })
      .catch(() => {});
  }, []);

  const buildQueryString = () => {
    const p = new URLSearchParams();
    if (warehouseId !== 'ALL') p.set('warehouseId', warehouseId);
    if (productId !== 'ALL') p.set('productId', productId);
    if (categoryId !== 'ALL') p.set('categoryId', categoryId);
    if (employeeId !== 'ALL') p.set('employeeId', employeeId);
    if (transactionType !== 'ALL') p.set('transactionType', transactionType);
    if (startDate) p.set('startDate', startDate);
    if (endDate) p.set('endDate', endDate);
    return p.toString();
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const qs = buildQueryString();
      if (section === 'reports') {
        const res = await apiRequest(`/api/reports/${reportType}?${qs}`);
        setRows(res.data || []);
      } else if (section === 'ledger') {
        const res = await apiRequest(`/api/ledger?${qs}`);
        setRows(res.data || []);
      } else {
        const res = await apiRequest('/api/audit-logs');
        setRows(res.data || []);
      }
      setPage(1);
    } catch (err: any) {
      onToast('error', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [section, reportType, warehouseId, productId, categoryId, employeeId, transactionType, startDate, endDate]);

  const pageSize = 15;
  const paged = rows.slice((page - 1) * pageSize, page * pageSize);

  const columns = rows.length > 0 ? Object.keys(rows[0]).filter((k) => !k.startsWith('_') && k !== 'readByUserIds') : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 no-print">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">{t(lang, 'navReports')}</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {lang === 'so'
              ? '12 warbixinood oo rasmi ah, diiwaanka kaydka, iyo diiwaanka hantidhawrka'
              : 'Operational & valuation reports, permanent stock ledger, and audit trails'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {section === 'reports' && user.permissions.exportReports && (
            <button
              type="button"
              onClick={() =>
                downloadAuthenticatedFile(
                  `/api/reports/${reportType}/export?${buildQueryString()}`,
                  `khayre-${reportType}.xlsx`
                )
              }
              className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium bg-white border border-slate-300 text-slate-700 rounded-md hover:bg-slate-50 whitespace-nowrap"
            >
              <FileSpreadsheet className="w-4 h-4" />
              {t(lang, 'exportExcel')}
            </button>
          )}
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium bg-[#1E4E79] text-white rounded-md hover:bg-[#163A5C] whitespace-nowrap"
          >
            <Printer className="w-4 h-4" />
            {t(lang, 'print')} / PDF
          </button>
        </div>
      </div>

      {/* Section Tabs */}
      <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-200/70 rounded-md w-fit no-print">
        <button
          type="button"
          onClick={() => setSection('reports')}
          className={`px-3 py-1.5 text-xs font-semibold rounded transition-colors ${
            section === 'reports' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          {t(lang, 'navReports')}
        </button>
        <button
          type="button"
          onClick={() => setSection('ledger')}
          className={`px-3 py-1.5 text-xs font-semibold rounded transition-colors ${
            section === 'ledger' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          {t(lang, 'stockLedger')}
        </button>
        {user.permissions.viewAuditLogs && (
          <button
            type="button"
            onClick={() => setSection('audit')}
            className={`px-3 py-1.5 text-xs font-semibold rounded transition-colors ${
              section === 'audit' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {t(lang, 'auditLogs')}
          </button>
        )}
      </div>

      {/* Filters */}
      {section !== 'audit' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-3 no-print">
          {section === 'reports' && (
            <select
              value={reportType}
              onChange={(e) => setReportType(e.target.value)}
              className="px-3 py-2 text-xs font-medium bg-white border border-slate-300 rounded-md sm:col-span-2"
            >
              {REPORT_TYPES.filter((rt) => rt.id !== 'valuation' || user.permissions.viewValuation).map((rt) => (
                <option key={rt.id} value={rt.id}>
                  {lang === 'so' ? rt.labelSo : rt.labelEn}
                </option>
              ))}
            </select>
          )}

          <select
            value={warehouseId}
            onChange={(e) => setWarehouseId(e.target.value)}
            className="px-3 py-2 text-xs bg-white border border-slate-300 rounded-md"
          >
            <option value="ALL">{t(lang, 'allWarehouses')}</option>
            {warehouses.map((w) => (
              <option key={w._id} value={w._id}>
                {w.name}
              </option>
            ))}
          </select>

          <select
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
            className="px-3 py-2 text-xs bg-white border border-slate-300 rounded-md"
          >
            <option value="ALL">{t(lang, 'all')} ({t(lang, 'product')})</option>
            {products.map((p) => (
              <option key={p._id} value={p._id}>
                {p.name}
              </option>
            ))}
          </select>

          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="px-3 py-2 text-xs bg-white border border-slate-300 rounded-md"
          >
            <option value="ALL">{t(lang, 'all')} ({t(lang, 'category')})</option>
            {categories.map((c) => (
              <option key={c._id} value={c._id}>
                {c.name}
              </option>
            ))}
          </select>

          {section === 'ledger' && (
            <select
              value={transactionType}
              onChange={(e) => setTransactionType(e.target.value)}
              className="px-3 py-2 text-xs bg-white border border-slate-300 rounded-md"
            >
              <option value="ALL">{t(lang, 'all')} (Movement)</option>
              <option value="STOCK_IN">STOCK_IN</option>
              <option value="STOCK_OUT">STOCK_OUT</option>
              <option value="TRANSFER_IN">TRANSFER_IN</option>
              <option value="TRANSFER_OUT">TRANSFER_OUT</option>
              <option value="ADJUSTMENT_IN">ADJUSTMENT_IN</option>
              <option value="ADJUSTMENT_OUT">ADJUSTMENT_OUT</option>
              <option value="DAMAGED_STOCK">DAMAGED_STOCK</option>
            </select>
          )}

          {employees.length > 0 && section === 'reports' && (
            <select
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              className="px-3 py-2 text-xs bg-white border border-slate-300 rounded-md"
            >
              <option value="ALL">{t(lang, 'all')} ({t(lang, 'navEmployees')})</option>
              {employees.map((e) => (
                <option key={e._id} value={e.userId || e._id}>
                  {e.fullName}
                </option>
              ))}
            </select>
          )}

          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="px-3 py-2 text-xs bg-white border border-slate-300 rounded-md"
          />
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="px-3 py-2 text-xs bg-white border border-slate-300 rounded-md"
          />
        </div>
      )}

      {loading ? (
        <TableSkeleton cols={6} />
      ) : rows.length === 0 ? (
        <EmptyState title={t(lang, 'noData')} />
      ) : section === 'ledger' ? (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="text-left px-3 py-3 font-semibold">{t(lang, 'txNumber')}</th>
                  <th className="text-left px-3 py-3 font-semibold">{t(lang, 'product')}</th>
                  <th className="text-left px-3 py-3 font-semibold">{t(lang, 'warehouse')}</th>
                  <th className="text-left px-3 py-3 font-semibold">Movement</th>
                  <th className="text-right px-3 py-3 font-semibold">Prev</th>
                  <th className="text-right px-3 py-3 font-semibold">In</th>
                  <th className="text-right px-3 py-3 font-semibold">Out</th>
                  <th className="text-right px-3 py-3 font-semibold">New</th>
                  <th className="text-left px-3 py-3 font-semibold">User</th>
                  <th className="text-left px-3 py-3 font-semibold">{t(lang, 'date')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paged.map((r) => (
                  <tr key={r._id} className="hover:bg-slate-50">
                    <td className="px-3 py-2.5 font-mono">{r.transactionNumber}</td>
                    <td className="px-3 py-2.5 font-medium text-slate-900">{r.productName}</td>
                    <td className="px-3 py-2.5">{r.warehouseName}</td>
                    <td className="px-3 py-2.5 font-mono text-[11px]">{r.movementType}</td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums">{r.previousQuantity}</td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums text-emerald-700 font-semibold">
                      {r.quantityIn > 0 ? `+${r.quantityIn}` : '0'}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums text-red-700 font-semibold">
                      {r.quantityOut > 0 ? `-${r.quantityOut}` : '0'}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums font-bold">{r.newQuantity}</td>
                    <td className="px-3 py-2.5">{r.performedByName}</td>
                    <td className="px-3 py-2.5 font-mono text-slate-500">{formatDate(r.transactionDate, dateFormat)}</td>
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
      ) : section === 'audit' ? (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold">{t(lang, 'date')}</th>
                  <th className="text-left px-4 py-3 font-semibold">User</th>
                  <th className="text-left px-4 py-3 font-semibold">{t(lang, 'role')}</th>
                  <th className="text-left px-4 py-3 font-semibold">Action</th>
                  <th className="text-left px-4 py-3 font-semibold">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paged.map((log) => (
                  <tr key={log._id} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5 font-mono text-slate-500 whitespace-nowrap">
                      {formatDate(log.createdAt, dateFormat)}
                    </td>
                    <td className="px-4 py-2.5 font-medium text-slate-900">{log.userName}</td>
                    <td className="px-4 py-2.5 font-mono text-[11px]">{log.userRole}</td>
                    <td className="px-4 py-2.5 font-mono font-semibold text-[#1E4E79]">{log.action}</td>
                    <td className="px-4 py-2.5 text-slate-700">{log.details}</td>
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
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                <tr>
                  {columns.map((col) => (
                    <th key={col} className="text-left px-4 py-3 font-semibold capitalize">
                      {col.replace(/([A-Z])/g, ' $1')}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paged.map((row, idx) => (
                  <tr key={idx} className="hover:bg-slate-50">
                    {columns.map((col) => (
                      <td key={col} className="px-4 py-2.5 font-mono text-slate-800 whitespace-nowrap">
                        {row[col] === null || row[col] === undefined ? '—' : String(row[col])}
                      </td>
                    ))}
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
    </div>
  );
}

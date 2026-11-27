import { Edit2, Eye, FolderPlus, Plus, Search } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { t } from '../i18n/translations';
import { apiRequest, formatCurrency, formatDate, formatNumber } from '../lib/api';
import type { AuthUser, Category, LanguageCode, Product } from '../types/wms';
import { EmptyState, Modal, PaginationBar, StatusLabel, TableSkeleton } from '../components/ui/Common';

const STANDARD_UNITS = ['Piece', 'Box', 'Carton', 'Meter', 'Kilogram', 'Liter', 'Bag', 'Roll'];

export function ProductsView({
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
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('ALL');
  const [page, setPage] = useState(1);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [customUnitMode, setCustomUnitMode] = useState(false);
  const [form, setForm] = useState({
    name: '',
    sku: '',
    barcode: '',
    categoryId: '',
    brand: '',
    unit: 'Piece',
    purchasePrice: 0,
    sellingPrice: 0,
    minimumStockLevel: 10,
    imageUrl: '',
    description: '',
    status: 'ACTIVE' as 'ACTIVE' | 'INACTIVE',
  });
  const [saving, setSaving] = useState(false);

  const [catOpen, setCatOpen] = useState(false);
  const [catName, setCatName] = useState('');
  const [catDesc, setCatDesc] = useState('');

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailData, setDetailData] = useState<any>(null);

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (categoryId !== 'ALL') params.set('categoryId', categoryId);
      const [prodRes, catRes] = await Promise.all([
        apiRequest(`/api/products?${params.toString()}`),
        apiRequest('/api/categories'),
      ]);
      setProducts(prodRes.data || []);
      setCategories(catRes.data || []);
    } catch (err: any) {
      onToast('error', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [search, categoryId]);

  const openCreate = () => {
    setEditing(null);
    setCustomUnitMode(false);
    setForm({
      name: '',
      sku: '',
      barcode: '',
      categoryId: categories[0]?._id || '',
      brand: '',
      unit: 'Piece',
      purchasePrice: 0,
      sellingPrice: 0,
      minimumStockLevel: 10,
      imageUrl: '',
      description: '',
      status: 'ACTIVE',
    });
    setFormOpen(true);
  };

  const openEdit = (p: Product) => {
    setEditing(p);
    setCustomUnitMode(!STANDARD_UNITS.includes(p.unit));
    setForm({
      name: p.name,
      sku: p.sku,
      barcode: p.barcode || '',
      categoryId: p.categoryId,
      brand: p.brand || '',
      unit: p.unit,
      purchasePrice: p.purchasePrice,
      sellingPrice: p.sellingPrice,
      minimumStockLevel: p.minimumStockLevel,
      imageUrl: p.imageUrl || '',
      description: p.description || '',
      status: p.status,
    });
    setFormOpen(true);
  };

  const openDetail = async (id: string) => {
    try {
      const res = await apiRequest(`/api/products/${id}`);
      setDetailData(res);
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
        await apiRequest(`/api/products/${editing._id}`, { method: 'PUT', body: form });
        onToast('success', lang === 'so' ? 'Alaabta waa la cusboonaysiiyay' : 'Product updated');
      } else {
        await apiRequest('/api/products', { method: 'POST', body: form });
        onToast('success', lang === 'so' ? 'Alaab cusub waa la daray' : 'Product created');
      }
      setFormOpen(false);
      load();
    } catch (err: any) {
      onToast('error', err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/api/categories', {
        method: 'POST',
        body: { name: catName, description: catDesc },
      });
      onToast('success', lang === 'so' ? 'Qeyb cusub waa la abuuray' : 'Category created');
      setCatName('');
      setCatDesc('');
      setCatOpen(false);
      load();
    } catch (err: any) {
      onToast('error', err.message);
    }
  };

  const pageSize = 10;
  const paged = products.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">{t(lang, 'navProducts')}</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {lang === 'so'
              ? 'Liiska dhexe ee alaabta ay wadaagaan dhammaan bakhaaradu'
              : 'Centralized product catalog shared across all company warehouses'}
          </p>
        </div>

        {user.permissions.manageProducts && (
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setCatOpen(true)}
              className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-md whitespace-nowrap"
            >
              <FolderPlus className="w-4 h-4" />
              {t(lang, 'newCategory')}
            </button>
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#1E4E79] hover:bg-[#163A5C] rounded-md whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              {t(lang, 'newProduct')}
            </button>
          </div>
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
      </div>

      {loading ? (
        <TableSkeleton cols={7} />
      ) : products.length === 0 ? (
        <EmptyState
          title={t(lang, 'noData')}
          actionLabel={user.permissions.manageProducts ? t(lang, 'newProduct') : undefined}
          onAction={user.permissions.manageProducts ? openCreate : undefined}
        />
      ) : (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold">{t(lang, 'productName')}</th>
                  <th className="text-left px-4 py-3 font-semibold">{t(lang, 'sku')}</th>
                  <th className="text-left px-4 py-3 font-semibold">{t(lang, 'category')}</th>
                  <th className="text-left px-4 py-3 font-semibold">{t(lang, 'unit')}</th>
                  {user.permissions.viewValuation && (
                    <th className="text-right px-4 py-3 font-semibold">{t(lang, 'purchasePrice')}</th>
                  )}
                  <th className="text-right px-4 py-3 font-semibold">{t(lang, 'sellingPrice')}</th>
                  <th className="text-right px-4 py-3 font-semibold">{t(lang, 'totalStockQty')}</th>
                  <th className="text-left px-4 py-3 font-semibold">{t(lang, 'status')}</th>
                  <th className="text-right px-4 py-3 font-semibold">{t(lang, 'actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paged.map((p) => (
                  <tr key={p._id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-900">{p.name}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-600">{p.sku}</td>
                    <td className="px-4 py-3 text-slate-600">{p.categoryName}</td>
                    <td className="px-4 py-3 text-slate-600">{p.unit}</td>
                    {user.permissions.viewValuation && (
                      <td className="px-4 py-3 text-right font-mono tabular-nums">{formatCurrency(p.purchasePrice)}</td>
                    )}
                    <td className="px-4 py-3 text-right font-mono tabular-nums">{formatCurrency(p.sellingPrice)}</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums font-semibold">
                      {formatNumber(p.globalQuantity ?? 0)}
                    </td>
                    <td className="px-4 py-3">
                      <StatusLabel status={p.status} label={p.status === 'ACTIVE' ? t(lang, 'active') : t(lang, 'inactive')} />
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => openDetail(p._id)}
                          className="p-1.5 text-slate-600 hover:text-[#1E4E79] rounded hover:bg-slate-100"
                          title={t(lang, 'view')}
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        {user.permissions.manageProducts && (
                          <button
                            type="button"
                            onClick={() => openEdit(p)}
                            className="p-1.5 text-slate-600 hover:text-[#1E4E79] rounded hover:bg-slate-100"
                            title={t(lang, 'edit')}
                          >
                            <Edit2 className="w-4 h-4" />
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
            totalItems={products.length}
            pageSize={pageSize}
            onPageChange={setPage}
            prevLabel={t(lang, 'previous')}
            nextLabel={t(lang, 'next')}
          />
        </div>
      )}

      {/* Product Form Modal */}
      <Modal
        open={formOpen}
        title={editing ? t(lang, 'edit') : t(lang, 'newProduct')}
        onClose={() => setFormOpen(false)}
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">{t(lang, 'productName')} *</label>
              <input
                type="text"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">{t(lang, 'sku')} *</label>
              <input
                type="text"
                required
                value={form.sku}
                onChange={(e) => setForm({ ...form, sku: e.target.value.toUpperCase() })}
                placeholder="CEM-50KG"
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">{t(lang, 'category')} *</label>
              <select
                required
                value={form.categoryId}
                onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
              >
                <option value="">—</option>
                {categories.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">{t(lang, 'unit')} *</label>
              {!customUnitMode ? (
                <select
                  value={form.unit}
                  onChange={(e) => {
                    if (e.target.value === '__CUSTOM__') {
                      setCustomUnitMode(true);
                      setForm({ ...form, unit: '' });
                    } else {
                      setForm({ ...form, unit: e.target.value });
                    }
                  }}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
                >
                  {STANDARD_UNITS.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                  <option value="__CUSTOM__">Other Custom Unit...</option>
                </select>
              ) : (
                <div className="flex gap-2">
                  <input
                    type="text"
                    required
                    value={form.unit}
                    onChange={(e) => setForm({ ...form, unit: e.target.value })}
                    placeholder="Pallet / Ton / Drum"
                    className="flex-1 px-3 py-2 text-sm border border-slate-300 rounded-md"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setCustomUnitMode(false);
                      setForm({ ...form, unit: 'Piece' });
                    }}
                    className="px-2.5 text-xs border border-slate-300 rounded-md"
                  >
                    List
                  </button>
                </div>
              )}
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">{t(lang, 'barcode')}</label>
              <input
                type="text"
                value={form.barcode}
                onChange={(e) => setForm({ ...form, barcode: e.target.value })}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">{t(lang, 'brand')}</label>
              <input
                type="text"
                value={form.brand}
                onChange={(e) => setForm({ ...form, brand: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">{t(lang, 'purchasePrice')}</label>
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
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">{t(lang, 'sellingPrice')}</label>
              <input
                type="number"
                step="0.01"
                min="0"
                required
                value={form.sellingPrice}
                onChange={(e) => setForm({ ...form, sellingPrice: Number(e.target.value) })}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">{t(lang, 'minStockLevel')}</label>
              <input
                type="number"
                min="0"
                required
                value={form.minimumStockLevel}
                onChange={(e) => setForm({ ...form, minimumStockLevel: Number(e.target.value) })}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-md"
              />
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

      {/* New Category Modal */}
      <Modal open={catOpen} title={t(lang, 'newCategory')} onClose={() => setCatOpen(false)} maxWidth="max-w-md">
        <form onSubmit={handleCreateCategory} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">{t(lang, 'category')} *</label>
            <input
              type="text"
              required
              value={catName}
              onChange={(e) => setCatName(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">{t(lang, 'description')}</label>
            <input
              type="text"
              value={catDesc}
              onChange={(e) => setCatDesc(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
            />
          </div>
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setCatOpen(false)}
              className="px-4 py-2 text-sm border border-slate-300 rounded-md"
            >
              {t(lang, 'cancel')}
            </button>
            <button type="submit" className="px-4 py-2 text-sm font-medium bg-[#1E4E79] text-white rounded-md">
              {t(lang, 'save')}
            </button>
          </div>
        </form>
      </Modal>

      {/* Product Detail Modal */}
      <Modal
        open={detailOpen}
        title={detailData?.product ? `${detailData.product.name} (${detailData.product.sku})` : ''}
        onClose={() => setDetailOpen(false)}
        maxWidth="max-w-4xl"
      >
        {detailData && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pb-4 border-b border-slate-200 text-xs">
              <div>
                <p className="text-slate-500">{t(lang, 'category')}</p>
                <p className="font-semibold text-slate-900 mt-0.5">{detailData.product.categoryName}</p>
              </div>
              <div>
                <p className="text-slate-500">{t(lang, 'unit')}</p>
                <p className="font-semibold text-slate-900 mt-0.5">{detailData.product.unit}</p>
              </div>
              <div>
                <p className="text-slate-500">{t(lang, 'totalStockQty')}</p>
                <p className="font-mono font-semibold text-slate-900 mt-0.5">
                  {formatNumber(detailData.product.globalQuantity)}
                </p>
              </div>
              {user.permissions.viewValuation && (
                <div>
                  <p className="text-slate-500">{t(lang, 'totalValue')}</p>
                  <p className="font-mono font-semibold text-slate-900 mt-0.5">
                    {formatCurrency(detailData.product.globalValue)}
                  </p>
                </div>
              )}
            </div>

            <div>
              <h4 className="text-xs font-semibold text-slate-700 mb-2">
                {lang === 'so' ? 'Kaydka Bakhaar Kasta' : 'Stock Across Warehouses'}
              </h4>
              <div className="border border-slate-200 rounded-md overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="text-left px-3 py-2 font-semibold">{t(lang, 'warehouse')}</th>
                      <th className="text-right px-3 py-2 font-semibold">{t(lang, 'availableQty')}</th>
                      {user.permissions.viewValuation && (
                        <th className="text-right px-3 py-2 font-semibold">{t(lang, 'totalValue')}</th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {detailData.warehouseStock.map((w: any) => (
                      <tr key={w._id}>
                        <td className="px-3 py-2 font-medium">{w.warehouseName} ({w.warehouseCode})</td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums">{formatNumber(w.availableQuantity)}</td>
                        {user.permissions.viewValuation && (
                          <td className="px-3 py-2 text-right font-mono tabular-nums">{formatCurrency(w.totalValue)}</td>
                        )}
                      </tr>
                    ))}
                    {detailData.warehouseStock.length === 0 && (
                      <tr>
                        <td colSpan={3} className="px-3 py-4 text-center text-slate-500">
                          {t(lang, 'noData')}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <h4 className="text-xs font-semibold text-slate-700 mb-2">{t(lang, 'stockLedger')}</h4>
              <div className="border border-slate-200 rounded-md overflow-x-auto max-h-60">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="text-left px-3 py-2 font-semibold">{t(lang, 'txNumber')}</th>
                      <th className="text-left px-3 py-2 font-semibold">{t(lang, 'warehouse')}</th>
                      <th className="text-left px-3 py-2 font-semibold">{t(lang, 'status')}</th>
                      <th className="text-right px-3 py-2 font-semibold">{t(lang, 'quantity')}</th>
                      <th className="text-left px-3 py-2 font-semibold">{t(lang, 'date')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {detailData.history.map((tx: any) => (
                      <tr key={tx._id}>
                        <td className="px-3 py-2 font-mono">{tx.transactionNumber}</td>
                        <td className="px-3 py-2">{tx.warehouseName}</td>
                        <td className="px-3 py-2">{tx.movementType}</td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums">{formatNumber(tx.quantity)}</td>
                        <td className="px-3 py-2 font-mono">{formatDate(tx.transactionDate, dateFormat)}</td>
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
          </div>
        )}
      </Modal>
    </div>
  );
}

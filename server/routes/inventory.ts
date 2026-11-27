import { Router } from 'express';
import type { StockStatus } from '../../src/types/wms.ts';
import { db } from '../db/adapter.ts';
import { AuthenticatedRequest, hasGlobalWarehouseAccess, requireAuth } from '../middleware/auth.ts';

const router = Router();
router.use(requireAuth);

function computeStockStatus(qty: number, minLevel: number): StockStatus {
  if (qty <= 0) return 'OUT_OF_STOCK';
  if (qty <= minLevel) return 'LOW_STOCK';
  return 'IN_STOCK';
}

router.get('/', async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const view = String(req.query.view || 'warehouse'); // 'warehouse' | 'global'
    const warehouseIdParam = String(req.query.warehouseId || '');
    const productIdParam = String(req.query.productId || '');
    const categoryIdParam = String(req.query.categoryId || '');
    const stockStatusParam = String(req.query.stockStatus || '');
    const search = String(req.query.search || '').trim().toLowerCase();

    let scopedWarehouseId = warehouseIdParam && warehouseIdParam !== 'ALL' ? warehouseIdParam : '';
    if (!hasGlobalWarehouseAccess(user)) {
      scopedWarehouseId = user.assignedWarehouseId || '__none__';
    }

    const [inventories, products, warehouses, categories] = await Promise.all([
      db.find('inventories', scopedWarehouseId ? { warehouseId: scopedWarehouseId } : {}),
      db.find('products', {}),
      db.find('warehouses', {}),
      db.find('categories', {}),
    ]);

    const productMap = new Map(products.map((p) => [String(p._id), p]));
    const warehouseMap = new Map(warehouses.map((w) => [String(w._id), w]));
    const categoryMap = new Map(categories.map((c) => [String(c._id), c.name]));

    if (view === 'global') {
      // Aggregate per product across warehouses (respecting warehouse scope for non-global users)
      const grouped = new Map<
        string,
        {
          product: any;
          totalAvailable: number;
          totalReserved: number;
          totalValue: number;
          warehouseBreakdown: Array<{
            warehouseId: string;
            warehouseName: string;
            warehouseCode: string;
            availableQuantity: number;
            reservedQuantity: number;
            averageCost: number | null;
            totalValue: number | null;
            stockStatus: StockStatus;
          }>;
        }
      >();

      for (const prod of products) {
        if (productIdParam && productIdParam !== 'ALL' && String(prod._id) !== productIdParam) continue;
        if (categoryIdParam && categoryIdParam !== 'ALL' && String(prod.categoryId) !== categoryIdParam) continue;
        if (
          search &&
          !prod.name.toLowerCase().includes(search) &&
          !prod.sku.toLowerCase().includes(search)
        ) {
          continue;
        }
        grouped.set(String(prod._id), {
          product: {
            ...prod,
            categoryName: categoryMap.get(String(prod.categoryId)) || 'Uncategorized',
          },
          totalAvailable: 0,
          totalReserved: 0,
          totalValue: 0,
          warehouseBreakdown: [],
        });
      }

      for (const inv of inventories) {
        const entry = grouped.get(String(inv.productId));
        const wh = warehouseMap.get(String(inv.warehouseId));
        if (!entry || !wh) continue;
        const qty = Number(inv.availableQuantity || 0);
        const resQty = Number(inv.reservedQuantity || 0);
        const val = Number(inv.totalValue || 0);
        entry.totalAvailable += qty;
        entry.totalReserved += resQty;
        entry.totalValue += val;
        entry.warehouseBreakdown.push({
          warehouseId: String(wh._id),
          warehouseName: wh.name,
          warehouseCode: wh.code,
          availableQuantity: qty,
          reservedQuantity: resQty,
          averageCost: user.permissions.viewValuation ? Number(inv.averageCost || 0) : null,
          totalValue: user.permissions.viewValuation ? Number(val.toFixed(2)) : null,
          stockStatus: computeStockStatus(qty, Number(entry.product.minimumStockLevel || 0)),
        });
      }

      let rows = Array.from(grouped.values()).map((g) => ({
        ...g,
        totalValue: user.permissions.viewValuation ? Number(g.totalValue.toFixed(2)) : null,
        stockStatus: computeStockStatus(g.totalAvailable, Number(g.product.minimumStockLevel || 0)),
      }));

      if (stockStatusParam && stockStatusParam !== 'ALL') {
        rows = rows.filter((r) => r.stockStatus === stockStatusParam);
      }

      res.json({ view: 'global', data: rows });
      return;
    }

    // Warehouse View (one row per Product + Warehouse record)
    let rows = inventories
      .map((inv) => {
        const prod = productMap.get(String(inv.productId));
        const wh = warehouseMap.get(String(inv.warehouseId));
        if (!prod || !wh) return null;
        const qty = Number(inv.availableQuantity || 0);
        const stockStatus = computeStockStatus(qty, Number(prod.minimumStockLevel || 0));
        return {
          _id: inv._id,
          productId: String(prod._id),
          warehouseId: String(wh._id),
          productName: prod.name,
          productSku: prod.sku,
          categoryId: String(prod.categoryId),
          categoryName: categoryMap.get(String(prod.categoryId)) || 'Uncategorized',
          unit: prod.unit,
          warehouseName: wh.name,
          warehouseCode: wh.code,
          availableQuantity: qty,
          reservedQuantity: Number(inv.reservedQuantity || 0),
          minimumStockLevel: Number(prod.minimumStockLevel || 0),
          purchasePrice: user.permissions.viewValuation ? Number(inv.averageCost || prod.purchasePrice || 0) : null,
          totalValue: user.permissions.viewValuation ? Number(inv.totalValue || 0) : null,
          stockStatus,
          lastUpdated: inv.lastUpdated || inv.updatedAt,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    if (productIdParam && productIdParam !== 'ALL') {
      rows = rows.filter((r) => r.productId === productIdParam);
    }
    if (categoryIdParam && categoryIdParam !== 'ALL') {
      rows = rows.filter((r) => r.categoryId === categoryIdParam);
    }
    if (stockStatusParam && stockStatusParam !== 'ALL') {
      rows = rows.filter((r) => r.stockStatus === stockStatusParam);
    }
    if (search) {
      rows = rows.filter(
        (r) =>
          r.productName.toLowerCase().includes(search) ||
          r.productSku.toLowerCase().includes(search) ||
          r.warehouseName.toLowerCase().includes(search)
      );
    }

    res.json({ view: 'warehouse', data: rows });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch inventory' });
  }
});

export default router;

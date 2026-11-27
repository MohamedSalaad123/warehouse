import { Router } from 'express';
import { db } from '../db/adapter.ts';
import {
  AuthenticatedRequest,
  canAccessWarehouse,
  hasGlobalWarehouseAccess,
  requireAuth,
} from '../middleware/auth.ts';

const router = Router();

router.use(requireAuth);

router.get('/dashboard', async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const requestedWarehouseId = req.query.warehouseId ? String(req.query.warehouseId) : '';
    const startDateStr = req.query.startDate ? String(req.query.startDate) : '';
    const endDateStr = req.query.endDate ? String(req.query.endDate) : '';

    let scopedWarehouseId: string | null = null;
    if (!hasGlobalWarehouseAccess(user)) {
      scopedWarehouseId = user.assignedWarehouseId || '__none__';
    } else if (requestedWarehouseId && requestedWarehouseId !== 'ALL') {
      scopedWarehouseId = requestedWarehouseId;
    }

    const [warehouses, products, inventories, transactions, transfers, employees] = await Promise.all([
      db.find('warehouses', {}),
      db.find('products', {}),
      db.find('inventories', scopedWarehouseId ? { warehouseId: scopedWarehouseId } : {}),
      db.find('stockTransactions', { status: 'CONFIRMED' }),
      db.find('stockTransfers', {}),
      db.find('employees', scopedWarehouseId ? { assignedWarehouseId: scopedWarehouseId } : {}),
    ]);

    const productMap = new Map(products.map((p) => [String(p._id), p]));
    const warehouseMap = new Map(warehouses.map((w) => [String(w._id), w]));

    const filteredWarehouses = scopedWarehouseId
      ? warehouses.filter((w) => String(w._id) === scopedWarehouseId)
      : warehouses;

    const totalWarehouses = filteredWarehouses.length;
    const activeWarehouses = filteredWarehouses.filter((w) => w.status === 'ACTIVE').length;
    const activeProducts = products.filter((p) => p.status === 'ACTIVE');

    let totalStockQuantity = 0;
    let totalInventoryValue = 0;
    let lowStockProducts = 0;
    let outOfStockProducts = 0;

    for (const inv of inventories) {
      const qty = Number(inv.availableQuantity || 0);
      const val = Number(inv.totalValue || 0);
      totalStockQuantity += qty;
      totalInventoryValue += val;
      const prod = productMap.get(String(inv.productId));
      if (prod && prod.status === 'ACTIVE') {
        if (qty <= 0) outOfStockProducts += 1;
        else if (qty <= Number(prod.minimumStockLevel || 0)) lowStockProducts += 1;
      }
    }

    // Date range bounds
    const startMs = startDateStr ? new Date(startDateStr).getTime() : 0;
    const endMs = endDateStr ? new Date(`${endDateStr}T23:59:59.999Z`).getTime() : Infinity;

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayMs = todayStart.getTime();

    let totalStockInToday = 0;
    let totalStockOutToday = 0;

    const scopedTx = transactions.filter((t) => {
      if (scopedWarehouseId && String(t.warehouseId) !== scopedWarehouseId) return false;
      const tMs = new Date(t.transactionDate || t.createdAt).getTime();
      if (tMs >= todayMs) {
        if (t.movementType === 'STOCK_IN') totalStockInToday += Number(t.quantityIn || t.quantity || 0);
        if (t.movementType === 'STOCK_OUT') totalStockOutToday += Number(t.quantityOut || t.quantity || 0);
      }
      return tMs >= startMs && tMs <= endMs;
    });

    const pendingTransfers = transfers.filter((tr) => {
      if (
        scopedWarehouseId &&
        String(tr.sourceWarehouseId) !== scopedWarehouseId &&
        String(tr.destinationWarehouseId) !== scopedWarehouseId
      ) {
        return false;
      }
      return ['PENDING_APPROVAL', 'APPROVED', 'IN_TRANSIT', 'PARTIALLY_RECEIVED'].includes(tr.status);
    }).length;

    // Chart 1: Stock In vs Stock Out (by day, last 14 days or within filter)
    const dayBucketMap = new Map<string, { date: string; stockIn: number; stockOut: number }>();
    for (const tx of scopedTx) {
      const dt = new Date(tx.transactionDate || tx.createdAt);
      const dayKey = dt.toISOString().slice(0, 10);
      const entry = dayBucketMap.get(dayKey) || { date: dayKey, stockIn: 0, stockOut: 0 };
      if (tx.direction === 'IN') entry.stockIn += Number(tx.quantityIn || tx.quantity || 0);
      else entry.stockOut += Number(tx.quantityOut || tx.quantity || 0);
      dayBucketMap.set(dayKey, entry);
    }
    const stockInVsOut = Array.from(dayBucketMap.values())
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-14);

    // Chart 2 & 5: Inventory distribution & valuation by warehouse
    const whStatsMap = new Map<string, { warehouseName: string; code: string; quantity: number; value: number }>();
    for (const w of filteredWarehouses) {
      whStatsMap.set(String(w._id), {
        warehouseName: w.name,
        code: w.code,
        quantity: 0,
        value: 0,
      });
    }
    for (const inv of inventories) {
      const entry = whStatsMap.get(String(inv.warehouseId));
      if (entry) {
        entry.quantity += Number(inv.availableQuantity || 0);
        entry.value = Number((entry.value + Number(inv.totalValue || 0)).toFixed(2));
      }
    }
    const warehouseDistribution = Array.from(whStatsMap.values());
    const warehouseValuation = Array.from(whStatsMap.values()).map((w) => ({
      name: w.warehouseName,
      code: w.code,
      value: user.permissions.viewValuation ? w.value : 0,
      quantity: w.quantity,
    }));

    // Chart 3: Top 10 products by stock quantity
    const prodQtyMap = new Map<string, { name: string; sku: string; quantity: number; value: number }>();
    for (const inv of inventories) {
      const prod = productMap.get(String(inv.productId));
      if (!prod) continue;
      const cur = prodQtyMap.get(String(prod._id)) || { name: prod.name, sku: prod.sku, quantity: 0, value: 0 };
      cur.quantity += Number(inv.availableQuantity || 0);
      cur.value = Number((cur.value + Number(inv.totalValue || 0)).toFixed(2));
      prodQtyMap.set(String(prod._id), cur);
    }
    const topProducts = Array.from(prodQtyMap.values())
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 10);

    // Chart 4: Monthly stock movement
    const monthMap = new Map<string, { month: string; inbound: number; outbound: number }>();
    for (const tx of scopedTx) {
      const mKey = new Date(tx.transactionDate || tx.createdAt).toISOString().slice(0, 7);
      const entry = monthMap.get(mKey) || { month: mKey, inbound: 0, outbound: 0 };
      if (tx.direction === 'IN') entry.inbound += Number(tx.quantityIn || tx.quantity || 0);
      else entry.outbound += Number(tx.quantityOut || tx.quantity || 0);
      monthMap.set(mKey, entry);
    }
    const monthlyMovement = Array.from(monthMap.values())
      .sort((a, b) => a.month.localeCompare(b.month))
      .slice(-12);

    // Recent activity feed (latest 8 confirmed transactions)
    const recentTransactions = scopedTx
      .sort((a, b) => new Date(b.transactionDate || b.createdAt).getTime() - new Date(a.transactionDate || a.createdAt).getTime())
      .slice(0, 8)
      .map((tx) => {
        const p = productMap.get(String(tx.productId));
        const w = warehouseMap.get(String(tx.warehouseId));
        return {
          _id: tx._id,
          transactionNumber: tx.transactionNumber,
          movementType: tx.movementType,
          quantity: tx.quantity,
          unit: tx.unit,
          productName: p?.name || 'Unknown',
          productSku: p?.sku || '',
          warehouseName: w?.name || 'Unknown',
          transactionDate: tx.transactionDate || tx.createdAt,
        };
      });

    res.json({
      kpis: {
        totalWarehouses,
        activeWarehouses,
        totalProducts: activeProducts.length,
        totalStockQuantity,
        totalInventoryValue: user.permissions.viewValuation ? Number(totalInventoryValue.toFixed(2)) : null,
        totalStockInToday,
        totalStockOutToday,
        lowStockProducts,
        outOfStockProducts,
        pendingTransfers,
        totalEmployees: employees.length,
      },
      charts: {
        stockInVsOut,
        warehouseDistribution,
        topProducts,
        monthlyMovement,
        warehouseValuation,
      },
      recentTransactions,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to compute dashboard metrics' });
  }
});

router.get('/search', async (req: AuthenticatedRequest, res) => {
  try {
    const q = String(req.query.q || '').trim().toLowerCase();
    if (!q || q.length < 2) {
      res.json({ warehouses: [], products: [], suppliers: [], transactions: [], transfers: [] });
      return;
    }

    const user = req.user!;
    const [warehouses, products, suppliers, transactions, transfers] = await Promise.all([
      db.find('warehouses', {}),
      db.find('products', {}),
      db.find('suppliers', {}),
      db.find('stockTransactions', {}, { sort: { createdAt: -1 }, limit: 100 }),
      db.find('stockTransfers', {}, { sort: { createdAt: -1 }, limit: 100 }),
    ]);

    const visibleWarehouses = warehouses.filter(
      (w) => canAccessWarehouse(user, w._id) && (w.name.toLowerCase().includes(q) || w.code.toLowerCase().includes(q) || w.location.toLowerCase().includes(q))
    );

    const visibleProducts = products
      .filter((p) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q) || (p.barcode || '').toLowerCase().includes(q))
      .slice(0, 8);

    const visibleSuppliers = suppliers
      .filter((s) => s.name.toLowerCase().includes(q) || s.companyName.toLowerCase().includes(q))
      .slice(0, 6);

    const visibleTx = transactions
      .filter((t) => canAccessWarehouse(user, t.warehouseId) && (t.transactionNumber.toLowerCase().includes(q) || (t.invoiceNumber || '').toLowerCase().includes(q)))
      .slice(0, 6);

    const visibleTrf = transfers
      .filter(
        (tr) =>
          (canAccessWarehouse(user, tr.sourceWarehouseId) || canAccessWarehouse(user, tr.destinationWarehouseId)) &&
          tr.transferNumber.toLowerCase().includes(q)
      )
      .slice(0, 6);

    res.json({
      warehouses: visibleWarehouses.slice(0, 6),
      products: visibleProducts,
      suppliers: visibleSuppliers,
      transactions: visibleTx,
      transfers: visibleTrf,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Search failed' });
  }
});

export default router;

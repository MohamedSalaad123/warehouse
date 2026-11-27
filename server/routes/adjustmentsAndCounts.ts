import { Router } from 'express';
import { db, withTransaction } from '../db/adapter.ts';
import {
  AuthenticatedRequest,
  canAccessWarehouse,
  hasGlobalWarehouseAccess,
  idempotencyGuard,
  requireAuth,
  requirePermission,
} from '../middleware/auth.ts';
import { emitNotification, generateSequenceNumber, recordAuditLog } from '../services/auditService.ts';
import { applyStockAdjustment } from '../services/inventoryService.ts';

export const adjustmentsRouter = Router();
adjustmentsRouter.use(requireAuth);

adjustmentsRouter.get('/', async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const warehouseId = String(req.query.warehouseId || '');
    const query: Record<string, any> = {};
    if (!hasGlobalWarehouseAccess(user)) {
      query.warehouseId = user.assignedWarehouseId || '__none__';
    } else if (warehouseId && warehouseId !== 'ALL') {
      query.warehouseId = warehouseId;
    }

    const [rows, warehouses, products, users] = await Promise.all([
      db.find('stockAdjustments', query, { sort: { createdAt: -1 } }),
      db.find('warehouses', {}),
      db.find('products', {}),
      db.find('users', {}),
    ]);
    const whMap = new Map(warehouses.map((w) => [String(w._id), w.name]));
    const prodMap = new Map(products.map((p) => [String(p._id), p]));
    const userMap = new Map(users.map((u) => [String(u._id), u.fullName]));

    const enriched = rows.map((r) => {
      const p = prodMap.get(String(r.productId));
      return {
        ...r,
        warehouseName: whMap.get(String(r.warehouseId)) || 'Unknown',
        productName: p?.name || 'Unknown',
        productSku: p?.sku || '',
        adjustedByName: userMap.get(String(r.adjustedByUserId)) || '',
        approvedByName: r.approvedByUserId ? userMap.get(String(r.approvedByUserId)) || '' : '',
      };
    });

    res.json({ data: enriched });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to load stock adjustments' });
  }
});

adjustmentsRouter.post('/', requirePermission('stockAdjustment'), idempotencyGuard, async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const { warehouseId, productId, adjustmentType, adjustmentQuantity, reason } = req.body;
    if (!warehouseId || !productId || !adjustmentType || !adjustmentQuantity || !reason) {
      res.status(400).json({ error: 'Warehouse, product, type, quantity, and reason are required' });
      return;
    }
    if (!canAccessWarehouse(user, warehouseId)) {
      res.status(403).json({ error: 'Unauthorized warehouse access' });
      return;
    }

    const created = await withTransaction((txDb) =>
      applyStockAdjustment(txDb, {
        warehouseId: String(warehouseId),
        productId: String(productId),
        adjustmentType,
        adjustmentQuantity: Number(adjustmentQuantity),
        reason: String(reason).trim(),
        adjustedByUser: user,
        approvedByUser: user,
        ipAddress: req.ip,
      })
    );

    res.status(201).json({ data: created });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to apply stock adjustment' });
  }
});

// Physical Stock Count Router
export const stockCountsRouter = Router();
stockCountsRouter.use(requireAuth);

stockCountsRouter.get('/', async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const warehouseId = String(req.query.warehouseId || '');
    const query: Record<string, any> = {};
    if (!hasGlobalWarehouseAccess(user)) {
      query.warehouseId = user.assignedWarehouseId || '__none__';
    } else if (warehouseId && warehouseId !== 'ALL') {
      query.warehouseId = warehouseId;
    }

    const [counts, warehouses, products, users] = await Promise.all([
      db.find('stockCounts', query, { sort: { createdAt: -1 } }),
      db.find('warehouses', {}),
      db.find('products', {}),
      db.find('users', {}),
    ]);

    const whMap = new Map(warehouses.map((w) => [String(w._id), w.name]));
    const prodMap = new Map(products.map((p) => [String(p._id), p]));
    const userMap = new Map(users.map((u) => [String(u._id), u.fullName]));

    const enriched = counts.map((c) => ({
      ...c,
      warehouseName: whMap.get(String(c.warehouseId)) || 'Unknown',
      createdByName: userMap.get(String(c.createdByUserId)) || '',
      approvedByName: c.approvedByUserId ? userMap.get(String(c.approvedByUserId)) || '' : '',
      items: (c.items || []).map((item: any) => {
        const p = prodMap.get(String(item.productId));
        return {
          ...item,
          productName: p?.name || 'Unknown',
          productSku: p?.sku || '',
          unit: p?.unit || '',
        };
      }),
    }));

    res.json({ data: enriched });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch stock counts' });
  }
});

stockCountsRouter.post('/', requirePermission('stockCount'), async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const { warehouseId, items, notes, submitForApproval } = req.body;
    if (!warehouseId || !Array.isArray(items) || items.length === 0) {
      res.status(400).json({ error: 'Warehouse and at least one counted product are required' });
      return;
    }
    if (!canAccessWarehouse(user, warehouseId)) {
      res.status(403).json({ error: 'Unauthorized warehouse access' });
      return;
    }

    const inventories = await db.find('inventories', { warehouseId });
    const invMap = new Map(inventories.map((i) => [String(i.productId), Number(i.availableQuantity || 0)]));

    const normalizedItems = items.map((item: any) => {
      const sysQty = invMap.get(String(item.productId)) ?? 0;
      const countedQty = Math.max(0, Number(item.countedQuantity ?? 0));
      return {
        productId: String(item.productId),
        systemQuantity: sysQty,
        countedQuantity: countedQty,
        difference: countedQty - sysQty,
        reason: String(item.reason || '').trim(),
      };
    });

    const countNumber = await generateSequenceNumber('CNT');
    const created = await db.insert('stockCounts', {
      countNumber,
      warehouseId: String(warehouseId),
      items: normalizedItems,
      status: submitForApproval ? 'SUBMITTED' : 'DRAFT',
      notes: String(notes || '').trim(),
      createdByUserId: user.id,
      approvedByUserId: null,
      countDate: new Date().toISOString(),
    });

    await recordAuditLog(db, user, {
      action: 'CREATE_STOCK_COUNT',
      entityType: 'StockCount',
      entityId: created._id,
      warehouseId: String(warehouseId),
      details: `Created physical stock count ${countNumber} with ${normalizedItems.length} products`,
      ipAddress: req.ip,
    });

    res.status(201).json({ data: created });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to create stock count' });
  }
});

stockCountsRouter.post('/:id/submit', requirePermission('stockCount'), async (req: AuthenticatedRequest, res) => {
  try {
    const id = String(req.params.id);
    const sc = await db.findById('stockCounts', id);
    if (!sc || sc.status !== 'DRAFT') {
      res.status(400).json({ error: 'Only DRAFT stock counts can be submitted' });
      return;
    }
    const updated = await db.updateById('stockCounts', id, { status: 'SUBMITTED' });
    res.json({ data: updated });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to submit stock count' });
  }
});

stockCountsRouter.post('/:id/approve', requirePermission('approveStockCount'), idempotencyGuard, async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const id = String(req.params.id);
    const sc = await db.findById('stockCounts', id);
    if (!sc) {
      res.status(404).json({ error: 'Stock count not found' });
      return;
    }
    if (sc.status !== 'SUBMITTED') {
      res.status(400).json({ error: 'Only SUBMITTED stock counts can be approved' });
      return;
    }
    if (!canAccessWarehouse(user, sc.warehouseId)) {
      res.status(403).json({ error: 'Unauthorized warehouse access' });
      return;
    }

    const updated = await withTransaction(async (txDb) => {
      const creatorDoc = await txDb.findById('users', sc.createdByUserId);
      const creatorUser = creatorDoc
        ? { ...user, id: creatorDoc._id, fullName: creatorDoc.fullName, role: creatorDoc.role }
        : user;

      for (const item of sc.items || []) {
        const diff = Number(item.difference || 0);
        if (diff !== 0) {
          await applyStockAdjustment(txDb, {
            warehouseId: sc.warehouseId,
            productId: item.productId,
            adjustmentType: 'PHYSICAL_COUNT_CORRECTION',
            adjustmentQuantity: diff,
            reason: item.reason || `Physical Stock Count ${sc.countNumber}`,
            adjustedByUser: creatorUser,
            approvedByUser: user,
            ipAddress: req.ip,
          });
        }
      }

      const approved = await txDb.updateById('stockCounts', id, {
        status: 'APPROVED',
        approvedByUserId: user.id,
      });

      await emitNotification(txDb, {
        type: 'STOCK_COUNT_APPROVED',
        title: `Stock Count Approved: ${sc.countNumber}`,
        message: `Physical inventory count ${sc.countNumber} was approved by ${user.fullName} and inventory variances applied.`,
        warehouseId: sc.warehouseId,
        targetRoles: ['SUPER_ADMIN', 'GENERAL_MANAGER', 'WAREHOUSE_MANAGER', 'ACCOUNTANT'],
        relatedId: sc._id,
      });

      await recordAuditLog(txDb, user, {
        action: 'APPROVE_STOCK_COUNT',
        entityType: 'StockCount',
        entityId: sc._id,
        warehouseId: sc.warehouseId,
        details: `Approved physical stock count ${sc.countNumber}`,
        ipAddress: req.ip,
      });

      return approved;
    });

    res.json({ data: updated });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to approve stock count' });
  }
});

stockCountsRouter.post('/:id/reject', requirePermission('approveStockCount'), async (req: AuthenticatedRequest, res) => {
  try {
    const id = String(req.params.id);
    const sc = await db.findById('stockCounts', id);
    if (!sc || sc.status !== 'SUBMITTED') {
      res.status(400).json({ error: 'Only SUBMITTED stock counts can be rejected' });
      return;
    }
    const updated = await db.updateById('stockCounts', id, {
      status: 'REJECTED',
      approvedByUserId: req.user!.id,
    });
    res.json({ data: updated });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to reject stock count' });
  }
});

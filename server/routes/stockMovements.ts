import { Router } from 'express';
import { db } from '../db/adapter.ts';
import {
  AuthenticatedRequest,
  canAccessWarehouse,
  hasGlobalWarehouseAccess,
  idempotencyGuard,
  requireAuth,
  requirePermission,
} from '../middleware/auth.ts';
import { generateSequenceNumber, recordAuditLog } from '../services/auditService.ts';
import { confirmStockInTransaction, confirmStockOutTransaction } from '../services/inventoryService.ts';

export const stockInRouter = Router();
stockInRouter.use(requireAuth);

async function enrichTransactions(list: any[], includeCost: boolean) {
  const [warehouses, products, suppliers, users] = await Promise.all([
    db.find('warehouses', {}),
    db.find('products', {}),
    db.find('suppliers', {}),
    db.find('users', {}),
  ]);
  const whMap = new Map(warehouses.map((w) => [String(w._id), w.name]));
  const prodMap = new Map(products.map((p) => [String(p._id), p]));
  const supMap = new Map(suppliers.map((s) => [String(s._id), s.companyName || s.name]));
  const userMap = new Map(users.map((u) => [String(u._id), u.fullName]));

  return list.map((t) => {
    const prod = prodMap.get(String(t.productId));
    return {
      ...t,
      warehouseName: whMap.get(String(t.warehouseId)) || 'Unknown',
      productName: prod?.name || 'Unknown',
      productSku: prod?.sku || '',
      supplierName: t.supplierId ? supMap.get(String(t.supplierId)) || '' : '',
      performedByName: userMap.get(String(t.performedByUserId)) || '',
      confirmedByName: t.confirmedByUserId ? userMap.get(String(t.confirmedByUserId)) || '' : '',
      unitPrice: includeCost ? t.unitPrice : null,
      totalAmount: includeCost ? t.totalAmount : null,
    };
  });
}

stockInRouter.get('/', async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const warehouseId = String(req.query.warehouseId || '');
    const status = String(req.query.status || '');
    const search = String(req.query.search || '').trim().toLowerCase();

    const query: Record<string, any> = { movementType: 'STOCK_IN' };
    if (!hasGlobalWarehouseAccess(user)) {
      query.warehouseId = user.assignedWarehouseId || '__none__';
    } else if (warehouseId && warehouseId !== 'ALL') {
      query.warehouseId = warehouseId;
    }
    if (status && status !== 'ALL') {
      query.status = status;
    }

    const raw = await db.find('stockTransactions', query, { sort: { createdAt: -1 } });
    let enriched = await enrichTransactions(raw, user.permissions.viewValuation);

    if (search) {
      enriched = enriched.filter(
        (t) =>
          t.transactionNumber.toLowerCase().includes(search) ||
          t.productName.toLowerCase().includes(search) ||
          t.productSku.toLowerCase().includes(search) ||
          (t.invoiceNumber || '').toLowerCase().includes(search) ||
          (t.supplierName || '').toLowerCase().includes(search)
      );
    }

    res.json({ data: enriched });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch Stock In transactions' });
  }
});

stockInRouter.post('/', requirePermission('stockIn'), idempotencyGuard, async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const {
      warehouseId,
      productId,
      quantity,
      unit,
      purchasePrice,
      supplierId,
      invoiceNumber,
      notes,
      attachmentName,
      confirmImmediately,
    } = req.body;

    if (!warehouseId || !productId || !quantity || Number(quantity) <= 0) {
      res.status(400).json({ error: 'Warehouse, product, and positive quantity are required' });
      return;
    }
    if (!canAccessWarehouse(user, warehouseId)) {
      res.status(403).json({ error: 'Unauthorized warehouse access' });
      return;
    }

    const product = await db.findById('products', productId);
    if (!product) {
      res.status(404).json({ error: 'Product not found' });
      return;
    }

    const txNum = await generateSequenceNumber('SIN');
    const qty = Number(quantity);
    const price = purchasePrice !== undefined && purchasePrice !== '' ? Math.max(0, Number(purchasePrice)) : Number(product.purchasePrice || 0);

    const draft = await db.insert('stockTransactions', {
      transactionNumber: txNum,
      warehouseId: String(warehouseId),
      productId: String(productId),
      movementType: 'STOCK_IN',
      direction: 'IN',
      status: 'DRAFT',
      quantity: qty,
      previousQuantity: 0,
      quantityIn: 0,
      quantityOut: 0,
      newQuantity: 0,
      unit: String(unit || product.unit),
      unitPrice: price,
      totalAmount: Number((qty * price).toFixed(2)),
      supplierId: supplierId || null,
      invoiceNumber: String(invoiceNumber || '').trim(),
      notes: String(notes || '').trim(),
      attachmentName: String(attachmentName || '').trim(),
      performedByUserId: user.id,
      confirmedByUserId: null,
      transactionDate: new Date().toISOString(),
    });

    await recordAuditLog(db, user, {
      action: 'CREATE_STOCK_IN_DRAFT',
      entityType: 'StockTransaction',
      entityId: draft._id,
      warehouseId: String(warehouseId),
      details: `Created Stock In draft ${txNum} (${qty} ${product.name})`,
      ipAddress: req.ip,
    });

    if (confirmImmediately === true) {
      const confirmed = await confirmStockInTransaction(draft._id, user, req.ip);
      res.status(201).json({ data: confirmed });
      return;
    }

    res.status(201).json({ data: draft });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to create Stock In' });
  }
});

stockInRouter.put('/:id', requirePermission('stockIn'), async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const id = String(req.params.id);
    const existing = await db.findById('stockTransactions', id);
    if (!existing || existing.movementType !== 'STOCK_IN') {
      res.status(404).json({ error: 'Stock In transaction not found' });
      return;
    }
    if (existing.status !== 'DRAFT') {
      res.status(409).json({ error: 'Only DRAFT transactions can be edited. Completed transactions are immutable.' });
      return;
    }
    if (!canAccessWarehouse(user, existing.warehouseId)) {
      res.status(403).json({ error: 'Unauthorized warehouse access' });
      return;
    }

    const body = req.body;
    const qty = body.quantity !== undefined ? Number(body.quantity) : existing.quantity;
    const price = body.purchasePrice !== undefined ? Math.max(0, Number(body.purchasePrice)) : existing.unitPrice;
    if (qty <= 0) {
      res.status(400).json({ error: 'Quantity must be positive' });
      return;
    }

    const updated = await db.updateById('stockTransactions', id, {
      warehouseId: body.warehouseId || existing.warehouseId,
      productId: body.productId || existing.productId,
      quantity: qty,
      unit: body.unit || existing.unit,
      unitPrice: price,
      totalAmount: Number((qty * price).toFixed(2)),
      supplierId: body.supplierId !== undefined ? body.supplierId || null : existing.supplierId,
      invoiceNumber: body.invoiceNumber !== undefined ? String(body.invoiceNumber).trim() : existing.invoiceNumber,
      notes: body.notes !== undefined ? String(body.notes).trim() : existing.notes,
      attachmentName: body.attachmentName !== undefined ? String(body.attachmentName).trim() : existing.attachmentName,
    });

    res.json({ data: updated });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to update Stock In draft' });
  }
});

stockInRouter.post('/:id/confirm', requirePermission('stockIn'), idempotencyGuard, async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const id = String(req.params.id);
    const existing = await db.findById('stockTransactions', id);
    if (!existing) {
      res.status(404).json({ error: 'Transaction not found' });
      return;
    }
    if (!canAccessWarehouse(user, existing.warehouseId)) {
      res.status(403).json({ error: 'Unauthorized warehouse access' });
      return;
    }

    const confirmed = await confirmStockInTransaction(id, user, req.ip);
    res.json({ data: confirmed });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to confirm Stock In' });
  }
});

// Stock Out Router
export const stockOutRouter = Router();
stockOutRouter.use(requireAuth);

stockOutRouter.get('/', async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const warehouseId = String(req.query.warehouseId || '');
    const status = String(req.query.status || '');
    const search = String(req.query.search || '').trim().toLowerCase();

    const query: Record<string, any> = { movementType: 'STOCK_OUT' };
    if (!hasGlobalWarehouseAccess(user)) {
      query.warehouseId = user.assignedWarehouseId || '__none__';
    } else if (warehouseId && warehouseId !== 'ALL') {
      query.warehouseId = warehouseId;
    }
    if (status && status !== 'ALL') {
      query.status = status;
    }

    const raw = await db.find('stockTransactions', query, { sort: { createdAt: -1 } });
    let enriched = await enrichTransactions(raw, user.permissions.viewValuation);

    if (search) {
      enriched = enriched.filter(
        (t) =>
          t.transactionNumber.toLowerCase().includes(search) ||
          t.productName.toLowerCase().includes(search) ||
          t.productSku.toLowerCase().includes(search) ||
          (t.destinationCustomer || '').toLowerCase().includes(search) ||
          (t.referenceNumber || '').toLowerCase().includes(search)
      );
    }

    res.json({ data: enriched });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch Stock Out transactions' });
  }
});

stockOutRouter.post('/', requirePermission('stockOut'), idempotencyGuard, async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const {
      warehouseId,
      productId,
      quantity,
      destinationCustomer,
      referenceNumber,
      reason,
      notes,
      confirmImmediately,
    } = req.body;

    if (!warehouseId || !productId || !quantity || Number(quantity) <= 0) {
      res.status(400).json({ error: 'Warehouse, product, and positive requested quantity are required' });
      return;
    }
    if (!canAccessWarehouse(user, warehouseId)) {
      res.status(403).json({ error: 'Unauthorized warehouse access' });
      return;
    }

    const product = await db.findById('products', productId);
    if (!product) {
      res.status(404).json({ error: 'Product not found' });
      return;
    }

    const inv = await db.findOne('inventories', { warehouseId, productId });
    const available = Number(inv?.availableQuantity || 0);
    const qty = Number(quantity);
    if (available < qty) {
      res.status(400).json({
        error: `Insufficient stock. Available: ${available} ${product.unit}, Requested: ${qty} ${product.unit}.`,
      });
      return;
    }

    const txNum = await generateSequenceNumber('SOUT');
    const avgCost = Number(inv?.averageCost || product.purchasePrice || 0);

    const draft = await db.insert('stockTransactions', {
      transactionNumber: txNum,
      warehouseId: String(warehouseId),
      productId: String(productId),
      movementType: 'STOCK_OUT',
      direction: 'OUT',
      status: 'DRAFT',
      quantity: qty,
      previousQuantity: available,
      quantityIn: 0,
      quantityOut: 0,
      newQuantity: available,
      unit: product.unit,
      unitPrice: avgCost,
      totalAmount: Number((qty * avgCost).toFixed(2)),
      destinationCustomer: String(destinationCustomer || '').trim(),
      referenceNumber: String(referenceNumber || '').trim(),
      reason: String(reason || '').trim(),
      notes: String(notes || '').trim(),
      performedByUserId: user.id,
      confirmedByUserId: null,
      transactionDate: new Date().toISOString(),
    });

    if (confirmImmediately === true) {
      const confirmed = await confirmStockOutTransaction(draft._id, user, req.ip);
      res.status(201).json({ data: confirmed });
      return;
    }

    res.status(201).json({ data: draft });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to create Stock Out' });
  }
});

stockOutRouter.post('/:id/confirm', requirePermission('stockOut'), idempotencyGuard, async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const id = String(req.params.id);
    const existing = await db.findById('stockTransactions', id);
    if (!existing) {
      res.status(404).json({ error: 'Transaction not found' });
      return;
    }
    if (!canAccessWarehouse(user, existing.warehouseId)) {
      res.status(403).json({ error: 'Unauthorized warehouse access' });
      return;
    }

    const confirmed = await confirmStockOutTransaction(id, user, req.ip);
    res.json({ data: confirmed });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to confirm Stock Out' });
  }
});

// Permanent Stock Ledger Router
export const ledgerRouter = Router();
ledgerRouter.use(requireAuth);

ledgerRouter.get('/', async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const warehouseId = String(req.query.warehouseId || '');
    const productId = String(req.query.productId || '');
    const movementType = String(req.query.movementType || '');

    const query: Record<string, any> = { status: 'CONFIRMED' };
    if (!hasGlobalWarehouseAccess(user)) {
      query.warehouseId = user.assignedWarehouseId || '__none__';
    } else if (warehouseId && warehouseId !== 'ALL') {
      query.warehouseId = warehouseId;
    }
    if (productId && productId !== 'ALL') {
      query.productId = productId;
    }
    if (movementType && movementType !== 'ALL') {
      query.movementType = movementType;
    }

    const raw = await db.find('stockTransactions', query, { sort: { transactionDate: -1 }, limit: 250 });
    const enriched = await enrichTransactions(raw, user.permissions.viewValuation);
    res.json({ data: enriched });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch stock ledger' });
  }
});

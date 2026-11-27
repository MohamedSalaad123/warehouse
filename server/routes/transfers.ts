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
import { emitNotification, generateSequenceNumber, recordAuditLog } from '../services/auditService.ts';
import { dispatchTransfer, receiveTransfer } from '../services/inventoryService.ts';

const router = Router();
router.use(requireAuth);

async function enrichTransfers(list: any[], includeCost: boolean) {
  const [warehouses, products, users] = await Promise.all([
    db.find('warehouses', {}),
    db.find('products', {}),
    db.find('users', {}),
  ]);
  const whMap = new Map(warehouses.map((w) => [String(w._id), w.name]));
  const prodMap = new Map(products.map((p) => [String(p._id), p]));
  const userMap = new Map(users.map((u) => [String(u._id), u.fullName]));

  return list.map((tr) => {
    const prod = prodMap.get(String(tr.productId));
    return {
      ...tr,
      sourceWarehouseName: whMap.get(String(tr.sourceWarehouseId)) || 'Unknown',
      destinationWarehouseName: whMap.get(String(tr.destinationWarehouseId)) || 'Unknown',
      productName: prod?.name || 'Unknown',
      productSku: prod?.sku || '',
      unit: prod?.unit || '',
      requestedByName: userMap.get(String(tr.requestedByUserId)) || '',
      approvedByName: tr.approvedByUserId ? userMap.get(String(tr.approvedByUserId)) || '' : '',
      unitCost: includeCost ? tr.unitCost : null,
    };
  });
}

router.get('/', async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const status = String(req.query.status || '');
    const warehouseId = String(req.query.warehouseId || '');
    const search = String(req.query.search || '').trim().toLowerCase();

    let list = await db.find('stockTransfers', {}, { sort: { createdAt: -1 } });

    if (!hasGlobalWarehouseAccess(user)) {
      const assigned = String(user.assignedWarehouseId || '');
      list = list.filter(
        (tr) => String(tr.sourceWarehouseId) === assigned || String(tr.destinationWarehouseId) === assigned
      );
    } else if (warehouseId && warehouseId !== 'ALL') {
      list = list.filter(
        (tr) => String(tr.sourceWarehouseId) === warehouseId || String(tr.destinationWarehouseId) === warehouseId
      );
    }

    if (status && status !== 'ALL') {
      list = list.filter((tr) => tr.status === status);
    }

    let enriched = await enrichTransfers(list, user.permissions.viewValuation);
    if (search) {
      enriched = enriched.filter(
        (tr) =>
          tr.transferNumber.toLowerCase().includes(search) ||
          tr.productName.toLowerCase().includes(search) ||
          tr.sourceWarehouseName.toLowerCase().includes(search) ||
          tr.destinationWarehouseName.toLowerCase().includes(search)
      );
    }

    res.json({ data: enriched });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch transfers' });
  }
});

router.post('/', requirePermission('createTransfer'), idempotencyGuard, async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const { sourceWarehouseId, destinationWarehouseId, productId, quantity, notes, saveAsDraft } = req.body;

    if (!sourceWarehouseId || !destinationWarehouseId || !productId || !quantity) {
      res.status(400).json({ error: 'Source warehouse, destination warehouse, product, and quantity are required' });
      return;
    }
    if (String(sourceWarehouseId) === String(destinationWarehouseId)) {
      res.status(400).json({ error: 'Source and destination warehouses cannot be the same' });
      return;
    }
    if (!canAccessWarehouse(user, sourceWarehouseId)) {
      res.status(403).json({ error: 'You can only initiate transfers from your assigned warehouse' });
      return;
    }

    const qty = Number(quantity);
    if (qty <= 0) {
      res.status(400).json({ error: 'Transfer quantity must be greater than zero' });
      return;
    }

    const [sourceWh, destWh, product, inv] = await Promise.all([
      db.findById('warehouses', sourceWarehouseId),
      db.findById('warehouses', destinationWarehouseId),
      db.findById('products', productId),
      db.findOne('inventories', { warehouseId: sourceWarehouseId, productId }),
    ]);

    if (!sourceWh || !destWh || !product) {
      res.status(404).json({ error: 'Warehouse or product not found' });
      return;
    }

    const available = Number(inv?.availableQuantity || 0);
    if (available < qty) {
      res.status(400).json({
        error: `Insufficient stock in ${sourceWh.name}. Available: ${available} ${product.unit}, Requested: ${qty}`,
      });
      return;
    }

    const settings = await db.findOne('companySettings', {});
    const requiresApproval = settings ? settings.requireTransferApproval !== false : true;
    const initialStatus = saveAsDraft ? 'DRAFT' : requiresApproval ? 'PENDING_APPROVAL' : 'APPROVED';

    const trfNum = await generateSequenceNumber('TRF');
    const created = await db.insert('stockTransfers', {
      transferNumber: trfNum,
      sourceWarehouseId: String(sourceWarehouseId),
      destinationWarehouseId: String(destinationWarehouseId),
      productId: String(productId),
      quantity: qty,
      dispatchedQuantity: 0,
      receivedQuantity: 0,
      damagedQuantity: 0,
      missingQuantity: 0,
      unitCost: Number(inv?.averageCost || product.purchasePrice || 0),
      status: initialStatus,
      transferDate: new Date().toISOString(),
      requestedByUserId: user.id,
      approvedByUserId: initialStatus === 'APPROVED' ? user.id : null,
      notes: String(notes || '').trim(),
      receiptHistory: [],
    });

    if (initialStatus === 'PENDING_APPROVAL') {
      await emitNotification(db, {
        type: 'TRANSFER_REQUEST',
        title: `Transfer Request: ${trfNum}`,
        message: `${user.fullName} requested transfer of ${qty} ${product.unit} of ${product.name} from ${sourceWh.name} to ${destWh.name}.`,
        warehouseId: sourceWh._id,
        targetRoles: ['SUPER_ADMIN', 'GENERAL_MANAGER', 'WAREHOUSE_MANAGER'],
        relatedId: created._id,
      });
    }

    await recordAuditLog(db, user, {
      action: 'CREATE_TRANSFER',
      entityType: 'StockTransfer',
      entityId: created._id,
      warehouseId: sourceWh._id,
      details: `Created transfer ${trfNum} (${qty} ${product.name}: ${sourceWh.name} -> ${destWh.name}), status: ${initialStatus}`,
      ipAddress: req.ip,
    });

    res.status(201).json({ data: created });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to create transfer' });
  }
});

router.post('/:id/submit', requirePermission('createTransfer'), async (req: AuthenticatedRequest, res) => {
  try {
    const id = String(req.params.id);
    const tr = await db.findById('stockTransfers', id);
    if (!tr || tr.status !== 'DRAFT') {
      res.status(400).json({ error: 'Only DRAFT transfers can be submitted' });
      return;
    }
    const updated = await db.updateById('stockTransfers', id, { status: 'PENDING_APPROVAL' });
    await emitNotification(db, {
      type: 'TRANSFER_REQUEST',
      title: `Transfer Submitted: ${tr.transferNumber}`,
      message: `Transfer ${tr.transferNumber} is awaiting manager approval.`,
      warehouseId: tr.sourceWarehouseId,
      targetRoles: ['SUPER_ADMIN', 'GENERAL_MANAGER', 'WAREHOUSE_MANAGER'],
      relatedId: tr._id,
    });
    res.json({ data: updated });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to submit transfer' });
  }
});

router.post('/:id/approve', requirePermission('approveTransfer'), idempotencyGuard, async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const id = String(req.params.id);
    const tr = await db.findById('stockTransfers', id);
    if (!tr) {
      res.status(404).json({ error: 'Transfer not found' });
      return;
    }
    if (tr.status !== 'PENDING_APPROVAL') {
      res.status(400).json({ error: 'Only PENDING_APPROVAL transfers can be approved' });
      return;
    }
    if (!hasGlobalWarehouseAccess(user) && !canAccessWarehouse(user, tr.sourceWarehouseId)) {
      res.status(403).json({ error: 'Unauthorized to approve transfer for this warehouse' });
      return;
    }

    const updated = await db.updateById('stockTransfers', id, {
      status: 'APPROVED',
      approvedByUserId: user.id,
    });

    await emitNotification(db, {
      type: 'TRANSFER_APPROVED',
      title: `Transfer Approved: ${tr.transferNumber}`,
      message: `Transfer ${tr.transferNumber} was approved by ${user.fullName} and is ready for dispatch.`,
      warehouseId: tr.sourceWarehouseId,
      targetRoles: ['SUPER_ADMIN', 'GENERAL_MANAGER', 'WAREHOUSE_MANAGER', 'STOREKEEPER'],
      relatedId: tr._id,
    });

    await recordAuditLog(db, user, {
      action: 'APPROVE_TRANSFER',
      entityType: 'StockTransfer',
      entityId: tr._id,
      warehouseId: tr.sourceWarehouseId,
      details: `Approved transfer ${tr.transferNumber}`,
      ipAddress: req.ip,
    });

    res.json({ data: updated });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to approve transfer' });
  }
});

router.post('/:id/reject', requirePermission('approveTransfer'), async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const id = String(req.params.id);
    const tr = await db.findById('stockTransfers', id);
    if (!tr) {
      res.status(404).json({ error: 'Transfer not found' });
      return;
    }
    if (!['PENDING_APPROVAL', 'APPROVED'].includes(tr.status)) {
      res.status(400).json({ error: 'Only pending or approved (undispatched) transfers can be rejected' });
      return;
    }

    const reason = String(req.body.reason || 'Rejected by manager').trim();
    const updated = await db.updateById('stockTransfers', id, {
      status: 'REJECTED',
      approvedByUserId: user.id,
      rejectionReason: reason,
    });

    await emitNotification(db, {
      type: 'TRANSFER_REJECTED',
      title: `Transfer Rejected: ${tr.transferNumber}`,
      message: `Transfer ${tr.transferNumber} was rejected by ${user.fullName}. Reason: ${reason}`,
      warehouseId: tr.sourceWarehouseId,
      targetRoles: ['SUPER_ADMIN', 'GENERAL_MANAGER', 'WAREHOUSE_MANAGER', 'STOREKEEPER'],
      relatedId: tr._id,
    });

    await recordAuditLog(db, user, {
      action: 'REJECT_TRANSFER',
      entityType: 'StockTransfer',
      entityId: tr._id,
      warehouseId: tr.sourceWarehouseId,
      details: `Rejected transfer ${tr.transferNumber}: ${reason}`,
      ipAddress: req.ip,
    });

    res.json({ data: updated });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to reject transfer' });
  }
});

router.post('/:id/dispatch', requirePermission('dispatchTransfer'), idempotencyGuard, async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const id = String(req.params.id);
    const tr = await db.findById('stockTransfers', id);
    if (!tr) {
      res.status(404).json({ error: 'Transfer not found' });
      return;
    }
    if (!canAccessWarehouse(user, tr.sourceWarehouseId)) {
      res.status(403).json({ error: 'Only the source warehouse or global managers can dispatch this transfer' });
      return;
    }
    const updated = await dispatchTransfer(id, user, req.ip);
    res.json({ data: updated });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to dispatch transfer' });
  }
});

router.post('/:id/receive', requirePermission('receiveTransfer'), idempotencyGuard, async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const id = String(req.params.id);
    const tr = await db.findById('stockTransfers', id);
    if (!tr) {
      res.status(404).json({ error: 'Transfer not found' });
      return;
    }
    if (!canAccessWarehouse(user, tr.destinationWarehouseId)) {
      res.status(403).json({ error: 'Only the destination warehouse or global managers can confirm receipt' });
      return;
    }
    const updated = await receiveTransfer(id, req.body, user, req.ip);
    res.json({ data: updated });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to receive transfer' });
  }
});

router.post('/:id/cancel', requirePermission('createTransfer'), async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const id = String(req.params.id);
    const tr = await db.findById('stockTransfers', id);
    if (!tr) {
      res.status(404).json({ error: 'Transfer not found' });
      return;
    }
    if (!['DRAFT', 'PENDING_APPROVAL', 'APPROVED'].includes(tr.status)) {
      res.status(400).json({ error: 'Cannot cancel a transfer that has already been dispatched' });
      return;
    }
    const updated = await db.updateById('stockTransfers', id, { status: 'CANCELLED' });
    await recordAuditLog(db, user, {
      action: 'CANCEL_TRANSFER',
      entityType: 'StockTransfer',
      entityId: tr._id,
      warehouseId: tr.sourceWarehouseId,
      details: `Cancelled transfer ${tr.transferNumber}`,
      ipAddress: req.ip,
    });
    res.json({ data: updated });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to cancel transfer' });
  }
});

export default router;

import { Router } from 'express';
import { db } from '../db/adapter.ts';
import {
  AuthenticatedRequest,
  canAccessWarehouse,
  hasGlobalWarehouseAccess,
  requireAuth,
  requirePermission,
} from '../middleware/auth.ts';
import { recordAuditLog } from '../services/auditService.ts';

const router = Router();

router.use(requireAuth);

router.get('/', async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const search = String(req.query.search || '').trim().toLowerCase();
    const status = String(req.query.status || '').trim();
    const includeAllForTransfer = req.query.forTransfer === 'true';

    const [warehouses, inventories, employees] = await Promise.all([
      db.find('warehouses', {}, { sort: { createdAt: -1 } }),
      db.find('inventories', {}),
      db.find('employees', {}),
    ]);

    const empMap = new Map(employees.map((e) => [String(e._id), e]));

    let list = warehouses;
    if (!includeAllForTransfer && !hasGlobalWarehouseAccess(user)) {
      list = list.filter((w) => String(w._id) === String(user.assignedWarehouseId));
    }
    if (status && status !== 'ALL') {
      list = list.filter((w) => w.status === status);
    }
    if (search) {
      list = list.filter(
        (w) =>
          w.name.toLowerCase().includes(search) ||
          w.code.toLowerCase().includes(search) ||
          w.location.toLowerCase().includes(search)
      );
    }

    const enriched = list.map((w) => {
      const whInv = inventories.filter((i) => String(i.warehouseId) === String(w._id));
      const whEmps = employees.filter((e) => String(e.assignedWarehouseId) === String(w._id));
      const totalProducts = whInv.filter((i) => Number(i.availableQuantity || 0) > 0).length;
      const totalQuantity = whInv.reduce((acc, i) => acc + Number(i.availableQuantity || 0), 0);
      const totalValue = whInv.reduce((acc, i) => acc + Number(i.totalValue || 0), 0);
      const mgr = w.managerId ? empMap.get(String(w.managerId)) : null;

      return {
        ...w,
        managerName: mgr?.fullName || '',
        totalProducts,
        totalQuantity,
        totalValue: user.permissions.viewValuation ? Number(totalValue.toFixed(2)) : null,
        employeeCount: whEmps.length,
      };
    });

    res.json({ data: enriched });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch warehouses' });
  }
});

router.get('/:id', async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const id = String(req.params.id);
    if (!canAccessWarehouse(user, id)) {
      res.status(403).json({ error: 'Unauthorized warehouse access' });
      return;
    }

    const warehouse = await db.findById('warehouses', id);
    if (!warehouse) {
      res.status(404).json({ error: 'Warehouse not found' });
      return;
    }

    const [inventories, products, employees, transactions] = await Promise.all([
      db.find('inventories', { warehouseId: id }),
      db.find('products', {}),
      db.find('employees', { assignedWarehouseId: id }),
      db.find('stockTransactions', { warehouseId: id }, { sort: { transactionDate: -1 }, limit: 50 }),
    ]);

    const productMap = new Map(products.map((p) => [String(p._id), p]));
    const manager = warehouse.managerId ? await db.findById('employees', warehouse.managerId) : null;

    const inventoryDetails = inventories.map((inv) => {
      const prod = productMap.get(String(inv.productId));
      return {
        ...inv,
        productName: prod?.name || 'Unknown',
        productSku: prod?.sku || '',
        unit: prod?.unit || '',
        minimumStockLevel: prod?.minimumStockLevel || 0,
        totalValue: user.permissions.viewValuation ? inv.totalValue : null,
        averageCost: user.permissions.viewValuation ? inv.averageCost : null,
      };
    });

    const txDetails = transactions.map((tx) => {
      const prod = productMap.get(String(tx.productId));
      return {
        ...tx,
        productName: prod?.name || 'Unknown',
        productSku: prod?.sku || '',
      };
    });

    const totalStockValue = inventories.reduce((acc, i) => acc + Number(i.totalValue || 0), 0);
    const totalQuantity = inventories.reduce((acc, i) => acc + Number(i.availableQuantity || 0), 0);

    res.json({
      warehouse: {
        ...warehouse,
        managerName: manager?.fullName || '',
        totalStockValue: user.permissions.viewValuation ? Number(totalStockValue.toFixed(2)) : null,
        totalQuantity,
      },
      inventory: inventoryDetails,
      employees,
      transactions: txDetails,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to load warehouse details' });
  }
});

router.post('/', requirePermission('manageWarehouses'), async (req: AuthenticatedRequest, res) => {
  try {
    const { name, code, location, address, managerId, phone, description, status } = req.body;
    if (!name || !code || !location) {
      res.status(400).json({ error: 'Warehouse name, code, and location are required' });
      return;
    }

    const created = await db.insert('warehouses', {
      name: String(name).trim(),
      code: String(code).trim().toUpperCase(),
      location: String(location).trim(),
      address: String(address || '').trim(),
      managerId: managerId || null,
      phone: String(phone || '').trim(),
      description: String(description || '').trim(),
      status: status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
    });

    await recordAuditLog(db, req.user!, {
      action: 'CREATE_WAREHOUSE',
      entityType: 'Warehouse',
      entityId: created._id,
      warehouseId: created._id,
      details: `Created warehouse ${created.name} (${created.code}) in ${created.location}`,
      ipAddress: req.ip,
    });

    res.status(201).json({ data: created });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to create warehouse' });
  }
});

router.put('/:id', requirePermission('manageWarehouses'), async (req: AuthenticatedRequest, res) => {
  try {
    const id = String(req.params.id);
    const existing = await db.findById('warehouses', id);
    if (!existing) {
      res.status(404).json({ error: 'Warehouse not found' });
      return;
    }

    const { name, code, location, address, managerId, phone, description, status } = req.body;
    const updated = await db.updateById('warehouses', id, {
      name: name !== undefined ? String(name).trim() : existing.name,
      code: code !== undefined ? String(code).trim().toUpperCase() : existing.code,
      location: location !== undefined ? String(location).trim() : existing.location,
      address: address !== undefined ? String(address).trim() : existing.address,
      managerId: managerId !== undefined ? managerId || null : existing.managerId,
      phone: phone !== undefined ? String(phone).trim() : existing.phone,
      description: description !== undefined ? String(description).trim() : existing.description,
      status: status === 'INACTIVE' || status === 'ACTIVE' ? status : existing.status,
    });

    await recordAuditLog(db, req.user!, {
      action: 'UPDATE_WAREHOUSE',
      entityType: 'Warehouse',
      entityId: id,
      warehouseId: id,
      details: `Updated warehouse ${updated.name} (${updated.code})`,
      ipAddress: req.ip,
    });

    res.json({ data: updated });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to update warehouse' });
  }
});

router.patch('/:id/status', requirePermission('manageWarehouses'), async (req: AuthenticatedRequest, res) => {
  try {
    const id = String(req.params.id);
    const existing = await db.findById('warehouses', id);
    if (!existing) {
      res.status(404).json({ error: 'Warehouse not found' });
      return;
    }

    const nextStatus = req.body.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE';
    const updated = await db.updateById('warehouses', id, { status: nextStatus });

    await recordAuditLog(db, req.user!, {
      action: nextStatus === 'ACTIVE' ? 'ACTIVATE_WAREHOUSE' : 'DEACTIVATE_WAREHOUSE',
      entityType: 'Warehouse',
      entityId: id,
      warehouseId: id,
      details: `Changed warehouse ${existing.name} status to ${nextStatus}`,
      ipAddress: req.ip,
    });

    res.json({ data: updated });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to update warehouse status' });
  }
});

router.delete('/:id', requirePermission('manageWarehouses'), async (req: AuthenticatedRequest, res) => {
  try {
    const id = String(req.params.id);
    const existing = await db.findById('warehouses', id);
    if (!existing) {
      res.status(404).json({ error: 'Warehouse not found' });
      return;
    }

    const [invList, txCount, trfSrcCount, trfDstCount, adjCount, cntCount] = await Promise.all([
      db.find('inventories', { warehouseId: id }),
      db.count('stockTransactions', { warehouseId: id }),
      db.count('stockTransfers', { sourceWarehouseId: id }),
      db.count('stockTransfers', { destinationWarehouseId: id }),
      db.count('stockAdjustments', { warehouseId: id }),
      db.count('stockCounts', { warehouseId: id }),
    ]);

    const hasStock = invList.some((i) => Number(i.availableQuantity || 0) > 0 || Number(i.reservedQuantity || 0) > 0);
    const hasHistory = txCount > 0 || trfSrcCount > 0 || trfDstCount > 0 || adjCount > 0 || cntCount > 0;

    if (hasStock || hasHistory) {
      res.status(409).json({
        error: 'Cannot delete warehouse containing stock or transaction history. Deactivate it instead.',
      });
      return;
    }

    await db.deleteById('warehouses', id);
    await recordAuditLog(db, req.user!, {
      action: 'DELETE_WAREHOUSE',
      entityType: 'Warehouse',
      entityId: id,
      details: `Deleted empty warehouse ${existing.name} (${existing.code})`,
      ipAddress: req.ip,
    });

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to delete warehouse' });
  }
});

export default router;

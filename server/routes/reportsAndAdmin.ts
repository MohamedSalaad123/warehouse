import { Router } from 'express';
import * as XLSX from 'xlsx';
import { DEFAULT_ROLE_PERMISSIONS } from '../config/permissions.ts';
import { db, exportLocalSnapshot, getDatabaseStatus } from '../db/adapter.ts';
import {
  AuthenticatedRequest,
  hasGlobalWarehouseAccess,
  requireAuth,
  requirePermission,
} from '../middleware/auth.ts';
import { recordAuditLog } from '../services/auditService.ts';

export const reportsRouter = Router();
reportsRouter.use(requireAuth);

async function buildReportData(reportType: string, req: AuthenticatedRequest) {
  const user = req.user!;
  const warehouseId = String(req.query.warehouseId || '');
  const productId = String(req.query.productId || '');
  const categoryId = String(req.query.categoryId || '');
  const employeeUserId = String(req.query.employeeId || '');
  const transactionType = String(req.query.transactionType || '');
  const startDate = String(req.query.startDate || '');
  const endDate = String(req.query.endDate || '');

  const scopedWh = !hasGlobalWarehouseAccess(user)
    ? user.assignedWarehouseId || '__none__'
    : warehouseId && warehouseId !== 'ALL'
    ? warehouseId
    : '';

  const startMs = startDate ? new Date(startDate).getTime() : 0;
  const endMs = endDate ? new Date(`${endDate}T23:59:59.999Z`).getTime() : Infinity;

  const [warehouses, products, categories, inventories, transactions, transfers, adjustments, stockCounts, users] =
    await Promise.all([
      db.find('warehouses', {}),
      db.find('products', {}),
      db.find('categories', {}),
      db.find('inventories', scopedWh ? { warehouseId: scopedWh } : {}),
      db.find('stockTransactions', { status: 'CONFIRMED' }, { sort: { transactionDate: -1 } }),
      db.find('stockTransfers', {}, { sort: { createdAt: -1 } }),
      db.find('stockAdjustments', {}, { sort: { createdAt: -1 } }),
      db.find('stockCounts', {}, { sort: { createdAt: -1 } }),
      db.find('users', {}),
    ]);

  const whMap = new Map(warehouses.map((w) => [String(w._id), w]));
  const prodMap = new Map(products.map((p) => [String(p._id), p]));
  const catMap = new Map(categories.map((c) => [String(c._id), c.name]));
  const userMap = new Map(users.map((u) => [String(u._id), u]));

  const inDateRange = (dtStr: string) => {
    const ms = new Date(dtStr).getTime();
    return ms >= startMs && ms <= endMs;
  };

  const canValue = user.permissions.viewValuation;

  switch (reportType) {
    case 'global-inventory':
    case 'warehouse-stock': {
      return inventories
        .map((inv) => {
          const p = prodMap.get(String(inv.productId));
          const w = whMap.get(String(inv.warehouseId));
          if (!p || !w) return null;
          if (productId && productId !== 'ALL' && String(p._id) !== productId) return null;
          if (categoryId && categoryId !== 'ALL' && String(p.categoryId) !== categoryId) return null;
          return {
            warehouse: w.name,
            warehouseCode: w.code,
            productName: p.name,
            sku: p.sku,
            category: catMap.get(String(p.categoryId)) || '',
            unit: p.unit,
            availableQty: inv.availableQuantity,
            minimumLevel: p.minimumStockLevel,
            averageCost: canValue ? inv.averageCost : null,
            totalValue: canValue ? inv.totalValue : null,
          };
        })
        .filter(Boolean);
    }

    case 'low-stock':
    case 'out-of-stock': {
      return inventories
        .map((inv) => {
          const p = prodMap.get(String(inv.productId));
          const w = whMap.get(String(inv.warehouseId));
          if (!p || !w) return null;
          const qty = Number(inv.availableQuantity || 0);
          if (reportType === 'out-of-stock' && qty > 0) return null;
          if (reportType === 'low-stock' && (qty <= 0 || qty > Number(p.minimumStockLevel || 0))) return null;
          return {
            warehouse: w.name,
            productName: p.name,
            sku: p.sku,
            unit: p.unit,
            availableQty: qty,
            minimumLevel: p.minimumStockLevel,
            shortfall: Math.max(0, Number(p.minimumStockLevel || 0) - qty),
          };
        })
        .filter(Boolean);
    }

    case 'valuation': {
      if (!canValue) return [];
      return inventories
        .map((inv) => {
          const p = prodMap.get(String(inv.productId));
          const w = whMap.get(String(inv.warehouseId));
          if (!p || !w) return null;
          if (productId && productId !== 'ALL' && String(p._id) !== productId) return null;
          if (categoryId && categoryId !== 'ALL' && String(p.categoryId) !== categoryId) return null;
          return {
            warehouse: w.name,
            productName: p.name,
            sku: p.sku,
            availableQty: inv.availableQuantity,
            avgPurchaseCost: inv.averageCost,
            sellingPrice: p.sellingPrice,
            totalInventoryValue: inv.totalValue,
          };
        })
        .filter(Boolean);
    }

    case 'stock-in':
    case 'stock-out':
    case 'product-movement': {
      return transactions
        .filter((tx) => {
          if (scopedWh && String(tx.warehouseId) !== scopedWh) return false;
          if (reportType === 'stock-in' && tx.movementType !== 'STOCK_IN') return false;
          if (reportType === 'stock-out' && tx.movementType !== 'STOCK_OUT') return false;
          if (transactionType && transactionType !== 'ALL' && tx.movementType !== transactionType) return false;
          if (productId && productId !== 'ALL' && String(tx.productId) !== productId) return false;
          if (employeeUserId && employeeUserId !== 'ALL' && String(tx.performedByUserId) !== employeeUserId) return false;
          const p = prodMap.get(String(tx.productId));
          if (categoryId && categoryId !== 'ALL' && p && String(p.categoryId) !== categoryId) return false;
          return inDateRange(tx.transactionDate || tx.createdAt);
        })
        .map((tx) => {
          const p = prodMap.get(String(tx.productId));
          const w = whMap.get(String(tx.warehouseId));
          const u = userMap.get(String(tx.performedByUserId));
          return {
            transactionNumber: tx.transactionNumber,
            date: new Date(tx.transactionDate || tx.createdAt).toISOString().slice(0, 10),
            warehouse: w?.name || 'Unknown',
            productName: p?.name || 'Unknown',
            sku: p?.sku || '',
            movementType: tx.movementType,
            previousQty: tx.previousQuantity,
            qtyIn: tx.quantityIn,
            qtyOut: tx.quantityOut,
            newQty: tx.newQuantity,
            unitCost: canValue ? tx.unitPrice : null,
            totalAmount: canValue ? tx.totalAmount : null,
            employee: u?.fullName || '',
            reference: tx.invoiceNumber || tx.referenceNumber || tx.destinationCustomer || '',
          };
        });
    }

    case 'transfers': {
      return transfers
        .filter((tr) => {
          if (scopedWh && String(tr.sourceWarehouseId) !== scopedWh && String(tr.destinationWarehouseId) !== scopedWh) {
            return false;
          }
          if (productId && productId !== 'ALL' && String(tr.productId) !== productId) return false;
          return inDateRange(tr.transferDate || tr.createdAt);
        })
        .map((tr) => {
          const p = prodMap.get(String(tr.productId));
          return {
            transferNumber: tr.transferNumber,
            date: new Date(tr.transferDate || tr.createdAt).toISOString().slice(0, 10),
            sourceWarehouse: whMap.get(String(tr.sourceWarehouseId))?.name || '',
            destinationWarehouse: whMap.get(String(tr.destinationWarehouseId))?.name || '',
            productName: p?.name || '',
            sku: p?.sku || '',
            requestedQty: tr.quantity,
            dispatchedQty: tr.dispatchedQuantity,
            receivedQty: tr.receivedQuantity,
            damagedQty: tr.damagedQuantity,
            missingQty: tr.missingQuantity,
            status: tr.status,
          };
        });
    }

    case 'employee-activity': {
      return transactions
        .filter((tx) => {
          if (scopedWh && String(tx.warehouseId) !== scopedWh) return false;
          if (employeeUserId && employeeUserId !== 'ALL' && String(tx.performedByUserId) !== employeeUserId) return false;
          return inDateRange(tx.transactionDate || tx.createdAt);
        })
        .map((tx) => ({
          date: new Date(tx.transactionDate || tx.createdAt).toISOString().slice(0, 16).replace('T', ' '),
          employee: userMap.get(String(tx.performedByUserId))?.fullName || '',
          role: userMap.get(String(tx.performedByUserId))?.role || '',
          warehouse: whMap.get(String(tx.warehouseId))?.name || '',
          transactionNumber: tx.transactionNumber,
          movementType: tx.movementType,
          product: prodMap.get(String(tx.productId))?.name || '',
          quantity: tx.quantity,
        }));
    }

    case 'stock-counts': {
      return stockCounts
        .filter((sc) => (!scopedWh || String(sc.warehouseId) === scopedWh) && inDateRange(sc.countDate || sc.createdAt))
        .map((sc) => ({
          countNumber: sc.countNumber,
          date: new Date(sc.countDate || sc.createdAt).toISOString().slice(0, 10),
          warehouse: whMap.get(String(sc.warehouseId))?.name || '',
          itemsCounted: (sc.items || []).length,
          totalVariance: (sc.items || []).reduce((s: number, i: any) => s + Number(i.difference || 0), 0),
          status: sc.status,
          countedBy: userMap.get(String(sc.createdByUserId))?.fullName || '',
        }));
    }

    case 'adjustments': {
      return adjustments
        .filter((a) => (!scopedWh || String(a.warehouseId) === scopedWh) && inDateRange(a.adjustmentDate || a.createdAt))
        .map((a) => ({
          adjustmentNumber: a.adjustmentNumber,
          date: new Date(a.adjustmentDate || a.createdAt).toISOString().slice(0, 10),
          warehouse: whMap.get(String(a.warehouseId))?.name || '',
          productName: prodMap.get(String(a.productId))?.name || '',
          type: a.adjustmentType,
          previousQty: a.previousQuantity,
          adjustmentQty: a.adjustmentQuantity,
          newQty: a.newQuantity,
          reason: a.reason,
          adjustedBy: userMap.get(String(a.adjustedByUserId))?.fullName || '',
        }));
    }

    default:
      return [];
  }
}

reportsRouter.get('/:type', async (req: AuthenticatedRequest, res) => {
  try {
    const reportType = String(req.params.type);
    const data = await buildReportData(reportType, req);
    res.json({ reportType, data });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to generate report' });
  }
});

reportsRouter.get('/:type/export', requirePermission('exportReports'), async (req: AuthenticatedRequest, res) => {
  try {
    const reportType = String(req.params.type);
    const data = await buildReportData(reportType, req);
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data.length > 0 ? data : [{ Message: 'No records found' }]);
    XLSX.utils.book_append_sheet(wb, ws, reportType.slice(0, 31));
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Disposition', `attachment; filename="khayre-${reportType}-${Date.now()}.xlsx"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buf);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to export Excel report' });
  }
});

// Notifications Router
export const notificationsRouter = Router();
notificationsRouter.use(requireAuth);

notificationsRouter.get('/', async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const all = await db.find('notifications', {}, { sort: { createdAt: -1 }, limit: 100 });
    const visible = all
      .filter((n) => {
        const roleMatch = !n.targetRoles?.length || n.targetRoles.includes(user.role);
        const whMatch = hasGlobalWarehouseAccess(user) || !n.warehouseId || String(n.warehouseId) === String(user.assignedWarehouseId);
        return roleMatch && whMatch;
      })
      .map((n) => ({
        ...n,
        isRead: (n.readByUserIds || []).map(String).includes(String(user.id)),
      }));

    const unreadCount = visible.filter((n) => !n.isRead).length;
    res.json({ data: visible, unreadCount });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to load notifications' });
  }
});

notificationsRouter.patch('/:id/read', async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const id = String(req.params.id);
    const notif = await db.findById('notifications', id);
    if (!notif) {
      res.status(404).json({ error: 'Notification not found' });
      return;
    }
    const set = new Set((notif.readByUserIds || []).map(String));
    set.add(String(user.id));
    await db.updateById('notifications', id, { readByUserIds: Array.from(set) });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to mark notification read' });
  }
});

notificationsRouter.post('/read-all', async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const all = await db.find('notifications', {}, { limit: 150 });
    for (const n of all) {
      const set = new Set((n.readByUserIds || []).map(String));
      if (!set.has(String(user.id))) {
        set.add(String(user.id));
        await db.updateById('notifications', n._id, { readByUserIds: Array.from(set) });
      }
    }
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to mark all read' });
  }
});

// Settings Router
export const settingsRouter = Router();
settingsRouter.use(requireAuth);

settingsRouter.get('/', async (_req, res) => {
  try {
    const settings = await db.findOne('companySettings', {});
    const dbStatus = getDatabaseStatus();
    res.json({
      data: settings || {
        companyName: 'Khayre Warehouse Management System',
        companyLogo: '',
        companyAddress: '',
        companyPhone: '',
        currency: 'USD',
        language: 'so',
        dateFormat: 'YYYY-MM-DD',
        costingMethod: 'MOVING_WEIGHTED_AVERAGE',
        requireTransferApproval: true,
        requireAdjustmentApproval: true,
        lowStockAlertsEnabled: true,
        emailNotificationsEnabled: false,
        rolePermissions: DEFAULT_ROLE_PERMISSIONS,
      },
      dbStatus,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to load settings' });
  }
});

settingsRouter.put('/', requirePermission('manageSettings'), async (req: AuthenticatedRequest, res) => {
  try {
    const existing = await db.findOne('companySettings', {});
    const body = req.body;
    const payload = {
      companyName: body.companyName !== undefined ? String(body.companyName).trim() : existing?.companyName || 'Khayre Warehouse Management System',
      companyLogo: body.companyLogo !== undefined ? String(body.companyLogo).trim() : existing?.companyLogo || '',
      companyAddress: body.companyAddress !== undefined ? String(body.companyAddress).trim() : existing?.companyAddress || '',
      companyPhone: body.companyPhone !== undefined ? String(body.companyPhone).trim() : existing?.companyPhone || '',
      currency: 'USD',
      language: body.language === 'en' ? 'en' : 'so',
      dateFormat: ['YYYY-MM-DD', 'DD/MM/YYYY', 'MM/DD/YYYY'].includes(body.dateFormat)
        ? body.dateFormat
        : existing?.dateFormat || 'YYYY-MM-DD',
      costingMethod: 'MOVING_WEIGHTED_AVERAGE',
      requireTransferApproval:
        body.requireTransferApproval !== undefined
          ? Boolean(body.requireTransferApproval)
          : existing?.requireTransferApproval ?? true,
      requireAdjustmentApproval:
        body.requireAdjustmentApproval !== undefined
          ? Boolean(body.requireAdjustmentApproval)
          : existing?.requireAdjustmentApproval ?? true,
      lowStockAlertsEnabled:
        body.lowStockAlertsEnabled !== undefined
          ? Boolean(body.lowStockAlertsEnabled)
          : existing?.lowStockAlertsEnabled ?? true,
      emailNotificationsEnabled:
        body.emailNotificationsEnabled !== undefined
          ? Boolean(body.emailNotificationsEnabled)
          : existing?.emailNotificationsEnabled ?? false,
      rolePermissions: body.rolePermissions || existing?.rolePermissions || DEFAULT_ROLE_PERMISSIONS,
    };

    const updated = existing
      ? await db.updateById('companySettings', existing._id, payload)
      : await db.insert('companySettings', payload);

    await recordAuditLog(db, req.user!, {
      action: 'UPDATE_SETTINGS',
      entityType: 'CompanySetting',
      entityId: updated._id,
      details: 'Updated system configuration and role permissions',
      ipAddress: req.ip,
    });

    res.json({ data: updated });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to update settings' });
  }
});

settingsRouter.get('/backup', requirePermission('manageSettings'), async (_req, res) => {
  try {
    const localSnap = exportLocalSnapshot();
    let payload: Record<string, any>;
    if (localSnap) {
      const safeUsers = (localSnap.users || []).map(({ passwordHash: _p, ...u }) => u);
      payload = { ...localSnap, users: safeUsers };
    } else {
      const [warehouses, products, categories, inventories, stockTransactions, stockTransfers, stockAdjustments, stockCounts, suppliers, employees, companySettings] =
        await Promise.all([
          db.find('warehouses', {}),
          db.find('products', {}),
          db.find('categories', {}),
          db.find('inventories', {}),
          db.find('stockTransactions', {}),
          db.find('stockTransfers', {}),
          db.find('stockAdjustments', {}),
          db.find('stockCounts', {}),
          db.find('suppliers', {}),
          db.find('employees', {}),
          db.find('companySettings', {}),
        ]);
      payload = {
        warehouses,
        products,
        categories,
        inventories,
        stockTransactions,
        stockTransfers,
        stockAdjustments,
        stockCounts,
        suppliers,
        employees,
        companySettings,
      };
    }

    res.setHeader('Content-Disposition', `attachment; filename="khayre-wms-backup-${Date.now()}.json"`);
    res.setHeader('Content-Type', 'application/json');
    res.send(JSON.stringify({ exportedAt: new Date().toISOString(), data: payload }, null, 2));
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Backup export failed' });
  }
});

// Audit Logs Router
export const auditLogsRouter = Router();
auditLogsRouter.use(requireAuth);

auditLogsRouter.get('/', requirePermission('viewAuditLogs'), async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const entityType = String(req.query.entityType || '');
    const query: Record<string, any> = {};
    if (!hasGlobalWarehouseAccess(user) && user.assignedWarehouseId) {
      query.warehouseId = user.assignedWarehouseId;
    }
    if (entityType && entityType !== 'ALL') {
      query.entityType = entityType;
    }

    const logs = await db.find('auditLogs', query, { sort: { createdAt: -1 }, limit: 200 });
    res.json({ data: logs });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch audit logs' });
  }
});

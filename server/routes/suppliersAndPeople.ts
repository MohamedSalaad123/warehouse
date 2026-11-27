import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { db, withTransaction } from '../db/adapter.ts';
import {
  AuthenticatedRequest,
  hasGlobalWarehouseAccess,
  requireAuth,
  requirePermission,
} from '../middleware/auth.ts';
import { recordAuditLog } from '../services/auditService.ts';

export const suppliersRouter = Router();
suppliersRouter.use(requireAuth);

suppliersRouter.get('/', async (req: AuthenticatedRequest, res) => {
  try {
    const search = String(req.query.search || '').trim().toLowerCase();
    const [suppliers, transactions] = await Promise.all([
      db.find('suppliers', {}, { sort: { createdAt: -1 } }),
      db.find('stockTransactions', { movementType: 'STOCK_IN', status: 'CONFIRMED' }),
    ]);

    let list = suppliers.map((s) => {
      const supTx = transactions.filter((t) => String(t.supplierId) === String(s._id));
      const totalPurchaseValue = supTx.reduce((sum, t) => sum + Number(t.totalAmount || 0), 0);
      return {
        ...s,
        totalPurchaseValue: req.user!.permissions.viewValuation ? Number(totalPurchaseValue.toFixed(2)) : null,
        transactionCount: supTx.length,
      };
    });

    if (search) {
      list = list.filter(
        (s) =>
          s.name.toLowerCase().includes(search) ||
          s.companyName.toLowerCase().includes(search) ||
          (s.contactPerson || '').toLowerCase().includes(search)
      );
    }

    res.json({ data: list });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to load suppliers' });
  }
});

suppliersRouter.get('/:id', async (req: AuthenticatedRequest, res) => {
  try {
    const id = String(req.params.id);
    const supplier = await db.findById('suppliers', id);
    if (!supplier) {
      res.status(404).json({ error: 'Supplier not found' });
      return;
    }

    const [transactions, products, warehouses] = await Promise.all([
      db.find('stockTransactions', { supplierId: id, movementType: 'STOCK_IN', status: 'CONFIRMED' }, { sort: { transactionDate: -1 } }),
      db.find('products', {}),
      db.find('warehouses', {}),
    ]);

    const prodMap = new Map(products.map((p) => [String(p._id), p]));
    const whMap = new Map(warehouses.map((w) => [String(w._id), w.name]));

    const history = transactions.map((t) => {
      const p = prodMap.get(String(t.productId));
      return {
        ...t,
        productName: p?.name || 'Unknown',
        productSku: p?.sku || '',
        warehouseName: whMap.get(String(t.warehouseId)) || 'Unknown',
      };
    });

    const suppliedProductIds = Array.from(new Set(transactions.map((t) => String(t.productId))));
    const productsSupplied = suppliedProductIds.map((pid) => prodMap.get(pid)).filter(Boolean);
    const totalPurchaseValue = transactions.reduce((sum, t) => sum + Number(t.totalAmount || 0), 0);

    res.json({
      supplier: {
        ...supplier,
        totalPurchaseValue: req.user!.permissions.viewValuation ? Number(totalPurchaseValue.toFixed(2)) : null,
      },
      history,
      productsSupplied,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch supplier details' });
  }
});

suppliersRouter.post('/', requirePermission('manageSuppliers'), async (req: AuthenticatedRequest, res) => {
  try {
    const { name, companyName, contactPerson, phone, email, address, notes } = req.body;
    if (!name || !companyName) {
      res.status(400).json({ error: 'Supplier name and company name are required' });
      return;
    }

    const created = await db.insert('suppliers', {
      name: String(name).trim(),
      companyName: String(companyName).trim(),
      contactPerson: String(contactPerson || '').trim(),
      phone: String(phone || '').trim(),
      email: String(email || '').trim(),
      address: String(address || '').trim(),
      notes: String(notes || '').trim(),
      status: 'ACTIVE',
    });

    await recordAuditLog(db, req.user!, {
      action: 'CREATE_SUPPLIER',
      entityType: 'Supplier',
      entityId: created._id,
      details: `Created supplier ${created.companyName}`,
      ipAddress: req.ip,
    });

    res.status(201).json({ data: created });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to create supplier' });
  }
});

suppliersRouter.put('/:id', requirePermission('manageSuppliers'), async (req: AuthenticatedRequest, res) => {
  try {
    const id = String(req.params.id);
    const existing = await db.findById('suppliers', id);
    if (!existing) {
      res.status(404).json({ error: 'Supplier not found' });
      return;
    }

    const body = req.body;
    const updated = await db.updateById('suppliers', id, {
      name: body.name !== undefined ? String(body.name).trim() : existing.name,
      companyName: body.companyName !== undefined ? String(body.companyName).trim() : existing.companyName,
      contactPerson: body.contactPerson !== undefined ? String(body.contactPerson).trim() : existing.contactPerson,
      phone: body.phone !== undefined ? String(body.phone).trim() : existing.phone,
      email: body.email !== undefined ? String(body.email).trim() : existing.email,
      address: body.address !== undefined ? String(body.address).trim() : existing.address,
      notes: body.notes !== undefined ? String(body.notes).trim() : existing.notes,
      status: body.status === 'INACTIVE' || body.status === 'ACTIVE' ? body.status : existing.status,
    });

    await recordAuditLog(db, req.user!, {
      action: 'UPDATE_SUPPLIER',
      entityType: 'Supplier',
      entityId: id,
      details: `Updated supplier ${updated.companyName}`,
      ipAddress: req.ip,
    });

    res.json({ data: updated });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to update supplier' });
  }
});

// Employees & Users Router
export const employeesRouter = Router();
employeesRouter.use(requireAuth);

employeesRouter.get('/', async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const search = String(req.query.search || '').trim().toLowerCase();
    const warehouseId = String(req.query.warehouseId || '');

    const [employees, users, warehouses] = await Promise.all([
      db.find('employees', {}, { sort: { createdAt: -1 } }),
      db.find('users', {}),
      db.find('warehouses', {}),
    ]);

    const userByEmp = new Map(users.map((u) => [String(u._id), u]));
    const whMap = new Map(warehouses.map((w) => [String(w._id), w.name]));

    let list = employees.map((e) => {
      const linkedUser = e.userId ? userByEmp.get(String(e.userId)) : null;
      return {
        ...e,
        assignedWarehouseName: e.assignedWarehouseId ? whMap.get(String(e.assignedWarehouseId)) || '' : 'All / HQ',
        username: linkedUser?.username || '',
        role: linkedUser?.role || '',
      };
    });

    if (!hasGlobalWarehouseAccess(user)) {
      list = list.filter((e) => String(e.assignedWarehouseId) === String(user.assignedWarehouseId));
    } else if (warehouseId && warehouseId !== 'ALL') {
      list = list.filter((e) => String(e.assignedWarehouseId) === warehouseId);
    }

    if (search) {
      list = list.filter(
        (e) =>
          e.fullName.toLowerCase().includes(search) ||
          e.employeeCode.toLowerCase().includes(search) ||
          e.email.toLowerCase().includes(search) ||
          e.position.toLowerCase().includes(search)
      );
    }

    res.json({ data: list });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to load employees' });
  }
});

employeesRouter.post('/', requirePermission('manageEmployees'), async (req: AuthenticatedRequest, res) => {
  try {
    const actor = req.user!;
    const {
      fullName,
      employeeCode,
      phone,
      email,
      position,
      assignedWarehouseId,
      username,
      password,
      role,
      accountStatus,
    } = req.body;

    if (!fullName || !employeeCode || !email || !position || !username || !password || !role) {
      res.status(400).json({ error: 'All employee and user account fields are required' });
      return;
    }

    if (String(password).length < 6) {
      res.status(400).json({ error: 'Password must be at least 6 characters' });
      return;
    }

    if (actor.role === 'WAREHOUSE_MANAGER' && (role === 'SUPER_ADMIN' || role === 'GENERAL_MANAGER')) {
      res.status(403).json({ error: 'Warehouse Managers cannot create Super Admin or General Manager accounts' });
      return;
    }

    const effectiveWarehouseId =
      actor.role === 'WAREHOUSE_MANAGER' ? actor.assignedWarehouseId : assignedWarehouseId || null;

    const result = await withTransaction(async (txDb) => {
      const passwordHash = await bcrypt.hash(String(password), 10);
      const emp = await txDb.insert('employees', {
        fullName: String(fullName).trim(),
        employeeCode: String(employeeCode).trim().toUpperCase(),
        phone: String(phone || '').trim(),
        email: String(email).trim().toLowerCase(),
        position: String(position).trim(),
        assignedWarehouseId: effectiveWarehouseId,
        userId: null,
        accountStatus: accountStatus === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
      });

      const usr = await txDb.insert('users', {
        username: String(username).trim().toLowerCase(),
        email: String(email).trim().toLowerCase(),
        fullName: String(fullName).trim(),
        passwordHash,
        role,
        assignedWarehouseId: effectiveWarehouseId,
        employeeId: emp._id,
        status: accountStatus === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
      });

      await txDb.updateById('employees', emp._id, { userId: usr._id });

      await recordAuditLog(txDb, actor, {
        action: 'CREATE_EMPLOYEE',
        entityType: 'Employee',
        entityId: emp._id,
        warehouseId: effectiveWarehouseId,
        details: `Created employee ${emp.fullName} (${emp.employeeCode}) with role ${role}`,
        ipAddress: req.ip,
      });

      return emp;
    });

    res.status(201).json({ data: result });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to create employee' });
  }
});

employeesRouter.put('/:id', requirePermission('manageEmployees'), async (req: AuthenticatedRequest, res) => {
  try {
    const actor = req.user!;
    const id = String(req.params.id);
    const emp = await db.findById('employees', id);
    if (!emp) {
      res.status(404).json({ error: 'Employee not found' });
      return;
    }

    const body = req.body;
    const updatedEmp = await withTransaction(async (txDb) => {
      const nextStatus =
        body.accountStatus === 'INACTIVE' || body.accountStatus === 'ACTIVE'
          ? body.accountStatus
          : emp.accountStatus;

      const nextWarehouse =
        body.assignedWarehouseId !== undefined ? body.assignedWarehouseId || null : emp.assignedWarehouseId;

      const savedEmp = await txDb.updateById('employees', id, {
        fullName: body.fullName !== undefined ? String(body.fullName).trim() : emp.fullName,
        phone: body.phone !== undefined ? String(body.phone).trim() : emp.phone,
        email: body.email !== undefined ? String(body.email).trim().toLowerCase() : emp.email,
        position: body.position !== undefined ? String(body.position).trim() : emp.position,
        assignedWarehouseId: nextWarehouse,
        accountStatus: nextStatus,
      });

      if (emp.userId) {
        const userUpdates: Record<string, any> = {
          fullName: savedEmp.fullName,
          email: savedEmp.email,
          assignedWarehouseId: nextWarehouse,
          status: nextStatus,
        };
        if (body.role && (actor.role === 'SUPER_ADMIN' || actor.role === 'GENERAL_MANAGER')) {
          userUpdates.role = body.role;
        }
        if (body.newPassword && String(body.newPassword).length >= 6) {
          userUpdates.passwordHash = await bcrypt.hash(String(body.newPassword), 10);
        }
        await txDb.updateById('users', emp.userId, userUpdates);
      }

      await recordAuditLog(txDb, actor, {
        action: 'UPDATE_EMPLOYEE',
        entityType: 'Employee',
        entityId: id,
        warehouseId: nextWarehouse,
        details: `Updated employee ${savedEmp.fullName} (${savedEmp.employeeCode})`,
        ipAddress: req.ip,
      });

      return savedEmp;
    });

    res.json({ data: updatedEmp });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to update employee' });
  }
});

// Users list alias endpoint (/api/users)
export const usersRouter = Router();
usersRouter.use(requireAuth);
usersRouter.get('/', requirePermission('manageEmployees'), async (_req, res) => {
  const users = await db.find('users', {}, { sort: { createdAt: -1 } });
  res.json({
    data: users.map(({ passwordHash: _pw, ...safe }) => safe),
  });
});

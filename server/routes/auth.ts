import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { DEFAULT_ROLE_PERMISSIONS } from '../config/permissions.ts';
import { db, getDatabaseStatus, withTransaction } from '../db/adapter.ts';
import {
  AuthenticatedRequest,
  requireAuth,
  resolveUserPermissions,
  signAuthToken,
} from '../middleware/auth.ts';
import { recordAuditLog } from '../services/auditService.ts';

const router = Router();

router.get('/status', async (_req, res) => {
  try {
    const userCount = await db.count('users', {});
    const settings = await db.findOne('companySettings', {});
    const dbStatus = getDatabaseStatus();
    res.json({
      initialized: userCount > 0,
      dbMode: dbStatus.mode,
      dbConnected: dbStatus.connected,
      companyName: settings?.companyName || 'Khayre Warehouse Management System',
      companyLogo: settings?.companyLogo || '',
      defaultLanguage: settings?.language || 'so',
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to check auth status' });
  }
});

router.post('/bootstrap', async (req, res) => {
  try {
    const { fullName, username, email, password, companyName, language } = req.body;

    if (!fullName || !username || !email || !password) {
      res.status(400).json({ error: 'Full name, username, email, and password are required' });
      return;
    }
    if (String(password).length < 6) {
      res.status(400).json({ error: 'Password must be at least 6 characters' });
      return;
    }

    const result = await withTransaction(async (txDb) => {
      const existingUsers = await txDb.count('users', {});
      if (existingUsers > 0) {
        throw new Error('System is already initialized. Please sign in.');
      }

      const passwordHash = await bcrypt.hash(String(password), 10);
      const cleanUsername = String(username).trim().toLowerCase();
      const cleanEmail = String(email).trim().toLowerCase();

      const employee = await txDb.insert('employees', {
        fullName: String(fullName).trim(),
        employeeCode: 'EMP-0001',
        phone: '',
        email: cleanEmail,
        position: 'System Administrator',
        assignedWarehouseId: null,
        userId: null,
        accountStatus: 'ACTIVE',
      });

      const user = await txDb.insert('users', {
        username: cleanUsername,
        email: cleanEmail,
        fullName: String(fullName).trim(),
        passwordHash,
        role: 'SUPER_ADMIN',
        assignedWarehouseId: null,
        employeeId: employee._id,
        status: 'ACTIVE',
      });

      await txDb.updateById('employees', employee._id, { userId: user._id });

      await txDb.insert('companySettings', {
        companyName: String(companyName || 'Khayre Warehouse Management System').trim(),
        companyLogo: '',
        companyAddress: '',
        companyPhone: '',
        currency: 'USD',
        language: language === 'en' ? 'en' : 'so',
        dateFormat: 'YYYY-MM-DD',
        costingMethod: 'MOVING_WEIGHTED_AVERAGE',
        requireTransferApproval: true,
        requireAdjustmentApproval: true,
        lowStockAlertsEnabled: true,
        emailNotificationsEnabled: false,
        rolePermissions: DEFAULT_ROLE_PERMISSIONS,
      });

      const defaultCategories = [
        { name: 'Construction Materials', description: 'Cement, steel, timber, and hardware' },
        { name: 'Food & Beverages', description: 'Packaged dry goods, grains, and beverages' },
        { name: 'Electronics & Appliances', description: 'Commercial electronics and electrical parts' },
        { name: 'Packaging & Supplies', description: 'Cartons, pallets, stretch film, and bags' },
        { name: 'Industrial Equipment', description: 'Tools, machinery, and spare parts' },
      ];
      for (const cat of defaultCategories) {
        await txDb.insert('categories', { ...cat, status: 'ACTIVE' });
      }

      await recordAuditLog(
        txDb,
        { id: user._id, fullName: user.fullName, role: 'SUPER_ADMIN' },
        {
          action: 'SYSTEM_BOOTSTRAP',
          entityType: 'User',
          entityId: user._id,
          details: `Initialized Khayre Warehouse System with Super Admin account (${cleanUsername})`,
          ipAddress: req.ip,
        }
      );

      return user;
    });

    const token = signAuthToken(result._id, 'SUPER_ADMIN');
    const permissions = await resolveUserPermissions('SUPER_ADMIN');

    res.status(201).json({
      token,
      user: {
        id: result._id,
        username: result.username,
        email: result.email,
        fullName: result.fullName,
        role: result.role,
        assignedWarehouseId: null,
        employeeId: result.employeeId,
        status: result.status,
        permissions,
      },
    });
  } catch (err: any) {
    const status = err.message?.includes('already initialized') ? 409 : 400;
    res.status(status).json({ error: err.message || 'Bootstrap failed' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { identifier, password } = req.body;
    if (!identifier || !password) {
      res.status(400).json({ error: 'Username/email and password are required' });
      return;
    }

    const cleanId = String(identifier).trim().toLowerCase();
    const userDoc = await db.findOne('users', {
      $or: [{ username: cleanId }, { email: cleanId }],
    });

    if (!userDoc) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    if (userDoc.status !== 'ACTIVE') {
      res.status(403).json({ error: 'Your account is inactive. Contact an administrator.' });
      return;
    }

    const valid = await bcrypt.compare(String(password), userDoc.passwordHash);
    if (!valid) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const token = signAuthToken(userDoc._id, userDoc.role);
    const permissions = await resolveUserPermissions(userDoc.role);

    await recordAuditLog(
      db,
      { id: userDoc._id, fullName: userDoc.fullName, role: userDoc.role },
      {
        action: 'USER_LOGIN',
        entityType: 'User',
        entityId: userDoc._id,
        warehouseId: userDoc.assignedWarehouseId || null,
        details: `User ${userDoc.username} signed in`,
        ipAddress: req.ip,
      }
    );

    res.json({
      token,
      user: {
        id: userDoc._id,
        username: userDoc.username,
        email: userDoc.email,
        fullName: userDoc.fullName,
        role: userDoc.role,
        assignedWarehouseId: userDoc.assignedWarehouseId ? String(userDoc.assignedWarehouseId) : null,
        employeeId: userDoc.employeeId ? String(userDoc.employeeId) : null,
        status: userDoc.status,
        permissions,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Login failed' });
  }
});

router.get('/me', requireAuth, async (req: AuthenticatedRequest, res) => {
  res.json({ user: req.user });
});

router.post('/change-password', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword || String(newPassword).length < 6) {
      res.status(400).json({ error: 'Valid current password and new password (min 6 chars) required' });
      return;
    }

    const userDoc = await db.findById('users', req.user!.id);
    if (!userDoc) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const valid = await bcrypt.compare(String(currentPassword), userDoc.passwordHash);
    if (!valid) {
      res.status(400).json({ error: 'Current password is incorrect' });
      return;
    }

    const passwordHash = await bcrypt.hash(String(newPassword), 10);
    await db.updateById('users', userDoc._id, { passwordHash });

    await recordAuditLog(db, req.user!, {
      action: 'CHANGE_PASSWORD',
      entityType: 'User',
      entityId: userDoc._id,
      details: `User ${userDoc.username} changed password`,
      ipAddress: req.ip,
    });

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to change password' });
  }
});

export default router;

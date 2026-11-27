import crypto from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import type { AuthUser, RolePermissionSet, UserRole } from '../../src/types/wms.ts';
import { DEFAULT_ROLE_PERMISSIONS, GLOBAL_ACCESS_ROLES } from '../config/permissions.ts';
import { db } from '../db/adapter.ts';

const EPHEMERAL_SECRET = crypto.randomBytes(32).toString('hex');

function getJwtSecret(): string {
  const configured = process.env.JWT_SECRET?.trim();
  return configured && configured.length >= 16 ? configured : EPHEMERAL_SECRET;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
}

export function signAuthToken(userId: string, role: UserRole): string {
  return jwt.sign({ sub: userId, role }, getJwtSecret(), { expiresIn: '12h' });
}

export async function resolveUserPermissions(role: UserRole): Promise<RolePermissionSet> {
  const settings = await db.findOne('companySettings', {});
  const configured = settings?.rolePermissions?.[role];
  return {
    ...DEFAULT_ROLE_PERMISSIONS[role],
    ...(configured || {}),
  };
}

export function sanitizeBodyMiddleware(req: Request, res: Response, next: NextFunction): void {
  const hasForbiddenKeys = (obj: any): boolean => {
    if (!obj || typeof obj !== 'object') return false;
    if (Array.isArray(obj)) return obj.some(hasForbiddenKeys);
    for (const key of Object.keys(obj)) {
      if (key.startsWith('$') || key.includes('.')) return true;
      if (hasForbiddenKeys(obj[key])) return true;
    }
    return false;
  };

  if (hasForbiddenKeys(req.body) || hasForbiddenKeys(req.query)) {
    res.status(400).json({ error: 'Invalid input parameters' });
    return;
  }
  next();
}

export async function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const token = authHeader.slice(7).trim();
    const decoded = jwt.verify(token, getJwtSecret()) as { sub: string; role: UserRole };
    const userDoc = await db.findById('users', decoded.sub);

    if (!userDoc || userDoc.status !== 'ACTIVE') {
      res.status(401).json({ error: 'Account is inactive or not found' });
      return;
    }

    const permissions = await resolveUserPermissions(userDoc.role);

    req.user = {
      id: String(userDoc._id),
      username: userDoc.username,
      email: userDoc.email,
      fullName: userDoc.fullName,
      role: userDoc.role,
      assignedWarehouseId: userDoc.assignedWarehouseId ? String(userDoc.assignedWarehouseId) : null,
      employeeId: userDoc.employeeId ? String(userDoc.employeeId) : null,
      status: userDoc.status,
      permissions,
    };

    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired session token' });
  }
}

export function requirePermission(permission: keyof RolePermissionSet) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    if (!req.user.permissions[permission]) {
      res.status(403).json({ error: 'You do not have permission to perform this action' });
      return;
    }
    next();
  };
}

export function requireRoles(...roles: UserRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: 'Insufficient role privileges' });
      return;
    }
    next();
  };
}

export function hasGlobalWarehouseAccess(user: AuthUser): boolean {
  return GLOBAL_ACCESS_ROLES.includes(user.role);
}

export function canAccessWarehouse(user: AuthUser, warehouseId?: string | null): boolean {
  if (hasGlobalWarehouseAccess(user)) return true;
  if (!warehouseId) return false;
  return Boolean(user.assignedWarehouseId && String(user.assignedWarehouseId) === String(warehouseId));
}

// Duplicate-request protection cache (in-memory, 10s window per user + idempotency key)
const idempotencyCache = new Map<string, number>();

export function idempotencyGuard(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const key = req.headers['x-idempotency-key'];
  if (typeof key === 'string' && key.trim()) {
    const composite = `${req.user?.id || req.ip}:${req.method}:${req.originalUrl}:${key.trim()}`;
    const now = Date.now();
    for (const [k, ts] of idempotencyCache.entries()) {
      if (now - ts > 15000) idempotencyCache.delete(k);
    }
    if (idempotencyCache.has(composite)) {
      res.status(409).json({ error: 'Duplicate request detected. Please wait a moment.' });
      return;
    }
    idempotencyCache.set(composite, now);
  }
  next();
}

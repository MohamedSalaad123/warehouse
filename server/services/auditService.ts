import crypto from 'crypto';
import type { AuthUser, NotificationItem, UserRole } from '../../src/types/wms.ts';
import { DbContext, db } from '../db/adapter.ts';

export async function generateSequenceNumber(prefix: string): Promise<string> {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const rand = crypto.randomBytes(2).toString('hex').toUpperCase();
  const ts = String(Date.now()).slice(-4);
  return `${prefix}-${y}${m}${d}-${ts}${rand}`;
}

export async function recordAuditLog(
  txDb: DbContext,
  user: Pick<AuthUser, 'id' | 'fullName' | 'role'>,
  params: {
    action: string;
    entityType: string;
    entityId?: string;
    warehouseId?: string | null;
    details: string;
    ipAddress?: string;
  }
): Promise<void> {
  await txDb.insert('auditLogs', {
    userId: user.id,
    userName: user.fullName,
    userRole: user.role,
    action: params.action,
    entityType: params.entityType,
    entityId: params.entityId || '',
    warehouseId: params.warehouseId || null,
    details: params.details,
    ipAddress: params.ipAddress || '',
  });
}

export async function emitNotification(
  txDb: DbContext,
  params: {
    type: NotificationItem['type'];
    title: string;
    message: string;
    warehouseId?: string | null;
    targetRoles?: UserRole[];
    relatedId?: string;
  }
): Promise<void> {
  const settings = await txDb.findOne('companySettings', {});
  if (
    (params.type === 'LOW_STOCK' || params.type === 'OUT_OF_STOCK') &&
    settings &&
    settings.lowStockAlertsEnabled === false
  ) {
    return;
  }

  await txDb.insert('notifications', {
    type: params.type,
    title: params.title,
    message: params.message,
    warehouseId: params.warehouseId || null,
    targetRoles: params.targetRoles || ['SUPER_ADMIN', 'GENERAL_MANAGER', 'WAREHOUSE_MANAGER'],
    readByUserIds: [],
    relatedId: params.relatedId || '',
  });
}

export async function checkAndEmitStockAlerts(
  txDb: DbContext,
  warehouseId: string,
  warehouseName: string,
  product: { _id: string; name: string; sku: string; minimumStockLevel: number; unit: string },
  newQuantity: number
): Promise<void> {
  if (newQuantity <= 0) {
    await emitNotification(txDb, {
      type: 'OUT_OF_STOCK',
      title: `Out of Stock: ${product.name}`,
      message: `${product.name} (${product.sku}) is now out of stock in ${warehouseName}.`,
      warehouseId,
      targetRoles: ['SUPER_ADMIN', 'GENERAL_MANAGER', 'WAREHOUSE_MANAGER', 'STOREKEEPER'],
      relatedId: String(product._id),
    });
  } else if (newQuantity <= Number(product.minimumStockLevel || 0)) {
    await emitNotification(txDb, {
      type: 'LOW_STOCK',
      title: `Low Stock Alert: ${product.name}`,
      message: `${product.name} (${product.sku}) has ${newQuantity} ${product.unit} left in ${warehouseName} (minimum: ${product.minimumStockLevel}).`,
      warehouseId,
      targetRoles: ['SUPER_ADMIN', 'GENERAL_MANAGER', 'WAREHOUSE_MANAGER', 'STOREKEEPER'],
      relatedId: String(product._id),
    });
  }
}

export async function safeRecordSimpleAudit(
  user: Pick<AuthUser, 'id' | 'fullName' | 'role'>,
  params: {
    action: string;
    entityType: string;
    entityId?: string;
    warehouseId?: string | null;
    details: string;
    ipAddress?: string;
  }
): Promise<void> {
  await recordAuditLog(db, user, params);
}

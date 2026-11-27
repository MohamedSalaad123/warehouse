import type { AdjustmentType, AuthUser } from '../../src/types/wms.ts';
import { DbContext, withTransaction } from '../db/adapter.ts';
import {
  checkAndEmitStockAlerts,
  emitNotification,
  generateSequenceNumber,
  recordAuditLog,
} from './auditService.ts';

async function getOrCreateInventory(
  txDb: DbContext,
  productId: string,
  warehouseId: string,
  defaultCost: number
) {
  let inv = await txDb.findOne('inventories', { productId, warehouseId });
  if (!inv) {
    inv = await txDb.insert('inventories', {
      productId,
      warehouseId,
      availableQuantity: 0,
      reservedQuantity: 0,
      averageCost: Number(defaultCost || 0),
      totalValue: 0,
      lastUpdated: new Date().toISOString(),
    });
  }
  return inv;
}

export async function confirmStockInTransaction(
  txId: string,
  user: AuthUser,
  ipAddress?: string
) {
  return withTransaction(async (txDb) => {
    const tx = await txDb.findById('stockTransactions', txId);
    if (!tx) throw new Error('Stock In transaction not found');
    if (tx.movementType !== 'STOCK_IN') throw new Error('Invalid transaction type');
    if (tx.status === 'CONFIRMED') throw new Error('Transaction is already confirmed');
    if (tx.status === 'CANCELLED') throw new Error('Cancelled transactions cannot be confirmed');

    const warehouse = await txDb.findById('warehouses', tx.warehouseId);
    if (!warehouse) throw new Error('Warehouse not found');
    const product = await txDb.findById('products', tx.productId);
    if (!product) throw new Error('Product not found');

    const qtyIn = Number(tx.quantity);
    if (qtyIn <= 0) throw new Error('Quantity must be greater than zero');
    const unitPrice = Number(tx.unitPrice);
    if (unitPrice < 0) throw new Error('Purchase price cannot be negative');

    const inv = await getOrCreateInventory(txDb, tx.productId, tx.warehouseId, product.purchasePrice);
    const prevQty = Number(inv.availableQuantity || 0);
    const prevAvg = Number(inv.averageCost || product.purchasePrice || 0);
    const newQty = prevQty + qtyIn;

    // Moving Weighted Average Cost calculation
    const newAvgCost =
      newQty > 0 ? Number((((prevQty * prevAvg) + (qtyIn * unitPrice)) / newQty).toFixed(4)) : unitPrice;
    const newTotalValue = Number((newQty * newAvgCost).toFixed(2));

    await txDb.updateById('inventories', inv._id, {
      availableQuantity: newQty,
      averageCost: newAvgCost,
      totalValue: newTotalValue,
      lastUpdated: new Date().toISOString(),
    });

    const updatedTx = await txDb.updateById('stockTransactions', tx._id, {
      status: 'CONFIRMED',
      previousQuantity: prevQty,
      quantityIn: qtyIn,
      quantityOut: 0,
      newQuantity: newQty,
      totalAmount: Number((qtyIn * unitPrice).toFixed(2)),
      confirmedByUserId: user.id,
      transactionDate: new Date().toISOString(),
    });

    await emitNotification(txDb, {
      type: 'STOCK_IN',
      title: `Stock In Confirmed: ${tx.transactionNumber}`,
      message: `Received ${qtyIn} ${tx.unit} of ${product.name} into ${warehouse.name}.`,
      warehouseId: warehouse._id,
      targetRoles: ['SUPER_ADMIN', 'GENERAL_MANAGER', 'WAREHOUSE_MANAGER', 'ACCOUNTANT'],
      relatedId: tx._id,
    });

    await recordAuditLog(txDb, user, {
      action: 'CONFIRM_STOCK_IN',
      entityType: 'StockTransaction',
      entityId: tx._id,
      warehouseId: warehouse._id,
      details: `Confirmed Stock In ${tx.transactionNumber}: +${qtyIn} ${product.name} (${product.sku}) at ${warehouse.name}. New qty: ${newQty}, MWAC: $${newAvgCost}`,
      ipAddress,
    });

    return updatedTx;
  });
}

export async function confirmStockOutTransaction(
  txId: string,
  user: AuthUser,
  ipAddress?: string
) {
  return withTransaction(async (txDb) => {
    const tx = await txDb.findById('stockTransactions', txId);
    if (!tx) throw new Error('Stock Out transaction not found');
    if (tx.movementType !== 'STOCK_OUT') throw new Error('Invalid transaction type');
    if (tx.status === 'CONFIRMED') throw new Error('Transaction is already confirmed');
    if (tx.status === 'CANCELLED') throw new Error('Cancelled transactions cannot be confirmed');

    const warehouse = await txDb.findById('warehouses', tx.warehouseId);
    if (!warehouse) throw new Error('Warehouse not found');
    const product = await txDb.findById('products', tx.productId);
    if (!product) throw new Error('Product not found');

    const qtyOut = Number(tx.quantity);
    if (qtyOut <= 0) throw new Error('Requested quantity must be greater than zero');

    const inv = await txDb.findOne('inventories', {
      productId: tx.productId,
      warehouseId: tx.warehouseId,
    });

    const available = Number(inv?.availableQuantity || 0);
    if (!inv || available < qtyOut) {
      throw new Error(
        `Insufficient stock in ${warehouse.name}. Available: ${available}, Requested: ${qtyOut}. Negative inventory is not permitted.`
      );
    }

    const newQty = available - qtyOut;
    const avgCost = Number(inv.averageCost || product.purchasePrice || 0);
    const newTotalValue = Number((newQty * avgCost).toFixed(2));

    await txDb.updateById('inventories', inv._id, {
      availableQuantity: newQty,
      totalValue: newTotalValue,
      lastUpdated: new Date().toISOString(),
    });

    const updatedTx = await txDb.updateById('stockTransactions', tx._id, {
      status: 'CONFIRMED',
      previousQuantity: available,
      quantityIn: 0,
      quantityOut: qtyOut,
      newQuantity: newQty,
      unitPrice: avgCost,
      totalAmount: Number((qtyOut * avgCost).toFixed(2)),
      confirmedByUserId: user.id,
      transactionDate: new Date().toISOString(),
    });

    await emitNotification(txDb, {
      type: 'STOCK_OUT',
      title: `Stock Out Confirmed: ${tx.transactionNumber}`,
      message: `Issued ${qtyOut} ${tx.unit} of ${product.name} from ${warehouse.name} to ${tx.destinationCustomer || 'Customer'}.`,
      warehouseId: warehouse._id,
      targetRoles: ['SUPER_ADMIN', 'GENERAL_MANAGER', 'WAREHOUSE_MANAGER', 'ACCOUNTANT'],
      relatedId: tx._id,
    });

    await checkAndEmitStockAlerts(txDb, warehouse._id, warehouse.name, product, newQty);

    await recordAuditLog(txDb, user, {
      action: 'CONFIRM_STOCK_OUT',
      entityType: 'StockTransaction',
      entityId: tx._id,
      warehouseId: warehouse._id,
      details: `Confirmed Stock Out ${tx.transactionNumber}: -${qtyOut} ${product.name} (${product.sku}) from ${warehouse.name}. Remaining qty: ${newQty}`,
      ipAddress,
    });

    return updatedTx;
  });
}

export async function dispatchTransfer(transferId: string, user: AuthUser, ipAddress?: string) {
  return withTransaction(async (txDb) => {
    const transfer = await txDb.findById('stockTransfers', transferId);
    if (!transfer) throw new Error('Transfer not found');
    if (transfer.status !== 'APPROVED') {
      throw new Error(`Only APPROVED transfers can be dispatched. Current status: ${transfer.status}`);
    }

    const sourceWh = await txDb.findById('warehouses', transfer.sourceWarehouseId);
    const destWh = await txDb.findById('warehouses', transfer.destinationWarehouseId);
    const product = await txDb.findById('products', transfer.productId);
    if (!sourceWh || !destWh || !product) throw new Error('Referenced warehouse or product not found');

    const qty = Number(transfer.quantity);
    const sourceInv = await txDb.findOne('inventories', {
      productId: transfer.productId,
      warehouseId: transfer.sourceWarehouseId,
    });
    const available = Number(sourceInv?.availableQuantity || 0);
    if (!sourceInv || available < qty) {
      throw new Error(
        `Insufficient stock in source warehouse (${sourceWh.name}). Available: ${available}, Required: ${qty}`
      );
    }

    const newSourceQty = available - qty;
    const avgCost = Number(sourceInv.averageCost || product.purchasePrice || 0);
    await txDb.updateById('inventories', sourceInv._id, {
      availableQuantity: newSourceQty,
      totalValue: Number((newSourceQty * avgCost).toFixed(2)),
      lastUpdated: new Date().toISOString(),
    });

    const txNum = await generateSequenceNumber('TOUT');
    await txDb.insert('stockTransactions', {
      transactionNumber: txNum,
      warehouseId: sourceWh._id,
      productId: product._id,
      movementType: 'TRANSFER_OUT',
      direction: 'OUT',
      status: 'CONFIRMED',
      quantity: qty,
      previousQuantity: available,
      quantityIn: 0,
      quantityOut: qty,
      newQuantity: newSourceQty,
      unit: product.unit,
      unitPrice: avgCost,
      totalAmount: Number((qty * avgCost).toFixed(2)),
      referenceNumber: transfer.transferNumber,
      destinationCustomer: `Transfer to ${destWh.name}`,
      notes: transfer.notes || '',
      performedByUserId: user.id,
      confirmedByUserId: user.id,
      transactionDate: new Date().toISOString(),
    });

    const updated = await txDb.updateById('stockTransfers', transfer._id, {
      status: 'IN_TRANSIT',
      dispatchedQuantity: qty,
      unitCost: avgCost,
      dispatchedByUserId: user.id,
      dispatchedAt: new Date().toISOString(),
    });

    await checkAndEmitStockAlerts(txDb, sourceWh._id, sourceWh.name, product, newSourceQty);

    await recordAuditLog(txDb, user, {
      action: 'DISPATCH_TRANSFER',
      entityType: 'StockTransfer',
      entityId: transfer._id,
      warehouseId: sourceWh._id,
      details: `Dispatched transfer ${transfer.transferNumber}: ${qty} ${product.name} from ${sourceWh.name} to ${destWh.name}`,
      ipAddress,
    });

    return updated;
  });
}

export async function receiveTransfer(
  transferId: string,
  payload: { receivedQty: number; damagedQty?: number; missingQty?: number; notes?: string },
  user: AuthUser,
  ipAddress?: string
) {
  return withTransaction(async (txDb) => {
    const transfer = await txDb.findById('stockTransfers', transferId);
    if (!transfer) throw new Error('Transfer not found');
    if (transfer.status !== 'IN_TRANSIT' && transfer.status !== 'PARTIALLY_RECEIVED') {
      throw new Error(`Transfer must be IN_TRANSIT or PARTIALLY_RECEIVED to receive. Current status: ${transfer.status}`);
    }

    const receivedQty = Number(payload.receivedQty || 0);
    const damagedQty = Number(payload.damagedQty || 0);
    const missingQty = Number(payload.missingQty || 0);
    if (receivedQty < 0 || damagedQty < 0 || missingQty < 0) {
      throw new Error('Quantities cannot be negative');
    }
    const batchTotal = receivedQty + damagedQty + missingQty;
    if (batchTotal <= 0) {
      throw new Error('At least one received, damaged, or missing quantity must be positive');
    }

    const accountedSoFar =
      Number(transfer.receivedQuantity || 0) +
      Number(transfer.damagedQuantity || 0) +
      Number(transfer.missingQuantity || 0);
    const remaining = Number(transfer.dispatchedQuantity || transfer.quantity) - accountedSoFar;

    if (batchTotal > remaining) {
      throw new Error(`Receipt total (${batchTotal}) exceeds remaining in-transit quantity (${remaining})`);
    }

    const destWh = await txDb.findById('warehouses', transfer.destinationWarehouseId);
    const sourceWh = await txDb.findById('warehouses', transfer.sourceWarehouseId);
    const product = await txDb.findById('products', transfer.productId);
    if (!destWh || !sourceWh || !product) throw new Error('Referenced warehouse or product not found');

    const unitCost = Number(transfer.unitCost || product.purchasePrice || 0);
    const destInv = await getOrCreateInventory(txDb, product._id, destWh._id, unitCost);
    const prevDestQty = Number(destInv.availableQuantity || 0);
    const prevDestAvg = Number(destInv.averageCost || unitCost);

    if (receivedQty > 0) {
      const newDestQty = prevDestQty + receivedQty;
      const newAvg =
        newDestQty > 0
          ? Number((((prevDestQty * prevDestAvg) + (receivedQty * unitCost)) / newDestQty).toFixed(4))
          : unitCost;
      await txDb.updateById('inventories', destInv._id, {
        availableQuantity: newDestQty,
        averageCost: newAvg,
        totalValue: Number((newDestQty * newAvg).toFixed(2)),
        lastUpdated: new Date().toISOString(),
      });

      const txInNum = await generateSequenceNumber('TIN');
      await txDb.insert('stockTransactions', {
        transactionNumber: txInNum,
        warehouseId: destWh._id,
        productId: product._id,
        movementType: 'TRANSFER_IN',
        direction: 'IN',
        status: 'CONFIRMED',
        quantity: receivedQty,
        previousQuantity: prevDestQty,
        quantityIn: receivedQty,
        quantityOut: 0,
        newQuantity: newDestQty,
        unit: product.unit,
        unitPrice: unitCost,
        totalAmount: Number((receivedQty * unitCost).toFixed(2)),
        referenceNumber: transfer.transferNumber,
        notes: payload.notes || `Transfer from ${sourceWh.name}`,
        performedByUserId: user.id,
        confirmedByUserId: user.id,
        transactionDate: new Date().toISOString(),
      });
    }

    if (damagedQty > 0) {
      const dmgNum = await generateSequenceNumber('DMG');
      await txDb.insert('stockTransactions', {
        transactionNumber: dmgNum,
        warehouseId: destWh._id,
        productId: product._id,
        movementType: 'DAMAGED_STOCK',
        direction: 'OUT',
        status: 'CONFIRMED',
        quantity: damagedQty,
        previousQuantity: prevDestQty + receivedQty,
        quantityIn: 0,
        quantityOut: damagedQty,
        newQuantity: prevDestQty + receivedQty,
        unit: product.unit,
        unitPrice: unitCost,
        totalAmount: Number((damagedQty * unitCost).toFixed(2)),
        referenceNumber: transfer.transferNumber,
        reason: 'Damaged during warehouse transfer',
        notes: payload.notes || '',
        performedByUserId: user.id,
        confirmedByUserId: user.id,
        transactionDate: new Date().toISOString(),
      });
    }

    const totalReceived = Number(transfer.receivedQuantity || 0) + receivedQty;
    const totalDamaged = Number(transfer.damagedQuantity || 0) + damagedQty;
    const totalMissing = Number(transfer.missingQuantity || 0) + missingQty;
    const newAccounted = totalReceived + totalDamaged + totalMissing;
    const dispatchedTotal = Number(transfer.dispatchedQuantity || transfer.quantity);
    const nextStatus = newAccounted >= dispatchedTotal ? 'COMPLETED' : 'PARTIALLY_RECEIVED';

    const receiptEntry = {
      receivedQty,
      damagedQty,
      missingQty,
      notes: payload.notes || '',
      receivedByUserId: user.id,
      receivedByName: user.fullName,
      receivedAt: new Date().toISOString(),
    };

    const updated = await txDb.updateById('stockTransfers', transfer._id, {
      receivedQuantity: totalReceived,
      damagedQuantity: totalDamaged,
      missingQuantity: totalMissing,
      status: nextStatus,
      receivedByUserId: user.id,
      receivedAt: new Date().toISOString(),
      receiptHistory: [...(transfer.receiptHistory || []), receiptEntry],
    });

    await emitNotification(txDb, {
      type: 'TRANSFER_RECEIVED',
      title: `Transfer ${nextStatus === 'COMPLETED' ? 'Completed' : 'Partially Received'}: ${transfer.transferNumber}`,
      message: `${destWh.name} received ${receivedQty} ${product.unit} of ${product.name} (Damaged: ${damagedQty}, Missing: ${missingQty}).`,
      warehouseId: destWh._id,
      targetRoles: ['SUPER_ADMIN', 'GENERAL_MANAGER', 'WAREHOUSE_MANAGER'],
      relatedId: transfer._id,
    });

    await recordAuditLog(txDb, user, {
      action: 'RECEIVE_TRANSFER',
      entityType: 'StockTransfer',
      entityId: transfer._id,
      warehouseId: destWh._id,
      details: `Received transfer ${transfer.transferNumber} at ${destWh.name}: +${receivedQty} good, ${damagedQty} damaged, ${missingQty} missing. Status: ${nextStatus}`,
      ipAddress,
    });

    return updated;
  });
}

export async function applyStockAdjustment(
  txDb: DbContext,
  params: {
    warehouseId: string;
    productId: string;
    adjustmentType: AdjustmentType;
    adjustmentQuantity: number;
    reason: string;
    adjustedByUser: AuthUser;
    approvedByUser: AuthUser;
    ipAddress?: string;
  }
) {
  const warehouse = await txDb.findById('warehouses', params.warehouseId);
  const product = await txDb.findById('products', params.productId);
  if (!warehouse || !product) throw new Error('Warehouse or product not found');

  const inv = await getOrCreateInventory(txDb, product._id, warehouse._id, product.purchasePrice);
  const prevQty = Number(inv.availableQuantity || 0);
  const absQty = Math.abs(Number(params.adjustmentQuantity));
  if (absQty <= 0) throw new Error('Adjustment quantity must be greater than zero');

  const isIncrease =
    params.adjustmentType === 'INCREASE' ||
    (params.adjustmentType === 'PHYSICAL_COUNT_CORRECTION' && Number(params.adjustmentQuantity) > 0);

  const signedDelta = isIncrease ? absQty : -absQty;
  const newQty = prevQty + signedDelta;

  if (newQty < 0) {
    throw new Error(`Adjustment would result in negative inventory (${newQty}). Available: ${prevQty}`);
  }

  const avgCost = Number(inv.averageCost || product.purchasePrice || 0);
  await txDb.updateById('inventories', inv._id, {
    availableQuantity: newQty,
    totalValue: Number((newQty * avgCost).toFixed(2)),
    lastUpdated: new Date().toISOString(),
  });

  const adjNum = await generateSequenceNumber('ADJ');
  const adjDoc = await txDb.insert('stockAdjustments', {
    adjustmentNumber: adjNum,
    warehouseId: warehouse._id,
    productId: product._id,
    adjustmentType: params.adjustmentType,
    previousQuantity: prevQty,
    adjustmentQuantity: signedDelta,
    newQuantity: newQty,
    reason: params.reason,
    adjustedByUserId: params.adjustedByUser.id,
    approvedByUserId: params.approvedByUser.id,
    status: 'APPROVED',
    adjustmentDate: new Date().toISOString(),
  });

  const movementType =
    params.adjustmentType === 'DAMAGED'
      ? 'DAMAGED_STOCK'
      : isIncrease
      ? 'ADJUSTMENT_IN'
      : 'ADJUSTMENT_OUT';

  const txNum = await generateSequenceNumber('LADJ');
  await txDb.insert('stockTransactions', {
    transactionNumber: txNum,
    warehouseId: warehouse._id,
    productId: product._id,
    movementType,
    direction: isIncrease ? 'IN' : 'OUT',
    status: 'CONFIRMED',
    quantity: absQty,
    previousQuantity: prevQty,
    quantityIn: isIncrease ? absQty : 0,
    quantityOut: isIncrease ? 0 : absQty,
    newQuantity: newQty,
    unit: product.unit,
    unitPrice: avgCost,
    totalAmount: Number((absQty * avgCost).toFixed(2)),
    referenceNumber: adjNum,
    reason: params.reason,
    notes: `Adjustment (${params.adjustmentType})`,
    performedByUserId: params.adjustedByUser.id,
    confirmedByUserId: params.approvedByUser.id,
    transactionDate: new Date().toISOString(),
  });

  await emitNotification(txDb, {
    type: 'STOCK_ADJUSTMENT',
    title: `Stock Adjustment: ${adjNum}`,
    message: `${product.name} in ${warehouse.name} adjusted by ${signedDelta > 0 ? '+' : ''}${signedDelta} (${params.adjustmentType}). New qty: ${newQty}.`,
    warehouseId: warehouse._id,
    targetRoles: ['SUPER_ADMIN', 'GENERAL_MANAGER', 'WAREHOUSE_MANAGER', 'ACCOUNTANT'],
    relatedId: adjDoc._id,
  });

  await checkAndEmitStockAlerts(txDb, warehouse._id, warehouse.name, product, newQty);

  await recordAuditLog(txDb, params.approvedByUser, {
    action: 'STOCK_ADJUSTMENT',
    entityType: 'StockAdjustment',
    entityId: adjDoc._id,
    warehouseId: warehouse._id,
    details: `${adjNum}: ${product.name} (${product.sku}) at ${warehouse.name} ${prevQty} -> ${newQty} (${params.adjustmentType}: ${params.reason})`,
    ipAddress: params.ipAddress,
  });

  return adjDoc;
}

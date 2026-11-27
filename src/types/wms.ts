export type UserRole =
  | 'SUPER_ADMIN'
  | 'GENERAL_MANAGER'
  | 'WAREHOUSE_MANAGER'
  | 'STOREKEEPER'
  | 'ACCOUNTANT';

export type LanguageCode = 'so' | 'en';

export type MovementType =
  | 'OPENING_BALANCE'
  | 'STOCK_IN'
  | 'STOCK_OUT'
  | 'TRANSFER_IN'
  | 'TRANSFER_OUT'
  | 'ADJUSTMENT_IN'
  | 'ADJUSTMENT_OUT'
  | 'DAMAGED_STOCK';

export type TransferStatus =
  | 'DRAFT'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'IN_TRANSIT'
  | 'PARTIALLY_RECEIVED'
  | 'COMPLETED'
  | 'REJECTED'
  | 'CANCELLED';

export type TransactionStatus = 'DRAFT' | 'CONFIRMED' | 'CANCELLED';

export type AdjustmentType =
  | 'INCREASE'
  | 'DECREASE'
  | 'DAMAGED'
  | 'LOST'
  | 'PHYSICAL_COUNT_CORRECTION';

export type StockCountStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED';

export type StockStatus = 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';

export interface RolePermissionSet {
  manageWarehouses: boolean;
  manageProducts: boolean;
  manageEmployees: boolean;
  manageSuppliers: boolean;
  stockIn: boolean;
  stockOut: boolean;
  createTransfer: boolean;
  approveTransfer: boolean;
  dispatchTransfer: boolean;
  receiveTransfer: boolean;
  stockAdjustment: boolean;
  stockCount: boolean;
  approveStockCount: boolean;
  viewValuation: boolean;
  exportReports: boolean;
  manageSettings: boolean;
  viewAuditLogs: boolean;
}

export interface AuthUser {
  id: string;
  username: string;
  email: string;
  fullName: string;
  role: UserRole;
  assignedWarehouseId?: string | null;
  employeeId?: string | null;
  status: 'ACTIVE' | 'INACTIVE';
  permissions: RolePermissionSet;
}

export interface Warehouse {
  _id: string;
  name: string;
  code: string;
  location: string;
  address: string;
  managerId?: string | null;
  managerName?: string;
  phone: string;
  description: string;
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: string;
  updatedAt: string;
  totalProducts?: number;
  totalQuantity?: number;
  totalValue?: number;
  employeeCount?: number;
}

export interface Category {
  _id: string;
  name: string;
  description: string;
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: string;
}

export interface Product {
  _id: string;
  name: string;
  sku: string;
  barcode: string;
  categoryId: string;
  categoryName?: string;
  brand: string;
  unit: string;
  purchasePrice: number;
  sellingPrice: number;
  minimumStockLevel: number;
  imageUrl: string;
  description: string;
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: string;
  updatedAt: string;
  globalQuantity?: number;
  globalValue?: number;
}

export interface InventoryItem {
  _id: string;
  productId: string;
  warehouseId: string;
  availableQuantity: number;
  reservedQuantity: number;
  averageCost: number;
  totalValue: number;
  lastUpdated: string;
  product?: Product;
  warehouse?: Warehouse;
  stockStatus?: StockStatus;
}

export interface StockTransaction {
  _id: string;
  transactionNumber: string;
  warehouseId: string;
  productId: string;
  movementType: MovementType;
  direction: 'IN' | 'OUT';
  status: TransactionStatus;
  quantity: number;
  previousQuantity: number;
  quantityIn: number;
  quantityOut: number;
  newQuantity: number;
  unit: string;
  unitPrice: number;
  totalAmount: number;
  supplierId?: string | null;
  invoiceNumber?: string;
  destinationCustomer?: string;
  referenceNumber?: string;
  reason?: string;
  notes?: string;
  attachmentName?: string;
  performedByUserId: string;
  performedByName?: string;
  confirmedByUserId?: string | null;
  confirmedByName?: string;
  transactionDate: string;
  createdAt: string;
  warehouseName?: string;
  productName?: string;
  productSku?: string;
  supplierName?: string;
}

export interface StockTransfer {
  _id: string;
  transferNumber: string;
  sourceWarehouseId: string;
  destinationWarehouseId: string;
  productId: string;
  quantity: number;
  dispatchedQuantity: number;
  receivedQuantity: number;
  damagedQuantity: number;
  missingQuantity: number;
  unitCost: number;
  status: TransferStatus;
  transferDate: string;
  requestedByUserId: string;
  requestedByName?: string;
  approvedByUserId?: string | null;
  approvedByName?: string;
  dispatchedByUserId?: string | null;
  dispatchedAt?: string | null;
  receivedByUserId?: string | null;
  receivedAt?: string | null;
  notes: string;
  rejectionReason?: string;
  receiptHistory: Array<{
    receivedQty: number;
    damagedQty: number;
    missingQty: number;
    notes: string;
    receivedByUserId: string;
    receivedByName: string;
    receivedAt: string;
  }>;
  createdAt: string;
  sourceWarehouseName?: string;
  destinationWarehouseName?: string;
  productName?: string;
  productSku?: string;
  unit?: string;
}

export interface StockAdjustment {
  _id: string;
  adjustmentNumber: string;
  warehouseId: string;
  productId: string;
  adjustmentType: AdjustmentType;
  previousQuantity: number;
  adjustmentQuantity: number;
  newQuantity: number;
  reason: string;
  adjustedByUserId: string;
  adjustedByName?: string;
  approvedByUserId?: string | null;
  approvedByName?: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  adjustmentDate: string;
  createdAt: string;
  warehouseName?: string;
  productName?: string;
  productSku?: string;
}

export interface StockCountItem {
  productId: string;
  productName?: string;
  productSku?: string;
  unit?: string;
  systemQuantity: number;
  countedQuantity: number;
  difference: number;
  reason: string;
}

export interface StockCount {
  _id: string;
  countNumber: string;
  warehouseId: string;
  warehouseName?: string;
  items: StockCountItem[];
  status: StockCountStatus;
  notes: string;
  createdByUserId: string;
  createdByName?: string;
  approvedByUserId?: string | null;
  approvedByName?: string;
  countDate: string;
  createdAt: string;
}

export interface Supplier {
  _id: string;
  name: string;
  companyName: string;
  contactPerson: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: string;
  totalPurchaseValue?: number;
  transactionCount?: number;
}

export interface EmployeeRecord {
  _id: string;
  fullName: string;
  employeeCode: string;
  phone: string;
  email: string;
  position: string;
  assignedWarehouseId?: string | null;
  assignedWarehouseName?: string;
  userId?: string | null;
  username?: string;
  role?: UserRole;
  accountStatus: 'ACTIVE' | 'INACTIVE';
  createdAt: string;
}

export interface NotificationItem {
  _id: string;
  type:
    | 'LOW_STOCK'
    | 'OUT_OF_STOCK'
    | 'STOCK_IN'
    | 'STOCK_OUT'
    | 'TRANSFER_REQUEST'
    | 'TRANSFER_APPROVED'
    | 'TRANSFER_REJECTED'
    | 'TRANSFER_RECEIVED'
    | 'STOCK_ADJUSTMENT'
    | 'STOCK_COUNT_APPROVED';
  title: string;
  message: string;
  warehouseId?: string | null;
  targetRoles: UserRole[];
  readByUserIds: string[];
  isRead?: boolean;
  relatedId?: string;
  createdAt: string;
}

export interface AuditLogItem {
  _id: string;
  userId: string;
  userName: string;
  userRole: string;
  action: string;
  entityType: string;
  entityId: string;
  warehouseId?: string | null;
  details: string;
  ipAddress?: string;
  createdAt: string;
}

export interface CompanySettings {
  _id: string;
  companyName: string;
  companyLogo: string;
  companyAddress: string;
  companyPhone: string;
  currency: 'USD';
  language: LanguageCode;
  dateFormat: 'YYYY-MM-DD' | 'DD/MM/YYYY' | 'MM/DD/YYYY';
  costingMethod: 'MOVING_WEIGHTED_AVERAGE';
  requireTransferApproval: boolean;
  requireAdjustmentApproval: boolean;
  lowStockAlertsEnabled: boolean;
  emailNotificationsEnabled: boolean;
  rolePermissions: Record<UserRole, RolePermissionSet>;
  updatedAt: string;
}

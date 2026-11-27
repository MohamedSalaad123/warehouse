import mongoose, { Schema } from 'mongoose';

const RolePermissionsSchema = new Schema(
  {
    manageWarehouses: { type: Boolean, default: false },
    manageProducts: { type: Boolean, default: false },
    manageEmployees: { type: Boolean, default: false },
    manageSuppliers: { type: Boolean, default: false },
    stockIn: { type: Boolean, default: false },
    stockOut: { type: Boolean, default: false },
    createTransfer: { type: Boolean, default: false },
    approveTransfer: { type: Boolean, default: false },
    dispatchTransfer: { type: Boolean, default: false },
    receiveTransfer: { type: Boolean, default: false },
    stockAdjustment: { type: Boolean, default: false },
    stockCount: { type: Boolean, default: false },
    approveStockCount: { type: Boolean, default: false },
    viewValuation: { type: Boolean, default: false },
    exportReports: { type: Boolean, default: false },
    manageSettings: { type: Boolean, default: false },
    viewAuditLogs: { type: Boolean, default: false },
  },
  { _id: false }
);

const UserSchema = new Schema(
  {
    username: { type: String, required: true, unique: true, trim: true, lowercase: true },
    email: { type: String, required: true, unique: true, trim: true, lowercase: true },
    fullName: { type: String, required: true, trim: true },
    passwordHash: { type: String, required: true },
    role: {
      type: String,
      enum: ['SUPER_ADMIN', 'GENERAL_MANAGER', 'WAREHOUSE_MANAGER', 'STOREKEEPER', 'ACCOUNTANT'],
      required: true,
    },
    assignedWarehouseId: { type: Schema.Types.ObjectId, ref: 'Warehouse', default: null },
    employeeId: { type: Schema.Types.ObjectId, ref: 'Employee', default: null },
    status: { type: String, enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE' },
  },
  { timestamps: true }
);

const EmployeeSchema = new Schema(
  {
    fullName: { type: String, required: true, trim: true },
    employeeCode: { type: String, required: true, unique: true, trim: true },
    phone: { type: String, default: '' },
    email: { type: String, required: true, trim: true, lowercase: true },
    position: { type: String, required: true, trim: true },
    assignedWarehouseId: { type: Schema.Types.ObjectId, ref: 'Warehouse', default: null },
    userId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    accountStatus: { type: String, enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE' },
  },
  { timestamps: true }
);

const WarehouseSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, unique: true, trim: true, uppercase: true },
    location: { type: String, required: true, trim: true },
    address: { type: String, default: '' },
    managerId: { type: Schema.Types.ObjectId, ref: 'Employee', default: null },
    phone: { type: String, default: '' },
    description: { type: String, default: '' },
    status: { type: String, enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE' },
  },
  { timestamps: true }
);

const CategorySchema = new Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    description: { type: String, default: '' },
    status: { type: String, enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE' },
  },
  { timestamps: true }
);

const ProductSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    sku: { type: String, required: true, unique: true, trim: true, uppercase: true },
    barcode: { type: String, default: '', trim: true },
    categoryId: { type: Schema.Types.ObjectId, ref: 'Category', required: true },
    brand: { type: String, default: '' },
    unit: { type: String, required: true, default: 'Piece' },
    purchasePrice: { type: Number, required: true, min: 0 },
    sellingPrice: { type: Number, required: true, min: 0 },
    minimumStockLevel: { type: Number, required: true, min: 0, default: 10 },
    imageUrl: { type: String, default: '' },
    description: { type: String, default: '' },
    status: { type: String, enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE' },
  },
  { timestamps: true }
);

const InventorySchema = new Schema(
  {
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    warehouseId: { type: Schema.Types.ObjectId, ref: 'Warehouse', required: true },
    availableQuantity: { type: Number, required: true, min: 0, default: 0 },
    reservedQuantity: { type: Number, required: true, min: 0, default: 0 },
    averageCost: { type: Number, required: true, min: 0, default: 0 },
    totalValue: { type: Number, required: true, min: 0, default: 0 },
    lastUpdated: { type: Date, default: Date.now },
  },
  { timestamps: true }
);
InventorySchema.index({ productId: 1, warehouseId: 1 }, { unique: true });

const StockTransactionSchema = new Schema(
  {
    transactionNumber: { type: String, required: true, unique: true },
    warehouseId: { type: Schema.Types.ObjectId, ref: 'Warehouse', required: true },
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    movementType: {
      type: String,
      enum: [
        'OPENING_BALANCE',
        'STOCK_IN',
        'STOCK_OUT',
        'TRANSFER_IN',
        'TRANSFER_OUT',
        'ADJUSTMENT_IN',
        'ADJUSTMENT_OUT',
        'DAMAGED_STOCK',
      ],
      required: true,
    },
    direction: { type: String, enum: ['IN', 'OUT'], required: true },
    status: { type: String, enum: ['DRAFT', 'CONFIRMED', 'CANCELLED'], default: 'DRAFT' },
    quantity: { type: Number, required: true, min: 0 },
    previousQuantity: { type: Number, default: 0 },
    quantityIn: { type: Number, default: 0 },
    quantityOut: { type: Number, default: 0 },
    newQuantity: { type: Number, default: 0 },
    unit: { type: String, required: true },
    unitPrice: { type: Number, required: true, min: 0 },
    totalAmount: { type: Number, required: true, min: 0 },
    supplierId: { type: Schema.Types.ObjectId, ref: 'Supplier', default: null },
    invoiceNumber: { type: String, default: '' },
    destinationCustomer: { type: String, default: '' },
    referenceNumber: { type: String, default: '' },
    reason: { type: String, default: '' },
    notes: { type: String, default: '' },
    attachmentName: { type: String, default: '' },
    performedByUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    confirmedByUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    transactionDate: { type: Date, default: Date.now },
  },
  { timestamps: true }
);
StockTransactionSchema.index({ warehouseId: 1, transactionDate: -1 });
StockTransactionSchema.index({ productId: 1, transactionDate: -1 });

const StockTransferSchema = new Schema(
  {
    transferNumber: { type: String, required: true, unique: true },
    sourceWarehouseId: { type: Schema.Types.ObjectId, ref: 'Warehouse', required: true },
    destinationWarehouseId: { type: Schema.Types.ObjectId, ref: 'Warehouse', required: true },
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    quantity: { type: Number, required: true, min: 1 },
    dispatchedQuantity: { type: Number, default: 0 },
    receivedQuantity: { type: Number, default: 0 },
    damagedQuantity: { type: Number, default: 0 },
    missingQuantity: { type: Number, default: 0 },
    unitCost: { type: Number, default: 0 },
    status: {
      type: String,
      enum: [
        'DRAFT',
        'PENDING_APPROVAL',
        'APPROVED',
        'IN_TRANSIT',
        'PARTIALLY_RECEIVED',
        'COMPLETED',
        'REJECTED',
        'CANCELLED',
      ],
      default: 'PENDING_APPROVAL',
    },
    transferDate: { type: Date, default: Date.now },
    requestedByUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    approvedByUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    dispatchedByUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    dispatchedAt: { type: Date, default: null },
    receivedByUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    receivedAt: { type: Date, default: null },
    notes: { type: String, default: '' },
    rejectionReason: { type: String, default: '' },
    receiptHistory: [
      {
        receivedQty: Number,
        damagedQty: Number,
        missingQty: Number,
        notes: String,
        receivedByUserId: { type: Schema.Types.ObjectId, ref: 'User' },
        receivedByName: String,
        receivedAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

const StockAdjustmentSchema = new Schema(
  {
    adjustmentNumber: { type: String, required: true, unique: true },
    warehouseId: { type: Schema.Types.ObjectId, ref: 'Warehouse', required: true },
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    adjustmentType: {
      type: String,
      enum: ['INCREASE', 'DECREASE', 'DAMAGED', 'LOST', 'PHYSICAL_COUNT_CORRECTION'],
      required: true,
    },
    previousQuantity: { type: Number, required: true },
    adjustmentQuantity: { type: Number, required: true },
    newQuantity: { type: Number, required: true, min: 0 },
    reason: { type: String, required: true },
    adjustedByUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    approvedByUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    status: { type: String, enum: ['PENDING', 'APPROVED', 'REJECTED'], default: 'PENDING' },
    adjustmentDate: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

const StockCountSchema = new Schema(
  {
    countNumber: { type: String, required: true, unique: true },
    warehouseId: { type: Schema.Types.ObjectId, ref: 'Warehouse', required: true },
    items: [
      {
        productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
        systemQuantity: { type: Number, required: true },
        countedQuantity: { type: Number, required: true, min: 0 },
        difference: { type: Number, required: true },
        reason: { type: String, default: '' },
      },
    ],
    status: { type: String, enum: ['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED'], default: 'DRAFT' },
    notes: { type: String, default: '' },
    createdByUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    approvedByUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    countDate: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

const SupplierSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    companyName: { type: String, required: true, trim: true },
    contactPerson: { type: String, default: '' },
    phone: { type: String, default: '' },
    email: { type: String, default: '' },
    address: { type: String, default: '' },
    notes: { type: String, default: '' },
    status: { type: String, enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE' },
  },
  { timestamps: true }
);

const NotificationSchema = new Schema(
  {
    type: {
      type: String,
      enum: [
        'LOW_STOCK',
        'OUT_OF_STOCK',
        'STOCK_IN',
        'STOCK_OUT',
        'TRANSFER_REQUEST',
        'TRANSFER_APPROVED',
        'TRANSFER_REJECTED',
        'TRANSFER_RECEIVED',
        'STOCK_ADJUSTMENT',
        'STOCK_COUNT_APPROVED',
      ],
      required: true,
    },
    title: { type: String, required: true },
    message: { type: String, required: true },
    warehouseId: { type: Schema.Types.ObjectId, ref: 'Warehouse', default: null },
    targetRoles: [{ type: String }],
    readByUserIds: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    relatedId: { type: String, default: '' },
  },
  { timestamps: true }
);

const AuditLogSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    userName: { type: String, required: true },
    userRole: { type: String, required: true },
    action: { type: String, required: true },
    entityType: { type: String, required: true },
    entityId: { type: String, default: '' },
    warehouseId: { type: Schema.Types.ObjectId, ref: 'Warehouse', default: null },
    details: { type: String, default: '' },
    ipAddress: { type: String, default: '' },
  },
  { timestamps: true }
);

const CompanySettingSchema = new Schema(
  {
    companyName: { type: String, default: 'Khayre Warehouse System' },
    companyLogo: { type: String, default: '' },
    companyAddress: { type: String, default: '' },
    companyPhone: { type: String, default: '' },
    currency: { type: String, enum: ['USD'], default: 'USD' },
    language: { type: String, enum: ['so', 'en'], default: 'so' },
    dateFormat: { type: String, enum: ['YYYY-MM-DD', 'DD/MM/YYYY', 'MM/DD/YYYY'], default: 'YYYY-MM-DD' },
    costingMethod: { type: String, enum: ['MOVING_WEIGHTED_AVERAGE'], default: 'MOVING_WEIGHTED_AVERAGE' },
    requireTransferApproval: { type: Boolean, default: true },
    requireAdjustmentApproval: { type: Boolean, default: true },
    lowStockAlertsEnabled: { type: Boolean, default: true },
    emailNotificationsEnabled: { type: Boolean, default: false },
    rolePermissions: {
      SUPER_ADMIN: RolePermissionsSchema,
      GENERAL_MANAGER: RolePermissionsSchema,
      WAREHOUSE_MANAGER: RolePermissionsSchema,
      STOREKEEPER: RolePermissionsSchema,
      ACCOUNTANT: RolePermissionsSchema,
    },
  },
  { timestamps: true }
);

export const UserModel = mongoose.models.User || mongoose.model('User', UserSchema, 'users');
export const EmployeeModel = mongoose.models.Employee || mongoose.model('Employee', EmployeeSchema, 'employees');
export const WarehouseModel = mongoose.models.Warehouse || mongoose.model('Warehouse', WarehouseSchema, 'warehouses');
export const CategoryModel = mongoose.models.Category || mongoose.model('Category', CategorySchema, 'categories');
export const ProductModel = mongoose.models.Product || mongoose.model('Product', ProductSchema, 'products');
export const InventoryModel = mongoose.models.Inventory || mongoose.model('Inventory', InventorySchema, 'inventories');
export const StockTransactionModel =
  mongoose.models.StockTransaction || mongoose.model('StockTransaction', StockTransactionSchema, 'stockTransactions');
export const StockTransferModel =
  mongoose.models.StockTransfer || mongoose.model('StockTransfer', StockTransferSchema, 'stockTransfers');
export const StockAdjustmentModel =
  mongoose.models.StockAdjustment || mongoose.model('StockAdjustment', StockAdjustmentSchema, 'stockAdjustments');
export const StockCountModel =
  mongoose.models.StockCount || mongoose.model('StockCount', StockCountSchema, 'stockCounts');
export const SupplierModel = mongoose.models.Supplier || mongoose.model('Supplier', SupplierSchema, 'suppliers');
export const NotificationModel =
  mongoose.models.Notification || mongoose.model('Notification', NotificationSchema, 'notifications');
export const AuditLogModel = mongoose.models.AuditLog || mongoose.model('AuditLog', AuditLogSchema, 'auditLogs');
export const CompanySettingModel =
  mongoose.models.CompanySetting || mongoose.model('CompanySetting', CompanySettingSchema, 'companySettings');

export const MongooseModels = {
  users: UserModel,
  employees: EmployeeModel,
  warehouses: WarehouseModel,
  categories: CategoryModel,
  products: ProductModel,
  inventories: InventoryModel,
  stockTransactions: StockTransactionModel,
  stockTransfers: StockTransferModel,
  stockAdjustments: StockAdjustmentModel,
  stockCounts: StockCountModel,
  suppliers: SupplierModel,
  notifications: NotificationModel,
  auditLogs: AuditLogModel,
  companySettings: CompanySettingModel,
} as const;

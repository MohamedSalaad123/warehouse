import { Router } from 'express';
import { db } from '../db/adapter.ts';
import {
  AuthenticatedRequest,
  hasGlobalWarehouseAccess,
  requireAuth,
  requirePermission,
} from '../middleware/auth.ts';
import { recordAuditLog } from '../services/auditService.ts';

const router = Router();
router.use(requireAuth);

// Categories
router.get('/categories', async (_req, res) => {
  try {
    const categories = await db.find('categories', {}, { sort: { name: 1 } });
    res.json({ data: categories });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch categories' });
  }
});

router.post('/categories', requirePermission('manageProducts'), async (req: AuthenticatedRequest, res) => {
  try {
    const { name, description } = req.body;
    if (!name || !String(name).trim()) {
      res.status(400).json({ error: 'Category name is required' });
      return;
    }
    const created = await db.insert('categories', {
      name: String(name).trim(),
      description: String(description || '').trim(),
      status: 'ACTIVE',
    });
    await recordAuditLog(db, req.user!, {
      action: 'CREATE_CATEGORY',
      entityType: 'Category',
      entityId: created._id,
      details: `Created product category ${created.name}`,
      ipAddress: req.ip,
    });
    res.status(201).json({ data: created });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to create category' });
  }
});

// Products
router.get('/', async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const search = String(req.query.search || '').trim().toLowerCase();
    const categoryId = String(req.query.categoryId || '').trim();
    const status = String(req.query.status || '').trim();

    const [products, categories, inventories] = await Promise.all([
      db.find('products', {}, { sort: { createdAt: -1 } }),
      db.find('categories', {}),
      db.find(
        'inventories',
        !hasGlobalWarehouseAccess(user) && user.assignedWarehouseId
          ? { warehouseId: user.assignedWarehouseId }
          : {}
      ),
    ]);

    const catMap = new Map(categories.map((c) => [String(c._id), c.name]));

    let filtered = products;
    if (categoryId && categoryId !== 'ALL') {
      filtered = filtered.filter((p) => String(p.categoryId) === categoryId);
    }
    if (status && status !== 'ALL') {
      filtered = filtered.filter((p) => p.status === status);
    }
    if (search) {
      filtered = filtered.filter(
        (p) =>
          p.name.toLowerCase().includes(search) ||
          p.sku.toLowerCase().includes(search) ||
          (p.barcode || '').toLowerCase().includes(search) ||
          (p.brand || '').toLowerCase().includes(search)
      );
    }

    const enriched = filtered.map((p) => {
      const pInv = inventories.filter((i) => String(i.productId) === String(p._id));
      const globalQuantity = pInv.reduce((sum, i) => sum + Number(i.availableQuantity || 0), 0);
      const globalValue = pInv.reduce((sum, i) => sum + Number(i.totalValue || 0), 0);
      return {
        ...p,
        categoryName: catMap.get(String(p.categoryId)) || 'Uncategorized',
        globalQuantity,
        globalValue: user.permissions.viewValuation ? Number(globalValue.toFixed(2)) : null,
      };
    });

    res.json({ data: enriched });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch products' });
  }
});

router.get('/:id', async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const id = String(req.params.id);
    const product = await db.findById('products', id);
    if (!product) {
      res.status(404).json({ error: 'Product not found' });
      return;
    }

    const [categories, warehouses, inventories, transactions] = await Promise.all([
      db.find('categories', {}),
      db.find('warehouses', {}),
      db.find('inventories', { productId: id }),
      db.find('stockTransactions', { productId: id }, { sort: { transactionDate: -1 }, limit: 100 }),
    ]);

    const cat = categories.find((c) => String(c._id) === String(product.categoryId));
    const whMap = new Map(warehouses.map((w) => [String(w._id), w]));

    const visibleInv = inventories
      .filter((i) => hasGlobalWarehouseAccess(user) || String(i.warehouseId) === String(user.assignedWarehouseId))
      .map((i) => {
        const wh = whMap.get(String(i.warehouseId));
        return {
          ...i,
          warehouseName: wh?.name || 'Unknown',
          warehouseCode: wh?.code || '',
          totalValue: user.permissions.viewValuation ? i.totalValue : null,
          averageCost: user.permissions.viewValuation ? i.averageCost : null,
        };
      });

    const visibleTx = transactions
      .filter((t) => hasGlobalWarehouseAccess(user) || String(t.warehouseId) === String(user.assignedWarehouseId))
      .map((t) => {
        const wh = whMap.get(String(t.warehouseId));
        return {
          ...t,
          warehouseName: wh?.name || 'Unknown',
        };
      });

    const totalQuantity = visibleInv.reduce((sum, i) => sum + Number(i.availableQuantity || 0), 0);
    const totalValuation = visibleInv.reduce((sum, i) => sum + Number(i.totalValue || 0), 0);

    res.json({
      product: {
        ...product,
        categoryName: cat?.name || 'Uncategorized',
        globalQuantity: totalQuantity,
        globalValue: user.permissions.viewValuation ? Number(totalValuation.toFixed(2)) : null,
      },
      warehouseStock: visibleInv,
      history: visibleTx,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch product details' });
  }
});

router.post('/', requirePermission('manageProducts'), async (req: AuthenticatedRequest, res) => {
  try {
    const {
      name,
      sku,
      barcode,
      categoryId,
      brand,
      unit,
      purchasePrice,
      sellingPrice,
      minimumStockLevel,
      imageUrl,
      description,
      status,
    } = req.body;

    if (!name || !sku || !categoryId) {
      res.status(400).json({ error: 'Product name, SKU, and category are required' });
      return;
    }

    const created = await db.insert('products', {
      name: String(name).trim(),
      sku: String(sku).trim().toUpperCase(),
      barcode: String(barcode || '').trim(),
      categoryId: String(categoryId),
      brand: String(brand || '').trim(),
      unit: String(unit || 'Piece').trim(),
      purchasePrice: Math.max(0, Number(purchasePrice || 0)),
      sellingPrice: Math.max(0, Number(sellingPrice || 0)),
      minimumStockLevel: Math.max(0, Number(minimumStockLevel ?? 10)),
      imageUrl: String(imageUrl || '').trim(),
      description: String(description || '').trim(),
      status: status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
    });

    await recordAuditLog(db, req.user!, {
      action: 'CREATE_PRODUCT',
      entityType: 'Product',
      entityId: created._id,
      details: `Created product ${created.name} (SKU: ${created.sku})`,
      ipAddress: req.ip,
    });

    res.status(201).json({ data: created });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to create product' });
  }
});

router.put('/:id', requirePermission('manageProducts'), async (req: AuthenticatedRequest, res) => {
  try {
    const id = String(req.params.id);
    const existing = await db.findById('products', id);
    if (!existing) {
      res.status(404).json({ error: 'Product not found' });
      return;
    }

    const body = req.body;
    const updated = await db.updateById('products', id, {
      name: body.name !== undefined ? String(body.name).trim() : existing.name,
      sku: body.sku !== undefined ? String(body.sku).trim().toUpperCase() : existing.sku,
      barcode: body.barcode !== undefined ? String(body.barcode).trim() : existing.barcode,
      categoryId: body.categoryId !== undefined ? String(body.categoryId) : existing.categoryId,
      brand: body.brand !== undefined ? String(body.brand).trim() : existing.brand,
      unit: body.unit !== undefined ? String(body.unit).trim() : existing.unit,
      purchasePrice:
        body.purchasePrice !== undefined ? Math.max(0, Number(body.purchasePrice)) : existing.purchasePrice,
      sellingPrice:
        body.sellingPrice !== undefined ? Math.max(0, Number(body.sellingPrice)) : existing.sellingPrice,
      minimumStockLevel:
        body.minimumStockLevel !== undefined
          ? Math.max(0, Number(body.minimumStockLevel))
          : existing.minimumStockLevel,
      imageUrl: body.imageUrl !== undefined ? String(body.imageUrl).trim() : existing.imageUrl,
      description: body.description !== undefined ? String(body.description).trim() : existing.description,
      status: body.status === 'INACTIVE' || body.status === 'ACTIVE' ? body.status : existing.status,
    });

    await recordAuditLog(db, req.user!, {
      action: 'UPDATE_PRODUCT',
      entityType: 'Product',
      entityId: id,
      details: `Updated product ${updated.name} (SKU: ${updated.sku})`,
      ipAddress: req.ip,
    });

    res.json({ data: updated });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to update product' });
  }
});

export default router;

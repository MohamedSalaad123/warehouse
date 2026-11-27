import crypto from 'crypto';
import fs from 'fs';
import mongoose, { ClientSession } from 'mongoose';
import path from 'path';
import { MongooseModels } from '../models/index.ts';

export type CollectionName = keyof typeof MongooseModels;

interface LocalDatabaseSnapshot {
  users: any[];
  employees: any[];
  warehouses: any[];
  categories: any[];
  products: any[];
  inventories: any[];
  stockTransactions: any[];
  stockTransfers: any[];
  stockAdjustments: any[];
  stockCounts: any[];
  suppliers: any[];
  notifications: any[];
  auditLogs: any[];
  companySettings: any[];
}

const EMPTY_SNAPSHOT: LocalDatabaseSnapshot = {
  users: [],
  employees: [],
  warehouses: [],
  categories: [],
  products: [],
  inventories: [],
  stockTransactions: [],
  stockTransfers: [],
  stockAdjustments: [],
  stockCounts: [],
  suppliers: [],
  notifications: [],
  auditLogs: [],
  companySettings: [],
};

const DATA_DIR = path.resolve(process.cwd(), '.data');
const DATA_FILE = path.join(DATA_DIR, 'khayre-wms.json');

let useMongo = false;
let mongoConnected = false;
let localData: LocalDatabaseSnapshot = structuredClone(EMPTY_SNAPSHOT);
let txMutex: Promise<void> = Promise.resolve();

function generateObjectId(): string {
  return crypto.randomBytes(12).toString('hex');
}

function normalizeIds(val: any): any {
  if (val === null || val === undefined) return val;
  if (val instanceof Date) return val.toISOString();
  if (typeof val === 'object' && typeof val.toHexString === 'function') {
    return val.toHexString();
  }
  if (Array.isArray(val)) return val.map(normalizeIds);
  if (typeof val === 'object') {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(val)) {
      out[k] = normalizeIds(v);
    }
    return out;
  }
  return val;
}

function loadLocalData(): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      localData = { ...structuredClone(EMPTY_SNAPSHOT), ...parsed };
    } else {
      persistLocalData(localData);
    }
  } catch (err) {
    console.error('Failed to load local store, initializing empty database:', err);
    localData = structuredClone(EMPTY_SNAPSHOT);
  }
}

function persistLocalData(snapshot: LocalDatabaseSnapshot): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  const tmpFile = `${DATA_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(snapshot, null, 2), 'utf-8');
  fs.renameSync(tmpFile, DATA_FILE);
}

export async function initDatabase(): Promise<{ mode: 'mongodb' | 'local'; connected: boolean }> {
  const uri = process.env.MONGODB_URI?.trim();
  if (uri) {
    try {
      await mongoose.connect(uri, {
        serverSelectionTimeoutMS: 8000,
      });
      useMongo = true;
      mongoConnected = true;
      console.log('Connected to MongoDB Atlas via Mongoose');
      return { mode: 'mongodb', connected: true };
    } catch (err) {
      console.error('MongoDB connection failed, falling back to local persistent store:', err);
      useMongo = false;
      mongoConnected = false;
      loadLocalData();
      return { mode: 'local', connected: true };
    }
  }

  useMongo = false;
  mongoConnected = false;
  loadLocalData();
  console.log('MONGODB_URI not set — using local persistent database (.data/khayre-wms.json)');
  return { mode: 'local', connected: true };
}

export function getDatabaseStatus(): { mode: 'mongodb' | 'local'; connected: boolean } {
  if (useMongo) {
    return { mode: 'mongodb', connected: mongoose.connection.readyState === 1 };
  }
  return { mode: 'local', connected: true };
}

function matchesQuery(doc: any, query: Record<string, any>): boolean {
  for (const [key, expected] of Object.entries(query)) {
    if (expected === undefined) continue;
    if (key === '$or' && Array.isArray(expected)) {
      if (!expected.some((sub) => matchesQuery(doc, sub))) return false;
      continue;
    }
    const actual = doc[key];
    if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
      if ('$in' in expected && Array.isArray(expected.$in)) {
        if (!expected.$in.map(String).includes(String(actual))) return false;
        continue;
      }
      if ('$ne' in expected) {
        if (String(actual) === String(expected.$ne)) return false;
        continue;
      }
      if ('$gte' in expected || '$lte' in expected || '$gt' in expected || '$lt' in expected) {
        const aTime = actual instanceof Date ? actual.getTime() : new Date(actual).getTime();
        const aNum = typeof actual === 'number' ? actual : aTime;
        if ('$gte' in expected) {
          const v = expected.$gte instanceof Date ? expected.$gte.getTime() : Number(expected.$gte);
          if (!(aNum >= v)) return false;
        }
        if ('$lte' in expected) {
          const v = expected.$lte instanceof Date ? expected.$lte.getTime() : Number(expected.$lte);
          if (!(aNum <= v)) return false;
        }
        if ('$gt' in expected) {
          const v = expected.$gt instanceof Date ? expected.$gt.getTime() : Number(expected.$gt);
          if (!(aNum > v)) return false;
        }
        if ('$lt' in expected) {
          const v = expected.$lt instanceof Date ? expected.$lt.getTime() : Number(expected.$lt);
          if (!(aNum < v)) return false;
        }
        continue;
      }
    }
    if (expected === null) {
      if (actual !== null && actual !== undefined) return false;
    } else if (String(actual) !== String(expected)) {
      return false;
    }
  }
  return true;
}

function enforceUniqueConstraints(collection: CollectionName, doc: any, existing: any[], excludeId?: string): void {
  const others = existing.filter((d) => !excludeId || String(d._id) !== String(excludeId));
  if (collection === 'users') {
    if (others.some((u) => u.username === doc.username)) throw new Error('Username already exists');
    if (others.some((u) => u.email === doc.email)) throw new Error('Email already exists');
  } else if (collection === 'employees') {
    if (others.some((e) => e.employeeCode === doc.employeeCode)) throw new Error('Employee ID already exists');
  } else if (collection === 'warehouses') {
    if (others.some((w) => w.code === doc.code)) throw new Error('Warehouse code already exists');
  } else if (collection === 'categories') {
    if (others.some((c) => c.name.toLowerCase() === doc.name.toLowerCase())) throw new Error('Category already exists');
  } else if (collection === 'products') {
    if (others.some((p) => p.sku === doc.sku)) throw new Error('SKU already exists');
  } else if (collection === 'inventories') {
    if (
      others.some(
        (i) => String(i.productId) === String(doc.productId) && String(i.warehouseId) === String(doc.warehouseId)
      )
    ) {
      throw new Error('Duplicate inventory record for product and warehouse');
    }
  } else if (collection === 'stockTransactions') {
    if (others.some((t) => t.transactionNumber === doc.transactionNumber)) {
      throw new Error('Transaction number already exists');
    }
  } else if (collection === 'stockTransfers') {
    if (others.some((t) => t.transferNumber === doc.transferNumber)) {
      throw new Error('Transfer number already exists');
    }
  } else if (collection === 'stockAdjustments') {
    if (others.some((a) => a.adjustmentNumber === doc.adjustmentNumber)) {
      throw new Error('Adjustment number already exists');
    }
  } else if (collection === 'stockCounts') {
    if (others.some((c) => c.countNumber === doc.countNumber)) {
      throw new Error('Stock count number already exists');
    }
  }
}

export class DbContext {
  private session: ClientSession | null;
  private localSnapshot: LocalDatabaseSnapshot | null;

  constructor(session: ClientSession | null = null, localSnapshot: LocalDatabaseSnapshot | null = null) {
    this.session = session;
    this.localSnapshot = localSnapshot;
  }

  private getLocalStore(): LocalDatabaseSnapshot {
    return this.localSnapshot || localData;
  }

  async find(
    collection: CollectionName,
    query: Record<string, any> = {},
    options: { sort?: Record<string, 1 | -1>; limit?: number; skip?: number } = {}
  ): Promise<any[]> {
    if (useMongo) {
      const Model = MongooseModels[collection] as any;
      let q = Model.find(query, null, this.session ? { session: this.session } : undefined);
      if (options.sort) q = q.sort(options.sort);
      if (options.skip) q = q.skip(options.skip);
      if (options.limit) q = q.limit(options.limit);
      const docs = await q.lean();
      return docs.map(normalizeIds);
    }

    const store = this.getLocalStore();
    let list = store[collection].filter((d) => matchesQuery(d, query)).map((d) => structuredClone(d));
    if (options.sort) {
      const sortEntries = Object.entries(options.sort);
      list.sort((a, b) => {
        for (const [field, dir] of sortEntries) {
          const av = a[field] ?? '';
          const bv = b[field] ?? '';
          if (av < bv) return -1 * dir;
          if (av > bv) return 1 * dir;
        }
        return 0;
      });
    }
    if (options.skip) list = list.slice(options.skip);
    if (options.limit) list = list.slice(0, options.limit);
    return list;
  }

  async findOne(collection: CollectionName, query: Record<string, any>): Promise<any | null> {
    if (useMongo) {
      const Model = MongooseModels[collection] as any;
      const doc = await Model.findOne(query, null, this.session ? { session: this.session } : undefined).lean();
      return doc ? normalizeIds(doc) : null;
    }
    const store = this.getLocalStore();
    const found = store[collection].find((d) => matchesQuery(d, query));
    return found ? structuredClone(found) : null;
  }

  async findById(collection: CollectionName, id: string): Promise<any | null> {
    if (!id) return null;
    if (useMongo) {
      if (!mongoose.isValidObjectId(id)) return null;
      const Model = MongooseModels[collection] as any;
      const doc = await Model.findById(id, null, this.session ? { session: this.session } : undefined).lean();
      return doc ? normalizeIds(doc) : null;
    }
    return this.findOne(collection, { _id: id });
  }

  async count(collection: CollectionName, query: Record<string, any> = {}): Promise<number> {
    if (useMongo) {
      const Model = MongooseModels[collection] as any;
      return Model.countDocuments(query, this.session ? { session: this.session } : undefined);
    }
    const store = this.getLocalStore();
    return store[collection].filter((d) => matchesQuery(d, query)).length;
  }

  async insert(collection: CollectionName, payload: Record<string, any>): Promise<any> {
    if (useMongo) {
      const Model = MongooseModels[collection] as any;
      const [created] = await Model.create([payload], this.session ? { session: this.session } : undefined);
      return normalizeIds(created.toObject());
    }

    const store = this.getLocalStore();
    const now = new Date().toISOString();
    const doc = {
      _id: generateObjectId(),
      ...structuredClone(payload),
      createdAt: payload.createdAt || now,
      updatedAt: now,
    };
    enforceUniqueConstraints(collection, doc, store[collection]);
    store[collection].push(doc);
    if (!this.localSnapshot) {
      persistLocalData(store);
    }
    return structuredClone(doc);
  }

  async updateById(collection: CollectionName, id: string, updates: Record<string, any>): Promise<any | null> {
    if (useMongo) {
      if (!mongoose.isValidObjectId(id)) return null;
      const Model = MongooseModels[collection] as any;
      const doc = await Model.findByIdAndUpdate(
        id,
        { $set: updates },
        { new: true, runValidators: true, ...(this.session ? { session: this.session } : {}) }
      ).lean();
      return doc ? normalizeIds(doc) : null;
    }

    const store = this.getLocalStore();
    const idx = store[collection].findIndex((d) => String(d._id) === String(id));
    if (idx === -1) return null;
    const next = {
      ...store[collection][idx],
      ...structuredClone(updates),
      updatedAt: new Date().toISOString(),
    };
    enforceUniqueConstraints(collection, next, store[collection], id);
    store[collection][idx] = next;
    if (!this.localSnapshot) {
      persistLocalData(store);
    }
    return structuredClone(next);
  }

  async deleteById(collection: CollectionName, id: string): Promise<boolean> {
    if (useMongo) {
      if (!mongoose.isValidObjectId(id)) return false;
      const Model = MongooseModels[collection] as any;
      const res = await Model.findByIdAndDelete(id, this.session ? { session: this.session } : undefined);
      return Boolean(res);
    }

    const store = this.getLocalStore();
    const before = store[collection].length;
    store[collection] = store[collection].filter((d) => String(d._id) !== String(id));
    const deleted = store[collection].length < before;
    if (deleted && !this.localSnapshot) {
      persistLocalData(store);
    }
    return deleted;
  }
}

export const db = new DbContext();

export async function withTransaction<T>(fn: (txDb: DbContext) => Promise<T>): Promise<T> {
  if (useMongo) {
    const session = await mongoose.startSession();
    try {
      let result!: T;
      try {
        await session.withTransaction(async () => {
          const txDb = new DbContext(session, null);
          result = await fn(txDb);
        });
      } catch (err: any) {
        // Standalone MongoDB instances without replica set throw code 20 / IllegalOperation on transactions
        if (err?.code === 20 || String(err?.message).includes('Transaction numbers are only allowed on a replica set')) {
          result = await fn(new DbContext(null, null));
        } else {
          throw err;
        }
      }
      return result;
    } finally {
      await session.endSession();
    }
  }

  // Serialized atomic transaction with rollback for local persistent database
  let release!: () => void;
  const prev = txMutex;
  txMutex = new Promise<void>((resolve) => {
    release = resolve;
  });
  await prev;

  const workingCopy = structuredClone(localData);
  const txDb = new DbContext(null, workingCopy);
  try {
    const result = await fn(txDb);
    localData = workingCopy;
    persistLocalData(localData);
    return result;
  } finally {
    release();
  }
}

export function exportLocalSnapshot(): LocalDatabaseSnapshot | null {
  if (useMongo) return null;
  return structuredClone(localData);
}

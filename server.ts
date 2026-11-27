import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { getDatabaseStatus, initDatabase } from './server/db/adapter.ts';
import { sanitizeBodyMiddleware } from './server/middleware/auth.ts';
import { adjustmentsRouter, stockCountsRouter } from './server/routes/adjustmentsAndCounts.ts';
import authRouter from './server/routes/auth.ts';
import dashboardRouter from './server/routes/dashboard.ts';
import inventoryRouter from './server/routes/inventory.ts';
import productsRouter from './server/routes/products.ts';
import {
  auditLogsRouter,
  notificationsRouter,
  reportsRouter,
  settingsRouter,
} from './server/routes/reportsAndAdmin.ts';
import { ledgerRouter, stockInRouter, stockOutRouter } from './server/routes/stockMovements.ts';
import { employeesRouter, suppliersRouter, usersRouter } from './server/routes/suppliersAndPeople.ts';
import transfersRouter from './server/routes/transfers.ts';
import warehousesRouter from './server/routes/warehouses.ts';

dotenv.config();

async function startServer() {
  await initDatabase();

  const app = express();
  const PORT = Number(process.env.PORT || 3000);

  app.set('trust proxy', 1);

  // Secure HTTP headers (allow iframe embedding for AI Studio preview)
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
      frameguard: false,
    })
  );

  // Strict origin-checked CORS (never wildcard '*' on authenticated endpoints)
  const allowedOrigins = new Set(
    [
      process.env.CLIENT_URL,
      process.env.APP_URL,
      'http://localhost:3000',
      'http://127.0.0.1:3000',
    ].filter((v): v is string => Boolean(v && v.trim()))
  );

  app.use(
    cors({
      origin(origin, callback) {
        if (!origin) return callback(null, true);
        if (allowedOrigins.has(origin) || origin.endsWith('.run.app') || origin.endsWith('.onrender.com')) {
          return callback(null, true);
        }
        return callback(new Error('Origin not allowed by CORS'));
      },
      credentials: true,
    })
  );

  app.use(express.json({ limit: '5mb' }));
  app.use(express.urlencoded({ extended: true, limit: '5mb' }));
  app.use(sanitizeBodyMiddleware);

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
  });

  const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
  });

  app.use('/api/auth', authLimiter);
  app.use('/api', apiLimiter);

  // Health check endpoint
  app.get('/api/health', (_req, res) => {
    const dbStatus = getDatabaseStatus();
    res.json({
      status: 'ok',
      service: 'Khayre Warehouse Management System',
      database: dbStatus,
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    });
  });

  // REST API Routes
  app.use('/api/auth', authRouter);
  app.use('/api', dashboardRouter); // /api/dashboard & /api/search
  app.use('/api/warehouses', warehousesRouter);
  app.use('/api/products', productsRouter);
  app.use('/api/categories', (req, res, next) => {
    req.url = `/categories${req.url === '/' ? '' : req.url}`;
    productsRouter(req, res, next);
  });
  app.use('/api/inventory', inventoryRouter);
  app.use('/api/stock-in', stockInRouter);
  app.use('/api/stock-out', stockOutRouter);
  app.use('/api/ledger', ledgerRouter);
  app.use('/api/transfers', transfersRouter);
  app.use('/api/adjustments', adjustmentsRouter);
  app.use('/api/stock-counts', stockCountsRouter);
  app.use('/api/suppliers', suppliersRouter);
  app.use('/api/employees', employeesRouter);
  app.use('/api/users', usersRouter);
  app.use('/api/reports', reportsRouter);
  app.use('/api/notifications', notificationsRouter);
  app.use('/api/settings', settingsRouter);
  app.use('/api/audit-logs', auditLogsRouter);

  // Global API 404 handler
  app.use('/api/*', (_req, res) => {
    res.status(404).json({ error: 'API endpoint not found' });
  });

  // Global error handler
  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('Unhandled server error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
  });

  // Vite dev middleware or production static assets
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Khayre Warehouse System running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});

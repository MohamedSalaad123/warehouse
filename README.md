# Khayre Warehouse System (WMS)

Enterprise-level multi-warehouse management system with centralized product catalog, independent warehouse inventory, Moving Weighted Average Cost valuation, multi-step warehouse transfers, physical stock counts, role-based access control, Somali/English bilingual UI, and MongoDB Atlas integration.

## Architecture

- **Frontend**: React 19, Vite, Tailwind CSS v4, Recharts, Lucide React
- **Backend**: Node.js, Express.js, JWT Authentication, bcryptjs, Helmet, Rate Limiting
- **Database**: MongoDB Atlas via Mongoose (14 structured collections with atomic transaction support and automatic local persistent fallback when `MONGODB_URI` is unset)

## Environment Variables

Configure these variables in your environment or Render dashboard (see `.env.example`):

- `MONGODB_URI` — MongoDB Atlas connection string
- `JWT_SECRET` — Strong secret key for signing JWT tokens
- `PORT` — HTTP server port (defaults to `3000`)
- `CLIENT_URL` — Production frontend origin URL
- `NODE_ENV` — `development` or `production`

## Local Development

1. Install dependencies:
   ```bash
   npm install
   ```
2. Start the full-stack server (Express API + Vite frontend):
   ```bash
   npm run dev
   ```
3. Open `http://localhost:3000`. On first launch, complete the **Super Admin Initial Setup** form to claim the system administrator account.

## Production Deployment (Render)

1. Provision a **MongoDB Atlas** cluster and obtain your `MONGODB_URI`.
2. Create a Render Web Service connected to this repository:
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
3. Set `MONGODB_URI`, `JWT_SECRET`, `CLIENT_URL`, and `NODE_ENV=production` in Render Environment Variables.
4. Health check endpoint: `GET /api/health`

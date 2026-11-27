// In-memory JWT token storage (never persisted to localStorage or sessionStorage)
let authTokenMemory: string | null = null;

const INVENTORY_CACHE_NAME = 'wms-inventory-api-cache';
const CACHEABLE_READ_PREFIXES = [
  '/api/inventory',
  '/api/warehouses',
  '/api/products',
  '/api/categories',
  '/api/suppliers',
  '/api/dashboard',
  '/api/transfers',
  '/api/stock-in',
  '/api/stock-out',
  '/api/adjustments',
  '/api/stock-counts',
  '/api/settings',
  '/api/notifications',
];

function isCacheableReadUrl(url: string, method: string): boolean {
  if (method !== 'GET') return false;
  return CACHEABLE_READ_PREFIXES.some((prefix) => url.startsWith(prefix));
}

export function clearOfflineInventoryCache(): void {
  if (typeof window !== 'undefined' && 'caches' in window) {
    window.caches.delete(INVENTORY_CACHE_NAME).catch(() => {});
  }
}

export function setAuthToken(token: string | null): void {
  authTokenMemory = token;
  if (!token) {
    clearOfflineInventoryCache();
  }
}

export function getAuthToken(): string | null {
  return authTokenMemory;
}

export async function apiRequest<T = any>(
  url: string,
  options: {
    method?: string;
    body?: any;
    idempotent?: boolean;
  } = {}
): Promise<T> {
  const method = (options.method || 'GET').toUpperCase();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (authTokenMemory) {
    headers.Authorization = `Bearer ${authTokenMemory}`;
  }

  if (options.idempotent) {
    headers['X-Idempotency-Key'] = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  const canCacheRead = isCacheableReadUrl(url, method);

  if (method !== 'GET' && typeof navigator !== 'undefined' && !navigator.onLine) {
    throw new Error('Offline mode: viewing cached inventory only. Reconnect to save changes.');
  }

  try {
const API_BASE_URL =
  import.meta.env.VITE_API_URL || '';

const apiUrl = `${API_BASE_URL}${url}`;

const res = await fetch(apiUrl, {
  method,
  headers,
  body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
});

    if (!res.ok) {
      let errMsg = `Request failed (${res.status})`;
      try {
        const parsed = await res.json();
        if (parsed?.error) errMsg = parsed.error;
      } catch {
        // ignore json parse failure
      }
      throw new Error(errMsg);
    }

    if (canCacheRead && typeof window !== 'undefined' && 'caches' in window) {
      try {
        const clone = res.clone();
        const cache = await window.caches.open(INVENTORY_CACHE_NAME);
        await cache.put(url, clone);
      } catch {
        // ignore cache write quota errors
      }
      window.dispatchEvent(
        new CustomEvent('wms:data-synced', { detail: { timestamp: new Date().toISOString() } })
      );
    }

    return res.json();
  } catch (err: any) {
    // Fallback to Cache Storage for GET inventory/catalog routes on network drop or unstable connection
    if (canCacheRead && typeof window !== 'undefined' && 'caches' in window) {
      try {
        const cache = await window.caches.open(INVENTORY_CACHE_NAME);
        const cachedRes = await cache.match(url);
        if (cachedRes) {
          window.dispatchEvent(new CustomEvent('wms:cached-fallback'));
          return cachedRes.json();
        }
      } catch {
        // ignore cache read error
      }
    }

    if (method !== 'GET' && err instanceof TypeError) {
      throw new Error('Network connection unstable or offline. Changes could not be saved.');
    }
    throw err;
  }
}

export async function downloadAuthenticatedFile(url: string, filename: string): Promise<void> {
  const headers: Record<string, string> = {};
  if (authTokenMemory) {
    headers.Authorization = `Bearer ${authTokenMemory}`;
  }
  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error('Download failed');
  }
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
}

export function formatCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value));
}

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return new Intl.NumberFormat('en-US').format(Number(value));
}

export function formatDate(
  iso: string | Date | null | undefined,
  format: 'YYYY-MM-DD' | 'DD/MM/YYYY' | 'MM/DD/YYYY' = 'YYYY-MM-DD'
): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  if (format === 'DD/MM/YYYY') return `${day}/${m}/${y}`;
  if (format === 'MM/DD/YYYY') return `${m}/${day}/${y}`;
  return `${y}-${m}-${day}`;
}

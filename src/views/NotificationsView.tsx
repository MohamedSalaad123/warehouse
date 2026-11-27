import { CheckCheck } from 'lucide-react';
import React, { useState } from 'react';
import { t } from '../i18n/translations';
import { apiRequest, formatDate } from '../lib/api';
import type { LanguageCode, NotificationItem } from '../types/wms';
import { EmptyState } from '../components/ui/Common';

export function NotificationsView({
  lang,
  dateFormat,
  notifications,
  onRefresh,
  onToast,
}: {
  lang: LanguageCode;
  dateFormat: 'YYYY-MM-DD' | 'DD/MM/YYYY' | 'MM/DD/YYYY';
  notifications: NotificationItem[];
  onRefresh: () => void;
  onToast: (type: 'success' | 'error' | 'info', text: string) => void;
}) {
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  const markRead = async (id: string) => {
    try {
      await apiRequest(`/api/notifications/${id}/read`, { method: 'PATCH' });
      onRefresh();
    } catch (err: any) {
      onToast('error', err.message);
    }
  };

  const markAllRead = async () => {
    try {
      await apiRequest('/api/notifications/read-all', { method: 'POST' });
      onToast('success', lang === 'so' ? 'Dhammaan waa la calaamadeeyay' : 'All notifications marked read');
      onRefresh();
    } catch (err: any) {
      onToast('error', err.message);
    }
  };

  const filtered = filter === 'unread' ? notifications.filter((n) => !n.isRead) : notifications;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">{t(lang, 'navNotifications')}</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {lang === 'so'
              ? 'Digniinaha kaydka yar, alaabta dhamaatay, wareejinta, iyo sixitaanka'
              : 'Low-stock alerts, out-of-stock notices, transfers, and approval notifications'}
          </p>
        </div>

        <button
          type="button"
          onClick={markAllRead}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 rounded-md whitespace-nowrap"
        >
          <CheckCheck className="w-4 h-4" />
          {t(lang, 'markAllRead')}
        </button>
      </div>

      <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-md w-fit">
        <button
          type="button"
          onClick={() => setFilter('all')}
          className={`px-3 py-1.5 text-xs font-semibold rounded ${
            filter === 'all' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
          }`}
        >
          {t(lang, 'all')} ({notifications.length})
        </button>
        <button
          type="button"
          onClick={() => setFilter('unread')}
          className={`px-3 py-1.5 text-xs font-semibold rounded ${
            filter === 'unread' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
          }`}
        >
          Unread ({notifications.filter((n) => !n.isRead).length})
        </button>
      </div>

      {filtered.length === 0 ? (
        <EmptyState title={t(lang, 'noData')} />
      ) : (
        <div className="bg-white border border-slate-200 rounded-lg divide-y divide-slate-100">
          {filtered.map((n) => (
            <div
              key={n._id}
              className={`p-4 flex items-start justify-between gap-4 ${n.isRead ? 'bg-white' : 'bg-sky-50/40'}`}
            >
              <div>
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <span className="font-mono font-semibold text-[#1E4E79]">{n.type.replace(/_/g, ' ')}</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono">{formatDate(n.createdAt, dateFormat)}</span>
                </div>
                <p className="text-sm font-semibold text-slate-900 mt-1">{n.title}</p>
                <p className="text-xs text-slate-600 mt-0.5">{n.message}</p>
              </div>
              {!n.isRead && (
                <button
                  type="button"
                  onClick={() => markRead(n._id)}
                  className="px-3 py-1.5 text-xs font-medium text-[#1E4E79] border border-slate-300 rounded hover:bg-slate-50 whitespace-nowrap shrink-0"
                >
                  Mark Read
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

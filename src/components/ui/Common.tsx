import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Info, X } from 'lucide-react';
import React from 'react';

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  text: string;
}

export function ToastBanner({
  toasts,
  onDismiss,
}: {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}) {
  if (toasts.length === 0) return null;
  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 max-w-md no-print">
      {toasts.map((toast) => {
        const isErr = toast.type === 'error';
        const isOk = toast.type === 'success';
        return (
          <div
            key={toast.id}
            role="alert"
            className={`flex items-start gap-3 px-4 py-3 rounded-lg border shadow-sm text-sm ${
              isErr
                ? 'bg-red-50 border-red-200 text-red-900'
                : isOk
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : 'bg-slate-50 border-slate-200 text-slate-900'
            }`}
          >
            {isErr ? (
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            ) : isOk ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            ) : (
              <Info className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" />
            )}
            <span className="flex-1 leading-snug">{toast.text}</span>
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              className="text-slate-400 hover:text-slate-700 shrink-0"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

export function Modal({
  open,
  title,
  onClose,
  children,
  maxWidth = 'max-w-2xl',
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  maxWidth?: string;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 overflow-y-auto no-print">
      <div
        className={`w-full ${maxWidth} bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden my-auto`}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
          <h3 className="text-base font-semibold text-slate-900">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-500 hover:text-slate-900 rounded-md hover:bg-slate-200/60 transition-colors"
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-6 max-h-[80vh] overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel,
  danger,
  loading,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;
  return (
    <Modal open={open} title={title} onClose={onCancel} maxWidth="max-w-md">
      <p className="text-sm text-slate-600 leading-relaxed mb-6">{message}</p>
      <div className="flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={onCancel}
          disabled={loading}
          className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 whitespace-nowrap shrink-0"
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={loading}
          className={`px-4 py-2 text-sm font-medium text-white rounded-md whitespace-nowrap shrink-0 disabled:opacity-50 ${
            danger ? 'bg-red-600 hover:bg-red-700' : 'bg-[#1E4E79] hover:bg-[#163A5C]'
          }`}
        >
          {loading ? '...' : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

export function StatusLabel({
  status,
  label,
}: {
  status: string;
  label?: string;
}) {
  const s = status.toUpperCase();
  let colorClass = 'text-slate-700';
  if (['ACTIVE', 'CONFIRMED', 'COMPLETED', 'APPROVED', 'IN_STOCK'].includes(s)) {
    colorClass = 'text-emerald-700';
  } else if (['LOW_STOCK', 'PENDING_APPROVAL', 'PENDING', 'IN_TRANSIT', 'PARTIALLY_RECEIVED', 'SUBMITTED', 'DRAFT'].includes(s)) {
    colorClass = 'text-amber-700';
  } else if (['OUT_OF_STOCK', 'REJECTED', 'CANCELLED', 'INACTIVE', 'DAMAGED', 'LOST'].includes(s)) {
    colorClass = 'text-red-700';
  }
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${colorClass}`}>
      {label || status.replace(/_/g, ' ')}
    </span>
  );
}

export function PaginationBar({
  page,
  totalItems,
  pageSize,
  onPageChange,
  prevLabel,
  nextLabel,
}: {
  page: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (next: number) => void;
  prevLabel: string;
  nextLabel: string;
}) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  if (totalItems <= pageSize) return null;
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(totalItems, page * pageSize);

  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 bg-slate-50/70 text-xs text-slate-600">
      <span className="tabular-nums">
        {start}–{end} / {totalItems}
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page <= 1}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-white border border-slate-300 rounded text-slate-700 hover:bg-slate-50 disabled:opacity-40 whitespace-nowrap"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          {prevLabel}
        </button>
        <span className="tabular-nums font-medium text-slate-700">
          {page} / {totalPages}
        </span>
        <button
          type="button"
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-white border border-slate-300 rounded text-slate-700 hover:bg-slate-50 disabled:opacity-40 whitespace-nowrap"
        >
          {nextLabel}
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
}: {
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="py-12 px-6 text-center bg-white border border-slate-200 rounded-lg">
      <p className="text-sm font-semibold text-slate-800">{title}</p>
      {description && <p className="mt-1 text-xs text-slate-500 max-w-md mx-auto">{description}</p>}
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="mt-4 px-4 py-2 text-xs font-medium text-white bg-[#1E4E79] hover:bg-[#163A5C] rounded-md whitespace-nowrap"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}

export function TableSkeleton({ rows = 5, cols = 6 }: { rows?: number; cols?: number }) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      <div className="divide-y divide-slate-100">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="grid gap-4 px-4 py-3.5" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
            {Array.from({ length: cols }).map((__, c) => (
              <div key={c} className="h-4 bg-slate-100 rounded animate-pulse" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

'use client';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import Link from 'next/link';
import { AlertCircle, Check, CheckCircle2, LoaderCircle, X } from 'lucide-react';

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className="brand" aria-label="Nexus Arcade home">
      <svg viewBox="0 0 40 44" fill="none" aria-hidden="true">
        <path d="M20 2 37 12v20L20 42 3 32V12L20 2Z" stroke="currentColor" strokeWidth="2" />
        <path d="m11 29 9-17 9 17M15 23h10" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" />
        <path d="M20 2v6M3 32l5-3m24 0 5 3" stroke="currentColor" strokeWidth="2" />
      </svg>
      {!compact && (
        <span>
          NEXUS<small>ARCADE</small>
        </span>
      )}
    </Link>
  );
}
export function Button({
  children,
  href,
  variant = 'primary',
  className = '',
  loading = false,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  href?: string;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  loading?: boolean;
}) {
  const content = (
    <>
      {loading && <LoaderCircle size={16} className="spin" />}
      {children}
    </>
  );
  if (href)
    return (
      <Link href={href} className={`button button-${variant} ${className}`}>
        {children}
      </Link>
    );
  return (
    <button
      {...props}
      disabled={props.disabled || loading}
      className={`button button-${variant} ${className}`}
    >
      {content}
    </button>
  );
}
export function Status({ status, children }: { status: string; children?: ReactNode }) {
  const tone = ['completed', 'verified', 'live'].includes(status)
    ? 'success'
    : ['failed', 'error', 'cancelled'].includes(status)
      ? 'danger'
      : ['running', 'connecting'].includes(status)
        ? 'active'
        : ['paused', 'awaiting_approval', 'interrupted'].includes(status)
          ? 'warning'
          : 'neutral';
  return (
    <span className={`status status-${tone}`}>
      <span className="status-dot" />
      {children || status.replaceAll('_', ' ')}
    </span>
  );
}
export function Panel({
  children,
  className = '',
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <section className={`panel ${className}`} style={style}>
      {children}
    </section>
  );
}
export function PageHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </div>
  );
}
export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">{icon}</div>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
export function ErrorNotice({ children }: { children: ReactNode }) {
  return (
    <div className="notice notice-error" role="alert">
      <AlertCircle size={17} />
      <div>{children}</div>
    </div>
  );
}
export function Loading({ label = 'Loading your universe…' }: { label?: string }) {
  return (
    <div className="loading-state">
      <LoaderCircle className="spin" size={22} />
      <span>{label}</span>
    </div>
  );
}
export function Dialog({
  open,
  onClose,
  title,
  children,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
    if (open) {
      const previous = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = previous;
      };
    }
  }, [open]);
  return (
    <dialog
      ref={ref}
      className={`dialog ${wide ? 'dialog-wide' : ''}`}
      aria-labelledby={id}
      onCancel={onClose}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === ref.current) {
          const box = ref.current.getBoundingClientRect();
          if (
            event.clientX < box.left ||
            event.clientX > box.right ||
            event.clientY < box.top ||
            event.clientY > box.bottom
          )
            onClose();
        }
      }}
    >
      <div className="dialog-header">
        <h2 id={id}>{title}</h2>
        <button className="icon-button" onClick={onClose} aria-label="Close dialog">
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
const ToastContext = createContext<(message: string, tone?: 'success' | 'error') => void>(() => {});
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ message: string; tone: string } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notify = useCallback((message: string, tone = 'success') => {
    if (timer.current) clearTimeout(timer.current);
    setToast({ message, tone });
    timer.current = setTimeout(() => setToast(null), 5000);
  }, []);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  return (
    <ToastContext.Provider value={notify}>
      {children}
      <div className="toast-region" aria-live="polite">
        {toast && (
          <div className={`toast toast-${toast.tone}`}>
            {toast.tone === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
            <span>{toast.message}</span>
            <button className="icon-button" aria-label="Dismiss notification" onClick={() => setToast(null)}>
              <X size={16} />
            </button>
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
}
export const useToast = () => useContext(ToastContext);
export function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <label className="toggle-row">
      <span>
        <strong>{label}</strong>
        {description && <small>{description}</small>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        className={`toggle ${checked ? 'on' : ''}`}
        onClick={() => onChange(!checked)}
      >
        <span>{checked && <Check size={11} />}</span>
      </button>
    </label>
  );
}
export function relativeTime(value: string) {
  const diff = Date.now() - new Date(value).getTime();
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

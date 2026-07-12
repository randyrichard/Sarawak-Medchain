'use client';

/**
 * Shadcn-style primitive components — hand-rolled so the design system is
 * fully owned (no CLI codegen), themed via Tailwind + the brand palette,
 * and dark-mode aware throughout.
 */
import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react';

export function cn(...classes: Array<string | false | undefined | null>): string {
  return classes.filter(Boolean).join(' ');
}

// ── Button ───────────────────────────────────────────────────────────────────

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';

const buttonVariants: Record<ButtonVariant, string> = {
  primary:
    'bg-brand-700 text-white hover:bg-brand-800 focus-visible:ring-brand-500 disabled:bg-brand-700/50',
  secondary:
    'bg-brand-50 text-brand-800 hover:bg-brand-100 dark:bg-brand-900/40 dark:text-brand-200 dark:hover:bg-brand-900/60',
  outline:
    'border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800',
  ghost: 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800',
  danger: 'bg-red-600 text-white hover:bg-red-700 disabled:bg-red-600/50',
};

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }
>(function Button({ className, variant = 'primary', ...props }, ref) {
  return (
    <button
      ref={ref}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed',
        buttonVariants[variant],
        className
      )}
      {...props}
    />
  );
});

// ── Input / Label / Select ───────────────────────────────────────────────────

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return (
      <input
        ref={ref}
        className={cn(
          'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900',
          'placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30',
          'dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100',
          className
        )}
        {...props}
      />
    );
  }
);

export function Label({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
      {children}
    </label>
  );
}

// ── Card ─────────────────────────────────────────────────────────────────────

export function Card({
  children,
  className,
  title,
  description,
  actions,
}: {
  children?: ReactNode;
  className?: string;
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div
      className={cn(
        'rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900',
        className
      )}
    >
      {(title || actions) && (
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4 dark:border-slate-800">
          <div>
            {title && <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</h3>}
            {description && <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{description}</p>}
          </div>
          {actions}
        </div>
      )}
      <div className="p-5">{children}</div>
    </div>
  );
}

// ── Badge ────────────────────────────────────────────────────────────────────

type BadgeTone = 'green' | 'red' | 'amber' | 'slate' | 'blue' | 'teal';

const badgeTones: Record<BadgeTone, string> = {
  green: 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300',
  red: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300',
  amber: 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300',
  slate: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  blue: 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300',
  teal: 'bg-brand-100 text-brand-800 dark:bg-brand-900/50 dark:text-brand-300',
};

export function Badge({ children, tone = 'slate' }: { children: ReactNode; tone?: BadgeTone }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold',
        badgeTones[tone]
      )}
    >
      {children}
    </span>
  );
}

export function statusTone(status: string): BadgeTone {
  switch (status) {
    case 'VALID':
    case 'ACTIVE':
    case 'APPROVED':
      return 'green';
    case 'TAMPERED':
    case 'REVOKED':
    case 'SUSPENDED':
    case 'CRITICAL':
      return 'red';
    case 'EXPIRED':
    case 'AMENDED':
    case 'PENDING':
    case 'HIGH':
      return 'amber';
    default:
      return 'slate';
  }
}

// ── Stat tile ────────────────────────────────────────────────────────────────

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-slate-400">{hint}</p>}
    </div>
  );
}

// ── Table ────────────────────────────────────────────────────────────────────

export function Table({ headers, children }: { headers: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:text-slate-400">
            {headers.map((h) => (
              <th key={h} className="px-3 py-2.5 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">{children}</tbody>
      </table>
    </div>
  );
}

export function Td({
  children,
  className,
  colSpan,
}: {
  children?: ReactNode;
  className?: string;
  colSpan?: number;
}) {
  return (
    <td colSpan={colSpan} className={cn('px-3 py-2.5 text-slate-700 dark:text-slate-300', className)}>
      {children}
    </td>
  );
}

// ── Alert ────────────────────────────────────────────────────────────────────

export function Alert({
  tone,
  children,
}: {
  tone: 'error' | 'success' | 'info';
  children: ReactNode;
}) {
  const tones = {
    error: 'border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300',
    success:
      'border-green-200 bg-green-50 text-green-800 dark:border-green-900 dark:bg-green-950/50 dark:text-green-300',
    info: 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900 dark:bg-blue-950/50 dark:text-blue-300',
  };
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn('rounded-lg border px-4 py-3 text-sm', tones[tone])}
    >
      {children}
    </div>
  );
}

/** Consistent loading indicator for dashboards while data is fetched. */
export function PageLoading({ label = 'Loading data…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-slate-400" role="status" aria-live="polite">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-brand-600" aria-hidden />
      <span className="text-sm">{label}</span>
    </div>
  );
}

// ── Minimal SVG bar chart (no chart-library dependency) ─────────────────────

export function BarChart({
  data,
  height = 160,
}: {
  data: Array<{ label: string; value: number }>;
  height?: number;
}) {
  if (data.length === 0) {
    return <p className="py-8 text-center text-sm text-slate-400">No data yet</p>;
  }
  const max = Math.max(...data.map((d) => d.value), 1);
  const barWidth = 100 / data.length;
  return (
    <div>
      <svg viewBox={`0 0 100 ${height / 4}`} className="w-full" preserveAspectRatio="none" role="img">
        {data.map((d, i) => {
          const h = (d.value / max) * (height / 4 - 4);
          return (
            <rect
              key={d.label}
              x={i * barWidth + barWidth * 0.15}
              y={height / 4 - h}
              width={barWidth * 0.7}
              height={h}
              rx={0.5}
              className="fill-brand-600 dark:fill-brand-500"
            >
              <title>{`${d.label}: ${d.value}`}</title>
            </rect>
          );
        })}
      </svg>
      <div className="mt-1 flex justify-between text-[10px] text-slate-400">
        <span>{data[0]?.label}</span>
        <span>{data[data.length - 1]?.label}</span>
      </div>
    </div>
  );
}

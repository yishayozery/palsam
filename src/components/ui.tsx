import Link from "next/link";
import type { ReactNode } from "react";

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between mb-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">{title}</h1>
        {subtitle && <p className="text-sm text-slate-500 mt-1">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`bg-white rounded-xl shadow-sm border border-slate-200 ${className}`}>
      {children}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  tone = "slate",
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: "slate" | "emerald" | "amber" | "rose" | "blue";
}) {
  const tones: Record<string, string> = {
    slate: "text-slate-800",
    emerald: "text-emerald-600",
    amber: "text-amber-600",
    rose: "text-rose-600",
    blue: "text-blue-600",
  };
  return (
    <Card className="p-4">
      <div className="text-sm text-slate-500">{label}</div>
      <div className={`text-3xl font-bold mt-1 ${tones[tone]}`}>{value}</div>
      {hint && <div className="text-xs text-slate-400 mt-1">{hint}</div>}
    </Card>
  );
}

export function Badge({
  children,
  className = "bg-slate-100 text-slate-700",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${className}`}>
      {children}
    </span>
  );
}

export function Button({
  children,
  type = "submit",
  variant = "primary",
  className = "",
  ...props
}: {
  children: ReactNode;
  type?: "submit" | "button";
  variant?: "primary" | "secondary" | "danger" | "ghost";
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const variants: Record<string, string> = {
    primary: "bg-slate-800 hover:bg-slate-900 text-white",
    secondary: "bg-white border border-slate-300 hover:bg-slate-50 text-slate-700",
    danger: "bg-rose-600 hover:bg-rose-700 text-white",
    ghost: "hover:bg-slate-100 text-slate-600",
  };
  return (
    <button
      type={type}
      className={`rounded-lg px-4 py-2 text-sm font-medium transition disabled:opacity-60 ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function LinkButton({
  href,
  children,
  variant = "primary",
}: {
  href: string;
  children: ReactNode;
  variant?: "primary" | "secondary";
}) {
  const variants: Record<string, string> = {
    primary: "bg-slate-800 hover:bg-slate-900 text-white",
    secondary: "bg-white border border-slate-300 hover:bg-slate-50 text-slate-700",
  };
  return (
    <Link
      href={href}
      className={`inline-block rounded-lg px-4 py-2 text-sm font-medium transition ${variants[variant]}`}
    >
      {children}
    </Link>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="text-center py-12 text-slate-400 text-sm">{children}</div>
  );
}

/** טבלה בסיסית */
export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm text-right">{children}</table>
    </div>
  );
}

export function Th({ children }: { children?: ReactNode }) {
  return (
    <th className="px-4 py-3 text-xs font-semibold text-slate-500 bg-slate-50 border-b border-slate-200">
      {children}
    </th>
  );
}

export function Td({
  children,
  className = "",
}: {
  children?: ReactNode;
  className?: string;
}) {
  return (
    <td className={`px-4 py-3 border-b border-slate-100 ${className}`}>
      {children}
    </td>
  );
}

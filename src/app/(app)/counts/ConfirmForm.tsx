"use client";

import type { ReactNode } from "react";

type Action = (formData: FormData) => Promise<void> | void | Promise<unknown>;

export default function ConfirmForm({
  action, message, children, className,
  hiddenFields = {},
}: {
  action: Action;
  message: string;
  children: ReactNode;
  className?: string;
  hiddenFields?: Record<string, string>;
}) {
  return (
    <form action={action as (fd: FormData) => Promise<void>}
      onSubmit={(e) => { if (!confirm(message)) e.preventDefault(); }}
      className={className}>
      {Object.entries(hiddenFields).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      {children}
    </form>
  );
}

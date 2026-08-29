"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import type { ReliabilityLevel } from "@/lib/alarm/reliability";

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

/* ------------------------------------------------------------------ */

export function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx(
        "relative h-7 w-12 shrink-0 rounded-full border transition-colors duration-150",
        checked
          ? "border-transparent bg-[var(--dawn)]"
          : "border-[var(--line)] bg-[var(--night-2)]",
        disabled && "cursor-not-allowed opacity-45",
      )}
    >
      <span
        className={cx(
          "absolute top-1/2 h-5 w-5 -translate-y-1/2 rounded-full transition-all duration-150",
          checked
            ? "left-[calc(100%-1.375rem)] bg-[#1a1206]"
            : "left-1 bg-[var(--muted)]",
        )}
      />
    </button>
  );
}

/* ------------------------------------------------------------------ */

const LEVEL_COLOR: Record<ReliabilityLevel, string> = {
  green: "var(--ok)",
  yellow: "var(--warn)",
  red: "var(--risk)",
};

export function StatusDot({
  level,
  pulse,
}: {
  level: ReliabilityLevel;
  pulse?: boolean;
}) {
  return (
    <span className="relative inline-flex h-2.5 w-2.5">
      {pulse && (
        <span
          className="absolute inset-0 rounded-full breathe"
          style={{ background: LEVEL_COLOR[level], opacity: 0.4 }}
        />
      )}
      <span
        className="relative h-2.5 w-2.5 rounded-full"
        style={{ background: LEVEL_COLOR[level] }}
      />
    </span>
  );
}

/* ------------------------------------------------------------------ */

export function Section({
  title,
  description,
  children,
  action,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="mb-8">
      <div className="mb-3 flex items-end justify-between gap-4">
        <div>
          <h2 className="eyebrow">{title}</h2>
          {description && (
            <p className="mt-1.5 text-sm text-[var(--muted)]">{description}</p>
          )}
        </div>
        {action}
      </div>
      <div className="card px-4 sm:px-5">{children}</div>
    </section>
  );
}

/* ------------------------------------------------------------------ */

export function SettingRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="row flex-col items-stretch gap-2 sm:flex-row sm:items-center">
      <div className="min-w-0">
        <div className="text-[0.95rem] text-[var(--ink)]">{label}</div>
        {hint && (
          <div className="mt-0.5 text-[0.8rem] leading-relaxed text-[var(--muted)]">
            {hint}
          </div>
        )}
      </div>
      <div className="shrink-0 sm:ml-auto">{children}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

export function Select<T extends string | number>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (next: T) => void;
  options: Array<{ value: T; label: string }>;
  label: string;
}) {
  return (
    <select
      aria-label={label}
      className="field w-auto min-w-[9rem] cursor-pointer pr-8"
      value={String(value)}
      onChange={(e) => {
        const raw = e.target.value;
        const match = options.find((o) => String(o.value) === raw);
        if (match) onChange(match.value);
      }}
    >
      {options.map((o) => (
        <option key={String(o.value)} value={String(o.value)}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/* ------------------------------------------------------------------ */

/** Segmented control for short, mutually exclusive choices. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (next: T) => void;
  options: Array<{ value: T; label: string }>;
  label: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex rounded-full border border-[var(--line)] bg-[var(--night-2)] p-0.5"
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={cx(
              "rounded-full px-3.5 py-1.5 text-[0.82rem] transition-colors",
              active
                ? "bg-[var(--dawn)] font-medium text-[#1a1206]"
                : "text-[var(--muted)] hover:text-[var(--ink)]",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */

export function Notice({
  tone = "info",
  children,
  onDismiss,
}: {
  tone?: "info" | "warn" | "risk";
  children: ReactNode;
  onDismiss?: () => void;
}) {
  const color =
    tone === "risk" ? "var(--risk)" : tone === "warn" ? "var(--warn)" : "var(--sky)";
  return (
    <div
      className="mb-5 flex items-start gap-3 rounded-[var(--radius)] border px-4 py-3 text-sm"
      style={{
        borderColor: `color-mix(in oklab, ${color} 35%, transparent)`,
        background: `color-mix(in oklab, ${color} 9%, transparent)`,
      }}
    >
      <span
        className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ background: color }}
      />
      <div className="flex-1 leading-relaxed text-[var(--ink-2)]">{children}</div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="-mr-1 -mt-0.5 rounded px-1.5 py-0.5 text-[var(--faint)] hover:text-[var(--ink)]"
        >
          ×
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 text-sm text-[var(--muted)] transition-colors hover:text-[var(--ink)]"
    >
      <span aria-hidden>←</span>
      {children}
    </Link>
  );
}

/* ------------------------------------------------------------------ */

export function PageHeader({
  eyebrow,
  title,
  lede,
}: {
  eyebrow?: string;
  title: string;
  lede?: string;
}) {
  return (
    <header className="mb-8">
      {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
      <h1 className="display text-[2rem] leading-tight sm:text-[2.4rem]">
        {title}
      </h1>
      {lede && (
        <p className="mt-2 max-w-prose text-[0.95rem] leading-relaxed text-[var(--muted)]">
          {lede}
        </p>
      )}
    </header>
  );
}

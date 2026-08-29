"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { cx } from "./ui";

const NAV = [
  { href: "/", label: "Today" },
  { href: "/alarms", label: "Alarms" },
  { href: "/reliability", label: "Reliability" },
  { href: "/settings", label: "Settings" },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b border-[var(--line-soft)] bg-[color-mix(in_oklab,var(--bg)_88%,transparent)] backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-5 py-3">
          <Link href="/" className="flex items-center gap-2.5">
            <SunGlyph />
            <span className="text-[0.95rem] font-medium tracking-tight">
              Salah Alarm
            </span>
          </Link>

          <nav aria-label="Main">
            <ul className="flex items-center gap-0.5">
              {NAV.map((item) => {
                const active =
                  item.href === "/"
                    ? pathname === "/"
                    : pathname.startsWith(item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={cx(
                        "rounded-full px-3 py-1.5 text-[0.82rem] transition-colors",
                        active
                          ? "bg-[var(--night-3)] text-[var(--ink)]"
                          : "text-[var(--muted)] hover:text-[var(--ink)]",
                      )}
                    >
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-7">{children}</main>

      <footer className="mx-auto w-full max-w-3xl px-5 pb-8 pt-2">
        <p className="text-xs leading-relaxed text-[var(--faint)]">
          Prayer times are calculated on this device. Nothing is uploaded and no
          account is needed.
        </p>
      </footer>
    </div>
  );
}

/**
 * The mark: a sun on the horizon — the same idea as the dashboard's arc,
 * reduced to its simplest form.
 */
function SunGlyph() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden>
      <line
        x1="1"
        y1="14"
        x2="19"
        y2="14"
        stroke="var(--horizon)"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M4.5 14a5.5 5.5 0 0 1 11 0"
        fill="var(--dawn)"
        fillOpacity="0.9"
      />
      <line
        x1="10"
        y1="2.5"
        x2="10"
        y2="5"
        stroke="var(--dawn)"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <line
        x1="3.2"
        y1="5.6"
        x2="4.9"
        y2="7.3"
        stroke="var(--dawn)"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.65"
      />
      <line
        x1="16.8"
        y1="5.6"
        x2="15.1"
        y2="7.3"
        stroke="var(--dawn)"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.65"
      />
    </svg>
  );
}

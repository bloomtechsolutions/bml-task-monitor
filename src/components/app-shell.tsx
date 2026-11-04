"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import {
  Bell, CalendarDays, ChevronsUpDown, Columns3, FileStack, FolderKanban, KeyRound, LayoutDashboard, ListChecks,
  LogOut, PanelLeft, Plus, BarChart3, PieChart, Repeat, Settings, Plane, Users, X,
} from "lucide-react";
import { logout } from "@/app/auth-actions";
import { Logo } from "@/components/logo";

type Role = "head" | "manager" | "staff";
export type ShellPerson = { id: string; name: string; subtitle: string | null; role: Role };

type Item = { href: string; label: string; icon: typeof ListChecks; match: (p: string) => boolean; roles?: Role[] };
const LEADS: Role[] = ["head", "manager"];

const GROUPS: { label: string; items: Item[] }[] = [
  {
    label: "Workspace",
    items: [
      { href: "/", label: "Dashboard", icon: LayoutDashboard, match: (p) => p === "/" },
      { href: "/tasks", label: "My tasks", icon: ListChecks, match: (p) => p === "/tasks" || (p.startsWith("/tasks/") && p !== "/tasks/new") },
      { href: "/board", label: "Board", icon: Columns3, match: (p) => p.startsWith("/board") },
      { href: "/calendar", label: "Calendar", icon: CalendarDays, match: (p) => p.startsWith("/calendar") },
      { href: "/tasks/new", label: "Assign task", icon: Plus, match: (p) => p === "/tasks/new" },
    ],
  },
  {
    label: "Organization",
    items: [
      { href: "/team", label: "Team overview", icon: BarChart3, match: (p) => p.startsWith("/team"), roles: LEADS },
      { href: "/projects", label: "Projects", icon: FolderKanban, match: (p) => p.startsWith("/projects") },
      { href: "/recurring", label: "Recurring tasks", icon: Repeat, match: (p) => p.startsWith("/recurring"), roles: LEADS },
      { href: "/templates", label: "Templates", icon: FileStack, match: (p) => p.startsWith("/templates"), roles: LEADS },
      { href: "/reports", label: "Reports", icon: PieChart, match: (p) => p.startsWith("/reports"), roles: LEADS },
      { href: "/leave", label: "Leave", icon: Plane, match: (p) => p.startsWith("/leave") },
      { href: "/admin", label: "People & units", icon: Users, match: (p) => p.startsWith("/admin"), roles: ["head"] },
    ],
  },
  {
    label: "System",
    items: [
      { href: "/settings", label: "Settings", icon: Settings, match: (p) => p.startsWith("/settings"), roles: ["head"] },
      { href: "/account", label: "Account", icon: KeyRound, match: (p) => p.startsWith("/account") },
    ],
  },
];

const COLLAPSE_KEY = "tm_sidebar_collapsed";

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?";
}

function UserCard({ person }: { person: ShellPerson }) {
  return (
    <details className="group relative">
      <summary className="flex cursor-pointer list-none items-center gap-3 rounded-lg px-2 py-2 hover:bg-slate-100 [&::-webkit-details-marker]:hidden">
        <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-blue-100 text-sm font-semibold text-blue-700">
          {initials(person.name)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-slate-900">{person.name}</span>
          <span className="block truncate text-xs text-slate-500">{person.subtitle ?? "Team member"}</span>
        </span>
        <ChevronsUpDown aria-hidden className="size-4 shrink-0 text-slate-400" />
      </summary>
      <div className="absolute inset-x-0 bottom-full mb-2 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
        <Link href="/account" className="flex items-center gap-2 px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-50">
          <KeyRound aria-hidden className="size-4 text-slate-500" /> Account &amp; password
        </Link>
        <form action={logout} className="border-t border-slate-100">
          <button type="submit" className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-red-700 hover:bg-red-50">
            <LogOut aria-hidden className="size-4" /> Sign out
          </button>
        </form>
      </div>
    </details>
  );
}

function SidebarBody({ person, onNavigate }: { person: ShellPerson; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <div className="flex h-full flex-col">
      <Link href="/" onClick={onNavigate} className="m-3 flex items-center gap-3 rounded-xl bg-slate-50 px-3 py-2.5 ring-1 ring-slate-200/70">
        <Logo />
      </Link>

      <nav aria-label="Main" className="flex-1 overflow-y-auto px-3 pb-3">
        {GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => !i.roles || i.roles.includes(person.role)) })).map((g) => (
          <div key={g.label} className="mt-4">
            <p className="mb-1 px-2 text-xs font-medium text-slate-500">{g.label}</p>
            <ul className="space-y-0.5">
              {g.items.map(({ href, label, icon: Icon, match }) => {
                const active = match(pathname);
                return (
                  <li key={href}>
                    <Link
                      href={href}
                      onClick={onNavigate}
                      aria-current={active ? "page" : undefined}
                      className={`flex min-h-10 items-center gap-2.5 rounded-lg px-2 text-[15px] ${
                        active ? "bg-slate-100 font-medium text-slate-900" : "text-slate-700 hover:bg-slate-50 hover:text-slate-900"
                      }`}
                    >
                      <Icon aria-hidden className={`size-[18px] ${active ? "text-blue-600" : "text-slate-500"}`} />
                      {label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-slate-200/70 p-3">
        <UserCard person={person} />
      </div>
    </div>
  );
}

export function AppShell({ person, unread, children }: { person: ShellPerson; unread: number; children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1");
    } catch {}
  }, []);
  useEffect(() => setDrawerOpen(false), [pathname]);
  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setDrawerOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  function toggle() {
    if (window.matchMedia("(min-width: 1024px)").matches) {
      setCollapsed((c) => {
        try {
          localStorage.setItem(COLLAPSE_KEY, c ? "0" : "1");
        } catch {}
        return !c;
      });
    } else {
      setDrawerOpen(true);
    }
  }

  return (
    <div className="min-h-dvh">
      {/* Desktop sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-slate-200/70 bg-white lg:block print:!hidden ${collapsed ? "lg:hidden" : ""}`}
      >
        <SidebarBody person={person} />
      </aside>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button aria-label="Close menu" className="absolute inset-0 bg-slate-900/30" onClick={() => setDrawerOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85vw] bg-white shadow-xl">
            <button
              onClick={() => setDrawerOpen(false)}
              aria-label="Close menu"
              className="absolute top-4 right-3 z-10 grid size-9 place-items-center rounded-md text-slate-500 hover:bg-slate-100"
            >
              <X className="size-5" />
            </button>
            <SidebarBody person={person} onNavigate={() => setDrawerOpen(false)} />
          </aside>
        </div>
      )}

      <div className={collapsed ? "" : "lg:pl-64 print:pl-0"}>
        <header className="sticky top-0 z-20 bg-[#f5f6f8]/90 backdrop-blur print:hidden">
          <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-3 px-4 sm:px-8">
            <button
              onClick={toggle}
              aria-label="Toggle sidebar"
              className="grid size-9 place-items-center rounded-md text-slate-600 hover:bg-white hover:text-slate-900"
            >
              <PanelLeft className="size-5" />
            </button>
            <div className="flex items-center gap-2">
              <Link
                href="/notifications"
                aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
                className="relative grid size-9 place-items-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:text-slate-900"
              >
                <Bell aria-hidden className="size-[18px]" />
                {unread > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-red-600 px-1 text-[11px] font-semibold text-white tabular-nums">
                    {unread > 99 ? "99+" : unread}
                  </span>
                )}
              </Link>
              <Link
                href="/tasks/new"
                className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-blue-600 px-3 text-sm font-medium text-white shadow-xs hover:bg-blue-700"
              >
                <Plus aria-hidden className="size-4" />
                New task
              </Link>
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-4 pt-4 pb-12 sm:px-8">{children}</main>
      </div>
    </div>
  );
}

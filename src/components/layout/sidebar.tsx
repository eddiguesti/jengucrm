'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useTheme } from '@/contexts/ThemeContext';
import {
  LayoutDashboard,
  Users,
  Mail,
  Kanban,
  Settings,
  Zap,
  BarChart3,
  Inbox,
  Database,
  UserSearch,
} from 'lucide-react';

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Prospects', href: '/prospects', icon: Users },
  { name: 'Pipeline', href: '/pipeline', icon: Kanban },
  { name: 'Emails', href: '/emails', icon: Mail },
  { name: 'Mystery Shopper', href: '/mystery-shopper', icon: UserSearch },
  { name: 'Lead Sources', href: '/lead-sources', icon: Database },
  { name: 'Analytics', href: '/analytics', icon: BarChart3 },
  { name: 'Agents', href: '/agents', icon: Inbox },
  { name: 'Settings', href: '/settings', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const { theme } = useTheme();
  const isLight = theme === 'light';

  return (
    <div
      className={cn(
        "flex h-full w-64 flex-col backdrop-blur-2xl border-r",
        isLight
          ? "bg-gradient-to-b from-white/90 via-[#faf4ea]/95 to-white/90 border-[#efe7dc] text-slate-900 shadow-[var(--shadow-strong)]"
          : "bg-sidebar/80 border-white/[0.06] text-white"
      )}
    >
      {/* Logo - macOS style title bar area */}
      <div
        className={cn(
          "flex h-14 items-center gap-3 px-5 border-b",
          isLight ? "border-slate-200/80" : "border-white/[0.06]"
        )}
      >
        {/* Traffic light dots placeholder for visual balance */}
        <div className="flex gap-2 mr-2">
          <div className="w-3 h-3 rounded-full bg-[#ff5f57]/80" />
          <div className="w-3 h-3 rounded-full bg-[#febc2e]/80" />
          <div className="w-3 h-3 rounded-full bg-[#28c840]/80" />
        </div>
        <div className="flex items-center gap-2">
          <div
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br shadow-lg",
              isLight
                ? "from-sky-500 to-indigo-500 shadow-sky-500/20"
                : "from-blue-500 to-blue-600 shadow-blue-500/20"
            )}
          >
            <Zap className={cn("h-3.5 w-3.5", isLight ? "text-white" : "text-white")} />
          </div>
          <span
            className={cn(
              "text-sm font-semibold",
              isLight ? "text-slate-900" : "text-foreground/90"
            )}
          >
            Jengu CRM
          </span>
        </div>
      </div>

      {/* Navigation - macOS Finder style */}
      <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
        {navigation.map((item) => {
          const isActive = pathname === item.href ||
            (item.href !== '/' && pathname.startsWith(item.href));

          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                'group flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium macos-transition',
                isActive
                  ? isLight
                    ? 'bg-slate-100 text-slate-900 shadow-sm border border-slate-200'
                    : 'bg-white/10 text-white shadow-sm'
                  : isLight
                    ? 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                    : 'text-white/60 hover:bg-white/[0.06] hover:text-white/90'
              )}
            >
              <item.icon className={cn(
                "h-4 w-4 macos-transition",
                isActive
                  ? isLight ? "text-sky-500" : "text-blue-400"
                  : isLight ? "text-slate-500 group-hover:text-slate-700" : "text-white/50 group-hover:text-white/70"
              )} />
              {item.name}
            </Link>
          );
        })}
      </nav>

      {/* Footer - User section */}
      <div
        className={cn(
          "border-t p-3",
          isLight ? "border-slate-200/80" : "border-white/[0.06]"
        )}
      >
        <div
          className={cn(
            "flex items-center gap-3 rounded-lg px-2 py-2 macos-transition cursor-pointer",
            isLight ? "hover:bg-slate-100" : "hover:bg-white/[0.04]"
          )}
        >
          <div
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br text-xs font-semibold text-white shadow-lg",
              isLight ? "from-sky-500 to-indigo-500" : "from-blue-500 to-purple-600"
            )}
          >
            J
          </div>
          <div className="flex-1 min-w-0">
            <p
              className={cn(
                "text-[13px] font-medium truncate",
                isLight ? "text-slate-900" : "text-white/90"
              )}
            >
              Jengu
            </p>
            <p
              className={cn(
                "text-[11px] truncate",
                isLight ? "text-slate-500" : "text-white/40"
              )}
            >
              Luxury Hospitality AI
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

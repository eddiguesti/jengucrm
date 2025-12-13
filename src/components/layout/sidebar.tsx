'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useTheme } from '@/contexts/ThemeContext';
import {
  LayoutDashboard,
  Users,
  Kanban,
  Settings,
  Zap,
  Inbox,
  Target,
  TrendingUp,
  Search,
  Command,
  Mail,
} from 'lucide-react';

// ===========================================
// SIMPLIFIED NAVIGATION - 3 Spaces + Settings
// Reduced from 17 items to 7 items (60% reduction)
// ===========================================

// TODAY - Your daily focus
const todayNavigation = [
  { name: 'Command Center', href: '/', icon: LayoutDashboard },
];

// PROSPECTS - Your data
const prospectsNavigation = [
  { name: 'All Prospects', href: '/prospects', icon: Users },
  { name: 'Pipeline', href: '/pipeline', icon: Kanban },
  { name: 'Find New', href: '/find-new', icon: Search },
];

// OUTREACH - Your communications
const outreachNavigation = [
  { name: 'Inbox', href: '/outreach/inbox', icon: Inbox },
  { name: 'Campaigns', href: '/outreach/campaigns', icon: Target },
  { name: 'Mailboxes', href: '/outreach/mailboxes', icon: Mail },
  { name: 'Performance', href: '/outreach/analytics', icon: TrendingUp },
];

// Export navigation config for shared use with mobile-nav
export const navigationConfig = {
  today: todayNavigation,
  prospects: prospectsNavigation,
  outreach: outreachNavigation,
};

export function Sidebar() {
  const pathname = usePathname();
  const { theme } = useTheme();
  const isLight = theme === 'light';

  // Helper to check if route is active
  const isRouteActive = (href: string) => {
    if (href === '/') return pathname === '/';
    // Handle /find-new matching legacy routes
    if (href === '/find-new') {
      return pathname === '/find-new' ||
        pathname.startsWith('/sales-navigator') ||
        pathname.startsWith('/enrichment') ||
        pathname.startsWith('/mystery-shopper') ||
        pathname.startsWith('/lead-sources');
    }
    // Handle /outreach/inbox matching legacy routes
    if (href === '/outreach/inbox') {
      return pathname === '/outreach/inbox' ||
        pathname === '/emails' ||
        pathname === '/replies';
    }
    return pathname === href || pathname.startsWith(href + '/');
  };

  // Color schemes for different sections
  const getNavItemClasses = (href: string, colorScheme: 'blue' | 'emerald' | 'violet' | 'slate') => {
    const isActive = isRouteActive(href);

    const schemes = {
      blue: {
        active: isLight
          ? 'bg-gradient-to-r from-sky-50 to-blue-50 text-sky-700 shadow-sm border border-sky-200'
          : 'bg-gradient-to-r from-sky-500/20 to-blue-500/20 text-sky-300 shadow-sm',
        hover: isLight
          ? 'text-slate-600 hover:bg-sky-50 hover:text-sky-700'
          : 'text-white/60 hover:bg-sky-500/10 hover:text-sky-300',
        iconActive: isLight ? 'text-sky-500' : 'text-sky-400',
        iconInactive: isLight ? 'text-slate-500 group-hover:text-sky-500' : 'text-white/50 group-hover:text-sky-400',
      },
      emerald: {
        active: isLight
          ? 'bg-gradient-to-r from-emerald-50 to-green-50 text-emerald-700 shadow-sm border border-emerald-200'
          : 'bg-gradient-to-r from-emerald-500/20 to-green-500/20 text-emerald-300 shadow-sm',
        hover: isLight
          ? 'text-slate-600 hover:bg-emerald-50 hover:text-emerald-700'
          : 'text-white/60 hover:bg-emerald-500/10 hover:text-emerald-300',
        iconActive: isLight ? 'text-emerald-500' : 'text-emerald-400',
        iconInactive: isLight ? 'text-slate-500 group-hover:text-emerald-500' : 'text-white/50 group-hover:text-emerald-400',
      },
      violet: {
        active: isLight
          ? 'bg-gradient-to-r from-violet-50 to-purple-50 text-violet-700 shadow-sm border border-violet-200'
          : 'bg-gradient-to-r from-violet-500/20 to-purple-500/20 text-violet-300 shadow-sm',
        hover: isLight
          ? 'text-slate-600 hover:bg-violet-50 hover:text-violet-700'
          : 'text-white/60 hover:bg-violet-500/10 hover:text-violet-300',
        iconActive: isLight ? 'text-violet-500' : 'text-violet-400',
        iconInactive: isLight ? 'text-slate-500 group-hover:text-violet-500' : 'text-white/50 group-hover:text-violet-400',
      },
      slate: {
        active: isLight
          ? 'bg-slate-100 text-slate-900 shadow-sm border border-slate-200'
          : 'bg-white/10 text-white shadow-sm',
        hover: isLight
          ? 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          : 'text-white/60 hover:bg-white/[0.06] hover:text-white/90',
        iconActive: isLight ? 'text-slate-700' : 'text-slate-300',
        iconInactive: isLight ? 'text-slate-500 group-hover:text-slate-700' : 'text-white/50 group-hover:text-white/70',
      },
    };

    const scheme = schemes[colorScheme];
    return {
      link: cn(
        'group flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium macos-transition',
        isActive ? scheme.active : scheme.hover
      ),
      icon: cn(
        'h-4 w-4 macos-transition',
        isActive ? scheme.iconActive : scheme.iconInactive
      ),
    };
  };

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
          "flex h-14 items-center justify-between px-4 border-b",
          isLight ? "border-slate-200/80" : "border-white/[0.06]"
        )}
      >
        <div className="flex items-center gap-3">
          {/* Traffic light dots placeholder for visual balance */}
          <div className="flex gap-2">
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
              <Zap className="h-3.5 w-3.5 text-white" />
            </div>
            <span
              className={cn(
                "text-sm font-semibold",
                isLight ? "text-slate-900" : "text-foreground/90"
              )}
            >
              Jengu
            </span>
          </div>
        </div>

        {/* Command palette trigger */}
        <button
          className={cn(
            "flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-colors",
            isLight
              ? "bg-slate-100 text-slate-500 hover:bg-slate-200"
              : "bg-white/5 text-white/40 hover:bg-white/10"
          )}
          title="Open command palette (⌘K)"
          onClick={() => {
            // Simulate ⌘K to open command palette
            const event = new KeyboardEvent('keydown', {
              key: 'k',
              metaKey: true,
              ctrlKey: false,
              bubbles: true,
            });
            document.dispatchEvent(event);
          }}
        >
          <Command className="h-3 w-3" />
          <span>K</span>
        </button>
      </div>

      {/* Navigation - Simplified 3 Spaces */}
      <nav className="flex-1 px-3 py-3 overflow-y-auto">
        {/* TODAY Section */}
        <div className="space-y-0.5">
          <div className={cn(
            "px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider",
            isLight ? "text-slate-400" : "text-white/30"
          )}>
            Today
          </div>
          {todayNavigation.map((item) => {
            const classes = getNavItemClasses(item.href, 'blue');
            return (
              <Link key={item.name} href={item.href} className={classes.link}>
                <item.icon className={classes.icon} />
                {item.name}
              </Link>
            );
          })}
        </div>

        {/* PROSPECTS Section */}
        <div className="mt-5">
          <div className={cn(
            "px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider",
            isLight ? "text-slate-400" : "text-white/30"
          )}>
            Prospects
          </div>
          <div className="space-y-0.5">
            {prospectsNavigation.map((item) => {
              const classes = getNavItemClasses(item.href, 'emerald');
              return (
                <Link key={item.name} href={item.href} className={classes.link}>
                  <item.icon className={classes.icon} />
                  {item.name}
                </Link>
              );
            })}
          </div>
        </div>

        {/* OUTREACH Section */}
        <div className="mt-5">
          <div className={cn(
            "px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider",
            isLight ? "text-slate-400" : "text-white/30"
          )}>
            Outreach
          </div>
          <div className="space-y-0.5">
            {outreachNavigation.map((item) => {
              const classes = getNavItemClasses(item.href, 'violet');
              return (
                <Link key={item.name} href={item.href} className={classes.link}>
                  <item.icon className={classes.icon} />
                  {item.name}
                </Link>
              );
            })}
          </div>
        </div>
      </nav>

      {/* Footer - Settings + User */}
      <div
        className={cn(
          "border-t p-3",
          isLight ? "border-slate-200/80" : "border-white/[0.06]"
        )}
      >
        {/* Settings Link */}
        <Link
          href="/settings"
          className={cn(
            'group flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium macos-transition mb-2',
            isRouteActive('/settings') || isRouteActive('/notifications') || isRouteActive('/agents') || isRouteActive('/activity') || isRouteActive('/analytics')
              ? isLight
                ? 'bg-slate-100 text-slate-900 shadow-sm border border-slate-200'
                : 'bg-white/10 text-white shadow-sm'
              : isLight
                ? 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                : 'text-white/60 hover:bg-white/[0.06] hover:text-white/90'
          )}
        >
          <Settings className={cn(
            "h-4 w-4 macos-transition",
            isRouteActive('/settings')
              ? isLight ? "text-slate-700" : "text-slate-300"
              : isLight ? "text-slate-500 group-hover:text-slate-700" : "text-white/50 group-hover:text-white/70"
          )} />
          Settings
        </Link>

        {/* User */}
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
            E
          </div>
          <div className="flex-1 min-w-0">
            <p
              className={cn(
                "text-[13px] font-medium truncate",
                isLight ? "text-slate-900" : "text-white/90"
              )}
            >
              Edd
            </p>
            <p
              className={cn(
                "text-[11px] truncate",
                isLight ? "text-slate-500" : "text-white/40"
              )}
            >
              edd@jengu.ai
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  Users,
  Mail,
  Kanban,
  Search,
  Settings,
  Zap,
  Star,
  FlaskConical,
} from 'lucide-react';

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Prospects', href: '/prospects', icon: Users },
  { name: 'Pipeline', href: '/pipeline', icon: Kanban },
  { name: 'Emails', href: '/emails', icon: Mail },
  { name: 'Job Scraper', href: '/scraper', icon: Search },
  { name: 'Review Mining', href: '/review-mining', icon: Star },
  { name: 'Test Lab', href: '/test-lab', icon: FlaskConical },
  { name: 'Settings', href: '/settings', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <div className="flex h-full w-64 flex-col bg-sidebar/80 backdrop-blur-2xl border-r border-white/[0.06]">
      {/* Logo - macOS style title bar area */}
      <div className="flex h-14 items-center gap-3 px-5 border-b border-white/[0.06]">
        {/* Traffic light dots placeholder for visual balance */}
        <div className="flex gap-2 mr-2">
          <div className="w-3 h-3 rounded-full bg-[#ff5f57]/80" />
          <div className="w-3 h-3 rounded-full bg-[#febc2e]/80" />
          <div className="w-3 h-3 rounded-full bg-[#28c840]/80" />
        </div>
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 shadow-lg shadow-blue-500/20">
            <Zap className="h-3.5 w-3.5 text-white" />
          </div>
          <span className="text-sm font-semibold text-foreground/90">Jengu CRM</span>
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
                  ? 'bg-white/10 text-white shadow-sm'
                  : 'text-white/60 hover:bg-white/[0.06] hover:text-white/90'
              )}
            >
              <item.icon className={cn(
                "h-4 w-4 macos-transition",
                isActive
                  ? "text-blue-400"
                  : "text-white/50 group-hover:text-white/70"
              )} />
              {item.name}
            </Link>
          );
        })}
      </nav>

      {/* Footer - User section */}
      <div className="border-t border-white/[0.06] p-3">
        <div className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-white/[0.04] macos-transition cursor-pointer">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-purple-600 text-xs font-semibold text-white shadow-lg">
            J
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-medium text-white/90 truncate">Jengu</p>
            <p className="text-[11px] text-white/40 truncate">Luxury Hospitality AI</p>
          </div>
        </div>
      </div>
    </div>
  );
}

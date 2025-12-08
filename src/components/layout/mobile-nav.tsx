'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useTheme } from '@/contexts/ThemeContext';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
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
  Linkedin,
  Menu,
  ChevronRight,
  Moon,
  Sun,
  Sparkles,
  MessageSquare,
  Bell,
  Activity,
} from 'lucide-react';

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard, color: 'from-blue-500 to-cyan-500' },
  { name: 'Prospects', href: '/prospects', icon: Users, color: 'from-violet-500 to-purple-500' },
  { name: 'Pipeline', href: '/pipeline', icon: Kanban, color: 'from-amber-500 to-orange-500' },
  { name: 'Emails', href: '/emails', icon: Mail, color: 'from-emerald-500 to-teal-500' },
  { name: 'Replies', href: '/replies', icon: MessageSquare, color: 'from-amber-500 to-yellow-500' },
  { name: 'Notifications', href: '/notifications', icon: Bell, color: 'from-red-500 to-rose-500' },
  { name: 'Activity', href: '/activity', icon: Activity, color: 'from-green-500 to-emerald-500' },
  { name: 'Mystery Shopper', href: '/mystery-shopper', icon: UserSearch, color: 'from-pink-500 to-rose-500' },
  { name: 'Sales Navigator', href: '/sales-navigator', icon: Linkedin, color: 'from-blue-600 to-blue-500' },
  { name: 'Lead Sources', href: '/lead-sources', icon: Database, color: 'from-indigo-500 to-violet-500' },
  { name: 'Analytics', href: '/analytics', icon: BarChart3, color: 'from-cyan-500 to-blue-500' },
  { name: 'Agents', href: '/agents', icon: Inbox, color: 'from-fuchsia-500 to-pink-500' },
  { name: 'Settings', href: '/settings', icon: Settings, color: 'from-slate-500 to-zinc-500' },
];

// Bottom tab bar items (most used)
const bottomTabs = [
  { name: 'Home', href: '/', icon: LayoutDashboard },
  { name: 'Prospects', href: '/prospects', icon: Users },
  { name: 'Pipeline', href: '/pipeline', icon: Kanban },
  { name: 'Emails', href: '/emails', icon: Mail },
];

export function MobileNav() {
  const [isOpen, setIsOpen] = useState(false);
  const isMountedRef = useRef(false);
  const [renderKey, setRenderKey] = useState(0);
  const pathname = usePathname();
  const { theme, toggleTheme } = useTheme();
  const isLight = theme === 'light';

  // Use callback to schedule state update after effect completes
  const scheduleMount = useCallback(() => {
    if (!isMountedRef.current) {
      isMountedRef.current = true;
      // Schedule the re-render outside of the effect
      queueMicrotask(() => setRenderKey(k => k + 1));
    }
  }, []);

  useEffect(() => {
    scheduleMount();
  }, [scheduleMount]);

  const mounted = isMountedRef.current;

  // Don't render on login page
  if (pathname === '/login') return null;

  // Find active tab index for pill animation
  const activeTabIndex = bottomTabs.findIndex(
    tab => pathname === tab.href || (tab.href !== '/' && pathname.startsWith(tab.href))
  );

  return (
    <>
      {/* Mobile Header Bar - Premium Glass Design */}
      <motion.div
        initial={{ y: -100 }}
        animate={{ y: 0 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className={cn(
          "fixed top-0 left-0 right-0 z-50 md:hidden",
          "flex h-14 items-center justify-between px-4",
          "backdrop-blur-2xl backdrop-saturate-150 border-b",
          isLight
            ? "bg-white/70 border-black/[0.04] shadow-[0_1px_3px_rgba(0,0,0,0.05)]"
            : "bg-zinc-950/70 border-white/[0.04] shadow-[0_1px_3px_rgba(0,0,0,0.3)]"
        )}
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
      >
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 active:opacity-70 transition-opacity">
          <motion.div
            whileTap={{ scale: 0.9, rotate: -10 }}
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-[11px] bg-gradient-to-br shadow-lg",
              isLight
                ? "from-blue-500 to-indigo-600 shadow-blue-500/25"
                : "from-blue-400 to-indigo-500 shadow-blue-500/20"
            )}
          >
            <Zap className="h-[18px] w-[18px] text-white" />
          </motion.div>
          <div className="flex flex-col">
            <span
              className={cn(
                "text-[15px] font-semibold leading-tight tracking-tight",
                isLight ? "text-zinc-900" : "text-white"
              )}
            >
              Jengu
            </span>
            <span
              className={cn(
                "text-[10px] font-medium leading-tight",
                isLight ? "text-zinc-500" : "text-white/40"
              )}
            >
              CRM
            </span>
          </div>
        </Link>

        {/* Right Actions */}
        <div className="flex items-center gap-1">
          {/* Theme Toggle */}
          {mounted && (
            <motion.button
              whileTap={{ scale: 0.85 }}
              onClick={toggleTheme}
              className={cn(
                "flex h-9 w-9 items-center justify-center rounded-full",
                "transition-colors duration-200",
                isLight
                  ? "text-zinc-600 active:bg-zinc-100"
                  : "text-white/70 active:bg-white/10"
              )}
            >
              <AnimatePresence mode="wait">
                <motion.div
                  key={theme}
                  initial={{ scale: 0, rotate: -180 }}
                  animate={{ scale: 1, rotate: 0 }}
                  exit={{ scale: 0, rotate: 180 }}
                  transition={{ duration: 0.2 }}
                >
                  {isLight ? <Moon className="h-[18px] w-[18px]" /> : <Sun className="h-[18px] w-[18px]" />}
                </motion.div>
              </AnimatePresence>
            </motion.button>
          )}

          {/* Menu Button */}
          <motion.button
            whileTap={{ scale: 0.85 }}
            onClick={() => setIsOpen(true)}
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-full",
              "transition-colors duration-200",
              isLight
                ? "text-zinc-600 active:bg-zinc-100"
                : "text-white/70 active:bg-white/10"
            )}
          >
            <Menu className="h-[18px] w-[18px]" />
          </motion.button>
        </div>
      </motion.div>

      {/* Bottom Tab Bar - Apple-Style with Floating Pill */}
      <motion.div
        initial={{ y: 100 }}
        animate={{ y: 0 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300, delay: 0.1 }}
        className={cn(
          "fixed bottom-0 left-0 right-0 z-50 md:hidden",
          "backdrop-blur-2xl backdrop-saturate-150 border-t",
          isLight
            ? "bg-white/80 border-black/[0.04]"
            : "bg-zinc-950/80 border-white/[0.04]"
        )}
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div className="relative flex h-[52px] items-center justify-around px-4">
          {/* Animated Background Pill */}
          {activeTabIndex >= 0 && activeTabIndex < bottomTabs.length && (
            <motion.div
              layoutId="activeTab"
              className={cn(
                "absolute h-8 rounded-full",
                isLight
                  ? "bg-gradient-to-r from-blue-500 to-indigo-500 shadow-lg shadow-blue-500/20"
                  : "bg-gradient-to-r from-blue-500 to-indigo-500 shadow-lg shadow-blue-500/25"
              )}
              style={{
                width: `${100 / (bottomTabs.length + 1) - 4}%`,
                left: `${(activeTabIndex / (bottomTabs.length + 1)) * 100 + 2}%`,
              }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            />
          )}

          {bottomTabs.map((tab, index) => {
            const isActive = pathname === tab.href ||
              (tab.href !== '/' && pathname.startsWith(tab.href));

            return (
              <Link
                key={tab.name}
                href={tab.href}
                className="relative flex-1 flex flex-col items-center justify-center py-1.5"
              >
                <motion.div
                  whileTap={{ scale: 0.8 }}
                  className="flex flex-col items-center"
                >
                  <tab.icon
                    className={cn(
                      "h-[22px] w-[22px] transition-colors duration-200",
                      isActive
                        ? "text-white"
                        : isLight
                          ? "text-zinc-400"
                          : "text-zinc-500"
                    )}
                  />
                  <span
                    className={cn(
                      "text-[10px] font-medium mt-0.5 transition-colors duration-200",
                      isActive
                        ? isLight ? "text-blue-600" : "text-blue-400"
                        : isLight ? "text-zinc-400" : "text-zinc-500"
                    )}
                  >
                    {tab.name}
                  </span>
                </motion.div>
              </Link>
            );
          })}

          {/* More button */}
          <motion.button
            whileTap={{ scale: 0.8 }}
            onClick={() => setIsOpen(true)}
            className="flex-1 flex flex-col items-center justify-center py-1.5"
          >
            <Menu
              className={cn(
                "h-[22px] w-[22px]",
                isLight ? "text-zinc-400" : "text-zinc-500"
              )}
            />
            <span
              className={cn(
                "text-[10px] font-medium mt-0.5",
                isLight ? "text-zinc-400" : "text-zinc-500"
              )}
            >
              More
            </span>
          </motion.button>
        </div>
      </motion.div>

      {/* Premium Slide-out Navigation Sheet */}
      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetContent
          side="right"
          className={cn(
            "w-[88vw] max-w-[340px] p-0 border-l",
            isLight
              ? "bg-gradient-to-b from-white via-zinc-50/80 to-white border-zinc-200/50"
              : "bg-gradient-to-b from-zinc-900 via-zinc-900/95 to-zinc-900 border-white/[0.06]"
          )}
        >
          {/* Header with visual flourish */}
          <SheetHeader className="relative p-5 pb-4 overflow-hidden">
            {/* Decorative gradient blob */}
            <div
              className={cn(
                "absolute -top-20 -right-20 w-40 h-40 rounded-full blur-3xl opacity-30",
                isLight ? "bg-blue-400" : "bg-blue-500"
              )}
            />
            <div className="relative flex items-center gap-3.5">
              <motion.div
                initial={{ scale: 0, rotate: -180 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: 'spring', damping: 15, stiffness: 200 }}
                className={cn(
                  "flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br shadow-xl",
                  isLight
                    ? "from-blue-500 to-indigo-600 shadow-blue-500/30"
                    : "from-blue-400 to-indigo-500 shadow-blue-500/25"
                )}
              >
                <Zap className="h-6 w-6 text-white" />
              </motion.div>
              <div>
                <SheetTitle className={cn(
                  "text-left text-lg font-semibold tracking-tight",
                  isLight ? "text-zinc-900" : "text-white"
                )}>
                  Jengu CRM
                </SheetTitle>
                <p className={cn(
                  "text-xs font-medium",
                  isLight ? "text-zinc-500" : "text-white/50"
                )}>
                  Luxury Hospitality AI
                </p>
              </div>
            </div>
          </SheetHeader>

          {/* Divider */}
          <div className={cn(
            "mx-5 h-px",
            isLight ? "bg-zinc-200/80" : "bg-white/[0.06]"
          )} />

          {/* Navigation List */}
          <nav className="flex-1 overflow-y-auto py-3 px-3">
            <div className="space-y-0.5">
              {navigation.map((item, index) => {
                const isActive = pathname === item.href ||
                  (item.href !== '/' && pathname.startsWith(item.href));

                return (
                  <motion.div
                    key={item.name}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.03, duration: 0.2 }}
                  >
                    <Link
                      href={item.href}
                      onClick={() => setIsOpen(false)}
                      className={cn(
                        "flex items-center justify-between rounded-2xl px-3 py-3",
                        "active:scale-[0.98] transition-all duration-150",
                        isActive
                          ? isLight
                            ? "bg-gradient-to-r from-blue-50 to-indigo-50/50 shadow-sm"
                            : "bg-gradient-to-r from-white/[0.08] to-white/[0.04]"
                          : isLight
                            ? "active:bg-zinc-100"
                            : "active:bg-white/[0.04]"
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={cn(
                            "flex h-10 w-10 items-center justify-center rounded-xl transition-all",
                            isActive
                              ? `bg-gradient-to-br ${item.color} shadow-lg`
                              : isLight
                                ? "bg-zinc-100"
                                : "bg-white/[0.06]"
                          )}
                          style={{
                            boxShadow: isActive
                              ? isLight
                                ? '0 4px 12px -2px rgba(59, 130, 246, 0.25)'
                                : '0 4px 12px -2px rgba(59, 130, 246, 0.3)'
                              : 'none'
                          }}
                        >
                          <item.icon
                            className={cn(
                              "h-[18px] w-[18px] transition-colors",
                              isActive
                                ? "text-white"
                                : isLight
                                  ? "text-zinc-500"
                                  : "text-white/50"
                            )}
                          />
                        </div>
                        <span
                          className={cn(
                            "text-[15px] font-medium",
                            isActive
                              ? isLight ? "text-zinc-900" : "text-white"
                              : isLight ? "text-zinc-600" : "text-white/70"
                          )}
                        >
                          {item.name}
                        </span>
                      </div>
                      {isActive && (
                        <motion.div
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          className={cn(
                            "flex h-6 w-6 items-center justify-center rounded-full",
                            isLight ? "bg-blue-500" : "bg-blue-500"
                          )}
                        >
                          <Sparkles className="h-3 w-3 text-white" />
                        </motion.div>
                      )}
                      {!isActive && (
                        <ChevronRight
                          className={cn(
                            "h-4 w-4",
                            isLight ? "text-zinc-300" : "text-white/20"
                          )}
                        />
                      )}
                    </Link>
                  </motion.div>
                );
              })}
            </div>
          </nav>

          {/* Footer - User Profile */}
          <div
            className={cn(
              "p-4 border-t",
              isLight
                ? "border-zinc-200/80 bg-gradient-to-t from-zinc-50 to-transparent"
                : "border-white/[0.04] bg-gradient-to-t from-white/[0.02] to-transparent"
            )}
          >
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className={cn(
                "flex items-center gap-3 p-3 rounded-2xl",
                isLight ? "bg-white shadow-sm border border-zinc-100" : "bg-white/[0.04]"
              )}
            >
              <div
                className={cn(
                  "flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br text-sm font-bold text-white shadow-lg",
                  isLight
                    ? "from-blue-500 to-indigo-600 shadow-blue-500/20"
                    : "from-blue-400 to-purple-500 shadow-purple-500/20"
                )}
              >
                J
              </div>
              <div className="flex-1 min-w-0">
                <p
                  className={cn(
                    "text-[14px] font-semibold truncate",
                    isLight ? "text-zinc-900" : "text-white"
                  )}
                >
                  Jengu Team
                </p>
                <div className="flex items-center gap-1.5">
                  <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  <p
                    className={cn(
                      "text-[11px] font-medium",
                      isLight ? "text-emerald-600" : "text-emerald-400"
                    )}
                  >
                    Premium Plan
                  </p>
                </div>
              </div>
            </motion.div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Top Spacer for fixed header */}
      <div className="h-14 md:hidden" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }} />
    </>
  );
}

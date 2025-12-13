'use client';

import { useState, useEffect, useCallback, memo } from 'react';
import { Command } from 'cmdk';
import { useRouter } from 'next/navigation';
import { useTheme } from '@/contexts/ThemeContext';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import {
  backdropVariants,
  commandPaletteVariants,
  stagger,
  springs,
  durations,
} from '@/lib/animations';
import {
  LayoutDashboard,
  Users,
  Kanban,
  Search,
  Inbox,
  Target,
  TrendingUp,
  Settings,
  Send,
  UserPlus,
  Mail,
  Sparkles,
  Sun,
  Moon,
  ArrowRight,
  Building2,
  Loader2,
} from 'lucide-react';

interface Prospect {
  id: string;
  name: string;
  company: string | null;
  city: string | null;
  contact_name: string | null;
  email: string | null;
  tier: string;
}

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Animation variants for list items
const listContainerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: stagger.fast,
      delayChildren: 0.1,
    },
  },
};

const listItemVariants = {
  hidden: { opacity: 0, x: -10, scale: 0.98 },
  visible: {
    opacity: 1,
    x: 0,
    scale: 1,
    transition: springs.quick,
  },
};

const groupHeaderVariants = {
  hidden: { opacity: 0, x: -20 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { ...springs.snappy, delay: 0.05 },
  },
};

// Memoized command item for better performance
const CommandItem = memo(function CommandItem({
  children,
  className,
  ...props
}: React.ComponentProps<typeof Command.Item>) {
  return (
    <motion.div variants={listItemVariants}>
      <Command.Item className={className} {...props}>
        {children}
      </Command.Item>
    </motion.div>
  );
});

// Memoized group header
const GroupHeader = memo(function GroupHeader({
  children,
  isLight,
}: {
  children: React.ReactNode;
  isLight: boolean;
}) {
  return (
    <motion.span
      variants={groupHeaderVariants}
      className={cn(
        'text-xs font-semibold uppercase tracking-wider px-2',
        isLight ? 'text-slate-400' : 'text-zinc-500'
      )}
    >
      {children}
    </motion.span>
  );
});

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const isLight = theme === 'light';

  const [search, setSearch] = useState('');
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [recentProspects, setRecentProspects] = useState<Prospect[]>([]);
  const [loading, setLoading] = useState(false);

  // Load recent prospects from localStorage
  useEffect(() => {
    if (open) {
      const stored = localStorage.getItem('recentProspects');
      if (stored) {
        try {
          setRecentProspects(JSON.parse(stored));
        } catch {
          // Ignore parse errors
        }
      }
    }
  }, [open]);

  // Search prospects when query changes
  useEffect(() => {
    if (!search || search.length < 2) {
      setProspects([]);
      return;
    }

    const searchProspects = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/prospects?search=${encodeURIComponent(search)}&limit=8`);
        const data = await res.json();
        setProspects(data.prospects || data.data || []);
      } catch (error) {
        console.error('Failed to search prospects:', error);
      } finally {
        setLoading(false);
      }
    };

    const debounce = setTimeout(searchProspects, 200);
    return () => clearTimeout(debounce);
  }, [search]);

  // Save to recent prospects
  const saveToRecent = useCallback((prospect: Prospect) => {
    const recent = [prospect, ...recentProspects.filter(p => p.id !== prospect.id)].slice(0, 5);
    setRecentProspects(recent);
    localStorage.setItem('recentProspects', JSON.stringify(recent));
  }, [recentProspects]);

  // Navigate and close
  const navigate = useCallback((path: string) => {
    router.push(path);
    onOpenChange(false);
    setSearch('');
  }, [router, onOpenChange]);

  // Navigate to prospect
  const navigateToProspect = useCallback((prospect: Prospect) => {
    saveToRecent(prospect);
    navigate(`/prospects/${prospect.id}`);
  }, [navigate, saveToRecent]);

  // Toggle theme
  const toggleTheme = useCallback(() => {
    setTheme(isLight ? 'dark' : 'light');
    onOpenChange(false);
  }, [isLight, setTheme, onOpenChange]);

  // Reset search when closing
  useEffect(() => {
    if (!open) {
      setSearch('');
      setProspects([]);
    }
  }, [open]);

  // Navigation items
  const navigationItems = [
    { name: 'Command Center', href: '/', icon: LayoutDashboard, shortcut: '⌘D' },
    { name: 'All Prospects', href: '/prospects', icon: Users, shortcut: '⌘⇧P' },
    { name: 'Pipeline', href: '/pipeline', icon: Kanban, shortcut: '⌘P' },
    { name: 'Find New', href: '/find-new', icon: Search },
    { name: 'Inbox', href: '/outreach/inbox', icon: Inbox, shortcut: '⌘I' },
    { name: 'Campaigns', href: '/outreach/campaigns', icon: Target },
    { name: 'Performance', href: '/outreach/analytics', icon: TrendingUp },
    { name: 'Settings', href: '/settings', icon: Settings, shortcut: '⌘,' },
  ];

  // Quick actions
  const quickActions = [
    { name: 'Send Emails to Ready Prospects', action: () => navigate('/outreach/campaigns'), icon: Send, shortcut: '⌘⇧E' },
    { name: 'Add New Prospect', action: () => navigate('/prospects?action=new'), icon: UserPlus, shortcut: '⌘N' },
    { name: 'Import from Sales Navigator', action: () => navigate('/sales-navigator'), icon: Sparkles },
    { name: 'Run Enrichment', action: () => navigate('/enrichment'), icon: Mail },
  ];

  const itemClassName = cn(
    'flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors',
    'data-[selected=true]:bg-violet-500 data-[selected=true]:text-white',
    isLight
      ? 'text-slate-700 hover:bg-slate-100'
      : 'text-zinc-300 hover:bg-zinc-800'
  );

  return (
    <AnimatePresence>
      {open && (
        <Command.Dialog
          open={open}
          onOpenChange={onOpenChange}
          label="Command Palette"
          className={cn(
            'fixed inset-0 z-50',
            'flex items-start justify-center pt-[20vh]'
          )}
        >
          {/* Animated Backdrop */}
          <motion.div
            variants={backdropVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className={cn(
              'fixed inset-0 backdrop-blur-sm',
              isLight ? 'bg-black/20' : 'bg-black/50'
            )}
            onClick={() => onOpenChange(false)}
          />

          {/* Animated Dialog */}
          <motion.div
            variants={commandPaletteVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className={cn(
              'relative w-full max-w-xl mx-4 rounded-xl shadow-2xl overflow-hidden',
              'border backdrop-blur-xl',
              isLight
                ? 'bg-white/95 border-slate-200 shadow-slate-200/50'
                : 'bg-zinc-900/95 border-zinc-700 shadow-black/50'
            )}
          >
            {/* Search Input */}
            <div className={cn(
              'flex items-center gap-3 px-4 py-3 border-b',
              isLight ? 'border-slate-200' : 'border-zinc-800'
            )}>
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.1, ...springs.snappy }}
              >
                {loading ? (
                  <Loader2 className={cn(
                    'h-5 w-5 flex-shrink-0 animate-spin',
                    isLight ? 'text-violet-500' : 'text-violet-400'
                  )} />
                ) : (
                  <Search className={cn(
                    'h-5 w-5 flex-shrink-0',
                    isLight ? 'text-slate-400' : 'text-zinc-500'
                  )} />
                )}
              </motion.div>
              <Command.Input
                value={search}
                onValueChange={setSearch}
                placeholder="Search prospects, actions, settings..."
                className={cn(
                  'flex-1 bg-transparent outline-none text-base',
                  isLight ? 'text-slate-900 placeholder:text-slate-400' : 'text-white placeholder:text-zinc-500'
                )}
                autoFocus
              />
              <motion.kbd
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.2, ...springs.snappy }}
                className={cn(
                  'hidden sm:flex items-center gap-1 px-2 py-1 rounded text-xs font-medium',
                  isLight ? 'bg-slate-100 text-slate-500' : 'bg-zinc-800 text-zinc-400'
                )}
              >
                ESC
              </motion.kbd>
            </div>

            {/* Animated Results */}
            <Command.List className={cn(
              'max-h-[60vh] overflow-y-auto p-2',
              isLight ? 'text-slate-900' : 'text-white'
            )}>
              <Command.Empty className={cn(
                'py-8 text-center text-sm',
                isLight ? 'text-slate-500' : 'text-zinc-500'
              )}>
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={springs.snappy}
                >
                  {loading ? (
                    <div className="flex items-center justify-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Searching...
                    </div>
                  ) : (
                    'No results found'
                  )}
                </motion.div>
              </Command.Empty>

              {/* Prospect Search Results */}
              {prospects.length > 0 && (
                <Command.Group
                  heading={<GroupHeader isLight={isLight}>Prospects</GroupHeader>}
                >
                  <motion.div
                    variants={listContainerVariants}
                    initial="hidden"
                    animate="visible"
                  >
                    {prospects.map((prospect) => (
                      <CommandItem
                        key={prospect.id}
                        value={`prospect-${prospect.id}-${prospect.name}`}
                        onSelect={() => navigateToProspect(prospect)}
                        className={itemClassName}
                      >
                        <Building2 className="h-4 w-4 flex-shrink-0 opacity-60" />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{prospect.name}</p>
                          <p className={cn(
                            'text-xs truncate',
                            'data-[selected=true]:text-white/70',
                            isLight ? 'text-slate-500' : 'text-zinc-500'
                          )}>
                            {prospect.contact_name && `${prospect.contact_name} · `}
                            {prospect.city}
                          </p>
                        </div>
                        <span className={cn(
                          'text-xs px-1.5 py-0.5 rounded',
                          prospect.tier === 'hot'
                            ? 'bg-red-500/20 text-red-400'
                            : prospect.tier === 'warm'
                              ? 'bg-amber-500/20 text-amber-400'
                              : 'bg-blue-500/20 text-blue-400'
                        )}>
                          {prospect.tier}
                        </span>
                        <ArrowRight className="h-4 w-4 opacity-40" />
                      </CommandItem>
                    ))}
                  </motion.div>
                </Command.Group>
              )}

              {/* Recent Prospects (only when not searching) */}
              {!search && recentProspects.length > 0 && (
                <Command.Group
                  heading={<GroupHeader isLight={isLight}>Recent Prospects</GroupHeader>}
                >
                  <motion.div
                    variants={listContainerVariants}
                    initial="hidden"
                    animate="visible"
                  >
                    {recentProspects.map((prospect) => (
                      <CommandItem
                        key={`recent-${prospect.id}`}
                        value={`recent-${prospect.id}-${prospect.name}`}
                        onSelect={() => navigateToProspect(prospect)}
                        className={itemClassName}
                      >
                        <Building2 className="h-4 w-4 flex-shrink-0 opacity-60" />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{prospect.name}</p>
                          <p className="text-xs truncate opacity-60">
                            {prospect.city}
                          </p>
                        </div>
                        <ArrowRight className="h-4 w-4 opacity-40" />
                      </CommandItem>
                    ))}
                  </motion.div>
                </Command.Group>
              )}

              {/* Quick Actions */}
              {!search && (
                <Command.Group
                  heading={<GroupHeader isLight={isLight}>Quick Actions</GroupHeader>}
                >
                  <motion.div
                    variants={listContainerVariants}
                    initial="hidden"
                    animate="visible"
                  >
                    {quickActions.map((action) => (
                      <CommandItem
                        key={action.name}
                        value={action.name}
                        onSelect={action.action}
                        className={itemClassName}
                      >
                        <action.icon className="h-4 w-4 flex-shrink-0 opacity-60" />
                        <span className="flex-1">{action.name}</span>
                        {action.shortcut && (
                          <kbd className={cn(
                            'text-xs px-1.5 py-0.5 rounded',
                            isLight ? 'bg-slate-100 text-slate-500' : 'bg-zinc-800 text-zinc-400'
                          )}>
                            {action.shortcut}
                          </kbd>
                        )}
                      </CommandItem>
                    ))}
                  </motion.div>
                </Command.Group>
              )}

              {/* Navigation */}
              <Command.Group
                heading={<GroupHeader isLight={isLight}>Navigation</GroupHeader>}
              >
                <motion.div
                  variants={listContainerVariants}
                  initial="hidden"
                  animate="visible"
                >
                  {navigationItems.map((item) => (
                    <CommandItem
                      key={item.href}
                      value={`go to ${item.name}`}
                      onSelect={() => navigate(item.href)}
                      className={itemClassName}
                    >
                      <item.icon className="h-4 w-4 flex-shrink-0 opacity-60" />
                      <span className="flex-1">{item.name}</span>
                      {item.shortcut && (
                        <kbd className={cn(
                          'text-xs px-1.5 py-0.5 rounded',
                          isLight ? 'bg-slate-100 text-slate-500' : 'bg-zinc-800 text-zinc-400'
                        )}>
                          {item.shortcut}
                        </kbd>
                      )}
                    </CommandItem>
                  ))}
                </motion.div>
              </Command.Group>

              {/* Theme Toggle */}
              <Command.Group
                heading={<GroupHeader isLight={isLight}>Preferences</GroupHeader>}
              >
                <motion.div
                  variants={listContainerVariants}
                  initial="hidden"
                  animate="visible"
                >
                  <CommandItem
                    value="toggle theme dark light mode"
                    onSelect={toggleTheme}
                    className={itemClassName}
                  >
                    <motion.div
                      initial={{ rotate: 0 }}
                      whileHover={{ rotate: 180 }}
                      transition={{ duration: durations.normal }}
                    >
                      {isLight ? (
                        <Moon className="h-4 w-4 flex-shrink-0 opacity-60" />
                      ) : (
                        <Sun className="h-4 w-4 flex-shrink-0 opacity-60" />
                      )}
                    </motion.div>
                    <span className="flex-1">
                      Switch to {isLight ? 'Dark' : 'Light'} Mode
                    </span>
                  </CommandItem>
                </motion.div>
              </Command.Group>
            </Command.List>

            {/* Animated Footer */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, ...springs.snappy }}
              className={cn(
                'flex items-center justify-between px-4 py-2 border-t text-xs',
                isLight ? 'border-slate-200 text-slate-400' : 'border-zinc-800 text-zinc-500'
              )}
            >
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1">
                  <kbd className={cn(
                    'px-1.5 py-0.5 rounded',
                    isLight ? 'bg-slate-100' : 'bg-zinc-800'
                  )}>↑↓</kbd>
                  navigate
                </span>
                <span className="flex items-center gap-1">
                  <kbd className={cn(
                    'px-1.5 py-0.5 rounded',
                    isLight ? 'bg-slate-100' : 'bg-zinc-800'
                  )}>↵</kbd>
                  select
                </span>
              </div>
              <span>Jengu Command Palette</span>
            </motion.div>
          </motion.div>
        </Command.Dialog>
      )}
    </AnimatePresence>
  );
}

// Hook for global keyboard shortcuts
export function useCommandPalette() {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // ⌘K or Ctrl+K - Open command palette
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen((prev) => !prev);
        return;
      }

      // Only handle shortcuts when palette is closed
      if (open) return;

      // ⌘I - Go to Inbox
      if ((e.metaKey || e.ctrlKey) && e.key === 'i') {
        e.preventDefault();
        router.push('/outreach/inbox');
        return;
      }

      // ⌘P - Go to Pipeline
      if ((e.metaKey || e.ctrlKey) && e.key === 'p' && !e.shiftKey) {
        e.preventDefault();
        router.push('/pipeline');
        return;
      }

      // ⌘⇧P - Go to Prospects
      if ((e.metaKey || e.ctrlKey) && e.key === 'p' && e.shiftKey) {
        e.preventDefault();
        router.push('/prospects');
        return;
      }

      // ⌘, - Go to Settings
      if ((e.metaKey || e.ctrlKey) && e.key === ',') {
        e.preventDefault();
        router.push('/settings');
        return;
      }

      // ⌘D - Go to Dashboard (Command Center)
      if ((e.metaKey || e.ctrlKey) && e.key === 'd') {
        e.preventDefault();
        router.push('/');
        return;
      }

      // ⌘N - Add new prospect
      if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
        e.preventDefault();
        router.push('/prospects?action=new');
        return;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, router]);

  return { open, setOpen };
}

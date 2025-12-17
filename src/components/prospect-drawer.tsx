'use client';

import { useEffect, useCallback, memo } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useTheme } from '@/contexts/ThemeContext';
import { cn } from '@/lib/utils';
import { calculateReadiness } from '@/lib/readiness';
import { motion, AnimatePresence } from 'framer-motion';
import {
  springs,
  stagger,
  backdropVariants,
  slideRightVariants,
} from '@/lib/animations';
import {
  X,
  Mail,
  Phone,
  Globe,
  MapPin,
  Star,
  ExternalLink,
  Send,
  Calendar,
  MessageSquare,
  Clock,
  CheckCircle2,
  AlertCircle,
  ChevronUp,
  ChevronDown,
  Linkedin,
  Briefcase,
} from 'lucide-react';
import Link from 'next/link';
import type { Prospect } from '@/types';

interface ProspectDrawerProps {
  prospect: Prospect | null;
  prospects: Prospect[];
  onClose: () => void;
  onNavigate: (prospectId: string) => void;
  onAction: (action: string, prospectId: string) => void;
}

// Animation variants
const contentContainerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: stagger.default,
      delayChildren: 0.15,
    },
  },
};

const contentItemVariants = {
  hidden: { opacity: 0, y: 20, scale: 0.95 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: springs.snappy,
  },
};

const headerVariants = {
  hidden: { opacity: 0, x: 20 },
  visible: {
    opacity: 1,
    x: 0,
    transition: springs.snappy,
  },
};

// Readiness indicator component with animated progress
const ReadinessIndicator = memo(function ReadinessIndicator({
  prospect,
  isLight,
}: {
  prospect: Prospect;
  isLight: boolean;
}) {
  const readiness = calculateReadiness(prospect);
  const percentage = readiness.total;

  const getColor = () => {
    if (percentage >= 80) return 'emerald';
    if (percentage >= 60) return 'blue';
    if (percentage >= 40) return 'amber';
    return 'orange';
  };

  const color = getColor();
  const colorClasses = {
    emerald: 'bg-emerald-500',
    blue: 'bg-blue-500',
    amber: 'bg-amber-500',
    orange: 'bg-orange-500',
  };

  const checks = [
    { label: 'Has email', done: !!prospect.email },
    { label: 'Has contact name', done: !!prospect.contact_name },
    { label: 'Has website', done: !!prospect.website },
    { label: 'Has pain signals', done: (prospect.pain_signal_count || 0) > 0 },
  ];

  return (
    <motion.div
      variants={contentItemVariants}
      className={cn(
        'rounded-xl border p-4',
        isLight ? 'bg-slate-50 border-slate-200' : 'bg-zinc-800/50 border-zinc-700'
      )}
    >
      <div className="flex items-center justify-between mb-3">
        <span className={cn(
          'text-sm font-medium',
          isLight ? 'text-slate-700' : 'text-zinc-300'
        )}>
          Readiness
        </span>
        <motion.span
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.3, ...springs.bouncy }}
          className={cn(
            'text-2xl font-bold',
            isLight ? 'text-slate-900' : 'text-white'
          )}
        >
          {percentage}%
        </motion.span>
      </div>

      {/* Animated Progress bar */}
      <div className={cn(
        'h-2 rounded-full overflow-hidden mb-4',
        isLight ? 'bg-slate-200' : 'bg-zinc-700'
      )}>
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          transition={{ delay: 0.2, duration: 0.8, ease: [0.25, 0.1, 0.25, 1] }}
          className={cn('h-full rounded-full', colorClasses[color])}
        />
      </div>

      {/* Animated Checklist */}
      <div className="space-y-2">
        {checks.map((check, index) => (
          <motion.div
            key={check.label}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 + index * 0.05, ...springs.quick }}
            className="flex items-center gap-2"
          >
            {check.done ? (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.4 + index * 0.05, ...springs.bouncy }}
              >
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              </motion.div>
            ) : (
              <AlertCircle className={cn(
                'h-4 w-4',
                isLight ? 'text-slate-300' : 'text-zinc-600'
              )} />
            )}
            <span className={cn(
              'text-sm',
              check.done
                ? isLight ? 'text-slate-700' : 'text-zinc-300'
                : isLight ? 'text-slate-400' : 'text-zinc-500'
            )}>
              {check.label}
            </span>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
});

// Quick action button with hover animation
const QuickAction = memo(function QuickAction({
  icon: Icon,
  label,
  onClick,
  variant = 'default',
  isLight,
}: {
  icon: React.ElementType;
  label: string;
  onClick: () => void;
  variant?: 'default' | 'primary';
  isLight: boolean;
}) {
  return (
    <motion.button
      whileHover={{ scale: 1.02, y: -1 }}
      whileTap={{ scale: 0.98 }}
      transition={springs.quick}
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors w-full',
        variant === 'primary'
          ? 'bg-violet-500 text-white hover:bg-violet-600'
          : isLight
            ? 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
    </motion.button>
  );
});

export function ProspectDrawer({
  prospect,
  prospects,
  onClose,
  onNavigate,
  onAction,
}: ProspectDrawerProps) {
  const { theme } = useTheme();
  const isLight = theme === 'light';
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Find current index for navigation
  const currentIndex = prospect
    ? prospects.findIndex((p) => p.id === prospect.id)
    : -1;

  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < prospects.length - 1;

  // Navigate to previous/next prospect
  const goToPrev = useCallback(() => {
    if (hasPrev) {
      onNavigate(prospects[currentIndex - 1].id);
    }
  }, [hasPrev, prospects, currentIndex, onNavigate]);

  const goToNext = useCallback(() => {
    if (hasNext) {
      onNavigate(prospects[currentIndex + 1].id);
    }
  }, [hasNext, prospects, currentIndex, onNavigate]);

  // Keyboard navigation
  useEffect(() => {
    if (!prospect) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement?.tagName === 'INPUT' ||
        document.activeElement?.tagName === 'TEXTAREA'
      ) {
        return;
      }

      switch (e.key) {
        case 'Escape':
          onClose();
          break;
        case 'j':
        case 'ArrowDown':
          e.preventDefault();
          goToNext();
          break;
        case 'k':
        case 'ArrowUp':
          e.preventDefault();
          goToPrev();
          break;
        case 'e':
          if (prospect.email) {
            e.preventDefault();
            onAction('generate_email', prospect.id);
          }
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [prospect, onClose, goToNext, goToPrev, onAction]);

  // Update URL when prospect changes
  useEffect(() => {
    if (prospect) {
      const params = new URLSearchParams(searchParams.toString());
      params.set('selected', prospect.id);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    }
  }, [prospect, pathname, router, searchParams]);

  const readiness = prospect ? calculateReadiness(prospect) : null;

  return (
    <AnimatePresence>
      {prospect && (
        <>
          {/* Animated Backdrop */}
          <motion.div
            variants={backdropVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className={cn(
              'fixed inset-0 z-40',
              isLight ? 'bg-black/10' : 'bg-black/40'
            )}
            onClick={onClose}
          />

          {/* Animated Drawer */}
          <motion.div
            variants={slideRightVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className={cn(
              'fixed right-0 top-0 z-50 h-full w-full sm:w-[420px] flex flex-col',
              'border-l shadow-2xl',
              isLight
                ? 'bg-white border-slate-200'
                : 'bg-zinc-900 border-zinc-800'
            )}
          >
            {/* Animated Header */}
            <motion.div
              variants={headerVariants}
              initial="hidden"
              animate="visible"
              className={cn(
                'flex items-center justify-between p-4 border-b',
                isLight ? 'border-slate-200' : 'border-zinc-800'
              )}
            >
              <div className="flex items-center gap-2">
                {/* Navigation arrows with hover effect */}
                <div className="flex items-center gap-1">
                  <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={goToPrev}
                      disabled={!hasPrev}
                    >
                      <ChevronUp className="h-4 w-4" />
                    </Button>
                  </motion.div>
                  <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={goToNext}
                      disabled={!hasNext}
                    >
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                  </motion.div>
                </div>
                <span className={cn(
                  'text-xs',
                  isLight ? 'text-slate-500' : 'text-zinc-500'
                )}>
                  {currentIndex + 1} of {prospects.length}
                </span>
              </div>

              <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={onClose}
                >
                  <X className="h-4 w-4" />
                </Button>
              </motion.div>
            </motion.div>

            {/* Animated Content */}
            <ScrollArea className="flex-1">
              <motion.div
                variants={contentContainerVariants}
                initial="hidden"
                animate="visible"
                className="p-4 space-y-4"
              >
                {/* Prospect Header */}
                <motion.div variants={contentItemVariants} className="flex items-start gap-4">
                  <motion.div
                    initial={{ scale: 0, rotate: -180 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ delay: 0.1, ...springs.bouncy }}
                    className={cn(
                      'h-14 w-14 rounded-xl flex items-center justify-center text-lg font-semibold flex-shrink-0',
                      isLight ? 'bg-slate-100 text-slate-700' : 'bg-zinc-800 text-white'
                    )}
                  >
                    {prospect.name.charAt(0)}
                  </motion.div>

                  <div className="flex-1 min-w-0">
                    <h2 className={cn(
                      'text-xl font-semibold truncate',
                      isLight ? 'text-slate-900' : 'text-white'
                    )}>
                      {prospect.name}
                    </h2>

                    {prospect.contact_name && (
                      <p className={cn(
                        'text-sm truncate',
                        isLight ? 'text-slate-600' : 'text-zinc-400'
                      )}>
                        {prospect.contact_name}
                        {prospect.contact_title && ` · ${prospect.contact_title}`}
                      </p>
                    )}

                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2, ...springs.snappy }}
                      className="flex items-center gap-2 mt-2"
                    >
                      <Badge className={cn(
                        'text-xs',
                        prospect.tier === 'hot'
                          ? 'bg-red-500/20 text-red-400'
                          : prospect.tier === 'warm'
                            ? 'bg-amber-500/20 text-amber-400'
                            : 'bg-blue-500/20 text-blue-400'
                      )}>
                        {prospect.tier}
                      </Badge>
                      <Badge className={cn(
                        'text-xs',
                        isLight ? 'bg-slate-100 text-slate-600' : 'bg-zinc-800 text-zinc-400'
                      )}>
                        {prospect.stage}
                      </Badge>
                    </motion.div>
                  </div>
                </motion.div>

                {/* Contact Info */}
                <motion.div
                  variants={contentItemVariants}
                  className={cn(
                    'rounded-xl border p-4 space-y-3 overflow-hidden',
                    isLight ? 'bg-white border-slate-200' : 'bg-zinc-800/30 border-zinc-700'
                  )}
                >
                  {prospect.email && (
                    <motion.div
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.25, ...springs.quick }}
                      className="flex items-center gap-3 min-w-0"
                    >
                      <Mail className={cn(
                        'h-4 w-4 flex-shrink-0',
                        isLight ? 'text-slate-400' : 'text-zinc-500'
                      )} />
                      <a
                        href={`mailto:${prospect.email}`}
                        className={cn(
                          'text-sm truncate hover:underline flex-1 min-w-0',
                          isLight ? 'text-slate-700' : 'text-zinc-300'
                        )}
                      >
                        {prospect.email}
                      </a>
                    </motion.div>
                  )}

                  {prospect.phone && (
                    <motion.div
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.3, ...springs.quick }}
                      className="flex items-center gap-3 min-w-0"
                    >
                      <Phone className={cn(
                        'h-4 w-4 flex-shrink-0',
                        isLight ? 'text-slate-400' : 'text-zinc-500'
                      )} />
                      <a
                        href={`tel:${prospect.phone}`}
                        className={cn(
                          'text-sm hover:underline truncate flex-1 min-w-0',
                          isLight ? 'text-slate-700' : 'text-zinc-300'
                        )}
                      >
                        {prospect.phone}
                      </a>
                    </motion.div>
                  )}

                  {prospect.city && (
                    <motion.div
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.35, ...springs.quick }}
                      className="flex items-center gap-3 min-w-0"
                    >
                      <MapPin className={cn(
                        'h-4 w-4 flex-shrink-0',
                        isLight ? 'text-slate-400' : 'text-zinc-500'
                      )} />
                      <span className={cn(
                        'text-sm truncate flex-1 min-w-0',
                        isLight ? 'text-slate-700' : 'text-zinc-300'
                      )}>
                        {prospect.city}{prospect.country && `, ${prospect.country}`}
                      </span>
                    </motion.div>
                  )}

                  {prospect.website && (
                    <motion.div
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.4, ...springs.quick }}
                      className="flex items-center gap-3 min-w-0"
                    >
                      <Globe className={cn(
                        'h-4 w-4 flex-shrink-0',
                        isLight ? 'text-slate-400' : 'text-zinc-500'
                      )} />
                      <a
                        href={prospect.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={cn(
                          'text-sm truncate hover:underline flex-1 min-w-0',
                          isLight ? 'text-blue-600' : 'text-blue-400'
                        )}
                      >
                        {prospect.website.replace(/^https?:\/\//, '')}
                      </a>
                    </motion.div>
                  )}

                  {prospect.linkedin_url && (
                    <motion.div
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.45, ...springs.quick }}
                      className="flex items-center gap-3 min-w-0"
                    >
                      <Linkedin className={cn(
                        'h-4 w-4 flex-shrink-0',
                        isLight ? 'text-slate-400' : 'text-zinc-500'
                      )} />
                      <a
                        href={prospect.linkedin_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={cn(
                          'text-sm truncate hover:underline flex-1 min-w-0',
                          isLight ? 'text-blue-600' : 'text-blue-400'
                        )}
                      >
                        LinkedIn Profile
                      </a>
                    </motion.div>
                  )}

                  {prospect.google_rating && (
                    <motion.div
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.5, ...springs.quick }}
                      className="flex items-center gap-3"
                    >
                      <Star className="h-4 w-4 flex-shrink-0 text-amber-400 fill-amber-400" />
                      <span className={cn(
                        'text-sm',
                        isLight ? 'text-slate-700' : 'text-zinc-300'
                      )}>
                        {prospect.google_rating} ({prospect.google_review_count?.toLocaleString()} reviews)
                      </span>
                    </motion.div>
                  )}
                </motion.div>

                {/* Readiness */}
                <ReadinessIndicator prospect={prospect} isLight={isLight} />

                {/* Quick Actions */}
                <motion.div
                  variants={contentItemVariants}
                  className={cn(
                    'rounded-xl border p-4',
                    isLight ? 'bg-white border-slate-200' : 'bg-zinc-800/30 border-zinc-700'
                  )}
                >
                  <h3 className={cn(
                    'text-sm font-medium mb-3',
                    isLight ? 'text-slate-700' : 'text-zinc-300'
                  )}>
                    Quick Actions
                  </h3>
                  <div className="space-y-2">
                    {readiness && (
                      <QuickAction
                        icon={Send}
                        label={readiness.nextAction.label}
                        onClick={() => onAction(readiness.nextAction.action, prospect.id)}
                        variant="primary"
                        isLight={isLight}
                      />
                    )}
                    <QuickAction
                      icon={MessageSquare}
                      label="View Thread"
                      onClick={() => router.push(`/outreach/inbox?search=${encodeURIComponent(prospect.name)}`)}
                      isLight={isLight}
                    />
                    <QuickAction
                      icon={Calendar}
                      label="Schedule Meeting"
                      onClick={() => onAction('schedule', prospect.id)}
                      isLight={isLight}
                    />
                  </div>
                </motion.div>

                {/* Source Info */}
                {prospect.source && (
                  <motion.div
                    variants={contentItemVariants}
                    className={cn(
                      'rounded-xl border p-4',
                      isLight ? 'bg-slate-50 border-slate-200' : 'bg-zinc-800/30 border-zinc-700'
                    )}
                  >
                    <h3 className={cn(
                      'text-sm font-medium mb-2',
                      isLight ? 'text-slate-700' : 'text-zinc-300'
                    )}>
                      Source
                    </h3>
                    <div className="flex items-center gap-2">
                      <Briefcase className={cn(
                        'h-4 w-4',
                        isLight ? 'text-slate-400' : 'text-zinc-500'
                      )} />
                      <span className={cn(
                        'text-sm',
                        isLight ? 'text-slate-600' : 'text-zinc-400'
                      )}>
                        {prospect.source}
                      </span>
                    </div>
                    {prospect.source_job_title && (
                      <p className={cn(
                        'text-xs mt-2',
                        isLight ? 'text-emerald-600' : 'text-emerald-400'
                      )}>
                        Job: {prospect.source_job_title}
                      </p>
                    )}
                  </motion.div>
                )}
              </motion.div>
            </ScrollArea>

            {/* Animated Footer */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, ...springs.snappy }}
              className={cn(
                'p-4 border-t',
                isLight ? 'border-slate-200 bg-slate-50' : 'border-zinc-800 bg-zinc-900'
              )}
            >
              <Link href={`/prospects/${prospect.id}`}>
                <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                  <Button className="w-full" variant="outline">
                    <ExternalLink className="h-4 w-4 mr-2" />
                    View Full Profile
                  </Button>
                </motion.div>
              </Link>

              {/* Keyboard hints */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4 }}
                className={cn(
                  'flex items-center justify-center gap-4 mt-3 text-xs',
                  isLight ? 'text-slate-400' : 'text-zinc-600'
                )}
              >
                <span className="flex items-center gap-1">
                  <kbd className={cn(
                    'px-1.5 py-0.5 rounded',
                    isLight ? 'bg-slate-200' : 'bg-zinc-800'
                  )}>j</kbd>
                  <kbd className={cn(
                    'px-1.5 py-0.5 rounded',
                    isLight ? 'bg-slate-200' : 'bg-zinc-800'
                  )}>k</kbd>
                  navigate
                </span>
                <span className="flex items-center gap-1">
                  <kbd className={cn(
                    'px-1.5 py-0.5 rounded',
                    isLight ? 'bg-slate-200' : 'bg-zinc-800'
                  )}>e</kbd>
                  email
                </span>
                <span className="flex items-center gap-1">
                  <kbd className={cn(
                    'px-1.5 py-0.5 rounded',
                    isLight ? 'bg-slate-200' : 'bg-zinc-800'
                  )}>esc</kbd>
                  close
                </span>
              </motion.div>
            </motion.div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// Hook for managing drawer state with URL
// NOTE: This hook uses useSearchParams() which requires the component to be wrapped in <Suspense>
export function useProspectDrawer(prospects: Prospect[]) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const selectedId = searchParams.get('selected');
  const selectedProspect = selectedId
    ? prospects.find((p) => p.id === selectedId) || null
    : null;

  const openDrawer = useCallback((prospectId: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('selected', prospectId);
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }, [pathname, router, searchParams]);

  const closeDrawer = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('selected');
    const newUrl = params.toString() ? `${pathname}?${params.toString()}` : pathname;
    router.push(newUrl, { scroll: false });
  }, [pathname, router, searchParams]);

  return {
    selectedProspect,
    openDrawer,
    closeDrawer,
  };
}

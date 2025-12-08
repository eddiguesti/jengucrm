'use client';

import { cn } from '@/lib/utils';
import { useTheme } from '@/contexts/ThemeContext';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';
import { ReactNode } from 'react';

interface MobilePageHeaderProps {
  title: string;
  subtitle?: string;
  action?: {
    icon?: ReactNode;
    label: string;
    onClick: () => void;
  };
  children?: ReactNode;
}

export function MobilePageHeader({
  title,
  subtitle,
  action,
  children,
}: MobilePageHeaderProps) {
  const { theme } = useTheme();
  const isLight = theme === 'light';

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
      className="md:hidden px-4 pt-3 pb-2"
    >
      <div className="flex items-center justify-between">
        <div className="min-w-0 flex-1">
          <motion.h1
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
            className={cn(
              'text-2xl font-bold tracking-tight',
              isLight ? 'text-zinc-900' : 'text-white'
            )}
          >
            {title}
          </motion.h1>
          {subtitle && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.15 }}
              className={cn(
                'text-sm font-medium mt-0.5',
                isLight ? 'text-zinc-500' : 'text-white/50'
              )}
            >
              {subtitle}
            </motion.p>
          )}
        </div>
        {action && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2, type: 'spring', damping: 20 }}
          >
            <Button
              onClick={action.onClick}
              size="sm"
              className={cn(
                'rounded-xl h-9 px-3.5 font-medium shadow-lg',
                'active:scale-95 transition-transform',
                isLight
                  ? 'bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 text-white shadow-blue-500/25'
                  : 'bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 text-white shadow-blue-500/30'
              )}
            >
              {action.icon}
              <span className="ml-1.5">{action.label}</span>
            </Button>
          </motion.div>
        )}
      </div>
      {children}
    </motion.div>
  );
}

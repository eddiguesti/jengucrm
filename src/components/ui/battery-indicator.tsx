'use client';

import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { CheckCircle2, AlertCircle, Clock, Zap } from 'lucide-react';

interface BatteryIndicatorProps {
  percentage: number;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  showPercentage?: boolean;
  animated?: boolean;
  className?: string;
}

/**
 * Battery-style progress indicator showing prospect readiness
 */
export function BatteryIndicator({
  percentage,
  size = 'md',
  showLabel = false,
  showPercentage = true,
  animated = true,
  className,
}: BatteryIndicatorProps) {
  const clampedPercentage = Math.max(0, Math.min(100, percentage));

  // Size configurations
  const sizeConfig = {
    sm: {
      width: 'w-16',
      height: 'h-2',
      tipWidth: 'w-1',
      tipHeight: 'h-1',
      textSize: 'text-[10px]',
      iconSize: 'h-3 w-3',
    },
    md: {
      width: 'w-24',
      height: 'h-3',
      tipWidth: 'w-1.5',
      tipHeight: 'h-1.5',
      textSize: 'text-xs',
      iconSize: 'h-4 w-4',
    },
    lg: {
      width: 'w-32',
      height: 'h-4',
      tipWidth: 'w-2',
      tipHeight: 'h-2',
      textSize: 'text-sm',
      iconSize: 'h-5 w-5',
    },
  };

  const config = sizeConfig[size];

  // Color and glow based on percentage
  const getColors = () => {
    if (clampedPercentage >= 90) {
      return {
        fill: 'bg-gradient-to-r from-emerald-500 to-emerald-400',
        glow: 'shadow-lg shadow-emerald-500/40',
        border: 'border-emerald-500/30',
        text: 'text-emerald-400',
        label: 'Ready',
        Icon: CheckCircle2,
      };
    }
    if (clampedPercentage >= 70) {
      return {
        fill: 'bg-gradient-to-r from-blue-500 to-blue-400',
        glow: 'shadow-lg shadow-blue-500/40',
        border: 'border-blue-500/30',
        text: 'text-blue-400',
        label: 'Almost',
        Icon: Zap,
      };
    }
    if (clampedPercentage >= 50) {
      return {
        fill: 'bg-gradient-to-r from-amber-500 to-amber-400',
        glow: 'shadow-md shadow-amber-500/30',
        border: 'border-amber-500/30',
        text: 'text-amber-400',
        label: 'Enrich',
        Icon: Clock,
      };
    }
    if (clampedPercentage >= 30) {
      return {
        fill: 'bg-gradient-to-r from-orange-500 to-orange-400',
        glow: 'shadow-md shadow-orange-500/30',
        border: 'border-orange-500/30',
        text: 'text-orange-400',
        label: 'Research',
        Icon: AlertCircle,
      };
    }
    return {
      fill: 'bg-gradient-to-r from-zinc-500 to-zinc-400',
      glow: '',
      border: 'border-zinc-600',
      text: 'text-zinc-400',
      label: 'New',
      Icon: AlertCircle,
    };
  };

  const colors = getColors();
  const Icon = colors.Icon;

  return (
    <div className={cn('flex items-center gap-2', className)}>
      {/* Battery Container */}
      <div className="flex items-center">
        {/* Main Battery Body */}
        <div
          className={cn(
            'relative rounded-sm border bg-zinc-900/50 overflow-hidden',
            config.width,
            config.height,
            colors.border
          )}
        >
          {/* Fill Bar */}
          <motion.div
            className={cn(
              'absolute inset-y-0 left-0 rounded-sm',
              colors.fill,
              clampedPercentage >= 90 && colors.glow
            )}
            initial={animated ? { width: 0 } : { width: `${clampedPercentage}%` }}
            animate={{ width: `${clampedPercentage}%` }}
            transition={{
              duration: animated ? 0.8 : 0,
              ease: [0.25, 0.1, 0.25, 1],
            }}
          />

          {/* Shine Effect */}
          <div className="absolute inset-0 bg-gradient-to-b from-white/10 to-transparent" />

          {/* Segment Lines (optional visual detail) */}
          {size !== 'sm' && (
            <div className="absolute inset-0 flex">
              {[25, 50, 75].map((mark) => (
                <div
                  key={mark}
                  className="absolute h-full w-px bg-zinc-700/50"
                  style={{ left: `${mark}%` }}
                />
              ))}
            </div>
          )}
        </div>

        {/* Battery Tip */}
        <div
          className={cn(
            'rounded-r-sm bg-zinc-600',
            config.tipWidth,
            config.tipHeight
          )}
        />
      </div>

      {/* Percentage / Label */}
      {(showPercentage || showLabel) && (
        <div className={cn('flex items-center gap-1', config.textSize, colors.text)}>
          {showLabel && <Icon className={config.iconSize} />}
          {showPercentage && (
            <span className="font-medium tabular-nums">
              {Math.round(clampedPercentage)}%
            </span>
          )}
          {showLabel && !showPercentage && (
            <span className="font-medium">{colors.label}</span>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Compact battery for table rows
 */
export function BatteryCompact({
  percentage,
  className,
}: {
  percentage: number;
  className?: string;
}) {
  const clampedPercentage = Math.max(0, Math.min(100, percentage));

  const getColor = () => {
    if (clampedPercentage >= 90) return 'bg-emerald-500';
    if (clampedPercentage >= 70) return 'bg-blue-500';
    if (clampedPercentage >= 50) return 'bg-amber-500';
    if (clampedPercentage >= 30) return 'bg-orange-500';
    return 'bg-zinc-500';
  };

  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      <div className="relative w-8 h-1.5 rounded-full bg-zinc-800 overflow-hidden">
        <motion.div
          className={cn('absolute inset-y-0 left-0 rounded-full', getColor())}
          initial={{ width: 0 }}
          animate={{ width: `${clampedPercentage}%` }}
          transition={{ duration: 0.5, ease: [0.25, 0.1, 0.25, 1] }}
        />
      </div>
      <span className="text-[10px] font-medium text-zinc-400 tabular-nums w-6">
        {Math.round(clampedPercentage)}%
      </span>
    </div>
  );
}

/**
 * Circular battery/progress ring
 */
export function BatteryRing({
  percentage,
  size = 40,
  strokeWidth = 3,
  showPercentage = true,
  className,
}: {
  percentage: number;
  size?: number;
  strokeWidth?: number;
  showPercentage?: boolean;
  className?: string;
}) {
  const clampedPercentage = Math.max(0, Math.min(100, percentage));
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (clampedPercentage / 100) * circumference;

  const getColor = () => {
    if (clampedPercentage >= 90) return 'stroke-emerald-500';
    if (clampedPercentage >= 70) return 'stroke-blue-500';
    if (clampedPercentage >= 50) return 'stroke-amber-500';
    if (clampedPercentage >= 30) return 'stroke-orange-500';
    return 'stroke-zinc-500';
  };

  const getTextColor = () => {
    if (clampedPercentage >= 90) return 'text-emerald-400';
    if (clampedPercentage >= 70) return 'text-blue-400';
    if (clampedPercentage >= 50) return 'text-amber-400';
    if (clampedPercentage >= 30) return 'text-orange-400';
    return 'text-zinc-400';
  };

  return (
    <div className={cn('relative', className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        {/* Background Circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="currentColor"
          strokeWidth={strokeWidth}
          fill="none"
          className="text-zinc-800"
        />
        {/* Progress Circle */}
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          className={getColor()}
          style={{
            strokeDasharray: circumference,
          }}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 0.8, ease: [0.25, 0.1, 0.25, 1] }}
        />
      </svg>
      {showPercentage && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={cn('text-[10px] font-bold tabular-nums', getTextColor())}>
            {Math.round(clampedPercentage)}
          </span>
        </div>
      )}
    </div>
  );
}

/**
 * Readiness status badge with battery
 */
export function ReadinessBadge({
  percentage,
  label,
  className,
}: {
  percentage: number;
  label?: string;
  className?: string;
}) {
  const clampedPercentage = Math.max(0, Math.min(100, percentage));

  const getStyles = () => {
    if (clampedPercentage >= 90) {
      return {
        bg: 'bg-emerald-500/10 border-emerald-500/20',
        text: 'text-emerald-400',
        defaultLabel: 'Ready',
      };
    }
    if (clampedPercentage >= 70) {
      return {
        bg: 'bg-blue-500/10 border-blue-500/20',
        text: 'text-blue-400',
        defaultLabel: 'Almost',
      };
    }
    if (clampedPercentage >= 50) {
      return {
        bg: 'bg-amber-500/10 border-amber-500/20',
        text: 'text-amber-400',
        defaultLabel: 'Enrich',
      };
    }
    if (clampedPercentage >= 30) {
      return {
        bg: 'bg-orange-500/10 border-orange-500/20',
        text: 'text-orange-400',
        defaultLabel: 'Research',
      };
    }
    return {
      bg: 'bg-zinc-500/10 border-zinc-500/20',
      text: 'text-zinc-400',
      defaultLabel: 'New',
    };
  };

  const styles = getStyles();

  return (
    <div
      className={cn(
        'inline-flex items-center gap-2 px-2 py-1 rounded-md border',
        styles.bg,
        className
      )}
    >
      <BatteryCompact percentage={clampedPercentage} />
      <span className={cn('text-xs font-medium', styles.text)}>
        {label || styles.defaultLabel}
      </span>
    </div>
  );
}

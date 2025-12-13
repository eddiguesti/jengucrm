'use client';

import { useEffect, useRef, useState, memo } from 'react';
import { motion, useSpring, useTransform, useInView } from 'framer-motion';
import { cn } from '@/lib/utils';

interface AnimatedNumberProps {
  value: number;
  duration?: number;
  delay?: number;
  className?: string;
  format?: 'number' | 'percent' | 'compact' | 'currency';
  prefix?: string;
  suffix?: string;
  decimals?: number;
  animateOnView?: boolean;
}

/**
 * AnimatedNumber - A premium animated counter component
 *
 * Features:
 * - Smooth spring-based number interpolation
 * - Multiple format options (number, percent, compact, currency)
 * - Optional animate-on-view trigger
 * - Configurable duration and delay
 */
export const AnimatedNumber = memo(function AnimatedNumber({
  value,
  duration = 1,
  delay = 0,
  className,
  format = 'number',
  prefix = '',
  suffix = '',
  decimals = 0,
  animateOnView = true,
}: AnimatedNumberProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-50px' });
  const [hasAnimated, setHasAnimated] = useState(false);

  // Spring animation for smooth number transitions
  const spring = useSpring(0, {
    stiffness: 100,
    damping: 30,
    duration: duration * 1000,
  });

  // Transform the spring value to the display value
  const display = useTransform(spring, (latest) => {
    return formatNumber(latest, format, decimals);
  });

  // Start animation when in view (or immediately if animateOnView is false)
  useEffect(() => {
    if (animateOnView && !isInView) return;
    if (hasAnimated && animateOnView) return;

    const timer = setTimeout(() => {
      spring.set(value);
      setHasAnimated(true);
    }, delay * 1000);

    return () => clearTimeout(timer);
  }, [value, spring, delay, isInView, animateOnView, hasAnimated]);

  // Update value when it changes (after initial animation)
  useEffect(() => {
    if (hasAnimated || !animateOnView) {
      spring.set(value);
    }
  }, [value, spring, hasAnimated, animateOnView]);

  return (
    <span ref={ref} className={cn('tabular-nums', className)}>
      {prefix}
      <motion.span>{display}</motion.span>
      {suffix}
    </span>
  );
});

/**
 * Format number based on the specified format type
 */
function formatNumber(
  num: number,
  format: 'number' | 'percent' | 'compact' | 'currency',
  decimals: number
): string {
  switch (format) {
    case 'percent':
      return `${num.toFixed(decimals)}%`;

    case 'compact':
      if (num >= 1000000) {
        return `${(num / 1000000).toFixed(1)}M`;
      }
      if (num >= 1000) {
        return `${(num / 1000).toFixed(1)}K`;
      }
      return num.toFixed(decimals);

    case 'currency':
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      }).format(num);

    case 'number':
    default:
      if (decimals > 0) {
        return num.toFixed(decimals);
      }
      return Math.round(num).toLocaleString();
  }
}

/**
 * AnimatedPercentage - Specialized component for percentages with ring indicator
 */
export const AnimatedPercentage = memo(function AnimatedPercentage({
  value,
  size = 'md',
  color = 'violet',
  showLabel = true,
  className,
}: {
  value: number;
  size?: 'sm' | 'md' | 'lg';
  color?: 'violet' | 'emerald' | 'blue' | 'amber' | 'red';
  showLabel?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-20px' });

  const sizeClasses = {
    sm: 'w-12 h-12',
    md: 'w-16 h-16',
    lg: 'w-20 h-20',
  };

  const strokeWidth = {
    sm: 3,
    md: 4,
    lg: 5,
  };

  const textSizes = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base',
  };

  const colorClasses = {
    violet: 'text-violet-500',
    emerald: 'text-emerald-500',
    blue: 'text-blue-500',
    amber: 'text-amber-500',
    red: 'text-red-500',
  };

  const strokeColors = {
    violet: '#8b5cf6',
    emerald: '#10b981',
    blue: '#3b82f6',
    amber: '#f59e0b',
    red: '#ef4444',
  };

  const radius = 45;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.min(Math.max(value, 0), 100);
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  return (
    <div ref={ref} className={cn('relative', sizeClasses[size], className)}>
      <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
        {/* Background circle */}
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth[size]}
          className="text-zinc-800"
        />
        {/* Progress circle */}
        <motion.circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke={strokeColors[color]}
          strokeWidth={strokeWidth[size]}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{
            strokeDashoffset: isInView ? strokeDashoffset : circumference,
          }}
          transition={{
            duration: 1,
            delay: 0.2,
            ease: [0.25, 0.1, 0.25, 1],
          }}
        />
      </svg>
      {showLabel && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={cn('font-bold', textSizes[size], colorClasses[color])}>
            <AnimatedNumber
              value={isInView ? value : 0}
              duration={1}
              delay={0.2}
              suffix="%"
              decimals={0}
              animateOnView={false}
            />
          </span>
        </div>
      )}
    </div>
  );
});

/**
 * CountUp - Simple count-up animation for stats
 */
export const CountUp = memo(function CountUp({
  end,
  start = 0,
  duration = 2,
  delay = 0,
  className,
  formatter,
}: {
  end: number;
  start?: number;
  duration?: number;
  delay?: number;
  className?: string;
  formatter?: (value: number) => string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-50px' });
  const [count, setCount] = useState(start);

  useEffect(() => {
    if (!isInView) return;

    const startTime = Date.now() + delay * 1000;
    const endTime = startTime + duration * 1000;

    const updateCount = () => {
      const now = Date.now();

      if (now < startTime) {
        requestAnimationFrame(updateCount);
        return;
      }

      if (now >= endTime) {
        setCount(end);
        return;
      }

      const progress = (now - startTime) / (duration * 1000);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = start + (end - start) * eased;
      setCount(current);
      requestAnimationFrame(updateCount);
    };

    requestAnimationFrame(updateCount);
  }, [isInView, start, end, duration, delay]);

  const displayValue = formatter
    ? formatter(count)
    : Math.round(count).toLocaleString();

  return (
    <span ref={ref} className={cn('tabular-nums', className)}>
      {displayValue}
    </span>
  );
});

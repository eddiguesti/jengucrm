'use client';

import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { stagger } from "@/lib/animations";

/**
 * Premium Skeleton component with shimmer effect
 */
function Skeleton({
  className,
  shimmer = true,
  ...props
}: React.ComponentProps<"div"> & { shimmer?: boolean }) {
  return (
    <div
      data-slot="skeleton"
      className={cn(
        "relative overflow-hidden rounded-md bg-zinc-800/50",
        shimmer && "before:absolute before:inset-0 before:-translate-x-full before:animate-[shimmer_2s_infinite] before:bg-gradient-to-r before:from-transparent before:via-zinc-700/30 before:to-transparent",
        className
      )}
      {...props}
    />
  );
}

/**
 * Skeleton text line
 */
function SkeletonText({
  lines = 1,
  className,
  lastLineWidth = "60%",
}: {
  lines?: number;
  className?: string;
  lastLineWidth?: string;
}) {
  return (
    <div className={cn("space-y-2", className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className="h-4"
          style={{
            width: i === lines - 1 ? lastLineWidth : "100%",
          }}
        />
      ))}
    </div>
  );
}

/**
 * Skeleton card with header, content, and optional footer
 */
function SkeletonCard({
  className,
  hasHeader = true,
  hasFooter = false,
  lines = 3,
}: {
  className?: string;
  hasHeader?: boolean;
  hasFooter?: boolean;
  lines?: number;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 space-y-4",
        className
      )}
    >
      {hasHeader && (
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
      )}
      <SkeletonText lines={lines} />
      {hasFooter && (
        <div className="flex items-center gap-2 pt-2">
          <Skeleton className="h-8 w-20 rounded-lg" />
          <Skeleton className="h-8 w-20 rounded-lg" />
        </div>
      )}
    </div>
  );
}

/**
 * Skeleton table row
 */
function SkeletonTableRow({
  columns = 4,
  className,
}: {
  columns?: number;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-4 py-3", className)}>
      {Array.from({ length: columns }).map((_, i) => (
        <Skeleton
          key={i}
          className="h-4 flex-1"
          style={{
            maxWidth: i === 0 ? "200px" : i === columns - 1 ? "80px" : undefined,
          }}
        />
      ))}
    </div>
  );
}

/**
 * Skeleton table with multiple rows
 */
function SkeletonTable({
  rows = 5,
  columns = 4,
  className,
}: {
  rows?: number;
  columns?: number;
  className?: string;
}) {
  return (
    <div className={cn("divide-y divide-zinc-800", className)}>
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonTableRow key={i} columns={columns} />
      ))}
    </div>
  );
}

/**
 * Animated skeleton list with stagger effect
 */
function SkeletonList({
  count = 3,
  variant = "card",
  className,
}: {
  count?: number;
  variant?: "card" | "row" | "compact";
  className?: string;
}) {
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: stagger.fast,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.3 },
    },
  };

  if (variant === "card") {
    return (
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className={cn("space-y-4", className)}
      >
        {Array.from({ length: count }).map((_, i) => (
          <motion.div key={i} variants={itemVariants}>
            <SkeletonCard />
          </motion.div>
        ))}
      </motion.div>
    );
  }

  if (variant === "compact") {
    return (
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className={cn("space-y-2", className)}
      >
        {Array.from({ length: count }).map((_, i) => (
          <motion.div
            key={i}
            variants={itemVariants}
            className="flex items-center gap-3 p-2 rounded-lg"
          >
            <Skeleton className="h-8 w-8 rounded-full" />
            <div className="flex-1 space-y-1">
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-2 w-24" />
            </div>
          </motion.div>
        ))}
      </motion.div>
    );
  }

  // Row variant
  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className={cn("divide-y divide-zinc-800", className)}
    >
      {Array.from({ length: count }).map((_, i) => (
        <motion.div key={i} variants={itemVariants}>
          <SkeletonTableRow columns={4} />
        </motion.div>
      ))}
    </motion.div>
  );
}

/**
 * Stats skeleton
 */
function SkeletonStats({
  count = 4,
  className,
}: {
  count?: number;
  className?: string;
}) {
  return (
    <div className={cn("grid grid-cols-2 md:grid-cols-4 gap-4", className)}>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 space-y-2"
        >
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-8 w-16" />
        </div>
      ))}
    </div>
  );
}

export {
  Skeleton,
  SkeletonText,
  SkeletonCard,
  SkeletonTableRow,
  SkeletonTable,
  SkeletonList,
  SkeletonStats,
};

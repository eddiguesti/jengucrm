/**
 * Premium Animation Utilities
 *
 * Centralized animation configurations for consistent,
 * physics-based animations throughout the app.
 */

import type { Transition, Variants } from 'framer-motion';

// ============================================
// SPRING PRESETS
// ============================================

export const springs = {
  /** Gentle, relaxed spring - great for large elements */
  gentle: { type: 'spring', stiffness: 120, damping: 14 } as const,

  /** Snappy, responsive spring - default for most interactions */
  snappy: { type: 'spring', stiffness: 300, damping: 24 } as const,

  /** Bouncy spring - for playful, attention-grabbing animations */
  bouncy: { type: 'spring', stiffness: 400, damping: 10 } as const,

  /** Smooth spring - for subtle, elegant transitions */
  smooth: { type: 'spring', stiffness: 200, damping: 20 } as const,

  /** Quick spring - for micro-interactions */
  quick: { type: 'spring', stiffness: 500, damping: 30 } as const,
} as const;

// ============================================
// DURATION PRESETS
// ============================================

export const durations = {
  instant: 0.1,
  fast: 0.15,
  normal: 0.25,
  slow: 0.4,
  slower: 0.6,
} as const;

// ============================================
// EASING PRESETS
// ============================================

export const easings = {
  /** macOS-style smooth ease */
  smooth: [0.25, 0.1, 0.25, 1] as const,

  /** Ease out - starts fast, ends slow */
  out: [0, 0, 0.2, 1] as const,

  /** Ease in - starts slow, ends fast */
  in: [0.4, 0, 1, 1] as const,

  /** Ease in-out - smooth both ends */
  inOut: [0.4, 0, 0.2, 1] as const,

  /** Anticipate - slight pull back before moving */
  anticipate: [0.36, 0, 0.66, -0.56] as const,

  /** Overshoot - goes past target then settles */
  overshoot: [0.34, 1.56, 0.64, 1] as const,
} as const;

// ============================================
// TRANSITION PRESETS
// ============================================

export const transitions = {
  /** Fast fade for quick state changes */
  fade: { duration: durations.fast, ease: easings.out } as Transition,

  /** Standard transition for most elements */
  default: { duration: durations.normal, ease: easings.smooth } as Transition,

  /** Smooth spring for natural movement */
  spring: springs.snappy as Transition,

  /** Gentle spring for large elements */
  gentleSpring: springs.gentle as Transition,

  /** Quick spring for micro-interactions */
  quickSpring: springs.quick as Transition,

  /** Slow transition for emphasis */
  slow: { duration: durations.slow, ease: easings.smooth } as Transition,
} as const;

// ============================================
// STAGGER CONFIGURATIONS
// ============================================

export const stagger = {
  /** Fast stagger for lists */
  fast: 0.03,

  /** Default stagger timing */
  default: 0.05,

  /** Slower stagger for emphasis */
  slow: 0.08,

  /** Very slow for dramatic effect */
  slower: 0.12,
} as const;

// ============================================
// REUSABLE VARIANTS
// ============================================

/** Fade in/out variants */
export const fadeVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: transitions.fade,
  },
  exit: {
    opacity: 0,
    transition: { duration: durations.fast },
  },
};

/** Fade + slide up variants */
export const fadeUpVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: springs.snappy,
  },
  exit: {
    opacity: 0,
    y: 10,
    transition: { duration: durations.fast },
  },
};

/** Fade + slide down variants */
export const fadeDownVariants: Variants = {
  hidden: { opacity: 0, y: -20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: springs.snappy,
  },
  exit: {
    opacity: 0,
    y: -10,
    transition: { duration: durations.fast },
  },
};

/** Scale + fade variants */
export const scaleVariants: Variants = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: springs.snappy,
  },
  exit: {
    opacity: 0,
    scale: 0.95,
    transition: { duration: durations.fast },
  },
};

/** Slide from right (for drawers/sheets) */
export const slideRightVariants: Variants = {
  hidden: { x: '100%', opacity: 0 },
  visible: {
    x: 0,
    opacity: 1,
    transition: springs.smooth,
  },
  exit: {
    x: '100%',
    opacity: 0,
    transition: { duration: durations.normal, ease: easings.in },
  },
};

/** Slide from left */
export const slideLeftVariants: Variants = {
  hidden: { x: '-100%', opacity: 0 },
  visible: {
    x: 0,
    opacity: 1,
    transition: springs.smooth,
  },
  exit: {
    x: '-100%',
    opacity: 0,
    transition: { duration: durations.normal, ease: easings.in },
  },
};

// ============================================
// LIST/CONTAINER VARIANTS
// ============================================

/** Container variant for staggered children */
export const staggerContainerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: stagger.default,
      delayChildren: 0.1,
    },
  },
  exit: {
    opacity: 0,
    transition: {
      staggerChildren: stagger.fast,
      staggerDirection: -1,
    },
  },
};

/** Fast stagger container */
export const fastStaggerContainerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: stagger.fast,
      delayChildren: 0.05,
    },
  },
};

/** List item variant (pair with staggerContainerVariants) */
export const listItemVariants: Variants = {
  hidden: { opacity: 0, y: 20, scale: 0.95 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: springs.snappy,
  },
  exit: {
    opacity: 0,
    y: -10,
    scale: 0.95,
    transition: { duration: durations.fast },
  },
};

/** Table row variant (subtle) */
export const tableRowVariants: Variants = {
  hidden: { opacity: 0, x: -10 },
  visible: {
    opacity: 1,
    x: 0,
    transition: springs.quick,
  },
};

// ============================================
// MODAL/OVERLAY VARIANTS
// ============================================

/** Backdrop/overlay variant */
export const backdropVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { duration: durations.normal },
  },
  exit: {
    opacity: 0,
    transition: { duration: durations.fast },
  },
};

/** Modal content variant */
export const modalVariants: Variants = {
  hidden: {
    opacity: 0,
    scale: 0.95,
    y: 10,
  },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: springs.snappy,
  },
  exit: {
    opacity: 0,
    scale: 0.95,
    y: 10,
    transition: { duration: durations.fast },
  },
};

/** Command palette variant (scale from center-top) */
export const commandPaletteVariants: Variants = {
  hidden: {
    opacity: 0,
    scale: 0.96,
    y: -10,
  },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: springs.snappy,
  },
  exit: {
    opacity: 0,
    scale: 0.96,
    y: -10,
    transition: { duration: durations.fast },
  },
};

// ============================================
// HOVER/TAP VARIANTS
// ============================================

/** Button hover/tap states */
export const buttonVariants = {
  initial: { scale: 1 },
  hover: { scale: 1.02 },
  tap: { scale: 0.97 },
} as const;

/** Card hover states */
export const cardHoverVariants = {
  initial: { scale: 1, y: 0 },
  hover: {
    scale: 1.01,
    y: -2,
    transition: springs.quick,
  },
} as const;

/** Icon hover states */
export const iconHoverVariants = {
  initial: { scale: 1, rotate: 0 },
  hover: {
    scale: 1.1,
    transition: springs.quick,
  },
  tap: { scale: 0.9 },
} as const;

// ============================================
// SPECIAL EFFECTS
// ============================================

/** Pulse/glow animation */
export const pulseVariants: Variants = {
  initial: { scale: 1, opacity: 1 },
  pulse: {
    scale: [1, 1.05, 1],
    opacity: [1, 0.8, 1],
    transition: {
      duration: 2,
      repeat: Infinity,
      ease: 'easeInOut',
    },
  },
};

/** Shake animation (for errors) */
export const shakeVariants: Variants = {
  initial: { x: 0 },
  shake: {
    x: [0, -10, 10, -10, 10, 0],
    transition: { duration: 0.5 },
  },
};

/** Success checkmark animation */
export const checkmarkVariants: Variants = {
  hidden: { pathLength: 0, opacity: 0 },
  visible: {
    pathLength: 1,
    opacity: 1,
    transition: {
      pathLength: { duration: 0.3, ease: 'easeOut' },
      opacity: { duration: 0.1 },
    },
  },
};

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Generate stagger container variants with custom timing
 */
export function createStaggerContainer(
  staggerDelay: number = stagger.default,
  delayChildren: number = 0.1
): Variants {
  return {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: staggerDelay,
        delayChildren,
      },
    },
  };
}

/**
 * Generate list item variants with custom animation
 */
export function createListItem(
  yOffset: number = 20,
  useScale: boolean = true
): Variants {
  return {
    hidden: {
      opacity: 0,
      y: yOffset,
      ...(useScale && { scale: 0.95 }),
    },
    visible: {
      opacity: 1,
      y: 0,
      ...(useScale && { scale: 1 }),
      transition: springs.snappy,
    },
  };
}

/**
 * Create a delay for sequential animations
 */
export function withDelay(delay: number, transition: Transition = transitions.default): Transition {
  return {
    ...transition,
    delay,
  };
}

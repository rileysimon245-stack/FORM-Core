/**
 * Centralized Animation Presets & Timing Constants for FORM
 * Tailored for Android Native feel: responsive 180ms-280ms transitions,
 * authentic Android decelerate / standard cubic-bezier curves, and tactile feedback.
 */

// Android standard cubic-bezier curves (Material 3 standard and decelerate)
export const ANDROID_EASING = {
  // Standard Material 3 curve for elements moving on screen
  standard: [0.2, 0.0, 0, 1.0] as const,
  // Decelerate curve for enter transitions (snappy start, gentle settle)
  decelerate: [0.0, 0.0, 0.2, 1.0] as const,
  // Accelerate curve for exit transitions
  accelerate: [0.3, 0.0, 1.0, 1.0] as const,
  // Natural bouncy spring-like curve for tactile buttons
  expressive: [0.16, 1, 0.3, 1.0] as const,
};

// Durations within the requested 180ms - 280ms range
export const ANIMATION_DURATIONS = {
  instant: 0.12, // 120ms for quick tap feedback
  fast: 0.18,    // 180ms for buttons and micro-interactions
  normal: 0.22,  // 220ms for cards, tabs, and lists
  sheet: 0.26,   // 260ms for modals and bottom sheets
  smooth: 0.28,  // 280ms for large layout shifts
};

// Reusable Framer Motion Variants

/**
 * Tap feedback for buttons and clickable chips
 * Provides tactile scale without layout jumping
 */
export const androidTapFeedback = {
  scale: 0.955,
  transition: {
    duration: ANIMATION_DURATIONS.instant,
    ease: ANDROID_EASING.expressive,
  },
};

export const androidCardTap = {
  scale: 0.985,
  transition: {
    duration: ANIMATION_DURATIONS.fast,
    ease: ANDROID_EASING.standard,
  },
};

/**
 * Screen & Tab transitions
 */
export const tabContentVariants = {
  initial: { opacity: 0, y: 8, scale: 0.995 },
  animate: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      duration: ANIMATION_DURATIONS.normal,
      ease: ANDROID_EASING.decelerate,
    },
  },
  exit: {
    opacity: 0,
    y: -6,
    scale: 0.995,
    transition: {
      duration: ANIMATION_DURATIONS.fast,
      ease: ANDROID_EASING.accelerate,
    },
  },
};

/**
 * Modal & Bottom Sheet Transitions
 */
export const modalBackdropVariants = {
  initial: { opacity: 0 },
  animate: {
    opacity: 1,
    transition: {
      duration: ANIMATION_DURATIONS.fast,
      ease: ANDROID_EASING.decelerate,
    },
  },
  exit: {
    opacity: 0,
    transition: {
      duration: ANIMATION_DURATIONS.fast,
      ease: ANDROID_EASING.accelerate,
    },
  },
};

export const modalDialogVariants = {
  initial: { opacity: 0, scale: 0.94, y: 22 },
  animate: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: {
      duration: ANIMATION_DURATIONS.sheet,
      ease: ANDROID_EASING.expressive,
    },
  },
  exit: {
    opacity: 0,
    scale: 0.96,
    y: 16,
    transition: {
      duration: ANIMATION_DURATIONS.fast,
      ease: ANDROID_EASING.accelerate,
    },
  },
};

export const bottomSheetVariants = {
  initial: { y: '100%', opacity: 0.5 },
  animate: {
    y: 0,
    opacity: 1,
    transition: {
      duration: ANIMATION_DURATIONS.sheet,
      ease: ANDROID_EASING.expressive,
    },
  },
  exit: {
    y: '100%',
    opacity: 0.3,
    transition: {
      duration: ANIMATION_DURATIONS.fast,
      ease: ANDROID_EASING.accelerate,
    },
  },
};

/**
 * Staggered lists (e.g. exercises, days, programs)
 */
export const staggerListContainer = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.04,
      delayChildren: 0.02,
    },
  },
};

export const staggerListItem = {
  hidden: { opacity: 0, y: 8 },
  show: {
    opacity: 1,
    y: 0,
    transition: {
      duration: ANIMATION_DURATIONS.normal,
      ease: ANDROID_EASING.decelerate,
    },
  },
};

/**
 * Interactive set checkmark pop
 */
export const checkmarkPopVariants = {
  initial: { scale: 0.7, opacity: 0 },
  animate: {
    scale: [0.7, 1.25, 1],
    opacity: 1,
    transition: {
      duration: ANIMATION_DURATIONS.normal,
      ease: ANDROID_EASING.expressive,
    },
  },
  exit: {
    scale: 0.6,
    opacity: 0,
    transition: {
      duration: ANIMATION_DURATIONS.fast,
    },
  },
};

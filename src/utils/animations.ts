/**
 * Centralized Animation Presets for FORM — ZERO ANIMATION MODE
 * Per user requirement #1: ALL animations, transitions, scaling, and fades are completely disabled.
 */

export const ANDROID_EASING = {
  standard: [0, 0, 1, 1] as const,
  decelerate: [0, 0, 1, 1] as const,
  accelerate: [0, 0, 1, 1] as const,
  expressive: [0, 0, 1, 1] as const,
};

export const ANIMATION_DURATIONS = {
  instant: 0,
  fast: 0,
  normal: 0,
  sheet: 0,
  smooth: 0,
};

export const androidTapFeedback = {
  scale: 1,
  transition: { duration: 0 },
};

export const androidCardTap = {
  scale: 1,
  transition: { duration: 0 },
};

export const tabContentVariants = {
  initial: { opacity: 1, y: 0, scale: 1 },
  animate: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0 },
  },
  exit: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0 },
  },
};

export const modalBackdropVariants = {
  initial: { opacity: 1 },
  animate: {
    opacity: 1,
    transition: { duration: 0 },
  },
  exit: {
    opacity: 1,
    transition: { duration: 0 },
  },
};

export const modalDialogVariants = {
  initial: { opacity: 1, scale: 1, y: 0 },
  animate: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { duration: 0 },
  },
  exit: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { duration: 0 },
  },
};

export const bottomSheetVariants = {
  initial: { y: 0, opacity: 1 },
  animate: {
    y: 0,
    opacity: 1,
    transition: { duration: 0 },
  },
  exit: {
    y: 0,
    opacity: 1,
    transition: { duration: 0 },
  },
};

export const staggerListContainer = {
  hidden: { opacity: 1 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0, delayChildren: 0 },
  },
};

export const staggerListItem = {
  hidden: { opacity: 1, y: 0 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0 },
  },
};

export const checkmarkPopVariants = {
  initial: { scale: 1, opacity: 1 },
  animate: {
    scale: 1,
    opacity: 1,
    transition: { duration: 0 },
  },
  exit: {
    scale: 1,
    opacity: 1,
    transition: { duration: 0 },
  },
};

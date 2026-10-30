import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  ANDROID_EASING,
  ANIMATION_DURATIONS,
  androidTapFeedback,
  androidCardTap,
  modalBackdropVariants,
  modalDialogVariants,
  bottomSheetVariants,
  tabContentVariants,
  staggerListContainer,
  staggerListItem,
} from '../utils/animations';

interface AnimationContextValue {
  isMotionReduced: boolean;
  toggleReducedMotion: () => void;
  durations: typeof ANIMATION_DURATIONS;
  easings: typeof ANDROID_EASING;
  variants: {
    tap: typeof androidTapFeedback;
    cardTap: typeof androidCardTap;
    modalBackdrop: typeof modalBackdropVariants;
    modalDialog: typeof modalDialogVariants;
    bottomSheet: typeof bottomSheetVariants;
    tabContent: typeof tabContentVariants;
    staggerContainer: typeof staggerListContainer;
    staggerItem: typeof staggerListItem;
  };
}

const AnimationContext = createContext<AnimationContextValue | null>(null);

export const AnimationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isMotionReduced, setIsMotionReduced] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return (
        window.localStorage.getItem('form_reduced_motion') === 'true' ||
        window.matchMedia('(prefers-reduced-motion: reduce)').matches
      );
    }
    return false;
  });

  useEffect(() => {
    try {
      localStorage.setItem('form_reduced_motion', String(isMotionReduced));
    } catch {
      // ignore
    }
  }, [isMotionReduced]);

  const toggleReducedMotion = () => {
    setIsMotionReduced((prev) => !prev);
  };

  const value: AnimationContextValue = {
    isMotionReduced,
    toggleReducedMotion,
    durations: ANIMATION_DURATIONS,
    easings: ANDROID_EASING,
    variants: {
      tap: androidTapFeedback,
      cardTap: androidCardTap,
      modalBackdrop: modalBackdropVariants,
      modalDialog: modalDialogVariants,
      bottomSheet: bottomSheetVariants,
      tabContent: tabContentVariants,
      staggerContainer: staggerListContainer,
      staggerItem: staggerListItem,
    },
  };

  return <AnimationContext.Provider value={value}>{children}</AnimationContext.Provider>;
};

export const useAppAnimations = (): AnimationContextValue => {
  const ctx = useContext(AnimationContext);
  if (!ctx) {
    // Graceful fallback with standard presets if used outside provider
    return {
      isMotionReduced: false,
      toggleReducedMotion: () => {},
      durations: ANIMATION_DURATIONS,
      easings: ANDROID_EASING,
      variants: {
        tap: androidTapFeedback,
        cardTap: androidCardTap,
        modalBackdrop: modalBackdropVariants,
        modalDialog: modalDialogVariants,
        bottomSheet: bottomSheetVariants,
        tabContent: tabContentVariants,
        staggerContainer: staggerListContainer,
        staggerItem: staggerListItem,
      },
    };
  }
  return ctx;
};

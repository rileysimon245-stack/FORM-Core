import React, { useRef, useEffect, useCallback } from 'react';
import { useAppAnimations } from '../context/AnimationContext';

interface ElasticScrollProps {
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
  onScroll?: (e: React.UIEvent<HTMLDivElement>) => void;
  maxPull?: number; // max pixels of stretch at boundaries
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
}

/**
 * Authentic iOS-Style Elastic Momentum & Rubber-Band Scrolling with Native Android Fluidity:
 * - Fluid, unhindered vertical scrolling through all page content with native fling inertia
 * - Zero artificial stops or gesture lockups
 * - Tactile rubber-band spring curve at top & bottom boundaries
 * - Horizontal swipe detection for tab switching (guaranteed no interference with vertical scrolling)
 * - Automatic spring bounce-back upon boundary release
 * - Strictly hides all scrollbars
 */
export const ElasticScroll: React.FC<ElasticScrollProps> = ({
  children,
  className = '',
  contentClassName = '',
  onScroll,
  maxPull = 90,
  onSwipeLeft,
  onSwipeRight,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const { isMotionReduced } = useAppAnimations();

  // Physics animation state
  const animFrameRef = useRef<number | null>(null);
  const currentOffsetRef = useRef<number>(0);
  const velocityRef = useRef<number>(0);

  // Touch tracking state
  const isInteractingRef = useRef<boolean>(false);
  const startXRef = useRef<number>(0);
  const startYRef = useRef<number>(0);
  const lastTouchYRef = useRef<number>(0);
  const directionLockedRef = useRef<'none' | 'vertical' | 'horizontal'>('none');
  const isRubberBandingRef = useRef<boolean>(false);

  // Apple iOS rubber-band resistance curve
  const computeRubberBand = useCallback(
    (delta: number): number => {
      const sign = delta < 0 ? -1 : 1;
      const absDelta = Math.abs(delta);
      const dampened = sign * (maxPull * (1 - 1 / ((absDelta * 0.45) / maxPull + 1)));
      return dampened;
    },
    [maxPull]
  );

  // Spring bounce-back to zero
  const startSpringAnimation = useCallback(
    (initialVelocity = 0) => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }

      velocityRef.current = initialVelocity;
      let lastTime = performance.now();
      const springK = 0.055; // tension
      const damping = 0.22; // friction

      const step = (now: number) => {
        const dt = Math.min((now - lastTime) / 16.667, 2.0);
        lastTime = now;

        const currentY = currentOffsetRef.current;
        const springForce = -springK * currentY;
        const dampingForce = -damping * velocityRef.current;
        const accel = springForce + dampingForce;

        velocityRef.current += accel * dt;
        currentOffsetRef.current += velocityRef.current * dt;

        if (Math.abs(currentOffsetRef.current) < 0.3 && Math.abs(velocityRef.current) < 0.25) {
          currentOffsetRef.current = 0;
          velocityRef.current = 0;
          if (contentRef.current) {
            contentRef.current.style.transform = 'translate3d(0, 0px, 0)';
          }
          animFrameRef.current = null;
          return;
        }

        if (contentRef.current) {
          contentRef.current.style.transform = `translate3d(0, ${currentOffsetRef.current.toFixed(2)}px, 0)`;
        }

        animFrameRef.current = requestAnimationFrame(step);
      };

      animFrameRef.current = requestAnimationFrame(step);
    },
    []
  );

  const stopSpring = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    const content = contentRef.current;
    if (!container || !content) return;

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      stopSpring();

      // Reset any active transform immediately
      if (currentOffsetRef.current !== 0) {
        currentOffsetRef.current = 0;
        content.style.transform = 'translate3d(0, 0px, 0)';
      }

      const touch = e.touches[0];
      isInteractingRef.current = true;
      startXRef.current = touch.clientX;
      startYRef.current = touch.clientY;
      lastTouchYRef.current = touch.clientY;
      directionLockedRef.current = 'none';
      isRubberBandingRef.current = false;
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isInteractingRef.current || e.touches.length !== 1) return;

      const touch = e.touches[0];
      const currentX = touch.clientX;
      const currentY = touch.clientY;
      const totalDX = currentX - startXRef.current;
      const totalDY = currentY - startYRef.current;
      lastTouchYRef.current = currentY;

      // Determine gesture direction on initial movement
      if (directionLockedRef.current === 'none') {
        const absX = Math.abs(totalDX);
        const absY = Math.abs(totalDY);

        if (absX > 10 && absX > absY * 1.35) {
          // Locked as horizontal swipe (for page tabs or calendar navigation)
          directionLockedRef.current = 'horizontal';
          return;
        } else if (absY > 6) {
          // Locked as vertical scroll
          directionLockedRef.current = 'vertical';
        } else {
          // Movement below threshold, let browser handle
          return;
        }
      }

      // If user is swiping horizontally, do NOT interfere with vertical scrolling or rubber-band
      if (directionLockedRef.current === 'horizontal') {
        return;
      }

      // VERTICAL SCROLL HANDLING:
      const scrollTop = container.scrollTop;
      const maxScroll = Math.max(0, container.scrollHeight - container.clientHeight);

      // Boundary Top: Pulling DOWN when already at top
      if (scrollTop <= 0 && totalDY > 0) {
        if (e.cancelable) e.preventDefault();
        isRubberBandingRef.current = true;
        const elasticY = computeRubberBand(totalDY);
        currentOffsetRef.current = elasticY;
        content.style.transform = `translate3d(0, ${elasticY.toFixed(2)}px, 0)`;
        return;
      }

      // Boundary Bottom: Pulling UP when already at bottom
      if (maxScroll > 15 && scrollTop >= maxScroll - 2 && totalDY < 0) {
        if (e.cancelable) e.preventDefault();
        isRubberBandingRef.current = true;
        // Dampened resistance past bottom
        const pullPastBottom = totalDY;
        const elasticY = computeRubberBand(pullPastBottom);
        currentOffsetRef.current = elasticY;
        content.style.transform = `translate3d(0, ${elasticY.toFixed(2)}px, 0)`;
        return;
      }

      // Normal scroll range (inside the page):
      // Clean up rubber band if returning from boundary
      if (isRubberBandingRef.current) {
        isRubberBandingRef.current = false;
        currentOffsetRef.current = 0;
        content.style.transform = 'translate3d(0, 0px, 0)';
      }
      // DO NOT call preventDefault here!
      // Native Android / iOS scroll compositor handles natural inertial scrolling
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (!isInteractingRef.current) return;
      isInteractingRef.current = false;

      // Handle horizontal swipe trigger on end
      if (directionLockedRef.current === 'horizontal' && e.changedTouches.length > 0) {
        const endTouch = e.changedTouches[0];
        const finalDX = endTouch.clientX - startXRef.current;
        const finalDY = endTouch.clientY - startYRef.current;

        // Require clean horizontal swipe: > 45px distance and > 1.4x vertical delta
        if (Math.abs(finalDX) > 45 && Math.abs(finalDX) > Math.abs(finalDY) * 1.4) {
          if (finalDX < 0) {
            onSwipeLeft?.();
          } else {
            onSwipeRight?.();
          }
        }
      }

      // If rubber-band was stretched, bounce back smoothly
      if (isRubberBandingRef.current || Math.abs(currentOffsetRef.current) > 0.5) {
        isRubberBandingRef.current = false;
        startSpringAnimation(0);
      }

      directionLockedRef.current = 'none';
    };

    // Wheel boundary bounce for desktop trackpads & mice
    const handleWheel = (e: WheelEvent) => {
      const scrollTop = container.scrollTop;
      const maxScroll = Math.max(0, container.scrollHeight - container.clientHeight);

      if (scrollTop <= 0 && e.deltaY < 0) {
        stopSpring();
        const impulse = -e.deltaY * 0.18;
        currentOffsetRef.current = Math.min(maxPull * 0.65, currentOffsetRef.current + impulse);
        content.style.transform = `translate3d(0, ${currentOffsetRef.current.toFixed(2)}px, 0)`;
        startSpringAnimation(0);
      } else if (maxScroll > 15 && scrollTop >= maxScroll - 1 && e.deltaY > 0) {
        stopSpring();
        const impulse = -e.deltaY * 0.18;
        currentOffsetRef.current = Math.max(-maxPull * 0.65, currentOffsetRef.current + impulse);
        content.style.transform = `translate3d(0, ${currentOffsetRef.current.toFixed(2)}px, 0)`;
        startSpringAnimation(0);
      }
    };

    container.addEventListener('touchstart', handleTouchStart, { passive: true });
    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    container.addEventListener('touchend', handleTouchEnd, { passive: true });
    container.addEventListener('touchcancel', handleTouchEnd, { passive: true });
    container.addEventListener('wheel', handleWheel, { passive: true });

    return () => {
      stopSpring();
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
      container.removeEventListener('touchcancel', handleTouchEnd);
      container.removeEventListener('wheel', handleWheel);
    };
  }, [computeRubberBand, maxPull, startSpringAnimation, stopSpring, onSwipeLeft, onSwipeRight]);

  return (
    <div
      ref={containerRef}
      onScroll={onScroll}
      className={`overflow-y-auto overscroll-y-contain relative no-scrollbar ${className}`}
      style={{
        WebkitOverflowScrolling: 'touch',
        touchAction: 'pan-y', // Explicitly allow native vertical scrolling while enabling horizontal gesture detection
        scrollbarWidth: 'none',
        msOverflowStyle: 'none',
      }}
    >
      <div
        ref={contentRef}
        className={`w-full will-change-transform ${contentClassName}`}
      >
        {children}
      </div>
    </div>
  );
};

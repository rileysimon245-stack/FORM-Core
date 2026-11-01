import { useEffect, useRef } from 'react';

interface ElasticScrollOptions {
  maxStretch?: number; // Maximum stretch in pixels (default 48px)
  disabled?: boolean;
}

/**
 * useElasticScroll hook
 * Implements authentic iOS-like rubber-band pull & snapback at scroll boundaries
 * for Android / mobile touch screens, without blocking native 60fps inertia.
 */
export function useElasticScroll<T extends HTMLElement = HTMLDivElement>(
  options: ElasticScrollOptions = {}
) {
  const containerRef = useRef<T>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const { maxStretch = 46, disabled = false } = options;

  useEffect(() => {
    const container = containerRef.current;
    const content = contentRef.current;
    if (!container || !content || disabled) return;

    // Check system prefers-reduced-motion
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }

    let startY = 0;
    let startX = 0;
    let isTracking = false;
    let isBoundaryPull = false;
    let boundaryDirection: 'top' | 'bottom' | null = null;
    let initialScrollTop = 0;

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      const touch = e.touches[0];
      startY = touch.clientY;
      startX = touch.clientX;
      initialScrollTop = container.scrollTop;
      isTracking = true;
      isBoundaryPull = false;
      boundaryDirection = null;

      // Remove transition while touching
      content.style.transition = 'none';
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isTracking || e.touches.length !== 1) return;
      const touch = e.touches[0];
      const deltaY = touch.clientY - startY;
      const deltaX = touch.clientX - startX;

      // Disregard horizontal swipes
      if (Math.abs(deltaX) > Math.abs(deltaY) && !isBoundaryPull) {
        return;
      }

      const scrollTop = container.scrollTop;
      const maxScroll = container.scrollHeight - container.clientHeight;

      // Check if at upper bound and pulling down
      if (scrollTop <= 1 && deltaY > 0) {
        isBoundaryPull = true;
        boundaryDirection = 'top';
        const pull = deltaY;
        // Natural logarithm / power damping curve
        const damped = Math.min(maxStretch, Math.pow(pull, 0.72) * 0.45);
        content.style.transform = `translate3d(0, ${damped}px, 0)`;
      }
      // Check if at lower bound and pulling up
      else if (scrollTop >= maxScroll - 1 && deltaY < 0) {
        isBoundaryPull = true;
        boundaryDirection = 'bottom';
        const pull = Math.abs(deltaY);
        const damped = Math.min(maxStretch, Math.pow(pull, 0.72) * 0.45);
        content.style.transform = `translate3d(0, -${damped}px, 0)`;
      } else {
        if (isBoundaryPull) {
          isBoundaryPull = false;
          content.style.transform = 'translate3d(0, 0, 0)';
        }
      }
    };

    const handleTouchEnd = () => {
      if (!isTracking) return;
      isTracking = false;

      if (isBoundaryPull) {
        isBoundaryPull = false;
        // Smooth authentic decelerate snapback
        content.style.transition = 'transform 320ms cubic-bezier(0.16, 1, 0.3, 1)';
        content.style.transform = 'translate3d(0, 0, 0)';

        const timer = setTimeout(() => {
          content.style.transition = 'none';
        }, 330);

        return () => clearTimeout(timer);
      }
    };

    container.addEventListener('touchstart', handleTouchStart, { passive: true });
    container.addEventListener('touchmove', handleTouchMove, { passive: true });
    container.addEventListener('touchend', handleTouchEnd, { passive: true });
    container.addEventListener('touchcancel', handleTouchEnd, { passive: true });

    return () => {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
      container.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, [disabled, maxStretch]);

  return { containerRef, contentRef };
}

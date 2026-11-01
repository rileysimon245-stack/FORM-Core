import React from 'react';
import { useElasticScroll } from '../../utils/useElasticScroll';

interface ElasticScrollContainerProps {
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
  disabled?: boolean;
}

export const ElasticScrollContainer: React.FC<ElasticScrollContainerProps> = ({
  children,
  className = '',
  contentClassName = '',
  disabled = false,
}) => {
  const { containerRef, contentRef } = useElasticScroll<HTMLDivElement>({ disabled });

  return (
    <div
      ref={containerRef}
      className={`w-full overflow-y-auto overscroll-contain overflow-x-hidden ${className}`}
      style={{
        WebkitOverflowScrolling: 'touch',
      }}
    >
      <div ref={contentRef} className={`w-full ${contentClassName}`}>
        {children}
      </div>
    </div>
  );
};

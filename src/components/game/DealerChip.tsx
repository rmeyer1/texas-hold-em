import React from 'react';

interface DealerChipProps {
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'custom';
  top?: string;
  right?: string;
  bottom?: string;
  left?: string;
  isMobile?: boolean;
}

export const DealerChip: React.FC<DealerChipProps> = ({ 
  position = 'top-right',
  top,
  right,
  bottom,
  left,
  isMobile = false
}) => {
  // Define positioning based on the position prop or custom values
  const getPositionStyles = (): React.CSSProperties => {
    if (position === 'custom' && (top || right || bottom || left)) {
      return {
        top,
        right,
        bottom,
        left,
      };
    }

    // Default positions
    switch (position) {
      case 'top-left':
        return { top: '-8px', left: '-8px' };
      case 'top-right':
        return { top: '-8px', right: '-8px' };
      case 'bottom-left':
        return { bottom: '-8px', left: '-8px' };
      case 'bottom-right':
        return { bottom: '-8px', right: '-8px' };
      default:
        return { top: '-8px', right: '-8px' };
    }
  };

  return (
    <div 
      className={`
        absolute 
        ${isMobile ? 'w-4 h-4' : 'w-5 h-5'}
        bg-white 
        rounded-full 
        flex 
        items-center 
        justify-center 
        ${isMobile ? 'text-[8px]' : 'text-[10px]'}
        font-bold 
        text-blue-900 
        border 
        border-blue-900
        shadow-md
        z-30
      `}
      style={getPositionStyles()}
    >
      D
    </div>
  );
}; 
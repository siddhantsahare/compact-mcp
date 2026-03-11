import React, { useState } from 'react';

interface ActionButtonProps {
  label: string;
  onClick: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  isDisabled?: boolean;
}

const SIZE_CLASSES = {
  sm: 'px-2 py-1 text-sm',
  md: 'px-4 py-2 text-base',
  lg: 'px-6 py-3 text-lg',
};

const VARIANT_CLASSES = {
  primary: 'bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500',
  secondary: 'bg-gray-200 text-gray-900 hover:bg-gray-300 focus:ring-gray-400',
  danger: 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500',
};

export function ActionButton({
  label,
  onClick,
  variant = 'primary',
  size = 'md',
  isDisabled = false,
}: ActionButtonProps) {
  const [isPressed, setIsPressed] = useState(false);

  const handleClick = () => {
    if (isDisabled) return;
    setIsPressed(true);
    onClick();
    setTimeout(() => setIsPressed(false), 200);
  };

  return (
    <button
      type="button"
      disabled={isDisabled}
      className={`
        inline-flex items-center justify-center rounded-md font-medium
        focus:outline-none focus:ring-2 focus:ring-offset-2
        transition-all duration-150
        ${SIZE_CLASSES[size]}
        ${isDisabled
          ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
          : `${VARIANT_CLASSES[variant]} ${isPressed ? 'scale-95 opacity-80' : 'scale-100 opacity-100'}`
        }
      `}
      onClick={handleClick}
    >
      {label}
    </button>
  );
}

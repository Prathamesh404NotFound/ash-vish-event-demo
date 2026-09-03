import React from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive' | 'google';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  children: React.ReactNode;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    'bg-[#D4AF37] hover:bg-[#B8962E] text-black font-bold',
  secondary:
    'bg-[#1C1C1C] hover:bg-[#262626] border border-white/10 text-white font-semibold',
  ghost:
    'bg-white/5 hover:bg-white/10 text-gray-300 font-bold border border-white/10',
  destructive:
    'bg-red-500/10 text-red-300 font-bold hover:bg-red-500 hover:text-white border border-red-500/20 hover:border-red-500',
  google:
    'bg-[#1C1C1C] hover:bg-[#262626] border border-white/10 text-white font-semibold',
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: 'px-4 py-2 rounded-xl text-xs',
  md: 'px-5 py-2.5 rounded-xl text-xs sm:text-sm',
  lg: 'px-7 py-3.5 rounded-2xl text-sm sm:text-base',
};

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  disabled,
  className = '',
  children,
  ...props
}) => {
  return (
    <button
      disabled={disabled}
      className={`
        inline-flex items-center justify-center gap-2
        transition-all duration-200 cursor-pointer
        disabled:opacity-50 disabled:cursor-not-allowed
        ${variantStyles[variant]}
        ${sizeStyles[size]}
        ${fullWidth ? 'w-full' : ''}
        ${className}
      `}
      {...props}
    >
      {children}
    </button>
  );
};

export default Button;

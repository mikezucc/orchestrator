import { useEffect } from 'react';

export interface ToastProps {
  id: string;
  type: 'error' | 'success' | 'info';
  message: string;
  onClose: () => void;
  duration?: number;
}

export default function Toast({ id, type, message, onClose, duration = 5000 }: ToastProps) {
  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(onClose, duration);
      return () => clearTimeout(timer);
    }
  }, [duration, onClose]);

  const getTypeStyles = () => {
    switch (type) {
      case 'error':
        return 'border-red-600 dark:border-te-orange text-red-600 dark:text-te-orange';
      case 'success':
        return 'border-green-600 dark:border-te-yellow text-green-600 dark:text-te-yellow';
      case 'info':
        return 'border-te-gray-600 dark:border-te-gray-400 text-te-gray-600 dark:text-te-gray-400';
    }
  };

  const getIcon = () => {
    switch (type) {
      case 'error':
        return (
          <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      case 'success':
        return (
          <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      case 'info':
        return (
          <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
    }
  };

  return (
    <div
      className={`
        flex items-center gap-3 p-4
        bg-white dark:bg-te-gray-900
        border-2 ${getTypeStyles()}
        font-mono text-sm
        animate-slide-in
        shadow-lg dark:shadow-2xl
      `}
      role="alert"
    >
      {getIcon()}
      <p className="flex-1 uppercase tracking-wider">{message}</p>
      <button
        onClick={onClose}
        className="text-current hover:text-te-gray-900 dark:hover:text-te-yellow transition-colors"
        aria-label="Close"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
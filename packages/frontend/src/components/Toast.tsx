import { Toast as ToastType } from '../hooks/useToast';

interface ToastProps {
  toast: ToastType;
  onRemove: (id: string) => void;
}

export default function Toast({ toast, onRemove }: ToastProps) {
  const getToastStyles = () => {
    switch (toast.type) {
      case 'success':
        return 'bg-green-50 dark:bg-te-gray-900 border-green-500 dark:border-te-yellow text-green-800 dark:text-te-yellow';
      case 'error':
        return 'bg-red-50 dark:bg-te-gray-900 border-red-500 dark:border-te-orange text-red-800 dark:text-te-orange';
      default:
        return 'bg-te-gray-100 dark:bg-te-gray-900 border-te-gray-300 dark:border-te-gray-700 text-te-gray-900 dark:text-te-gray-100';
    }
  };

  const getIcon = () => {
    switch (toast.type) {
      case 'success':
        return (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        );
      case 'error':
        return (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        );
      default:
        return (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
    }
  };

  return (
    <div
      className={`flex items-center justify-between p-4 border ${getToastStyles()} animate-slide-in`}
    >
      <div className="flex items-center space-x-3">
        {getIcon()}
        <p className="text-sm font-medium">{toast.message}</p>
      </div>
      <button
        onClick={() => onRemove(toast.id)}
        className="ml-4 text-current opacity-70 hover:opacity-100 transition-opacity"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
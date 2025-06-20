interface VMStatusBadgeProps {
  status: 'running' | 'stopped' | 'terminated' | 'pending';
}

export default function VMStatusBadge({ status }: VMStatusBadgeProps) {
  const getStatusConfig = () => {
    switch (status) {
      case 'running':
        return {
          label: 'Running',
          className: 'badge-success',
          icon: (
            <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          ),
        };
      case 'stopped':
        return {
          label: 'Stopped',
          className: 'badge-error',
          icon: (
            <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          ),
        };
      case 'pending':
        return {
          label: 'Pending',
          className: 'badge-neutral',
          icon: (
            <svg className="w-3 h-3 mr-1 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          ),
        };
      case 'terminated':
      default:
        return {
          label: 'Terminated',
          className: 'badge-neutral',
          icon: null,
        };
    }
  };

  const config = getStatusConfig();

  return (
    <span className={`${config.className} flex items-center`}>
      {config.icon}
      {config.label}
    </span>
  );
}
'use client';

interface StatusBadgeProps {
  status: 'healthy' | 'degraded' | 'error';
  message?: string;
  className?: string;
}

export function StatusBadge({ status, message, className = '' }: StatusBadgeProps) {
  const colors = {
    healthy: 'bg-green-100 text-green-800 border-green-300',
    degraded: 'bg-yellow-100 text-yellow-800 border-yellow-300',
    error: 'bg-red-100 text-red-800 border-red-300',
  };

  const icons = {
    healthy: '✓',
    degraded: '⚠',
    error: '✕',
  };

  return (
    <div className={`border rounded-lg px-4 py-2 inline-flex items-center gap-2 ${colors[status]} ${className}`}>
      <span className="font-bold">{icons[status]}</span>
      <div>
        <div className="font-bold capitalize">{status}</div>
        {message && <div className="text-sm">{message}</div>}
      </div>
    </div>
  );
}

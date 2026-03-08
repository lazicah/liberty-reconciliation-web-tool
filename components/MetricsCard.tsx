'use client';

import { formatCurrency } from '@/lib/utils';

interface MetricsCardProps {
  title: string;
  value: number | string;
  subtitle?: string;
  variant?: 'default' | 'success' | 'warning' | 'danger';
}

export function MetricsCard({ title, value, subtitle, variant = 'default' }: MetricsCardProps) {
  const variantStyles = {
    default: 'border-blue-300 bg-blue-50',
    success: 'border-green-300 bg-green-50',
    warning: 'border-yellow-300 bg-yellow-50',
    danger: 'border-red-300 bg-red-50',
  };

  const formatValue = (val: number | string): string => {
    if (typeof val === 'string') return val;
    if (title.toLowerCase().includes('revenue') || title.toLowerCase().includes('settlement') || title.toLowerCase().includes('chargeback') || title.toLowerCase().includes('claim')) {
      return formatCurrency(val);
    }
    return val.toLocaleString();
  };

  return (
    <div className={`border-2 rounded-lg p-6 ${variantStyles[variant]}`}>
      <h3 className="text-gray-600 text-sm font-semibold uppercase">{title}</h3>
      <div className="text-3xl font-bold mt-2">{formatValue(value)}</div>
      {subtitle && <div className="text-gray-500 text-sm mt-1">{subtitle}</div>}
    </div>
  );
}

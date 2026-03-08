'use client';

import { useEffect, useState } from 'react';
import { apiService, HealthResponse, MetricsResponse } from '@/lib/api';
import { MetricsCard } from '@/components/MetricsCard';
import { StatusBadge } from '@/components/StatusBadge';
import { LoadingSpinner, ErrorMessage } from '@/components/Feedback';
import Link from 'next/link';
import { formatCurrency } from '@/lib/utils';

export default function Dashboard() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [metrics, setMetrics] = useState<MetricsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);

        const [healthData, metricsData] = await Promise.all([
          apiService.getHealth(),
          apiService.getLatestMetrics().catch(() => null),
        ]);

        setHealth(healthData);
        setMetrics(metricsData);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load dashboard');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    // Refresh every 30 seconds
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return <LoadingSpinner message="Loading dashboard..." />;
  }

  return (
    <div>
      <h1 className="text-4xl font-bold mb-8">Dashboard</h1>

      {error && <ErrorMessage message={error} />}

      {/* Service Status Section */}
      <div className="mb-8">
        <h2 className="text-2xl font-bold mb-4">Service Status</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {health && (
            <>
              <StatusBadge
                status={health.status === 'healthy' ? 'healthy' : 'degraded'}
                message={health.message}
              />
              {health.google_sheets_connected !== undefined && (
                <StatusBadge
                  status={health.google_sheets_connected ? 'healthy' : 'error'}
                  message={`Google Sheets: ${health.google_sheets_connected ? 'Connected' : 'Disconnected'}`}
                />
              )}
              {health.openai_configured !== undefined && (
                <StatusBadge
                  status={health.openai_configured ? 'healthy' : 'degraded'}
                  message={`AI Model: ${health.openai_configured ? 'Configured' : 'Not Configured'}`}
                />
              )}
              {health.card_reconciliation_included !== undefined && (
                <StatusBadge
                  status={health.card_reconciliation_included ? 'healthy' : 'error'}
                  message="Card Reconciliation: Integrated"
                />
              )}
            </>
          )}
        </div>
      </div>

      {/* Latest Metrics Section */}
      {metrics && (
        <div className="mb-8">
          <h2 className="text-2xl font-bold mb-4">Latest Metrics - {metrics.run_date}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
            <MetricsCard
              title="Total Revenue"
              value={metrics.total_revenue}
              variant="success"
            />
            <MetricsCard
              title="Total Settlement"
              value={metrics.total_settlement}
              variant="default"
            />
            <MetricsCard
              title="Chargebacks"
              value={metrics.total_settlement_charge_back}
              variant="warning"
            />
            <MetricsCard
              title="Unsettled Claims"
              value={metrics.total_settlement_unsettled_claims}
              variant="danger"
            />
          </div>

          {/* Channel Breakdown */}
          <div className="bg-white rounded-lg shadow-md p-6 mb-6">
            <h3 className="text-xl font-bold mb-4">Channel Breakdown</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {Object.entries(metrics.channels).map(([channel, data]) => (
                <div key={channel} className="border-2 border-gray-200 rounded-lg p-4">
                  <h4 className="font-bold text-lg mb-2">{channel}</h4>
                  {typeof data.revenue === 'number' && (
                    <p className="text-sm text-gray-600">
                      Revenue: <span className="font-bold">{formatCurrency(data.revenue)}</span>
                    </p>
                  )}
                  {typeof data.settlement === 'number' && (
                    <p className="text-sm text-gray-600">
                      Settlement: <span className="font-bold">{formatCurrency(data.settlement)}</span>
                    </p>
                  )}
                  {typeof data.charge_back === 'number' && (
                    <p className="text-sm text-gray-600">
                      Chargebacks: <span className="font-bold">{formatCurrency(data.charge_back)}</span>
                    </p>
                  )}
                  {typeof data.unsettled_claim === 'number' && (
                    <p className="text-sm text-gray-600">
                      Unsettled: <span className="font-bold">{formatCurrency(data.unsettled_claim)}</span>
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-2xl font-bold mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Link
            href="/reconciliation"
            className="btn-primary flex items-center justify-center text-lg h-16"
          >
            Run Reconciliation
          </Link>
          <Link
            href="/metrics"
            className="btn-secondary flex items-center justify-center text-lg h-16"
          >
            View Metrics & Reports
          </Link>
        </div>
      </div>
    </div>
  );
}

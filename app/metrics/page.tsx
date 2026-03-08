'use client';

import { useState } from 'react';
import { apiService, MetricsResponse } from '@/lib/api';
import { MetricsCard } from '@/components/MetricsCard';
import { LoadingSpinner, ErrorMessage, SuccessMessage } from '@/components/Feedback';
import { Bar } from 'react-chartjs-2';
import { formatCurrency, downloadJSON, downloadCSV } from '@/lib/utils';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

export default function Metrics() {
  const [selectedDate, setSelectedDate] = useState('');
  const [metrics, setMetrics] = useState<MetricsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const handleLoadByDate = async () => {
    if (!selectedDate) {
      setError('Please select a date');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      setMessage(null);

      const data = await apiService.getMetricsByDate(selectedDate);
      setMetrics(data);
      setMessage(`Metrics loaded for ${selectedDate}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load metrics');
    } finally {
      setLoading(false);
    }
  };

  const handleLoadLatest = async () => {
    try {
      setLoading(true);
      setError(null);
      setMessage(null);

      const data = await apiService.getLatestMetrics();
      setMetrics(data);
      setMessage(`Latest metrics loaded for ${data.run_date}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load latest metrics');
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadJSON = () => {
    if (metrics) {
      downloadJSON(metrics, `metrics-${metrics.run_date}.json`);
    }
  };

  const handleDownloadCSV = () => {
    if (metrics) {
      const csvData = [
        {
          'Run Date': metrics.run_date,
          'Total Revenue': metrics.total_revenue,
          'Total Settlement': metrics.total_settlement,
          'Total Chargebacks': metrics.total_settlement_charge_back,
          'Total Unsettled Claims': metrics.total_settlement_unsettled_claims,
          'Bank ISW Unsettled Claims': metrics.total_bank_isw_unsettled_claims,
          'Bank ISW Chargebacks': metrics.total_bank_isw_charge_back,
        },
      ];
      downloadCSV(csvData, `metrics-${metrics.run_date}.csv`);
    }
  };

  const chartData = metrics
    ? {
        labels: Object.keys(metrics.channels),
        datasets: [
          {
            label: 'Revenue',
            data: Object.values(metrics.channels).map((ch) => ch.revenue || 0),
            backgroundColor: '#10b981',
          },
          {
            label: 'Settlement',
            data: Object.values(metrics.channels).map((ch) => ch.settlement || 0),
            backgroundColor: '#3b82f6',
          },
          {
            label: 'Chargebacks',
            data: Object.values(metrics.channels).map((ch) => ch.charge_back || 0),
            backgroundColor: '#ef4444',
          },
        ],
      }
    : null;

  return (
    <div>
      <h1 className="text-4xl font-bold mb-8">Metrics & Reports</h1>

      {error && <ErrorMessage message={error} />}
      {message && <SuccessMessage message={message} />}

      {/* Load Controls */}
      <div className="bg-white rounded-lg shadow-md p-8 mb-8">
        <h2 className="text-2xl font-bold mb-4">Load Metrics</h2>
        <div className="flex flex-col md:flex-row gap-4 items-end">
          <div className="flex-1">
            <label className="form-label">Select Date</label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="input-field"
            />
          </div>
          <button
            onClick={handleLoadByDate}
            disabled={loading}
            className="btn-primary"
          >
            Load by Date
          </button>
          <button
            onClick={handleLoadLatest}
            disabled={loading}
            className="btn-secondary"
          >
            Load Latest
          </button>
        </div>
      </div>

      {loading && <LoadingSpinner message="Loading metrics..." />}

      {metrics && (
        <>
          {/* Export Buttons */}
          <div className="bg-white rounded-lg shadow-md p-8 mb-8">
            <h2 className="text-2xl font-bold mb-4">Export</h2>
            <div className="flex flex-wrap gap-4">
              <button onClick={handleDownloadJSON} className="btn-primary">
                Download JSON
              </button>
              <button onClick={handleDownloadCSV} className="btn-primary">
                Download CSV
              </button>
            </div>
          </div>

          {/* Overview Cards */}
          <div className="mb-8">
            <h2 className="text-2xl font-bold mb-4">Overview</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
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
                title="Total Chargebacks"
                value={metrics.total_settlement_charge_back}
                variant="warning"
              />
              <MetricsCard
                title="Total Unsettled Claims"
                value={metrics.total_settlement_unsettled_claims}
                variant="danger"
              />
            </div>
          </div>

          {/* Chart */}
          {chartData && (
            <div className="bg-white rounded-lg shadow-md p-8 mb-8">
              <h2 className="text-2xl font-bold mb-4">Channel Comparison</h2>
              <div className="h-96">
                <Bar
                  data={chartData}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                      legend: {
                        position: 'top' as const,
                      },
                      title: {
                        display: true,
                        text: 'Revenue by Channel',
                      },
                    },
                    scales: {
                      y: {
                        ticks: {
                          callback: (value) => `₦${formatCurrency(Number(value))}`,
                        },
                      },
                    },
                  }}
                />
              </div>
            </div>
          )}

          {/* Channel Details */}
          <div className="bg-white rounded-lg shadow-md p-8 mb-8">
            <h2 className="text-2xl font-bold mb-4">Channel Breakdown</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="px-4 py-2 text-left font-bold">Channel</th>
                    <th className="px-4 py-2 text-right font-bold">Revenue</th>
                    <th className="px-4 py-2 text-right font-bold">Settlement</th>
                    <th className="px-4 py-2 text-right font-bold">Chargebacks</th>
                    <th className="px-4 py-2 text-right font-bold">Unsettled Claims</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(metrics.channels).map(([channel, data]) => (
                    <tr key={channel} className="border-b border-gray-200 hover:bg-gray-50">
                      <td className="px-4 py-2 font-semibold">{channel}</td>
                      <td className="px-4 py-2 text-right">
                        {formatCurrency(data.revenue || 0)}
                      </td>
                      <td className="px-4 py-2 text-right">
                        {formatCurrency(data.settlement || 0)}
                      </td>
                      <td className="px-4 py-2 text-right">
                        {formatCurrency(data.charge_back || 0)}
                      </td>
                      <td className="px-4 py-2 text-right">
                        {formatCurrency(data.unsettled_claim || 0)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

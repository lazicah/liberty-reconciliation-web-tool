'use client';

import { useEffect, useState } from 'react';
import { apiService, HealthResponse, ConfigResponse } from '@/lib/api';
import { StatusBadge } from '@/components/StatusBadge';
import { LoadingSpinner, ErrorMessage } from '@/components/Feedback';

export default function Configuration() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [config, setConfig] = useState<ConfigResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);

        const [healthData, configData] = await Promise.all([
          apiService.getCardHealth(),
          apiService.getConfig(),
        ]);

        setHealth(healthData);
        setConfig(configData);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load configuration');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  if (loading) {
    return <LoadingSpinner message="Loading configuration..." />;
  }

  return (
    <div>
      <h1 className="text-4xl font-bold mb-8">System Configuration</h1>

      {error && <ErrorMessage message={error} />}

      {/* Health Status */}
      {health && (
        <div className="bg-white rounded-lg shadow-md p-8 mb-8">
          <h2 className="text-2xl font-bold mb-4">Service Status</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
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
            {health.backend_api_configured !== undefined && (
              <StatusBadge
                status={health.backend_api_configured ? 'healthy' : 'error'}
                message={`Backend API: ${health.backend_api_configured ? 'Connected' : 'Disconnected'}`}
              />
            )}
          </div>
        </div>
      )}

      {/* Configuration Details */}
      {config && (
        <div className="bg-white rounded-lg shadow-md p-8 mb-8">
          <h2 className="text-2xl font-bold mb-4">Configuration Details</h2>

          {/* Basic Config */}
          <div className="mb-8">
            <h3 className="text-xl font-bold mb-4">Basic Settings</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="border-l-4 border-blue-600 pl-4">
                <p className="text-sm text-gray-600 mb-1">Spreadsheet ID</p>
                <p className="font-mono text-lg break-all">{config.spreadsheet_id}</p>
              </div>
              <div className="border-l-4 border-blue-600 pl-4">
                <p className="text-sm text-gray-600 mb-1">AI Model</p>
                <p className="font-bold text-lg">{config.ai_model}</p>
              </div>
            </div>
          </div>

          {/* Merchant IDs */}
          <div className="mb-8">
            <h3 className="text-xl font-bold mb-4">Merchant IDs</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {Object.entries(config.merchant_ids).map(([key, value]) => (
                <div key={key} className="border-2 border-gray-200 rounded-lg p-4">
                  <p className="text-sm text-gray-600 mb-1 capitalize">
                    {key.replace(/_/g, ' ')}
                  </p>
                  <p className="font-mono font-bold break-all">{value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Sheet Names */}
          <div className="mb-8">
            <h3 className="text-xl font-bold mb-4">Google Sheet Tabs</h3>
            <div className="bg-gray-50 rounded-lg p-6 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-200">
                  <tr>
                    <th className="px-4 py-2 text-left font-bold">Purpose</th>
                    <th className="px-4 py-2 text-left font-bold">Sheet Name</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(config.sheet_names).map(([key, value]) => (
                    <tr key={key} className="border-b border-gray-200 hover:bg-gray-100">
                      <td className="px-4 py-2 font-semibold capitalize">
                        {key.replace(/_/g, ' ')}
                      </td>
                      <td className="px-4 py-2 font-mono">{value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* API Endpoints Reference */}
      <div className="bg-blue-50 border-2 border-blue-300 rounded-lg p-8">
        <h2 className="text-2xl font-bold mb-4">API Endpoints</h2>
        <div className="space-y-4">
          <div className="bg-white rounded-lg p-4 font-mono text-sm">
            <p className="font-bold text-blue-600 mb-2">GET /health</p>
            <p className="text-gray-600">Check service health and dependencies</p>
          </div>
          <div className="bg-white rounded-lg p-4 font-mono text-sm">
            <p className="font-bold text-blue-600 mb-2">POST /reconciliation/run</p>
            <p className="text-gray-600">Trigger card reconciliation</p>
          </div>
          <div className="bg-white rounded-lg p-4 font-mono text-sm">
            <p className="font-bold text-blue-600 mb-2">GET /metrics/latest</p>
            <p className="text-gray-600">Retrieve latest reconciliation metrics</p>
          </div>
          <div className="bg-white rounded-lg p-4 font-mono text-sm">
            <p className="font-bold text-blue-600 mb-2">GET /metrics/{'{date}'}</p>
            <p className="text-gray-600">Retrieve metrics for specific date (YYYY-MM-DD)</p>
          </div>
          <div className="bg-white rounded-lg p-4 font-mono text-sm">
            <p className="font-bold text-blue-600 mb-2">GET /config</p>
            <p className="text-gray-600">Retrieve system configuration</p>
          </div>
        </div>
      </div>
    </div>
  );
}

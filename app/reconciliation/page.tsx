'use client';

import { useState, useRef } from 'react';
import { apiService, TransferReconciliationResponse, CardReconciliationResponse } from '@/lib/api';
import { LoadingSpinner, ErrorMessage, SuccessMessage } from '@/components/Feedback';
import { MetricsCard } from '@/components/MetricsCard';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { formatCurrency } from '@/lib/utils';
import Papa from 'papaparse';

// ─────────────────────────────────────────────────────────────
// GOOGLE SHEETS PARSING UTILITIES
// ─────────────────────────────────────────────────────────────

const SPREADSHEET_ID_PATTERN = /\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/;
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

interface Transaction {
  transaction_id: string;
  transaction_date: string;
  narration: string;
  debit: number;
  credit: number;
  session_id: string;
}

function parseSheetUrl(url: string): {
  spreadsheetId: string;
  gid: string;
} | null {
  try {
    // Extract spreadsheet ID from URL
    const idMatch = url.match(SPREADSHEET_ID_PATTERN);
    if (!idMatch) return null;
    const spreadsheetId = idMatch[1];

    // Extract GID from URL (try query param first, then hash)
    let gid = "0";
    const gidQueryMatch = url.match(/[?&]gid=(\d+)/);
    const gidHashMatch = url.match(/#gid=(\d+)/);
    if (gidQueryMatch) gid = gidQueryMatch[1];
    else if (gidHashMatch) gid = gidHashMatch[1];

    return { spreadsheetId, gid };
  } catch {
    return null;
  }
}

function normalizeHeader(header: string): string {
  return header
    .toLowerCase()
    .trim()
    .replace(/[\s_]+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

function mapRowToTransaction(
  row: Record<string, string>,
  headers: string[]
): Transaction | null {
  const normalizedRow: Record<string, string> = {};
  for (const key of Object.keys(row)) {
    normalizedRow[normalizeHeader(key)] = row[key]?.trim() ?? "";
  }

  // Find columns by multiple possible names
  const findValue = (...keys: string[]): string => {
    for (const k of keys) {
      const normalized = normalizeHeader(k);
      if (normalizedRow[normalized] !== undefined)
        return normalizedRow[normalized];
    }
    // Also search by index position through original headers
    for (const k of keys) {
      const idx = headers.findIndex(
        (h) => normalizeHeader(h) === normalizeHeader(k)
      );
      if (idx >= 0) {
        const originalKey = headers[idx];
        return row[originalKey]?.trim() ?? "";
      }
    }
    return "";
  };

  const transactionId = findValue(
    "transaction_id",
    "transaction id",
    "txn_id",
    "txnid",
    "id"
  );
  const transactionDate = findValue(
    "created_date",
    "transaction_date",
    "date",
    "created_date",
    "value_date"
  );
  const narration = findValue(
    "narration",
    "description",
    "remarks",
    "particulars",
    "details"
  );
  const debitStr = findValue("debit", "dr", "debit_amount", "withdrawal");
  const creditStr = findValue("credit", "cr", "credit_amount", "deposit");
  const sessionId = findValue(
    "session_id",
    "session id",
    "sessionid",
    "session_ref",
    "reference"
  );

  // Skip empty rows
  if (!transactionId && !transactionDate && !narration) return null;

  const debitRaw = debitStr.replace(/[,\s]/g, "");
  const creditRaw = creditStr.replace(/[,\s]/g, "");
  const debit = debitRaw !== "" && !isNaN(Number(debitRaw)) ? parseFloat(debitRaw) : 0;
  const credit = creditRaw !== "" && !isNaN(Number(creditRaw)) ? parseFloat(creditRaw) : 0;

  return {
    transaction_id: transactionId,
    transaction_date: transactionDate,
    narration,
    debit,
    credit,
    session_id: sessionId,
  };
}

async function fetchAndParseSheet(sheetUrl: string): Promise<Transaction[]> {
  const parsed = parseSheetUrl(sheetUrl);
  if (!parsed) {
    throw new Error(
      "Invalid Google Sheet URL. Please provide a valid Google Sheets link."
    );
  }

  const { spreadsheetId, gid } = parsed;
  const csvUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=${gid}`;

  const response = await fetch(csvUrl, {
    headers: { "User-Agent": USER_AGENT },
  });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch Google Sheet. Make sure the sheet is publicly accessible (status: ${response.status}).`
    );
  }

  const csvText = await response.text();

  const result = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });

  if (result.errors.length > 0 && result.data.length === 0) {
    throw new Error("Failed to parse the Google Sheet CSV data.");
  }

  const headers = result.meta.fields ?? [];
  const transactions: Transaction[] = [];

  for (const row of result.data) {
    const txn = mapRowToTransaction(row, headers);
    if (txn) transactions.push(txn);
  }

  if (transactions.length === 0) {
    throw new Error(
      "No valid transactions found in the sheet. Please check the column headers."
    );
  }

  return transactions;
}

// ─────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────

type ReconciliationType = 'transfer' | 'card';

export default function Reconciliation() {
  const [activeTab, setActiveTab] = useState<ReconciliationType>('transfer');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const transferResultsRef = useRef<TransferReconciliationResponse | null>(null);
  const cardResultsRef = useRef<CardReconciliationResponse | null>(null);

  return (
    <div>
      <h1 className="text-4xl font-bold mb-8">Run Reconciliation</h1>

      {/* Tabs */}
      <div className="mb-8 border-b-2 border-gray-300">
        <div className="flex gap-4">
          <button
            onClick={() => setActiveTab('transfer')}
            className={`px-6 py-3 font-bold border-b-4 transition ${
              activeTab === 'transfer'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-600 hover:text-gray-800'
            }`}
          >
            Transfer Reconciliation
          </button>
          <button
            onClick={() => setActiveTab('card')}
            className={`px-6 py-3 font-bold border-b-4 transition ${
              activeTab === 'card'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-600 hover:text-gray-800'
            }`}
          >
            Card Reconciliation
          </button>
        </div>
      </div>

      {error && <ErrorMessage message={error} onRetry={() => setError(null)} />}

      {/* Transfer Reconciliation Tab */}
      {activeTab === 'transfer' && (
        <TransferReconciliationForm
          loading={loading}
          setLoading={setLoading}
          setError={setError}
          resultsRef={transferResultsRef}
        />
      )}

      {/* Card Reconciliation Tab */}
      {activeTab === 'card' && (
        <CardReconciliationForm
          loading={loading}
          setLoading={setLoading}
          setError={setError}
          resultsRef={cardResultsRef}
        />
      )}

      {/* Display Results */}
      {loading && <LoadingSpinner message="Processing reconciliation..." />}
      {transferResultsRef.current && activeTab === 'transfer' && (
        <TransferReconciliationResults results={transferResultsRef.current} />
      )}
      {cardResultsRef.current && activeTab === 'card' && (
        <CardReconciliationResults results={cardResultsRef.current} />
      )}
    </div>
  );
}

// ─────────────────┐
// TRANSFER SECTION │
// ─────────────────┘

interface TransferFormProps {
  loading: boolean;
  setLoading: (val: boolean) => void;
  setError: (val: string | null) => void;
  resultsRef: React.MutableRefObject<TransferReconciliationResponse | null>;
}

function TransferReconciliationForm({
  loading,
  setLoading,
  setError,
  resultsRef,
}: TransferFormProps) {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [runAI, setRunAI] = useState(true);
  const [sheetUrl, setSheetUrl] = useState('');
  const [bankDataJSON, setBankDataJSON] = useState('');
  const [parsedTransactions, setParsedTransactions] = useState<Transaction[]>([]);
  const [fetchingSheet, setFetchingSheet] = useState(false);

  const handleFetchSheet = async () => {
    if (!sheetUrl.trim()) {
      setError('Please enter a Google Sheets URL');
      return;
    }

    try {
      setFetchingSheet(true);
      setError(null);
      
      const transactions = await fetchAndParseSheet(sheetUrl);
      setParsedTransactions(transactions);
      
      // Convert to JSON for preview
      setBankDataJSON(JSON.stringify(transactions, null, 2));
      
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch sheet');
      setParsedTransactions([]);
    } finally {
      setFetchingSheet(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!startDate || !endDate) {
      setError('Please provide both start and end dates');
      return;
    }

    if (new Date(startDate) > new Date(endDate)) {
      setError('Start date must be before end date');
      return;
    }

    try {
      setLoading(true);

      let bankData: Record<string, unknown>[] = [];
      
      // Use parsed transactions if available, otherwise parse JSON
      if (parsedTransactions.length > 0) {
        bankData = parsedTransactions as unknown as Record<string, unknown>[];
      } else if (bankDataJSON.trim()) {
        try {
          bankData = JSON.parse(bankDataJSON);
          if (!Array.isArray(bankData)) {
            setError('Bank data must be a JSON array');
            setLoading(false);
            return;
          }
        } catch {
          setError('Invalid JSON format for bank data');
          setLoading(false);
          return;
        }
      }

      const response = await apiService.runTransferReconciliation({
        start_date: startDate,
        end_date: endDate,
        bank_data: bankData,
        run_ai_analysis: runAI,
      });

      resultsRef.current = response;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reconciliation failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-md p-8 max-w-2xl mb-8">
      <div className="form-group">
        <label className="form-label">Start Date</label>
        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className="input-field"
          required
        />
      </div>

      <div className="form-group">
        <label className="form-label">End Date</label>
        <input
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          className="input-field"
          required
        />
      </div>

      {/* Google Sheets URL Input */}
      <div className="form-group">
        <label className="form-label">Bank Statement (Google Sheets)</label>
        <div className="flex gap-2">
          <input
            type="url"
            value={sheetUrl}
            onChange={(e) => setSheetUrl(e.target.value)}
            className="input-field flex-1"
            placeholder="https://docs.google.com/spreadsheets/d/..."
          />
          <button
            type="button"
            onClick={handleFetchSheet}
            disabled={fetchingSheet || !sheetUrl.trim()}
            className="btn-secondary whitespace-nowrap"
          >
            {fetchingSheet ? 'Fetching...' : 'Fetch Sheet'}
          </button>
        </div>
        <p className="text-sm text-gray-500 mt-2">
          Paste a public Google Sheets URL containing bank statement data
        </p>
        {parsedTransactions.length > 0 && (
          <div className="mt-2 p-3 bg-green-50 border border-green-300 rounded-lg">
            <p className="text-sm text-green-800 font-semibold">
              ✓ Successfully parsed {parsedTransactions.length} transactions
            </p>
          </div>
        )}
      </div>

      {/* Alternative: JSON Input */}
      <div className="form-group">
        <label className="form-label">Or Enter Bank Data (JSON)</label>
        <textarea
          value={bankDataJSON}
          onChange={(e) => {
            setBankDataJSON(e.target.value);
            // Clear parsed transactions when manually editing JSON
            if (parsedTransactions.length > 0) {
              setParsedTransactions([]);
            }
          }}
          className="input-field h-32 font-mono text-sm"
          placeholder='[{"transaction_id": "...", "transaction_date": "...", ...}]'
          spellCheck="false"
        />
        <p className="text-sm text-gray-500 mt-2">
          Optional: Manually paste bank transaction data as JSON array, or use Google Sheets above
        </p>
      </div>

      <div className="form-group">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={runAI}
            onChange={(e) => setRunAI(e.target.checked)}
          />
          <span className="form-label mb-0">Run AI Analysis</span>
        </label>
      </div>

      <button type="submit" disabled={loading} className="btn-primary text-lg w-full">
        {loading ? 'Processing...' : 'Run Reconciliation'}
      </button>
    </form>
  );
}

interface TransferResultsProps {
  results: TransferReconciliationResponse;
}

function TransferReconciliationResults({ results }: TransferResultsProps) {
  return (
    <div className="bg-white rounded-lg shadow-md p-8">
      <SuccessMessage
        title="Reconciliation Complete"
        message={`Run ID: ${results.run_id}`}
      />

      <div className="mb-8">
        <h2 className="text-2xl font-bold mb-4">Summary</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <MetricsCard
            title="Backend Transactions"
            value={results.backend_count}
            variant="default"
          />
          <MetricsCard
            title="Bank Transactions"
            value={results.bank_count}
            variant="default"
          />
          <MetricsCard
            title="Total Unmatched Backend"
            value={(results.unmatched?.['total_unmatched_backend_value'] as number) || 0}
            variant="warning"
          />
          <MetricsCard
            title="Total Unmatched Bank"
            value={(results.unmatched?.['total_unmatched_bank_value'] as number) || 0}
            variant="warning"
          />
        </div>
      </div>

      {results.summary && (
        <div className="mb-8">
          <h3 className="text-xl font-bold mb-4">Reconciliation Summary</h3>
          <div className="bg-gray-50 rounded-lg p-6 overflow-x-auto">
            <table className="w-full text-sm">
              <tbody>
                {Object.entries(results.summary).map(([key, value]) => (
                  <tr key={key} className="border-b border-gray-200 last:border-b-0">
                    <td className="py-2 font-semibold text-gray-700 w-1/2">
                      {key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                    </td>
                    <td className="py-2 text-right text-gray-900">
                      {typeof value === 'number' ? formatCurrency(value) : String(value)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {results.ai_analysis && (
        <div className="mb-8">
          <h3 className="text-xl font-bold mb-4">AI Analysis</h3>
          <div className="bg-blue-50 border-2 border-blue-300 rounded-lg p-6 prose prose-sm max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {results.ai_analysis}
            </ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────┐
// CARD SECTION │
// ─────────────┘

interface CardFormProps {
  loading: boolean;
  setLoading: (val: boolean) => void;
  setError: (val: string | null) => void;
  resultsRef: React.MutableRefObject<CardReconciliationResponse | null>;
}

function CardReconciliationForm({
  loading,
  setLoading,
  setError,
  resultsRef,
}: CardFormProps) {
  const [runDate, setRunDate] = useState('');
  const [daysOffset, setDaysOffset] = useState(18);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (runDate && daysOffset < 1) {
      setError('Days offset must be at least 1');
      return;
    }

    try {
      setLoading(true);

      const response = await apiService.runCardReconciliation({
        run_date: runDate || null,
        days_offset: daysOffset,
      });

      resultsRef.current = response;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Card reconciliation failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-md p-8 max-w-2xl mb-8">
      <div className="form-group">
        <label className="form-label">Run Date (Optional)</label>
        <input
          type="date"
          value={runDate}
          onChange={(e) => setRunDate(e.target.value)}
          className="input-field"
        />
        <p className="text-sm text-gray-500 mt-2">
          Leave empty to use days offset from today
        </p>
      </div>

      <div className="form-group">
        <label className="form-label">Days Offset from Today</label>
        <div className="flex gap-4 items-center">
          <input
            type="number"
            value={daysOffset}
            onChange={(e) => setDaysOffset(Math.max(1, parseInt(e.target.value) || 1))}
            min="1"
            max="365"
            className="input-field flex-1"
          />
          <span className="text-gray-600">(1-365 days)</span>
        </div>
        <p className="text-sm text-gray-500 mt-2">
          Default: 18 days. Used if run date is not specified.
        </p>
      </div>

      <button type="submit" disabled={loading} className="btn-primary text-lg">
        {loading ? 'Processing...' : 'Run Card Reconciliation'}
      </button>
    </form>
  );
}

interface CardResultsProps {
  results: CardReconciliationResponse;
}

function CardReconciliationResults({ results }: CardResultsProps) {
  return (
    <div className="bg-white rounded-lg shadow-md p-8">
      <SuccessMessage
        title="Reconciliation Complete"
        message={`Date: ${results.run_date}`}
      />

      {results.metrics && (
        <div className="mb-8">
          <h2 className="text-2xl font-bold mb-4">Metrics</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
            <MetricsCard
              title="Total Revenue"
              value={results.metrics.total_revenue}
              variant="success"
            />
            <MetricsCard
              title="Total Settlement"
              value={results.metrics.total_settlement}
              variant="default"
            />
            <MetricsCard
              title="Chargebacks"
              value={results.metrics.total_settlement_charge_back}
              variant="warning"
            />
            <MetricsCard
              title="Unsettled Claims"
              value={results.metrics.total_settlement_unsettled_claims}
              variant="danger"
            />
          </div>

          <div className="bg-gray-50 rounded-lg p-6">
            <h3 className="font-bold mb-4">Channel Breakdown</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Object.entries(results.metrics.channels).map(([channel, data]) => (
                <div key={channel} className="border-2 border-gray-200 rounded-lg p-4">
                  <h4 className="font-bold mb-2">{channel}</h4>
                  <div className="text-sm space-y-1">
                    {typeof data.revenue === 'number' && (
                      <p>Revenue: <span className="font-bold">{formatCurrency(data.revenue)}</span></p>
                    )}
                    {typeof data.settlement === 'number' && (
                      <p>Settlement: <span className="font-bold">{formatCurrency(data.settlement)}</span></p>
                    )}
                    {typeof data.charge_back === 'number' && (
                      <p>Chargebacks: <span className="font-bold">{formatCurrency(data.charge_back)}</span></p>
                    )}
                    {typeof data.unsettled_claim === 'number' && (
                      <p>Unsettled: <span className="font-bold">{formatCurrency(data.unsettled_claim)}</span></p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {results.ai_summary && (
        <div className="mb-8">
          <h3 className="text-xl font-bold mb-4">AI Summary</h3>
          <div className="bg-blue-50 border-2 border-blue-300 rounded-lg p-6 prose prose-sm max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {results.ai_summary}
            </ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  );
}

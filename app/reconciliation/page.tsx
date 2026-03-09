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

  /**
   * Filter transactions by date range
   */
  const filterTransactionsByDate = (
    transactions: Transaction[],
    startDate: string,
    endDate: string
  ): Transaction[] => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    return transactions.filter((txn) => {
      if (!txn.transaction_date) return false;
      const txnDate = new Date(txn.transaction_date);
      return txnDate >= start && txnDate <= end;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!sheetUrl.trim()) {
      setError('Please provide a Google Sheets URL');
      return;
    }

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

      // Fetch and parse the Google Sheet
      const allTransactions = await fetchAndParseSheet(sheetUrl);
      
      // Filter transactions by date range
      const filteredTransactions = filterTransactionsByDate(
        allTransactions,
        startDate,
        endDate
      );

      if (filteredTransactions.length === 0) {
        setError(
          `No transactions found in the date range ${startDate} to ${endDate}`
        );
        setLoading(false);
        return;
      }

      const bankData = filteredTransactions as unknown as Record<string, unknown>[];

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
        <label className="form-label">
          Google Sheet URL
          <span className="text-red-500 ml-1">*</span>
        </label>
        <input
          type="url"
          value={sheetUrl}
          onChange={(e) => setSheetUrl(e.target.value)}
          className="input-field"
          placeholder="https://docs.google.com/spreadsheets/d/..."
          required
        />
        <p className="text-sm text-gray-500 mt-2">
          The sheet must be publicly accessible. Columns should include:
          Transaction ID, Date, Narration, Debit, Credit, Session ID.
        </p>
      </div>

      <div className="form-group">
        <label className="form-label">
          Start Date
          <span className="text-red-500 ml-1">*</span>
        </label>
        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className="input-field"
          required
        />
      </div>

      <div className="form-group">
        <label className="form-label">
          End Date
          <span className="text-red-500 ml-1">*</span>
        </label>
        <input
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          className="input-field"
          required
        />
        <p className="text-sm text-gray-500 mt-2">
          Bank transactions will be filtered to this date range.
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
        <p className="text-sm text-gray-500 mt-2">
          Generate AI-powered insights and recommendations
        </p>
      </div>

      <button type="submit" disabled={loading} className="btn-primary text-lg w-full">
        {loading ? 'Processing...' : 'Run Reconciliation'}
      </button>
    </form>
  );
}

// ─────────────────────────────────────────────────────────────
// TRANSFER RESULTS HELPER FUNCTIONS
// ─────────────────────────────────────────────────────────────

const LOCALE = "en-NG";

function formatNumber(n: number): string {
  return new Intl.NumberFormat(LOCALE).format(n);
}

function formatCurrencyNGN(n: number): string {
  return new Intl.NumberFormat(LOCALE, {
    style: "currency",
    currency: "NGN",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

function safeNumber(value?: number): number {
  return typeof value === "number" && !Number.isNaN(value) ? value : 0;
}

function downloadCsv(filename: string, rows: Array<Record<string, unknown>>) {
  const headers = Array.from(
    rows.reduce((acc, row) => {
      Object.keys(row).forEach((key) => acc.add(key));
      return acc;
    }, new Set<string>())
  );

  const escapeCell = (value: unknown) => {
    if (value === null || value === undefined) return "";
    const raw = String(value);
    if (raw.includes('"')) {
      return `"${raw.replace(/"/g, '""')}"`;
    }
    if (raw.includes(",") || raw.includes("\n")) {
      return `"${raw}"`;
    }
    return raw;
  };

  const csv = [headers.join(",")]
    .concat(
      rows.map((row) =>
        headers.map((header) => escapeCell(row[header])).join(",")
      )
    )
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

// ─────────────────────────────────────────────────────────────
// TRANSFER RESULTS SUB-COMPONENTS
// ─────────────────────────────────────────────────────────────

function InsightCard({ title, value, detail }: { title: string; value: string; detail: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
        {title}
      </p>
      <p className="text-xl font-bold text-slate-800 mt-2">{value}</p>
      <p className="text-xs text-slate-500 mt-1">{detail}</p>
    </div>
  );
}

function SimpleBar({
  label,
  value,
  total,
  color,
}: {
  label: string;
  value: number;
  total: number;
  color: string;
}) {
  const pct = total > 0 ? (value / total) * 100 : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-xs text-slate-500">
        <span>{label}</span>
        <span>
          {formatNumber(value)} ({formatPercent(pct)})
        </span>
      </div>
      <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function MatchBar({
  label,
  matched,
  unmatched,
}: {
  label: string;
  matched: number;
  unmatched: number;
}) {
  const total = matched + unmatched;
  const matchPct = total > 0 ? Math.round((matched / total) * 100) : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-sm">
        <span className="font-medium text-slate-700">{label}</span>
        <span className="text-slate-500">
          {formatNumber(matched)} / {formatNumber(total)} matched ({matchPct}%)
        </span>
      </div>
      <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-emerald-400 to-emerald-500 rounded-full transition-all"
          style={{ width: `${matchPct}%` }}
        />
      </div>
      <div className="flex gap-4 text-xs text-slate-500">
        <span className="flex items-center gap-1">
          <span className="inline-block w-2 h-2 rounded-full bg-emerald-400" />
          {formatNumber(matched)} matched
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2 h-2 rounded-full bg-red-400" />
          {formatNumber(unmatched)} unmatched
        </span>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub?: string;
  color: string;
}) {
  return (
    <div
      className={`bg-white rounded-xl border p-4 flex flex-col gap-1 ${color}`}
    >
      <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
        {label}
      </p>
      <p className="text-2xl font-bold text-slate-800">{value}</p>
      {sub && <p className="text-xs text-slate-400">{sub}</p>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// MAIN TRANSFER RESULTS COMPONENT
// ─────────────────────────────────────────────────────────────

interface TransferResultsProps {
  results: TransferReconciliationResponse;
}

function TransferReconciliationResults({ results }: TransferResultsProps) {
  const printRef = useRef<HTMLDivElement>(null);
  const [copyStatus, setCopyStatus] = useState<"idle" | "success" | "error">("idle");

  // Extract summary data
  const summary = results.summary as {
    total_backend_transactions?: number;
    total_bank_transactions?: number;
    send_bank_matched?: number;
    send_bank_unmatched?: number;
    fund_matched?: number;
    fund_unmatched?: number;
    bank_to_backend_matched?: number;
    bank_to_backend_unmatched?: number;
    total_unmatched_backend_value?: number;
    total_unmatched_bank_value?: number;
    reversal_matched?: number;
    reversal_unmatched?: number;
    failed_backend_mapped?: number;
  };

  const unmatched = results.unmatched as {
    backend_only_send?: Array<Record<string, unknown>>;
    backend_only_fund?: Array<Record<string, unknown>>;
    bank_only?: Array<Record<string, unknown>>;
    reversal_unmatched?: Array<Record<string, unknown>>;
  } | undefined;

  const totalBankMatched = safeNumber(summary?.bank_to_backend_matched);
  const totalBankUnmatched = safeNumber(summary?.bank_to_backend_unmatched);
  const totalBank = totalBankMatched + totalBankUnmatched;
  const overallMatchRate = totalBank > 0 ? (totalBankMatched / totalBank) * 100 : 0;

  const sendTotal = safeNumber(summary?.send_bank_matched) + safeNumber(summary?.send_bank_unmatched);
  const fundTotal = safeNumber(summary?.fund_matched) + safeNumber(summary?.fund_unmatched);
  const reversalTotal = safeNumber(summary?.reversal_matched) + safeNumber(summary?.reversal_unmatched);

  const unmatchedSendCount = unmatched?.backend_only_send?.length ?? 0;
  const unmatchedFundCount = unmatched?.backend_only_fund?.length ?? 0;
  const unmatchedBankCount = unmatched?.bank_only?.length ?? 0;
  const unmatchedReversalCount = unmatched?.reversal_unmatched?.length ?? 0;
  const unmatchedTotal = unmatchedSendCount + unmatchedFundCount + unmatchedBankCount + unmatchedReversalCount;

  const topUnmatchedBucket = [
    { label: "Backend send", value: unmatchedSendCount },
    { label: "Backend fund", value: unmatchedFundCount },
    { label: "Bank only", value: unmatchedBankCount },
    { label: "Reversal", value: unmatchedReversalCount },
  ].sort((a, b) => b.value - a.value)[0];

  const statusColor =
    results.status === "complete"
      ? "bg-emerald-100 text-emerald-700 border-emerald-200"
      : "bg-amber-100 text-amber-700 border-amber-200";

  const handlePrint = () => {
    window.print();
  };

  const handleCopyEmail = () => {
    const el = printRef.current;
    if (!el) return;
    const text = el.innerText;
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopyStatus("success");
        setTimeout(() => setCopyStatus("idle"), 3000);
      })
      .catch(() => {
        setCopyStatus("error");
        setTimeout(() => setCopyStatus("idle"), 3000);
      });
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {/* Print action bar */}
      <div className="flex items-center justify-between mb-6 print:hidden">
        <h2 className="text-lg font-bold text-slate-800">Reconciliation Report</h2>
        <div className="flex items-center gap-2">
          {copyStatus === "success" && (
            <span className="text-xs text-emerald-600 font-medium">✓ Copied to clipboard!</span>
          )}
          {copyStatus === "error" && (
            <span className="text-xs text-red-500 font-medium">Could not copy</span>
          )}
          <button
            onClick={handleCopyEmail}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-600 text-sm font-medium rounded-lg hover:bg-slate-50 transition"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            Copy for Email
          </button>
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            Print / Save PDF
          </button>
        </div>
      </div>

      {/* Printable content */}
      <div ref={printRef} className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        {/* Report Header */}
        <div className="bg-gradient-to-r from-slate-800 to-slate-700 px-6 py-6 text-white">
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <svg className="w-5 h-5 text-blue-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span className="text-blue-200 text-xs font-medium uppercase tracking-wider">
                  Reconciliation Report
                </span>
              </div>
              <h1 className="text-xl font-bold">Liberty Agency Banking</h1>
              <p className="text-slate-300 text-sm mt-1">
                Period: {results.start_date} to {results.end_date}
              </p>
            </div>
            <div className="text-right">
              <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold border uppercase ${statusColor}`}>
                {results.status}
              </span>
              <p className="text-slate-400 text-xs mt-2">Run ID: {results.run_id}</p>
              <p className="text-slate-400 text-xs">
                Generated: {new Date().toLocaleString(LOCALE, { dateStyle: "medium", timeStyle: "short" })}
              </p>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-8">
          {/* Overview Stats */}
          <section>
            <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">Overview</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <StatCard
                label="Backend Transactions"
                value={formatNumber(safeNumber(summary?.total_backend_transactions))}
                color="border-slate-200"
              />
              <StatCard
                label="Bank Transactions"
                value={formatNumber(safeNumber(summary?.total_bank_transactions))}
                sub={results.bank_count ? `${formatNumber(results.bank_count)} parsed from sheet` : undefined}
                color="border-slate-200"
              />
              <StatCard
                label="Unmatched Backend Value"
                value={formatCurrencyNGN(safeNumber(summary?.total_unmatched_backend_value))}
                color="border-red-200"
              />
              <StatCard
                label="Unmatched Bank Value"
                value={formatCurrencyNGN(safeNumber(summary?.total_unmatched_bank_value))}
                color="border-amber-200"
              />
            </div>
          </section>

          {/* Match Statistics */}
          <section>
            <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">Match Statistics</h2>
            <div className="bg-slate-50 rounded-xl border border-slate-200 p-5 space-y-6">
              <MatchBar
                label="Send Bank Transfers"
                matched={safeNumber(summary?.send_bank_matched)}
                unmatched={safeNumber(summary?.send_bank_unmatched)}
              />
              <MatchBar
                label="Fund Transfers"
                matched={safeNumber(summary?.fund_matched)}
                unmatched={safeNumber(summary?.fund_unmatched)}
              />
              <MatchBar
                label="Bank → Backend"
                matched={safeNumber(summary?.bank_to_backend_matched)}
                unmatched={safeNumber(summary?.bank_to_backend_unmatched)}
              />
              {(summary?.reversal_matched || summary?.reversal_unmatched) && (
                <MatchBar
                  label="Reversals"
                  matched={safeNumber(summary?.reversal_matched)}
                  unmatched={safeNumber(summary?.reversal_unmatched)}
                />
              )}
            </div>
          </section>

          {/* Charts & Insights */}
          <section>
            <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">Charts & Insights</h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white border border-slate-200 rounded-xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-sm font-semibold text-slate-700">Match Rate Overview</p>
                  <span className="text-xs text-slate-500">{formatPercent(overallMatchRate)} matched</span>
                </div>
                <div className="space-y-4">
                  <SimpleBar label="Matched" value={totalBankMatched} total={totalBank} color="bg-emerald-500" />
                  <SimpleBar label="Unmatched" value={totalBankUnmatched} total={totalBank} color="bg-red-400" />
                </div>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-5">
                <p className="text-sm font-semibold text-slate-700 mb-4">Volume Mix by Transaction Type</p>
                <div className="space-y-4">
                  <SimpleBar label="Send Bank Transfers" value={sendTotal} total={sendTotal + fundTotal + reversalTotal} color="bg-blue-500" />
                  <SimpleBar label="Fund Transfers" value={fundTotal} total={sendTotal + fundTotal + reversalTotal} color="bg-indigo-500" />
                  <SimpleBar label="Reversals" value={reversalTotal} total={sendTotal + fundTotal + reversalTotal} color="bg-amber-500" />
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
              <InsightCard
                title="Overall Match Rate"
                value={formatPercent(overallMatchRate)}
                detail={`${formatNumber(totalBankMatched)} matched of ${formatNumber(totalBank)} total bank-side transactions`}
              />
              <InsightCard
                title="Largest Unmatched Bucket"
                value={topUnmatchedBucket?.label ?? "N/A"}
                detail={
                  unmatchedTotal > 0
                    ? `${formatNumber(topUnmatchedBucket?.value ?? 0)} of ${formatNumber(unmatchedTotal)} unmatched transactions`
                    : "No unmatched data provided"
                }
              />
              <InsightCard
                title="Failed Backend Mapped"
                value={formatNumber(safeNumber(summary?.failed_backend_mapped))}
                detail="Backend records flagged as failed but mapped during reconciliation"
              />
            </div>
          </section>

          {/* Detailed Breakdown Table */}
          <section>
            <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">Detailed Breakdown</h2>
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Category</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Matched</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Unmatched</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Total</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Match Rate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {[
                    {
                      cat: "Send Bank Transfers",
                      m: safeNumber(summary?.send_bank_matched),
                      u: safeNumber(summary?.send_bank_unmatched),
                    },
                    {
                      cat: "Fund Transfers",
                      m: safeNumber(summary?.fund_matched),
                      u: safeNumber(summary?.fund_unmatched),
                    },
                    {
                      cat: "Bank → Backend",
                      m: safeNumber(summary?.bank_to_backend_matched),
                      u: safeNumber(summary?.bank_to_backend_unmatched),
                    },
                  ].map(({ cat, m, u }) => {
                    const total = m + u;
                    const rate = total > 0 ? ((m / total) * 100).toFixed(1) : "0.0";
                    return (
                      <tr key={cat} className="hover:bg-slate-50 transition">
                        <td className="px-4 py-3 font-medium text-slate-700">{cat}</td>
                        <td className="px-4 py-3 text-right text-emerald-600 font-medium">{formatNumber(m)}</td>
                        <td className="px-4 py-3 text-right text-red-500 font-medium">{formatNumber(u)}</td>
                        <td className="px-4 py-3 text-right text-slate-600">{formatNumber(total)}</td>
                        <td className="px-4 py-3 text-right">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                              parseFloat(rate) >= 75
                                ? "bg-emerald-100 text-emerald-700"
                                : parseFloat(rate) >= 50
                                  ? "bg-amber-100 text-amber-700"
                                  : "bg-red-100 text-red-700"
                            }`}
                          >
                            {rate}%
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-50 border-t-2 border-slate-200 font-semibold">
                    <td className="px-4 py-3 text-slate-700">Total</td>
                    <td className="px-4 py-3 text-right text-emerald-600">
                      {formatNumber(
                        safeNumber(summary?.send_bank_matched) +
                          safeNumber(summary?.fund_matched) +
                          safeNumber(summary?.bank_to_backend_matched)
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-red-500">
                      {formatNumber(
                        safeNumber(summary?.send_bank_unmatched) +
                          safeNumber(summary?.fund_unmatched) +
                          safeNumber(summary?.bank_to_backend_unmatched)
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-600">
                      {formatNumber(
                        safeNumber(summary?.send_bank_matched) +
                          safeNumber(summary?.send_bank_unmatched) +
                          safeNumber(summary?.fund_matched) +
                          safeNumber(summary?.fund_unmatched) +
                          safeNumber(summary?.bank_to_backend_matched) +
                          safeNumber(summary?.bank_to_backend_unmatched)
                      )}
                    </td>
                    <td className="px-4 py-3" />
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>

          {/* Unmatched Values */}
          <section>
            <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">Unmatched Values</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-red-50 border border-red-200 rounded-xl p-5">
                <div className="flex items-center gap-2 mb-2">
                  <svg className="w-4 h-4 text-red-500" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v3a1 1 0 102 0V7zm-1 7a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                  </svg>
                  <p className="text-sm font-semibold text-red-700">Backend Unmatched Value</p>
                </div>
                <p className="text-2xl font-bold text-red-800">
                  {formatCurrencyNGN(safeNumber(summary?.total_unmatched_backend_value))}
                </p>
                <p className="text-xs text-red-500 mt-1">Transactions in backend not found on bank statement</p>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
                <div className="flex items-center gap-2 mb-2">
                  <svg className="w-4 h-4 text-amber-500" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v3a1 1 0 102 0V7zm-1 7a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                  </svg>
                  <p className="text-sm font-semibold text-amber-700">Bank Unmatched Value</p>
                </div>
                <p className="text-2xl font-bold text-amber-800">
                  {formatCurrencyNGN(safeNumber(summary?.total_unmatched_bank_value))}
                </p>
                <p className="text-xs text-amber-500 mt-1">Transactions on bank statement not found in backend</p>
              </div>
            </div>
          </section>

          {/* Unmatched Exports */}
          <section>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
              <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Unmatched Exports</h2>
              <p className="text-xs text-slate-400">Export detailed rows to CSV for deeper analysis</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-white border border-slate-200 rounded-xl p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-700">Backend Only - Send Transfers</p>
                    <p className="text-xs text-slate-500">{formatNumber(unmatchedSendCount)} records</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => downloadCsv(`unmatched-backend-send-${results.run_id}.csv`, unmatched?.backend_only_send ?? [])}
                    className="px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition"
                    disabled={unmatchedSendCount === 0}
                  >
                    Export CSV
                  </button>
                </div>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-700">Backend Only - Fund Transfers</p>
                    <p className="text-xs text-slate-500">{formatNumber(unmatchedFundCount)} records</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => downloadCsv(`unmatched-backend-fund-${results.run_id}.csv`, unmatched?.backend_only_fund ?? [])}
                    className="px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition"
                    disabled={unmatchedFundCount === 0}
                  >
                    Export CSV
                  </button>
                </div>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-700">Bank Only</p>
                    <p className="text-xs text-slate-500">{formatNumber(unmatchedBankCount)} records</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => downloadCsv(`unmatched-bank-only-${results.run_id}.csv`, unmatched?.bank_only ?? [])}
                    className="px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition"
                    disabled={unmatchedBankCount === 0}
                  >
                    Export CSV
                  </button>
                </div>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-700">Reversal Unmatched</p>
                    <p className="text-xs text-slate-500">{formatNumber(unmatchedReversalCount)} records</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => downloadCsv(`unmatched-reversal-${results.run_id}.csv`, unmatched?.reversal_unmatched ?? [])}
                    className="px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition"
                    disabled={unmatchedReversalCount === 0}
                  >
                    Export CSV
                  </button>
                </div>
              </div>
            </div>
          </section>

          {/* AI Analysis */}
          {results.ai_analysis && (
            <section>
              <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">AI Analysis</h2>
              <div className="bg-gradient-to-br from-indigo-50 to-blue-50 border border-indigo-200 rounded-xl p-6">
                <div className="flex items-center gap-2 mb-4">
                  <div className="bg-indigo-600 text-white rounded-lg p-1.5">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                  </div>
                  <span className="text-sm font-semibold text-indigo-700">AI-Generated Insights</span>
                </div>
                <div className="prose prose-sm prose-slate max-w-none">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      h1: ({ children }) => <h1 className="text-xl font-bold text-slate-800 mt-4 mb-2">{children}</h1>,
                      h2: ({ children }) => <h2 className="text-base font-bold text-slate-700 mt-5 mb-2 border-b border-indigo-200 pb-1">{children}</h2>,
                      h3: ({ children }) => <h3 className="text-sm font-bold text-slate-700 mt-3 mb-1">{children}</h3>,
                      p: ({ children }) => <p className="text-sm text-slate-600 mb-3 leading-relaxed">{children}</p>,
                      ul: ({ children }) => <ul className="list-disc list-inside space-y-1 mb-3 text-sm text-slate-600">{children}</ul>,
                      ol: ({ children }) => <ol className="list-decimal list-inside space-y-1 mb-3 text-sm text-slate-600">{children}</ol>,
                      li: ({ children }) => <li className="leading-relaxed">{children}</li>,
                      strong: ({ children }) => <strong className="font-semibold text-slate-700">{children}</strong>,
                      code: ({ children }) => <code className="bg-indigo-100 text-indigo-800 px-1.5 py-0.5 rounded text-xs font-mono">{children}</code>,
                      table: ({ children }) => (
                        <div className="overflow-x-auto my-4">
                          <table className="w-full text-sm border border-indigo-200 rounded-lg overflow-hidden">{children}</table>
                        </div>
                      ),
                      thead: ({ children }) => <thead className="bg-indigo-100">{children}</thead>,
                      th: ({ children }) => <th className="px-3 py-2 text-left text-xs font-semibold text-indigo-700 border-b border-indigo-200">{children}</th>,
                      td: ({ children }) => <td className="px-3 py-2 text-slate-600 border-b border-indigo-100">{children}</td>,
                      blockquote: ({ children }) => <blockquote className="border-l-4 border-indigo-400 pl-4 text-slate-600 italic my-3">{children}</blockquote>,
                      hr: () => <hr className="border-indigo-200 my-4" />,
                    }}
                  >
                    {results.ai_analysis}
                  </ReactMarkdown>
                </div>
              </div>
            </section>
          )}

          {/* Footer */}
          <div className="pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
            <span>Liberty Agency Banking Reconciliation Tool</span>
            <span>Run ID: {results.run_id}</span>
          </div>
        </div>
      </div>
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

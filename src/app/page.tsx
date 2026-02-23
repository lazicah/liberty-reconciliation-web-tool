"use client";

import { useState, useRef } from "react";
import ReconciliationResults from "@/components/ReconciliationResults";
import ProgressLog from "@/components/ProgressLog";

interface LogEntry {
  id: string;
  message: string;
  timestamp: Date;
  status: "pending" | "success" | "error";
}

interface ReconciliationResponse {
  run_id: string;
  start_date: string;
  end_date: string;
  status: string;
  summary: {
    total_backend_transactions: number;
    total_bank_transactions: number;
    send_bank_matched: number;
    send_bank_unmatched: number;
    fund_matched: number;
    fund_unmatched: number;
    bank_to_backend_matched: number;
    bank_to_backend_unmatched: number;
    total_unmatched_backend_value: number;
    total_unmatched_bank_value: number;
    reversal_matched?: number;
    reversal_unmatched?: number;
    failed_backend_mapped?: number;
  };
  ai_analysis?: string;
  backend_count: number;
  bank_count: number;
  bank_transactions_parsed?: number;
  unmatched?: {
    backend_only_send?: Array<{
      transaction_type: string;
      amount: number;
      date_created?: string;
      status?: string;
    }>;
    backend_only_fund?: Array<{
      transaction_type: string;
      amount: number;
      session_id?: string;
      date_created?: string;
      status?: string;
    }>;
    bank_only?: Array<{
      transaction_date: string;
      narration: string;
      debit?: number;
      credit?: number;
    }>;
    reversal_unmatched?: Array<{
      transaction_date: string;
      narration: string;
      credit?: number;
      debit?: number;
    }>;
  };
  error?: string;
}

export default function Home() {
  const [sheetUrl, setSheetUrl] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [runAiAnalysis, setRunAiAnalysis] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [results, setResults] = useState<ReconciliationResponse | null>(null);
  const [progressLogs, setProgressLogs] = useState<LogEntry[]>([]);
  const resultsRef = useRef<HTMLDivElement>(null);
  const logCounterRef = useRef(0);

  function addLog(
    message: string,
    status: "pending" | "success" | "error" = "pending"
  ): string {
    const id = `log-${++logCounterRef.current}`;
    const entry: LogEntry = {
      id,
      message,
      timestamp: new Date(),
      status,
    };
    setProgressLogs((prev) => [...prev, entry]);
    return id;
  }

  function updateLog(id: string, status: "success" | "error") {
    setProgressLogs((prev) =>
      prev.map((log) => (log.id === id ? { ...log, status } : log))
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setResults(null);
    setProgressLogs([]);
    setLoading(true);

    try {
      const validateLog = addLog("Validating input...");
      // Quick validation
      if (!sheetUrl || !startDate || !endDate) {
        updateLog(validateLog, "error");
        setError("Please fill in all required fields.");
        setLoading(false);
        return;
      }
      updateLog(validateLog, "success");

      const fetchLog = addLog("Fetching and parsing Google Sheet...");

      const response = await fetch("/api/reconcile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sheet_url: sheetUrl,
          start_date: startDate,
          end_date: endDate,
          run_ai_analysis: runAiAnalysis,
        }),
      });

      const data: ReconciliationResponse = await response.json();

      if (!response.ok || data.error) {
        updateLog(fetchLog, "error");
        setError(data.error ?? "An unexpected error occurred.");
        setLoading(false);
        return;
      }

      updateLog(fetchLog, "success");

      const reconcileLog = addLog("Running reconciliation...");
      updateLog(reconcileLog, "success");

      if (runAiAnalysis && data.ai_analysis) {
        const analysisLog = addLog("AI analysis completed");
        updateLog(analysisLog, "success");
      }

      const finalLog = addLog("Generating report...");
      setResults(data);
      updateLog(finalLog, "success");

      setTimeout(() => {
        resultsRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 100);
    } catch (err) {
      console.error("Reconciliation request failed:", err);
      setError("Network error. Please check your connection and try again.");
      if (progressLogs.length > 0) {
        updateLog(progressLogs[progressLogs.length - 1].id, "error");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 shadow-sm print:hidden">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center gap-3">
          <div className="bg-blue-600 text-white rounded-lg p-2">
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 11h.01M12 11h.01M15 11h.01M4 19h16a2 2 0 002-2V7a2 2 0 00-2-2H4a2 2 0 00-2 2v10a2 2 0 002 2z"
              />
            </svg>
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800">
              Liberty Reconciliation Tool
            </h1>
            <p className="text-xs text-slate-500">
              Agency Banking · Reconciliation Platform
            </p>
          </div>
        </div>
      </header>

      {/* Form Section */}
      <main className="max-w-5xl mx-auto px-4 py-8 print:hidden">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-5">
            <h2 className="text-white font-semibold text-lg">
              Start Reconciliation
            </h2>
            <p className="text-blue-100 text-sm mt-1">
              Enter your Google Sheet URL and date range to begin
            </p>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-5">
            {/* Google Sheet URL */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Google Sheet URL
                <span className="text-red-500 ml-1">*</span>
              </label>
              <input
                type="url"
                required
                value={sheetUrl}
                onChange={(e) => setSheetUrl(e.target.value)}
                placeholder="https://docs.google.com/spreadsheets/d/..."
                className="w-full px-4 py-2.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
              />
              <p className="mt-1 text-xs text-slate-400">
                The sheet must be publicly accessible. Columns should include:
                Transaction ID, Date, Narration, Debit, Credit, Session ID.
              </p>
            </div>

            {/* Date Range */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Start Date
                  <span className="text-red-500 ml-1">*</span>
                </label>
                <input
                  type="date"
                  required
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  End Date
                  <span className="text-red-500 ml-1">*</span>
                </label>
                <input
                  type="date"
                  required
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                />
              </div>
            </div>

            {/* AI Analysis Toggle */}
            <div className="flex items-center justify-between bg-slate-50 rounded-xl p-4 border border-slate-200">
              <div>
                <p className="text-sm font-medium text-slate-700">
                  AI Analysis
                </p>
                <p className="text-xs text-slate-400 mt-0.5">
                  Generate AI-powered insights and recommendations
                </p>
              </div>
              <button
                type="button"
                onClick={() => setRunAiAnalysis(!runAiAnalysis)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                  runAiAnalysis ? "bg-blue-600" : "bg-slate-300"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                    runAiAnalysis ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl p-4">
                <svg
                  className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                    clipRule="evenodd"
                  />
                </svg>
                <div>
                  <p className="text-sm font-medium text-red-700">Error</p>
                  <p className="text-sm text-red-600 mt-0.5">{error}</p>
                </div>
              </div>
            )}

            {/* Progress Log */}
            {loading && <ProgressLog logs={progressLogs} />}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold py-3 px-6 rounded-xl transition-colors flex items-center justify-center gap-2 text-sm"
            >
              {loading ? (
                <>
                  <svg
                    className="animate-spin h-4 w-4 text-white"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                  Running Reconciliation…
                </>
              ) : (
                <>
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  Run Reconciliation
                </>
              )}
            </button>
          </form>
        </div>
      </main>

      {/* Results */}
      {results && (
        <div ref={resultsRef}>
          <ReconciliationResults data={results} />
        </div>
      )}
    </div>
  );
}

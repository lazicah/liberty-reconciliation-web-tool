"use client";

import { useState, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const LOCALE = "en-NG";

interface Summary {
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
}

interface UnmatchedData {
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
}

interface ReconciliationData {
  run_id: string;
  start_date: string;
  end_date: string;
  status: string;
  summary: Summary;
  ai_analysis?: string;
  backend_count: number;
  bank_count: number;
  bank_transactions_parsed?: number;
  unmatched?: UnmatchedData;
}

interface Props {
  data: ReconciliationData;
}

function formatNumber(n: number): string {
  return new Intl.NumberFormat(LOCALE).format(n);
}

function formatCurrency(n: number): string {
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
    if (raw.includes("\"")) {
      return `"${raw.replace(/\"/g, '""')}"`;
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

export default function ReconciliationResults({ data }: Props) {
  const printRef = useRef<HTMLDivElement>(null);
  const [copyStatus, setCopyStatus] = useState<"idle" | "success" | "error">(
    "idle"
  );
  const { summary } = data;
  const unmatched = data.unmatched;

  const totalBankMatched = safeNumber(summary.bank_to_backend_matched);
  const totalBankUnmatched = safeNumber(summary.bank_to_backend_unmatched);
  const totalBank = totalBankMatched + totalBankUnmatched;
  const overallMatchRate =
    totalBank > 0 ? (totalBankMatched / totalBank) * 100 : 0;

  const sendTotal =
    safeNumber(summary.send_bank_matched) +
    safeNumber(summary.send_bank_unmatched);
  const fundTotal =
    safeNumber(summary.fund_matched) + safeNumber(summary.fund_unmatched);
  const reversalTotal =
    safeNumber(summary.reversal_matched) +
    safeNumber(summary.reversal_unmatched);

  const unmatchedSendCount = unmatched?.backend_only_send?.length ?? 0;
  const unmatchedFundCount = unmatched?.backend_only_fund?.length ?? 0;
  const unmatchedBankCount = unmatched?.bank_only?.length ?? 0;
  const unmatchedReversalCount = unmatched?.reversal_unmatched?.length ?? 0;
  const unmatchedTotal =
    unmatchedSendCount +
    unmatchedFundCount +
    unmatchedBankCount +
    unmatchedReversalCount;

  const topUnmatchedBucket = [
    { label: "Backend send", value: unmatchedSendCount },
    { label: "Backend fund", value: unmatchedFundCount },
    { label: "Bank only", value: unmatchedBankCount },
    { label: "Reversal", value: unmatchedReversalCount },
  ].sort((a, b) => b.value - a.value)[0];

  const statusColor =
    data.status === "complete"
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
        <h2 className="text-lg font-bold text-slate-800">
          Reconciliation Report
        </h2>
        <div className="flex items-center gap-2">
          {copyStatus === "success" && (
            <span className="text-xs text-emerald-600 font-medium">
              ✓ Copied to clipboard!
            </span>
          )}
          {copyStatus === "error" && (
            <span className="text-xs text-red-500 font-medium">
              Could not copy
            </span>
          )}
          <button
            onClick={handleCopyEmail}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-600 text-sm font-medium rounded-lg hover:bg-slate-50 transition"
          >
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
                d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
              />
            </svg>
            Copy for Email
          </button>
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition"
          >
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
                d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"
              />
            </svg>
            Print / Save PDF
          </button>
        </div>
      </div>

      {/* Printable content */}
      <div
        ref={printRef}
        className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden"
      >
        {/* Report Header */}
        <div className="bg-gradient-to-r from-slate-800 to-slate-700 px-6 py-6 text-white">
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <svg
                  className="w-5 h-5 text-blue-300"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
                <span className="text-blue-200 text-xs font-medium uppercase tracking-wider">
                  Reconciliation Report
                </span>
              </div>
              <h1 className="text-xl font-bold">Liberty Agency Banking</h1>
              <p className="text-slate-300 text-sm mt-1">
                Period: {data.start_date} to {data.end_date}
              </p>
            </div>
            <div className="text-right">
              <span
                className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold border uppercase ${statusColor}`}
              >
                {data.status}
              </span>
              <p className="text-slate-400 text-xs mt-2">
                Run ID: {data.run_id}
              </p>
              <p className="text-slate-400 text-xs">
                Generated:{" "}
                {new Date().toLocaleString(LOCALE, {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </p>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-8">
          {/* Overview Stats */}
          <section>
            <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">
              Overview
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <StatCard
                label="Backend Transactions"
                value={formatNumber(summary.total_backend_transactions)}
                color="border-slate-200"
              />
              <StatCard
                label="Bank Transactions"
                value={formatNumber(summary.total_bank_transactions)}
                sub={
                  data.bank_transactions_parsed
                    ? `${formatNumber(data.bank_transactions_parsed)} parsed from sheet`
                    : undefined
                }
                color="border-slate-200"
              />
              <StatCard
                label="Unmatched Backend Value"
                value={formatCurrency(summary.total_unmatched_backend_value)}
                color="border-red-200"
              />
              <StatCard
                label="Unmatched Bank Value"
                value={formatCurrency(summary.total_unmatched_bank_value)}
                color="border-amber-200"
              />
            </div>
          </section>

          {/* Match Statistics */}
          <section>
            <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">
              Match Statistics
            </h2>
            <div className="bg-slate-50 rounded-xl border border-slate-200 p-5 space-y-6">
              <MatchBar
                label="Send Bank Transfers"
                matched={summary.send_bank_matched}
                unmatched={summary.send_bank_unmatched}
              />
              <MatchBar
                label="Fund Transfers"
                matched={summary.fund_matched}
                unmatched={summary.fund_unmatched}
              />
              <MatchBar
                label="Bank → Backend"
                matched={summary.bank_to_backend_matched}
                unmatched={summary.bank_to_backend_unmatched}
              />
              {(summary.reversal_matched || summary.reversal_unmatched) && (
                <MatchBar
                  label="Reversals"
                  matched={safeNumber(summary.reversal_matched)}
                  unmatched={safeNumber(summary.reversal_unmatched)}
                />
              )}
            </div>
          </section>

          {/* Charts & Insights */}
          <section>
            <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">
              Charts & Insights
            </h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white border border-slate-200 rounded-xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-sm font-semibold text-slate-700">
                    Match Rate Overview
                  </p>
                  <span className="text-xs text-slate-500">
                    {formatPercent(overallMatchRate)} matched
                  </span>
                </div>
                <div className="space-y-4">
                  <SimpleBar
                    label="Matched"
                    value={totalBankMatched}
                    total={totalBank}
                    color="bg-emerald-500"
                  />
                  <SimpleBar
                    label="Unmatched"
                    value={totalBankUnmatched}
                    total={totalBank}
                    color="bg-red-400"
                  />
                </div>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-5">
                <p className="text-sm font-semibold text-slate-700 mb-4">
                  Volume Mix by Transaction Type
                </p>
                <div className="space-y-4">
                  <SimpleBar
                    label="Send Bank Transfers"
                    value={sendTotal}
                    total={sendTotal + fundTotal + reversalTotal}
                    color="bg-blue-500"
                  />
                  <SimpleBar
                    label="Fund Transfers"
                    value={fundTotal}
                    total={sendTotal + fundTotal + reversalTotal}
                    color="bg-indigo-500"
                  />
                  <SimpleBar
                    label="Reversals"
                    value={reversalTotal}
                    total={sendTotal + fundTotal + reversalTotal}
                    color="bg-amber-500"
                  />
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
                value={formatNumber(safeNumber(summary.failed_backend_mapped))}
                detail="Backend records flagged as failed but mapped during reconciliation"
              />
            </div>
          </section>

          {/* Detailed Breakdown Table */}
          <section>
            <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">
              Detailed Breakdown
            </h2>
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                      Category
                    </th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                      Matched
                    </th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                      Unmatched
                    </th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                      Total
                    </th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                      Match Rate
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {[
                    {
                      cat: "Send Bank Transfers",
                      m: summary.send_bank_matched,
                      u: summary.send_bank_unmatched,
                    },
                    {
                      cat: "Fund Transfers",
                      m: summary.fund_matched,
                      u: summary.fund_unmatched,
                    },
                    {
                      cat: "Bank → Backend",
                      m: summary.bank_to_backend_matched,
                      u: summary.bank_to_backend_unmatched,
                    },
                  ].map(({ cat, m, u }) => {
                    const total = m + u;
                    const rate =
                      total > 0 ? ((m / total) * 100).toFixed(1) : "0.0";
                    return (
                      <tr key={cat} className="hover:bg-slate-50 transition">
                        <td className="px-4 py-3 font-medium text-slate-700">
                          {cat}
                        </td>
                        <td className="px-4 py-3 text-right text-emerald-600 font-medium">
                          {formatNumber(m)}
                        </td>
                        <td className="px-4 py-3 text-right text-red-500 font-medium">
                          {formatNumber(u)}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-600">
                          {formatNumber(total)}
                        </td>
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
                        summary.send_bank_matched +
                          summary.fund_matched +
                          summary.bank_to_backend_matched
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-red-500">
                      {formatNumber(
                        summary.send_bank_unmatched +
                          summary.fund_unmatched +
                          summary.bank_to_backend_unmatched
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-600">
                      {formatNumber(
                        summary.send_bank_matched +
                          summary.send_bank_unmatched +
                          summary.fund_matched +
                          summary.fund_unmatched +
                          summary.bank_to_backend_matched +
                          summary.bank_to_backend_unmatched
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
            <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">
              Unmatched Values
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-red-50 border border-red-200 rounded-xl p-5">
                <div className="flex items-center gap-2 mb-2">
                  <svg
                    className="w-4 h-4 text-red-500"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v3a1 1 0 102 0V7zm-1 7a1 1 0 100-2 1 1 0 000 2z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <p className="text-sm font-semibold text-red-700">
                    Backend Unmatched Value
                  </p>
                </div>
                <p className="text-2xl font-bold text-red-800">
                  {formatCurrency(summary.total_unmatched_backend_value)}
                </p>
                <p className="text-xs text-red-500 mt-1">
                  Transactions in backend not found on bank statement
                </p>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
                <div className="flex items-center gap-2 mb-2">
                  <svg
                    className="w-4 h-4 text-amber-500"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v3a1 1 0 102 0V7zm-1 7a1 1 0 100-2 1 1 0 000 2z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <p className="text-sm font-semibold text-amber-700">
                    Bank Unmatched Value
                  </p>
                </div>
                <p className="text-2xl font-bold text-amber-800">
                  {formatCurrency(summary.total_unmatched_bank_value)}
                </p>
                <p className="text-xs text-amber-500 mt-1">
                  Transactions on bank statement not found in backend
                </p>
              </div>
            </div>
          </section>

          {/* Unmatched Exports */}
          <section>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
              <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">
                Unmatched Exports
              </h2>
              <p className="text-xs text-slate-400">
                Export detailed rows to CSV for deeper analysis
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-white border border-slate-200 rounded-xl p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-700">
                      Backend Only - Send Transfers
                    </p>
                    <p className="text-xs text-slate-500">
                      {formatNumber(unmatchedSendCount)} records
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      downloadCsv(
                        `unmatched-backend-send-${data.run_id}.csv`,
                        unmatched?.backend_only_send ?? []
                      )
                    }
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
                    <p className="text-sm font-semibold text-slate-700">
                      Backend Only - Fund Transfers
                    </p>
                    <p className="text-xs text-slate-500">
                      {formatNumber(unmatchedFundCount)} records
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      downloadCsv(
                        `unmatched-backend-fund-${data.run_id}.csv`,
                        unmatched?.backend_only_fund ?? []
                      )
                    }
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
                    <p className="text-sm font-semibold text-slate-700">
                      Bank Only
                    </p>
                    <p className="text-xs text-slate-500">
                      {formatNumber(unmatchedBankCount)} records
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      downloadCsv(
                        `unmatched-bank-only-${data.run_id}.csv`,
                        unmatched?.bank_only ?? []
                      )
                    }
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
                    <p className="text-sm font-semibold text-slate-700">
                      Reversal Unmatched
                    </p>
                    <p className="text-xs text-slate-500">
                      {formatNumber(unmatchedReversalCount)} records
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      downloadCsv(
                        `unmatched-reversal-${data.run_id}.csv`,
                        unmatched?.reversal_unmatched ?? []
                      )
                    }
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
          {data.ai_analysis && (
            <section>
              <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">
                AI Analysis
              </h2>
              <div className="bg-gradient-to-br from-indigo-50 to-blue-50 border border-indigo-200 rounded-xl p-6">
                <div className="flex items-center gap-2 mb-4">
                  <div className="bg-indigo-600 text-white rounded-lg p-1.5">
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
                        d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                      />
                    </svg>
                  </div>
                  <span className="text-sm font-semibold text-indigo-700">
                    AI-Generated Insights
                  </span>
                </div>
                <div className="prose prose-sm prose-slate max-w-none">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      h1: ({ children }) => (
                        <h1 className="text-xl font-bold text-slate-800 mt-4 mb-2">
                          {children}
                        </h1>
                      ),
                      h2: ({ children }) => (
                        <h2 className="text-base font-bold text-slate-700 mt-5 mb-2 border-b border-indigo-200 pb-1">
                          {children}
                        </h2>
                      ),
                      h3: ({ children }) => (
                        <h3 className="text-sm font-bold text-slate-700 mt-3 mb-1">
                          {children}
                        </h3>
                      ),
                      p: ({ children }) => (
                        <p className="text-sm text-slate-600 mb-3 leading-relaxed">
                          {children}
                        </p>
                      ),
                      ul: ({ children }) => (
                        <ul className="list-disc list-inside space-y-1 mb-3 text-sm text-slate-600">
                          {children}
                        </ul>
                      ),
                      ol: ({ children }) => (
                        <ol className="list-decimal list-inside space-y-1 mb-3 text-sm text-slate-600">
                          {children}
                        </ol>
                      ),
                      li: ({ children }) => (
                        <li className="leading-relaxed">{children}</li>
                      ),
                      strong: ({ children }) => (
                        <strong className="font-semibold text-slate-700">
                          {children}
                        </strong>
                      ),
                      code: ({ children }) => (
                        <code className="bg-indigo-100 text-indigo-800 px-1.5 py-0.5 rounded text-xs font-mono">
                          {children}
                        </code>
                      ),
                      table: ({ children }) => (
                        <div className="overflow-x-auto my-4">
                          <table className="w-full text-sm border border-indigo-200 rounded-lg overflow-hidden">
                            {children}
                          </table>
                        </div>
                      ),
                      thead: ({ children }) => (
                        <thead className="bg-indigo-100">{children}</thead>
                      ),
                      th: ({ children }) => (
                        <th className="px-3 py-2 text-left text-xs font-semibold text-indigo-700 border-b border-indigo-200">
                          {children}
                        </th>
                      ),
                      td: ({ children }) => (
                        <td className="px-3 py-2 text-slate-600 border-b border-indigo-100">
                          {children}
                        </td>
                      ),
                      blockquote: ({ children }) => (
                        <blockquote className="border-l-4 border-indigo-400 pl-4 text-slate-600 italic my-3">
                          {children}
                        </blockquote>
                      ),
                      hr: () => (
                        <hr className="border-indigo-200 my-4" />
                      ),
                    }}
                  >
                    {data.ai_analysis}
                  </ReactMarkdown>
                </div>
              </div>
            </section>
          )}

          {/* Footer */}
          <div className="pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
            <span>Liberty Agency Banking Reconciliation Tool</span>
            <span>Run ID: {data.run_id}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

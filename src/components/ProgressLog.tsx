"use client";

import { useEffect, useRef } from "react";

interface LogEntry {
  id: string;
  message: string;
  timestamp: Date;
  status: "pending" | "success" | "error";
}

interface Props {
  logs: LogEntry[];
}

export default function ProgressLog({ logs }: Props) {
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  return (
    <div className="mt-6 bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="bg-slate-50 px-4 py-3 border-b border-slate-200">
        <h3 className="text-sm font-semibold text-slate-700">Progress Log</h3>
      </div>
      <div className="p-4 space-y-3 max-h-64 overflow-y-auto bg-slate-50">
        {logs.length === 0 ? (
          <p className="text-sm text-slate-400 italic">Waiting to start...</p>
        ) : (
          logs.map((log) => (
            <div key={log.id} className="flex items-start gap-3">
              {log.status === "pending" && (
                <div className="pt-1">
                  <svg
                    className="animate-spin h-4 w-4 text-blue-500"
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
                </div>
              )}
              {log.status === "success" && (
                <div className="pt-1">
                  <svg
                    className="h-4 w-4 text-emerald-500"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
              )}
              {log.status === "error" && (
                <div className="pt-1">
                  <svg
                    className="h-4 w-4 text-red-500"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
              )}
              <div className="flex-1">
                <p
                  className={`text-sm ${
                    log.status === "error"
                      ? "text-red-600 font-medium"
                      : "text-slate-700"
                  }`}
                >
                  {log.message}
                </p>
                <p className="text-xs text-slate-400 mt-0.5">
                  {log.timestamp.toLocaleTimeString()}
                </p>
              </div>
            </div>
          ))
        )}
        <div ref={logsEndRef} />
      </div>
    </div>
  );
}

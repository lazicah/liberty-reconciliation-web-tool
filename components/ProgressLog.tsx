interface LogEntry {
  id: string;
  message: string;
  timestamp: Date;
  status: "pending" | "success" | "error";
}

interface ProgressLogProps {
  logs: LogEntry[];
}

export default function ProgressLog({ logs }: ProgressLogProps) {
  if (logs.length === 0) return null;

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <svg
          className="w-4 h-4 text-blue-600 animate-spin"
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
        <span className="text-sm font-medium text-slate-700">Progress</span>
      </div>
      <div className="space-y-2">
        {logs.map((log) => (
          <div key={log.id} className="flex items-center gap-2 text-sm">
            {log.status === "pending" && (
              <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />
            )}
            {log.status === "success" && (
              <svg
                className="w-4 h-4 text-emerald-600 flex-shrink-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            )}
            {log.status === "error" && (
              <svg
                className="w-4 h-4 text-red-600 flex-shrink-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            )}
            <span
              className={`${
                log.status === "success"
                  ? "text-emerald-700"
                  : log.status === "error"
                    ? "text-red-700"
                    : "text-slate-600"
              }`}
            >
              {log.message}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

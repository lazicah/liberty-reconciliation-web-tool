import { NextRequest, NextResponse } from "next/server";
import Papa from "papaparse";

const RECONCILE_ENDPOINT =
  "https://la-agency-banking-reconciliation.onrender.com/reconcile";

const SPREADSHEET_ID_PATTERN = /\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/;
const USER_AGENT = "Mozilla/5.0 (compatible; LibertyReconciliationTool/1.0)";

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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sheet_url, start_date, end_date, run_ai_analysis } = body;

    if (!sheet_url) {
      return NextResponse.json(
        { error: "Google Sheet URL is required." },
        { status: 400 }
      );
    }
    if (!start_date || !end_date) {
      return NextResponse.json(
        { error: "Start date and end date are required." },
        { status: 400 }
      );
    }

    // Fetch and parse the Google Sheet
    const bankData = await fetchAndParseSheet(sheet_url);

    console.log(`Parsed ${bankData.length} transactions from the sheet.`);

    // Build reconciliation request
    const reconcileBody = {
      start_date,
      end_date,
      run_ai_analysis: run_ai_analysis ?? false,
      bank_data: bankData,
    };

    console.log(reconcileBody);

    // Call the reconciliation endpoint
    let reconcileResponse;
    try {
      reconcileResponse = await fetch(RECONCILE_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(reconcileBody),
      });
    } catch (fetchErr: unknown) {
      const fetchMessage =
        fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
      console.error(`Fetch failed: ${fetchMessage}`);
      return NextResponse.json(
        {
          error: `Failed to connect to reconciliation service: ${fetchMessage}. Please check your internet connection and try again.`,
        },
        { status: 503 }
      );
    }

    if (!reconcileResponse.ok) {
      const errText = await reconcileResponse.text();
      console.error(
        `Reconciliation service error (${reconcileResponse.status}): ${errText}`
      );
      return NextResponse.json(
        {
          error: `Reconciliation service returned an error (${reconcileResponse.status}): ${errText}`,
        },
        { status: reconcileResponse.status }
      );
    }

    const reconcileResult = await reconcileResponse.json();

    return NextResponse.json({
      ...reconcileResult,
      bank_transactions_parsed: bankData.length,
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "An unexpected error occurred.";
    console.error(`API error: ${message}`);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

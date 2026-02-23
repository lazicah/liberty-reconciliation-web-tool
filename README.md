# Liberty Reconciliation Web Tool

A Next.js web application for bank reconciliation hosted on Vercel.

## Features

- **Google Sheet Integration**: Paste a public Google Sheet URL containing bank transactions
- **Date Range Selection**: Specify the reconciliation period (start and end dates)
- **AI Analysis**: Optional AI-powered analysis of reconciliation results
- **Beautiful Reports**: View detailed reconciliation results with match statistics and visual charts
- **Print / PDF Export**: Print-friendly layout for saving or emailing reports

## How It Works

1. Paste your public Google Sheet URL containing bank transactions
2. Set the start and end dates for the reconciliation period
3. Toggle AI analysis on/off
4. Click **Run Reconciliation** to submit
5. The tool reads the Google Sheet, parses transactions, and sends them to the reconciliation API
6. View the formatted report with match rates, unmatched values, and AI insights

## Google Sheet Format

The sheet should have the following columns (case-insensitive):

| Column | Description |
|--------|-------------|
| Transaction ID | Unique transaction identifier |
| Transaction Date | Date of the transaction |
| Narration | Transaction description |
| Debit | Debit amount |
| Credit | Credit amount |
| Session ID | Bank session/reference ID |

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Deployment

Deploy to [Vercel](https://vercel.com) by connecting this repository.

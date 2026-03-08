# Liberty Pay Reconciliation Web

Unified web application for Liberty Pay card and transfer reconciliation. Consolidates two separate frontend applications into a single Next.js-based dashboard with unified navigation and shared API client.

## Features

- **Dashboard**: Real-time service health status and latest reconciliation metrics
- **Reconciliation**: Tabbed interface for both transfer and card reconciliation with AI analysis
- **Metrics & Reports**: Historical metrics with Chart.js visualizations, filtering by date, and CSV/JSON export
- **Configuration**: System settings, merchant IDs, and Google Sheets integration status
- **Responsive Design**: Mobile-friendly Tailwind CSS with dark mode support
- **Type Safety**: Full TypeScript with strict mode enabled
- **API Integration**: Unified API client handling both `/` (transfer) and `/card-reconciliation/*` (card) endpoints

## Tech Stack

- **Framework**: Next.js 14 with App Router
- **Language**: TypeScript (strict mode)
- **Styling**: Tailwind CSS with PostCSS
- **HTTP Client**: Axios
- **Charts**: Chart.js + react-chartjs-2
- **Markdown**: react-markdown with GitHub Flavored Markdown
- **CSV**: papaparse
- **Package Manager**: npm

## Prerequisites

- Node.js 18+
- Backend API running on `http://localhost:8000` (development)
- Environment configuration (see below)

## Getting Started

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Create `.env.local` for development (copy from `.env.production` template):

```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
```

For production, set:

```env
NEXT_PUBLIC_API_BASE_URL=https://api.yourdomain.com
```

### 3. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Development

### Project Structure

```
web/
├── app/
│   ├── page.tsx              # Dashboard (home page)
│   ├── reconciliation/
│   │   └── page.tsx          # Reconciliation with Transfer/Card tabs
│   ├── metrics/
│   │   └── page.tsx          # Metrics & Reports
│   ├── config/
│   │   └── page.tsx          # System Configuration
│   ├── layout.tsx            # Root layout with NavBar
│   └── globals.css           # Global Tailwind styles
├── components/
│   ├── NavBar.tsx            # Main navigation
│   ├── StatusBadge.tsx       # Status indicator
│   ├── MetricsCard.tsx       # Metric display card
│   └── Feedback.tsx          # LoadingSpinner, Error, Success messages
├── lib/
│   ├── api.ts                # Unified API client service
│   └── utils.ts              # Utilities (formatting, downloads)
└── public/                   # Static assets
```

### API Client

The `APIService` class in `lib/api.ts` provides unified access to all backend endpoints:

```typescript
import { apiService } from '@/lib/api';

// Transfer reconciliation
const result = await apiService.runTransferReconciliation({
  start_date: "2026-02-07",
  end_date: "2026-02-28",
  bank_data: dataArray,
  run_ai_analysis: true
});

// Card reconciliation
const result = await apiService.runCardReconciliation({
  run_date: "2026-02-07",
  days_offset: 18
});

// Metrics
const metrics = await apiService.getLatestMetrics();
const byDate = await apiService.getMetricsByDate("2026-02-07");

// Configuration
const config = await apiService.getConfig();

// Health checks
const transferHealth = await apiService.getHealth();
const cardHealth = await apiService.getCardHealth();
```

### Components

Reusable components for common UI patterns:

- **NavBar**: Active route highlighting, responsive menu
- **StatusBadge**: Colored status indicator (healthy, degraded, error)
- **MetricsCard**: Currency-formatted metric display card
- **LoadingSpinner**: Animated loading indicator
- **ErrorMessage**: Error display with error details
- **SuccessMessage**: Success notification

### Utilities

Helper functions in `lib/utils.ts`:

- `formatCurrency(amount, currency)`: Format as NGN or custom currency
- `formatDate(date)`: Format with Nigerian locale (en-NG)
- `formatNumber(num)`: Format with thousand separators
- `calculatePercentage(part, whole)`: Calculate and format percentage
- `downloadJSON(data, filename)`: Download object as JSON file
- `downloadCSV(data, filename)`: Download array as CSV file

## Building for Production

### 1. Build

```bash
npm run build
```

### 2. Start Production Server

```bash
npm start
```

### 3. Deployment to Vercel (Recommended)

```bash
npm install -g vercel
vercel
```

Then set environment variables in Vercel dashboard:
- `NEXT_PUBLIC_API_BASE_URL`: Your production API URL

## Testing

### Lint Code

```bash
npm run lint
```

### Type Check

```bash
npm run type-check
```

## Backend Integration

This frontend connects to a unified FastAPI backend with routes:

- **Transfer Endpoints** (at root `/`)
  - `GET /health` - Check API health
  - `POST /reconcile` - Run transfer reconciliation

- **Card Endpoints** (at `/card-reconciliation/`)
  - `GET /card-reconciliation/health` - Check card API health
  - `POST /card-reconciliation/reconciliation/run` - Run card reconciliation
  - `GET /card-reconciliation/metrics/latest` - Get latest metrics
  - `GET /card-reconciliation/metrics/{date}` - Get metrics for date
  - `GET /card-reconciliation/config` - Get configuration

## Environment Variables

| Variable | Type | Description | Default |
|----------|------|-------------|---------|
| `NEXT_PUBLIC_API_BASE_URL` | string | Backend API base URL | `http://localhost:8000` |

Note: Variables prefixed with `NEXT_PUBLIC_` are exposed to the browser.

## Troubleshooting

### API Connection Issues

1. Verify backend is running on the configured URL
2. Check `NEXT_PUBLIC_API_BASE_URL` in `.env.local`
3. Ensure CORS is configured on backend
4. Open browser console for detailed error messages

### Build Errors

```bash
# Clear build cache
rm -rf .next

# Reinstall dependencies
rm -rf node_modules
npm install

# Rebuild
npm run build
```

### TypeScript Errors

```bash
# Run type check
npm run type-check

# Strict mode may reject previously valid code
# Check error messages in console
```

## License

Proprietary - Liberty Pay

## Support

For issues or feature requests, contact the development team.

import axios, { AxiosInstance } from 'axios';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';

const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 150000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// ─────────────────────────────────────────────────────────────
// TYPES & INTERFACES
// ─────────────────────────────────────────────────────────────

export interface HealthResponse {
  status: 'healthy' | 'degraded';
  message: string;
  google_sheets_connected?: boolean;
  openai_configured?: boolean;
  backend_api_configured?: boolean;
  ai_configured?: boolean;
  card_reconciliation_included?: boolean;
}

export interface ChannelMetrics {
  revenue?: number;
  settlement?: number;
  charge_back?: number;
  unsettled_claim?: number;
}

export interface MetricsResponse {
  run_date: string;
  total_revenue: number;
  total_settlement: number;
  total_settlement_charge_back: number;
  total_settlement_unsettled_claims: number;
  total_bank_isw_unsettled_claims: number;
  total_bank_isw_charge_back: number;
  channels: Record<string, ChannelMetrics>;
}

export interface CardReconciliationRequest {
  run_date?: string | null;
  days_offset?: number;
}

export interface CardReconciliationResponse {
  status: string;
  message: string;
  run_date: string;
  metrics: MetricsResponse;
  ai_summary?: string;
  metrics_file_path: string;
  debug?: Record<string, unknown>;
}

export interface TransferReconciliationRequest {
  start_date: string;
  end_date: string;
  bank_data: Record<string, unknown>[];
  run_ai_analysis: boolean;
}

export interface TransferReconciliationResponse {
  run_id: string;
  start_date: string;
  end_date: string;
  status: string;
  summary: Record<string, unknown>;
  ai_analysis?: string;
  backend_count: number;
  bank_count: number;
  unmatched?: Record<string, unknown>;
}

export interface ConfigResponse {
  spreadsheet_id: string;
  ai_model: string;
  merchant_ids: Record<string, string | number>;
  sheet_names: Record<string, string>;
}

// ─────────────────────────────────────────────────────────────
// API SERVICE CLASS
// ─────────────────────────────────────────────────────────────

export class APIService {
  // HEALTH & STATUS
  
  async getHealth(): Promise<HealthResponse> {
    const response = await apiClient.get<HealthResponse>('/health');
    return response.data;
  }

  async getCardHealth(): Promise<HealthResponse> {
    const response = await apiClient.get<HealthResponse>('/card-reconciliation/health');
    return response.data;
  }

  // TRANSFER RECONCILIATION
  
  async runTransferReconciliation(
    request: TransferReconciliationRequest
  ): Promise<TransferReconciliationResponse> {
    const response = await apiClient.post<TransferReconciliationResponse>(
      '/reconcile',
      request
    );
    return response.data;
  }

  // CARD RECONCILIATION
  
  async runCardReconciliation(
    request: CardReconciliationRequest
  ): Promise<CardReconciliationResponse> {
    const response = await apiClient.post<CardReconciliationResponse>(
      '/card-reconciliation/reconciliation/run',
      request
    );
    return response.data;
  }

  // METRICS
  
  async getMetricsByDate(date: string): Promise<MetricsResponse> {
    const response = await apiClient.get<MetricsResponse>(
      `/card-reconciliation/metrics/${date}`
    );
    return response.data;
  }

  async getLatestMetrics(): Promise<MetricsResponse> {
    const response = await apiClient.get<MetricsResponse>(
      '/card-reconciliation/metrics/latest'
    );
    return response.data;
  }

  // CONFIGURATION
  
  async getConfig(): Promise<ConfigResponse> {
    const response = await apiClient.get<ConfigResponse>(
      '/card-reconciliation/config'
    );
    return response.data;
  }

  // UTILITIES
  
  getBaseURL(): string {
    return API_BASE_URL;
  }

  setBaseURL(url: string): void {
    apiClient.defaults.baseURL = url;
  }
}

export const apiService = new APIService();

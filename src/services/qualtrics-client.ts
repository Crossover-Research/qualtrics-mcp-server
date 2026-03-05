import { QualtricsConfig } from "../config/settings.js";
import { RateLimiter } from "./rate-limiter.js";
import type { Survey, SurveyListResponse, ResponseExportJob } from "../types/index.js";

export type { Survey, SurveyListResponse, ResponseExportJob };

export class QualtricsClient {
  private baseUrl: string;
  private apiToken: string;
  private rateLimiter: RateLimiter;
  private timeout: number;
  public readOnly: boolean;

  /** Endpoints that use POST but are actually read operations. */
  private static readonly READ_ONLY_POST_ALLOWLIST = [
    /\/export-responses$/,
  ];

  constructor(config: QualtricsConfig) {
    this.baseUrl = config.qualtrics.baseUrl ||
      `https://${config.qualtrics.dataCenter}.qualtrics.com/API/v3`;
    this.apiToken = config.qualtrics.apiToken;
    this.rateLimiter = new RateLimiter(config.server.rateLimiting);
    this.timeout = config.server.timeout;
    this.readOnly = config.server.readOnly;
  }

  public async makeRequest<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const method = (options.method ?? "GET").toUpperCase();
    if (this.readOnly && method !== "GET") {
      const isAllowlisted = QualtricsClient.READ_ONLY_POST_ALLOWLIST.some(
        (pattern) => pattern.test(endpoint)
      );
      if (!isAllowlisted) {
        throw new Error(
          `Read-only mode: ${method} ${endpoint} blocked. Set QUALTRICS_READ_ONLY=false to enable write operations.`
        );
      }
    }

    await this.rateLimiter.checkLimit();

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        ...options,
        headers: {
          "X-API-TOKEN": this.apiToken,
          "Content-Type": "application/json",
          ...options.headers,
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Qualtrics API error: ${response.status} ${response.statusText} - ${errorText}`);
      }

      return response.json();
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Request timeout');
      }
      throw error;
    }
  }

  async getSurveys(offset = 0, limit = 100): Promise<SurveyListResponse> {
    return this.makeRequest(`/surveys?offset=${offset}&limit=${limit}`);
  }

  async getSurvey(surveyId: string): Promise<any> {
    return this.makeRequest(`/surveys/${surveyId}`);
  }

  async getSurveyDefinition(surveyId: string): Promise<any> {
    return this.makeRequest(`/survey-definitions/${surveyId}`);
  }

  async createSurvey(surveyData: any): Promise<any> {
    return this.makeRequest("/survey-definitions", {
      method: "POST",
      body: JSON.stringify(surveyData),
    });
  }

  async startResponseExport(surveyId: string, format: string = "json", filters?: any): Promise<ResponseExportJob> {
    const requestBody: any = {
      format: format,
      compress: false,
    };

    // Add filters if provided
    if (filters) {
      Object.assign(requestBody, filters);
    }

    return this.makeRequest(`/surveys/${surveyId}/export-responses`, {
      method: "POST",
      body: JSON.stringify(requestBody),
    });
  }

  async getResponseExportProgress(surveyId: string, exportProgressId: string): Promise<any> {
    return this.makeRequest(`/surveys/${surveyId}/export-responses/${exportProgressId}`);
  }

  async downloadResponseExportFile(surveyId: string, fileId: string): Promise<string> {
    const response = await fetch(`${this.baseUrl}/surveys/${surveyId}/export-responses/${fileId}/file`, {
      headers: {
        "X-API-TOKEN": this.apiToken,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to download export file: ${response.status} ${response.statusText}`);
    }

    return response.text();
  }
}

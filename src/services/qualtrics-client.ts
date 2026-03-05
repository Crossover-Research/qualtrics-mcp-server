import { QualtricsConfig } from "../config/settings.js";
import { RateLimiter } from "./rate-limiter.js";
import type { Survey, SurveyListResponse, ResponseExportJob } from "../types/index.js";

export type { Survey, SurveyListResponse, ResponseExportJob };

/**
 * Scoped write categories grouped by risk level.
 *
 * HIGH RISK (unrecoverable):
 *   "users" — user account management
 *   "contacts" — mailing lists and contacts
 *   "surveys" — survey-level create/update/delete
 *
 * MEDIUM RISK (annoying but reprogrammable):
 *   "surveyDesign" — flows, embedded data, web services
 *
 * LOW RISK (deleted items go to trash):
 *   "questionsAndBlocks" — questions and blocks within surveys
 *
 * MINIMAL RISK:
 *   "distributions" — distributions and links
 */
export type WriteScope = "users" | "contacts" | "surveys" | "surveyDesign" | "questionsAndBlocks" | "distributions";

export const ALL_WRITE_SCOPES: WriteScope[] = ["users", "contacts", "surveys", "surveyDesign", "questionsAndBlocks", "distributions"];

export type RiskLevel = "HIGH" | "MEDIUM" | "LOW" | "MINIMAL";

interface ScopeInfo {
  description: string;
  risk: RiskLevel;
  riskNote: string;
}

const SCOPE_INFO: Record<WriteScope, ScopeInfo> = {
  users:             { description: "Create and update user accounts", risk: "HIGH", riskNote: "Account-level changes, unrecoverable" },
  contacts:          { description: "Create, update, and delete mailing lists and contacts", risk: "HIGH", riskNote: "Deleted contacts cannot be recovered" },
  surveys:           { description: "Create, update, and delete entire surveys", risk: "HIGH", riskNote: "Deleted surveys cannot be recovered" },
  surveyDesign:      { description: "Modify survey flow, embedded data, and web services", risk: "MEDIUM", riskNote: "Annoying but reprogrammable" },
  questionsAndBlocks: { description: "Create, update, and delete questions and blocks", risk: "LOW", riskNote: "Deleted items go to survey trash" },
  distributions:     { description: "Create and manage distributions and links", risk: "MINIMAL", riskNote: "Low impact" },
};

const SCOPE_DESCRIPTIONS: Record<WriteScope, string> = Object.fromEntries(
  ALL_WRITE_SCOPES.map(s => [s, SCOPE_INFO[s].description])
) as Record<WriteScope, string>;

/** Map endpoint patterns to their write scope. Order matters — first match wins. */
const ENDPOINT_SCOPE_RULES: Array<{ pattern: RegExp; scope: WriteScope }> = [
  // questionsAndBlocks: questions and blocks within surveys (LOW risk — trash recoverable)
  { pattern: /\/survey-definitions\/[^/]+\/questions/, scope: "questionsAndBlocks" },
  { pattern: /\/survey-definitions\/[^/]+\/blocks/, scope: "questionsAndBlocks" },
  // surveyDesign: flow, embedded data, web services, webhooks (MEDIUM risk — reprogrammable)
  { pattern: /\/survey-definitions\/[^/]+\/flow/, scope: "surveyDesign" },
  { pattern: /\/eventsubscriptions/, scope: "surveyDesign" },
  // surveys: survey-level CRUD (HIGH risk — unrecoverable)
  { pattern: /\/survey-definitions/, scope: "surveys" },
  { pattern: /\/surveys/, scope: "surveys" },
  // contacts & mailing lists (HIGH risk — unrecoverable)
  { pattern: /\/mailinglists/, scope: "contacts" },
  { pattern: /\/directories\/[^/]+\/contacts/, scope: "contacts" },
  // distributions (MINIMAL risk)
  { pattern: /\/distributions/, scope: "distributions" },
  // users (HIGH risk — account-level)
  { pattern: /\/users/, scope: "users" },
];

function resolveScope(endpoint: string): WriteScope | null {
  for (const rule of ENDPOINT_SCOPE_RULES) {
    if (rule.pattern.test(endpoint)) {
      return rule.scope;
    }
  }
  return null;
}

export class QualtricsClient {
  private baseUrl: string;
  private apiToken: string;
  private rateLimiter: RateLimiter;
  private timeout: number;

  /**
   * Set of scopes that are allowed to perform write operations.
   * Empty set = fully read-only. All scopes present = fully read-write.
   */
  public writeScopes: Set<WriteScope>;

  /** Backwards-compatible getter. */
  public get readOnly(): boolean {
    return this.writeScopes.size === 0;
  }

  /** Backwards-compatible setter: true clears all scopes, false grants all. */
  public set readOnly(value: boolean) {
    if (value) {
      this.writeScopes.clear();
    } else {
      this.writeScopes = new Set(ALL_WRITE_SCOPES);
    }
  }

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
    this.writeScopes = config.server.readOnly ? new Set() : new Set(ALL_WRITE_SCOPES);
  }

  public async makeRequest<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const method = (options.method ?? "GET").toUpperCase();
    if (method !== "GET") {
      const isAllowlisted = QualtricsClient.READ_ONLY_POST_ALLOWLIST.some(
        (pattern) => pattern.test(endpoint)
      );
      if (!isAllowlisted) {
        const scope = resolveScope(endpoint);
        if (scope === null || !this.writeScopes.has(scope)) {
          const scopeHint = scope
            ? ` Enable the "${scope}" scope to allow this operation.`
            : "";
          throw new Error(
            `Write blocked: ${method} ${endpoint}. ${scope ? `Scope "${scope}" is not enabled.` : "No matching scope found."}${scopeHint}`
          );
        }
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

  /** Get a human-readable summary of current write permissions. */
  public getScopesSummary(): string {
    if (this.writeScopes.size === 0) {
      return "READ-ONLY (no write scopes enabled)";
    }
    if (this.writeScopes.size === ALL_WRITE_SCOPES.length) {
      return "READ-WRITE (all scopes enabled)";
    }
    const enabled = ALL_WRITE_SCOPES.filter(s => this.writeScopes.has(s));
    const lines = enabled.map(s => `  ✓ ${s} [${SCOPE_INFO[s].risk} risk]: ${SCOPE_INFO[s].description} — ${SCOPE_INFO[s].riskNote}`);
    return `SCOPED WRITE (${enabled.length}/${ALL_WRITE_SCOPES.length} scopes enabled):\n${lines.join("\n")}`;
  }

  /** Get descriptions for all scopes. */
  public static getScopeDescriptions(): Record<WriteScope, string> {
    return { ...SCOPE_DESCRIPTIONS };
  }

  /** Get full scope info including risk levels. */
  public static getScopeInfo(): Record<WriteScope, ScopeInfo> {
    return { ...SCOPE_INFO };
  }
}

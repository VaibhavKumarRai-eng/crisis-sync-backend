import type {
  AlertResponse,
  CreateAlertPayload,
  CreateSOSPayload,
  CreateVenuePayload,
  DashboardSummary,
  HealthResponse,
  LoginPayload,
  RegisterPayload,
  SOSResponse,
  SOSStatus,
  Session,
  TokenResponse,
  UpdateSOSPayload,
  UserResponse,
  VenueResponse,
  CrisisSeverity,
} from "./types";

export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim() ?? "";
const TOKEN_STORAGE_KEY = "crisis-sync.token";

export class ApiError extends Error {
  status: number;
  details: unknown;

  constructor(message: string, status: number, details: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

function joinUrl(path: string): string {
  const normalizedBase = API_BASE_URL.replace(/\/$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
}

function buildQuery(query?: Record<string, string | number | boolean | null | undefined>): string {
  if (!query) {
    return "";
  }

  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") {
      continue;
    }
    search.set(key, String(value));
  }

  const rendered = search.toString();
  return rendered ? `?${rendered}` : "";
}

function parseBody(text: string): unknown {
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function extractErrorMessage(payload: unknown, fallback: string): string {
  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }

  if (payload && typeof payload === "object") {
    const detail = (payload as { detail?: unknown }).detail;
    if (typeof detail === "string") {
      return detail;
    }
    if (Array.isArray(detail) && detail.length > 0) {
      return detail
        .map((entry) => {
          if (entry && typeof entry === "object") {
            const location = Array.isArray((entry as { loc?: unknown }).loc)
              ? ((entry as { loc?: Array<string | number> }).loc ?? []).join(".")
              : "";
            const message = typeof (entry as { msg?: unknown }).msg === "string" ? (entry as { msg?: string }).msg : "";
            return [location, message].filter(Boolean).join(": ");
          }
          return String(entry);
        })
        .join("; ");
    }
  }

  return fallback;
}

async function requestJson<T>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    query?: Record<string, string | number | boolean | null | undefined>;
    auth?: boolean;
    headers?: HeadersInit;
  } = {},
): Promise<T> {
  const headers = new Headers(options.headers);

  if (options.auth !== false) {
    const token = getStoredToken();
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }
  }

  let body: BodyInit | undefined;
  if (options.body !== undefined) {
    if (options.body instanceof FormData || options.body instanceof Blob || typeof options.body === "string") {
      body = options.body;
    } else {
      headers.set("Content-Type", "application/json");
      body = JSON.stringify(options.body);
    }
  }

  const response = await fetch(joinUrl(path) + buildQuery(options.query), {
    method: options.method ?? "GET",
    headers,
    body,
  });

  const text = await response.text();
  const payload = parseBody(text);

  if (!response.ok) {
    throw new ApiError(extractErrorMessage(payload, `${response.status} ${response.statusText}`), response.status, payload);
  }

  return payload as T;
}

export function getStoredToken(): string | null {
  return window.localStorage.getItem(TOKEN_STORAGE_KEY);
}

export function setStoredToken(token: string): void {
  window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
}

export function clearStoredToken(): void {
  window.localStorage.removeItem(TOKEN_STORAGE_KEY);
}

export function buildWebSocketUrl(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  if (/^https?:\/\//i.test(API_BASE_URL)) {
    const url = new URL(API_BASE_URL);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    url.pathname = `${url.pathname.replace(/\/$/, "")}${normalizedPath}`;
    return url.toString();
  }

  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const basePath = API_BASE_URL.replace(/\/$/, "");
  return `${protocol}//${window.location.host}${basePath}${normalizedPath}`;
}

export async function fetchHealth(): Promise<HealthResponse> {
  return requestJson<HealthResponse>("/health", { auth: false });
}

export async function login(payload: LoginPayload): Promise<TokenResponse> {
  const response = await requestJson<TokenResponse>("/api/v1/auth/login", {
    method: "POST",
    body: payload,
    auth: false,
  });
  setStoredToken(response.access_token);
  return response;
}

export async function register(payload: RegisterPayload): Promise<UserResponse> {
  return requestJson<UserResponse>("/api/v1/auth/register", {
    method: "POST",
    body: payload,
    auth: false,
  });
}

export async function me(): Promise<UserResponse> {
  return requestJson<UserResponse>("/api/v1/auth/me");
}

export async function dashboardSummary(venueId?: string): Promise<DashboardSummary> {
  return requestJson<DashboardSummary>("/api/v1/dashboard/summary", {
    query: venueId ? { venue_id: venueId } : undefined,
  });
}

export async function listSos(params: { status?: SOSStatus; venue_id?: string; priority?: CrisisSeverity; limit?: number; skip?: number } = {}): Promise<SOSResponse[]> {
  return requestJson<SOSResponse[]>("/api/v1/sos/", { query: params });
}

export async function createSos(payload: CreateSOSPayload): Promise<SOSResponse> {
  return requestJson<SOSResponse>("/api/v1/sos/", {
    method: "POST",
    body: payload,
  });
}

export async function updateSos(sosId: string, payload: UpdateSOSPayload): Promise<SOSResponse> {
  return requestJson<SOSResponse>(`/api/v1/sos/${sosId}`, {
    method: "PATCH",
    body: payload,
  });
}

export async function addTimelineEvent(
  sosId: string,
  payload: { event_type: string; message: string },
): Promise<SOSResponse> {
  return requestJson<SOSResponse>(`/api/v1/sos/${sosId}/timeline`, {
    method: "POST",
    body: payload,
  });
}

export async function listAlerts(params: { venue_id?: string; limit?: number; skip?: number } = {}): Promise<AlertResponse[]> {
  return requestJson<AlertResponse[]>("/api/v1/alerts/", { query: params });
}

export async function createAlert(payload: CreateAlertPayload): Promise<AlertResponse> {
  return requestJson<AlertResponse>("/api/v1/alerts/", {
    method: "POST",
    body: payload,
  });
}

export async function listVenues(params: { limit?: number; skip?: number } = {}): Promise<VenueResponse[]> {
  return requestJson<VenueResponse[]>("/api/v1/venues/", { query: params });
}

export async function createVenue(payload: CreateVenuePayload): Promise<VenueResponse> {
  return requestJson<VenueResponse>("/api/v1/venues/", {
    method: "POST",
    body: payload,
  });
}

export async function listUsers(params: { limit?: number; skip?: number } = {}): Promise<UserResponse[]> {
  return requestJson<UserResponse[]>("/api/v1/users/", { query: params });
}

export type { Session };

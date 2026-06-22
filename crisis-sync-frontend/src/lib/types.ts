export const USER_ROLES = ["guest", "staff", "admin"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const SOS_STATUSES = ["open", "acknowledged", "dispatched", "resolved", "cancelled"] as const;
export type SOSStatus = (typeof SOS_STATUSES)[number];

export const CRISIS_SEVERITIES = ["low", "medium", "high"] as const;
export type CrisisSeverity = (typeof CRISIS_SEVERITIES)[number];

export const EMERGENCY_TYPES = ["medical", "fire", "security", "evacuation", "maintenance", "other"] as const;
export type EmergencyType = (typeof EMERGENCY_TYPES)[number];

export const TIMELINE_EVENT_TYPES = [
  "created",
  "classified",
  "acknowledged",
  "dispatched",
  "resolved",
  "cancelled",
  "assigned",
  "note",
] as const;
export type TimelineEventType = (typeof TIMELINE_EVENT_TYPES)[number];

export const ALERT_SEVERITIES = ["low", "medium", "high", "critical"] as const;
export type AlertSeverity = (typeof ALERT_SEVERITIES)[number];

export interface HealthResponse {
  status: string;
  service: string;
  environment: string;
  version: string;
}

export interface UserResponse {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  venue_id: string;
  role: UserRole;
  created_at: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: "bearer";
}

export interface DashboardSummary {
  venue_id: string | null;
  open_incidents: number;
  acknowledged_incidents: number;
  dispatched_incidents: number;
  high_priority_incidents: number;
  total_active_incidents: number;
  recent_incidents: SOSResponse[];
}

export interface TimelineEvent {
  event_type: TimelineEventType | string;
  message: string;
  actor_id: string;
  occurred_at: string;
}

export interface SOSResponse {
  id: string;
  venue_id: string;
  user_id: string;
  emergency_type: EmergencyType | string;
  latitude: number;
  longitude: number;
  location: {
    type: string;
    coordinates: [number, number];
  };
  message: string | null;
  address: string | null;
  status: SOSStatus | string;
  priority: CrisisSeverity | string;
  ai_summary: string | null;
  assigned_to: string | null;
  timeline: TimelineEvent[];
  created_at: string;
  updated_at: string;
}

export interface AlertResponse {
  id: string;
  venue_id: string;
  title: string;
  message: string;
  severity: AlertSeverity | string;
  location: string | null;
  created_by: string;
  created_at: string;
}

export interface VenueResponse {
  id: string;
  venue_id: string;
  name: string;
  address: string | null;
  created_at: string;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface RegisterPayload {
  name: string;
  email: string;
  password: string;
  phone?: string;
  venue_id: string;
}

export interface CreateSOSPayload {
  venue_id: string;
  emergency_type: EmergencyType;
  latitude: number;
  longitude: number;
  message?: string;
  address?: string;
}

export interface UpdateSOSPayload {
  status: SOSStatus;
  assigned_to?: string;
  note?: string;
}

export interface CreateAlertPayload {
  venue_id: string;
  title: string;
  message: string;
  severity: AlertSeverity;
  location?: string;
}

export interface CreateVenuePayload {
  venue_id: string;
  name: string;
  address?: string;
}

export interface Session {
  token: string;
  user: UserResponse;
}

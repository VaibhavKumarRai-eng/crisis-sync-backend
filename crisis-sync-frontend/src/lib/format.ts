import type { AlertSeverity, CrisisSeverity, SOSStatus, UserRole } from "./types";

export function toTitleCase(value: string): string {
  return value
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) {
    return "Not available";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function formatShortTime(value: string | null | undefined): string {
  if (!value) {
    return "Now";
  }

  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export function formatCoordinatePair(latitude: number, longitude: number): string {
  return `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
}

export function roleLabel(role: UserRole | string | null | undefined): string {
  return role ? toTitleCase(role) : "Guest";
}

export function statusTone(status: SOSStatus | CrisisSeverity | AlertSeverity | UserRole | string | null | undefined): string {
  switch (status) {
    case "resolved":
    case "low":
      return "success";
    case "acknowledged":
    case "staff":
    case "medium":
      return "accent";
    case "dispatched":
    case "high":
    case "admin":
      return "warning";
    case "cancelled":
    case "critical":
      return "danger";
    default:
      return "muted";
  }
}

export function formatCountLabel(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

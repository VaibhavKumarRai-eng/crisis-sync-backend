from enum import StrEnum


class UserRole(StrEnum):
    GUEST = "guest"
    STAFF = "staff"
    ADMIN = "admin"


class SOSStatus(StrEnum):
    OPEN = "open"
    ACKNOWLEDGED = "acknowledged"
    DISPATCHED = "dispatched"
    RESOLVED = "resolved"
    CANCELLED = "cancelled"


class CrisisSeverity(StrEnum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class EmergencyType(StrEnum):
    MEDICAL = "medical"
    FIRE = "fire"
    SECURITY = "security"
    EVACUATION = "evacuation"
    MAINTENANCE = "maintenance"
    OTHER = "other"


class TimelineEventType(StrEnum):
    CREATED = "created"
    CLASSIFIED = "classified"
    ACKNOWLEDGED = "acknowledged"
    DISPATCHED = "dispatched"
    RESOLVED = "resolved"
    CANCELLED = "cancelled"
    ASSIGNED = "assigned"
    NOTE = "note"


class AlertSeverity(StrEnum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"

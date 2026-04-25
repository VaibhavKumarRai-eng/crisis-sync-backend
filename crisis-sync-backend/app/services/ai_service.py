from typing import Protocol

from app.core.config import settings
from app.core.enums import CrisisSeverity, EmergencyType


class IncidentClassifier(Protocol):
    async def classify(self, payload: dict) -> dict:
        ...


class RuleBasedIncidentClassifier:
    severity_by_type = {
        EmergencyType.FIRE: CrisisSeverity.HIGH,
        EmergencyType.SECURITY: CrisisSeverity.HIGH,
        EmergencyType.EVACUATION: CrisisSeverity.HIGH,
        EmergencyType.MEDICAL: CrisisSeverity.MEDIUM,
        EmergencyType.MAINTENANCE: CrisisSeverity.LOW,
        EmergencyType.OTHER: CrisisSeverity.MEDIUM,
    }

    async def classify(self, payload: dict) -> dict:
        emergency_type = EmergencyType(payload.get("emergency_type", EmergencyType.OTHER))
        message = (payload.get("message") or "").lower()
        severity = self.severity_by_type[emergency_type]

        if any(keyword in message for keyword in ("unconscious", "weapon", "smoke", "trapped", "bleeding")):
            severity = CrisisSeverity.HIGH
        elif any(keyword in message for keyword in ("minor", "noise", "leak", "stuck")):
            severity = min(severity, CrisisSeverity.LOW, key=self._rank)

        return {
            "priority": severity.value,
            "emergency_type": emergency_type.value,
            "summary": payload.get("message") or f"{emergency_type.value.title()} emergency reported",
            "provider": "rule_based",
            "confidence": 0.72,
        }

    def _rank(self, severity: CrisisSeverity) -> int:
        return {
            CrisisSeverity.LOW: 1,
            CrisisSeverity.MEDIUM: 2,
            CrisisSeverity.HIGH: 3,
        }[severity]


class GeminiIncidentClassifier:
    """Future adapter for Google Gemini. Keep provider details behind this interface."""

    def __init__(self, api_key: str | None = None, model: str = "gemini-1.5-pro") -> None:
        self.api_key = api_key
        self.model = model

    async def classify(self, payload: dict) -> dict:
        raise NotImplementedError("Gemini integration is intentionally not wired yet")


class AIIncidentService:
    def __init__(self, classifier: IncidentClassifier | None = None) -> None:
        self.classifier = classifier or self._default_classifier()

    async def analyze_incident(self, payload: dict) -> dict:
        return await self.classifier.classify(payload)

    def _default_classifier(self) -> IncidentClassifier:
        if settings.AI_PROVIDER == "gemini":
            return GeminiIncidentClassifier(api_key=settings.GEMINI_API_KEY, model=settings.GEMINI_MODEL)
        return RuleBasedIncidentClassifier()

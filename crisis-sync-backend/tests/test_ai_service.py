import asyncio

import pytest

from app.services.ai_service import RuleBasedIncidentClassifier


@pytest.mark.parametrize(
    ("emergency_type", "message", "expected_priority"),
    [
        ("fire", "Smoke near stairwell", "high"),
        ("maintenance", "Minor water leak", "low"),
        ("medical", "Guest needs help", "medium"),
        ("security", "Possible weapon reported", "high"),
    ],
)
def test_rule_based_classifier_prioritizes_incidents(emergency_type, message, expected_priority):
    classifier = RuleBasedIncidentClassifier()

    result = asyncio.run(classifier.classify({"emergency_type": emergency_type, "message": message}))

    assert result["priority"] == expected_priority
    assert result["provider"] == "rule_based"

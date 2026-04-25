import asyncio
from typing import Protocol

from app.utils.logger import logger


class NotificationChannel(Protocol):
    name: str

    async def send(self, recipient: str, subject: str, message: str, payload: dict | None = None) -> dict:
        ...


class SMSNotificationChannel:
    name = "sms"

    async def send(self, recipient: str, subject: str, message: str, payload: dict | None = None) -> dict:
        logger.bind(channel=self.name, recipient=recipient).info("SMS notification queued")
        return {"channel": self.name, "recipient": recipient, "queued": True, "provider": "placeholder"}


class PushNotificationChannel:
    name = "push"

    async def send(self, recipient: str, subject: str, message: str, payload: dict | None = None) -> dict:
        logger.bind(channel=self.name, recipient=recipient).info("Push notification queued")
        return {"channel": self.name, "recipient": recipient, "queued": True, "provider": "placeholder"}


class EmailNotificationChannel:
    name = "email"

    async def send(self, recipient: str, subject: str, message: str, payload: dict | None = None) -> dict:
        logger.bind(channel=self.name, recipient=recipient).info("Email notification queued")
        return {"channel": self.name, "recipient": recipient, "queued": True, "provider": "placeholder"}


class NotificationService:
    def __init__(self, channels: list[NotificationChannel] | None = None) -> None:
        self.channels = channels or [
            SMSNotificationChannel(),
            PushNotificationChannel(),
            EmailNotificationChannel(),
        ]

    async def notify_staff(self, payload: dict) -> list[dict]:
        venue_id = payload.get("venue_id", "default")
        subject = f"CrisisSync {payload.get('priority', 'medium').upper()} alert"
        message = payload.get("ai_summary") or payload.get("message") or "New emergency reported"
        recipient = f"venue:{venue_id}:staff"
        return await self._fan_out(recipient=recipient, subject=subject, message=message, payload=payload)

    async def notify_user(self, recipient: str, message: str) -> list[dict]:
        return await self._fan_out(recipient=recipient, subject="CrisisSync update", message=message)

    async def _fan_out(
        self,
        *,
        recipient: str,
        subject: str,
        message: str,
        payload: dict | None = None,
    ) -> list[dict]:
        results = await asyncio.gather(
            *(
                channel.send(recipient=recipient, subject=subject, message=message, payload=payload)
                for channel in self.channels
            ),
            return_exceptions=True,
        )
        return [self._normalize_result(result) for result in results]

    def _normalize_result(self, result: dict | BaseException) -> dict:
        if isinstance(result, BaseException):
            logger.error("Notification channel failed: {error}", error=result)
            return {"queued": False, "error": result.__class__.__name__}
        return result

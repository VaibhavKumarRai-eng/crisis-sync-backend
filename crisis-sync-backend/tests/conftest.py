import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.db.collections import USERS_COLLECTION
from app.db.database import clear_database_override, set_database_override
from app.main import app
from tests.fakes import FakeDatabase


@pytest.fixture()
def fake_database():
    database = FakeDatabase()
    set_database_override(database)
    database[USERS_COLLECTION].unique_indexes.add("email")
    yield database
    clear_database_override()


@pytest.fixture()
def client(fake_database):
    settings.RATE_LIMIT_ENABLED = False
    with TestClient(app) as test_client:
        yield test_client
    settings.RATE_LIMIT_ENABLED = True

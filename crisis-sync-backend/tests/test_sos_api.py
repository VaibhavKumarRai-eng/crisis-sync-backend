def _register_and_login(client) -> str:
    client.post(
        "/api/v1/auth/register",
        json={
            "name": "Mira Chen",
            "email": "mira@example.com",
            "password": "strong-password",
            "venue_id": "hotel-alpha",
        },
    )
    response = client.post(
        "/api/v1/auth/login",
        json={"email": "mira@example.com", "password": "strong-password"},
    )
    return response.json()["access_token"]


def test_sos_trigger_success(client):
    token = _register_and_login(client)

    response = client.post(
        "/api/v1/sos/",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "venue_id": "hotel-alpha",
            "emergency_type": "fire",
            "latitude": 28.6139,
            "longitude": 77.2090,
            "message": "Smoke near stairwell",
            "address": "Tower A, Floor 3",
        },
    )

    assert response.status_code == 201
    body = response.json()
    assert body["venue_id"] == "hotel-alpha"
    assert body["emergency_type"] == "fire"
    assert body["status"] == "open"
    assert body["priority"] == "high"
    assert body["location"]["type"] == "Point"
    assert body["location"]["coordinates"] == [77.209, 28.6139]
    assert len(body["timeline"]) == 2


def test_sos_requires_authentication(client):
    response = client.post(
        "/api/v1/sos/",
        json={
            "emergency_type": "medical",
            "latitude": 28.6139,
            "longitude": 77.2090,
        },
    )

    assert response.status_code == 401


def test_sos_rejects_invalid_coordinates(client):
    token = _register_and_login(client)

    response = client.post(
        "/api/v1/sos/",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "emergency_type": "medical",
            "latitude": 120,
            "longitude": 77.2090,
        },
    )

    assert response.status_code == 422

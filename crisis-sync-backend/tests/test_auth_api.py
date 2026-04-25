def test_register_user_success(client):
    response = client.post(
        "/api/v1/auth/register",
        json={
            "name": "Asha Rao",
            "email": "asha@example.com",
            "password": "strong-password",
            "phone": "+15551234567",
            "venue_id": "hotel-alpha",
        },
    )

    assert response.status_code == 201
    body = response.json()
    assert body["email"] == "asha@example.com"
    assert body["role"] == "guest"
    assert body["venue_id"] == "hotel-alpha"
    assert "password" not in body
    assert "id" in body


def test_register_rejects_duplicate_email(client):
    payload = {
        "name": "Asha Rao",
        "email": "asha@example.com",
        "password": "strong-password",
    }

    assert client.post("/api/v1/auth/register", json=payload).status_code == 201
    response = client.post("/api/v1/auth/register", json=payload)

    assert response.status_code == 409
    assert response.json()["detail"] == "A user with this email already exists"


def test_register_validation_error(client):
    response = client.post(
        "/api/v1/auth/register",
        json={"name": "A", "email": "not-an-email", "password": "short"},
    )

    assert response.status_code == 422
    assert "detail" in response.json()


def test_login_success(client):
    client.post(
        "/api/v1/auth/register",
        json={
            "name": "Asha Rao",
            "email": "asha@example.com",
            "password": "strong-password",
        },
    )

    response = client.post(
        "/api/v1/auth/login",
        json={"email": "asha@example.com", "password": "strong-password"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["token_type"] == "bearer"
    assert body["access_token"]


def test_login_rejects_bad_password(client):
    client.post(
        "/api/v1/auth/register",
        json={
            "name": "Asha Rao",
            "email": "asha@example.com",
            "password": "strong-password",
        },
    )

    response = client.post(
        "/api/v1/auth/login",
        json={"email": "asha@example.com", "password": "wrong-password"},
    )

    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid email or password"

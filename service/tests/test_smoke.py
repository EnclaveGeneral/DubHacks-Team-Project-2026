from fastapi.testclient import TestClient

from app.main import app


def test_health_and_clock():
    with TestClient(app) as client:
        assert client.get("/health").json()["ok"] is True
        assert client.post("/clock", json={"day": 3}).json()["day"] == 3
        assert client.get("/clock").json()["day"] == 3
        assert client.post("/demo/reset").json()["day"] == 0


def test_cards_catalog():
    with TestClient(app) as client:
        ids = [c["card_id"] for c in client.get("/cards").json()]
        assert ids == ["northwind-4417", "cascade-9021"]

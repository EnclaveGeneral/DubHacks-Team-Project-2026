"""Website -> store form hand-off codes: single use, only for a real action."""

import json
from pathlib import Path

from fastapi.testclient import TestClient

from app import main, tracking
from app.schemas import TrackedPurchase

FIXTURES = Path(__file__).resolve().parents[2] / "shared" / "fixtures"


def _seed(client):
    client.post("/demo/reset")
    tp = TrackedPurchase.model_validate(json.loads((FIXTURES / "purchases.json").read_text(encoding="utf-8"))[0])
    tp.price_history = {0: 140.0, 3: 110.0}
    tracking.save(tp)
    client.post("/clock", json={"day": 3})
    return tp


def test_handoff_is_single_use():
    with TestClient(main.app) as client:
        tp = _seed(client)
        alert = next(a for a in tracking.alerts_for(tracking.load(tp.purchase.order_id), 3) if a.action)
        token = client.post("/handoffs", json={"order_id": tp.purchase.order_id, "alert_id": alert.id}).json()["token"]
        first = client.post(f"/handoffs/{token}/redeem")
        assert first.status_code == 200 and first.json() == {"order_id": tp.purchase.order_id, "alert_id": alert.id}
        assert client.post(f"/handoffs/{token}/redeem").status_code == 404


def test_handoff_needs_a_real_action_and_rejects_made_up_codes():
    with TestClient(main.app) as client:
        tp = _seed(client)
        r = client.post("/handoffs", json={"order_id": tp.purchase.order_id, "alert_id": "not-an-alert"})
        assert r.status_code == 409
        assert client.post("/handoffs", json={"order_id": "nope", "alert_id": "x"}).status_code == 404
        assert client.post("/handoffs/made-up-token/redeem").status_code == 404

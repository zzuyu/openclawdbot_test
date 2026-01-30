from fastapi.testclient import TestClient

from app.main import app


def test_health_ok():
    c = TestClient(app)
    r = c.get("/api/health")
    assert r.status_code == 200
    assert r.json() == {"ok": True}


def test_wordbank_get_has_categories():
    c = TestClient(app)
    r = c.get("/api/wordbank")
    assert r.status_code == 200
    data = r.json()
    assert "categories" in data
    assert isinstance(data["categories"], dict)
    assert len(data["categories"].keys()) >= 1

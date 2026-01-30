from fastapi.testclient import TestClient

from app.main import app


def test_set_wordbank_accepts_categories_wrapper(tmp_path, monkeypatch):
    # point DATA_PATH to a temp file
    from app import main as m

    monkeypatch.setattr(m, "DATA_PATH", tmp_path / "wordbank.json")

    c = TestClient(app)
    payload = {"categories": {"美食": ["火锅", "饺子"], "地标": ["长城"]}}
    r = c.post("/api/wordbank", json=payload)
    assert r.status_code == 200
    data = r.json()
    assert data["ok"] is True


def test_set_wordbank_accepts_flat_object(tmp_path, monkeypatch):
    from app import main as m

    monkeypatch.setattr(m, "DATA_PATH", tmp_path / "wordbank.json")

    c = TestClient(app)
    payload = {"动物": ["熊猫", "龙"]}
    r = c.post("/api/wordbank", json=payload)
    assert r.status_code == 200
    assert r.json()["ok"] is True

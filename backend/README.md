# Backend (FastAPI)

## Run
```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

Health: `GET /api/health`
WebSocket: `ws://localhost:8000/ws`

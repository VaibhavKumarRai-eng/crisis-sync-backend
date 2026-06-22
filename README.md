# CrisisSync

This repository now contains both halves of the product:

- `crisis-sync-backend/` FastAPI API and websocket backend
- `crisis-sync-frontend/` React + Vite command center UI

## Run the backend

```powershell
cd crisis-sync-backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

## Run the frontend

```powershell
cd crisis-sync-frontend
npm install
npm run dev
```

The frontend uses the Vite dev proxy for `/api` and `/health` by default. If you want to call the backend directly, set `VITE_API_BASE_URL=http://localhost:8000` in `crisis-sync-frontend/.env.local`.

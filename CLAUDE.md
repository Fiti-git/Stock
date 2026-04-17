/c# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Stack

- **Backend**: Django 5.0.4 + DRF, PostgreSQL, JWT auth (SimpleJWT)
- **Frontend**: React 18 + Vite, Material-UI + TailwindCSS
- **Mobile**: React Native 0.71.0, TypeScript, barcode scanning
- **Infra**: Docker Compose (backend:8001, frontend:8002, db:5432)

## Commands

### Docker (recommended for full-stack)
```bash
docker-compose up --build       # Start all services
docker-compose logs -f backend  # View backend logs
docker-compose down             # Stop services
```

### Backend (local)
```bash
cd backend
python manage.py runserver 0.0.0.0:8000
python manage.py makemigrations && python manage.py migrate
python manage.py seed_data      # Populate test data
python manage.py test           # Run tests
python manage.py shell
```

### Frontend (local)
```bash
cd frontend
npm run dev     # http://localhost:5173
npm run build
npm run lint
```

### Mobile
```bash
cd mobile
npm start           # Metro bundler
npm run android
npm run ios
npm run test
```

## Architecture

### Backend apps (`backend/apps/`)
- **accounts** — JWT auth, user roles, audit logging
- **outlets** — Branch/store locations
- **items** — Product catalog, inventory, rack/shelf fields
- **uploads** — Bulk CSV/Excel import
- **dashboard** — Analytics, variance reports, negative POS reports

Each app follows: `models.py → serializers.py → views.py (ViewSets) → urls.py → permissions.py`

All models use UUID primary keys and `created_at`/`updated_at` timestamps. Routes registered via DRF `DefaultRouter`, all under `/api/` prefix. Pagination uses `LimitOffsetPagination`.

### Frontend (`frontend/src/`)
- `api/client.js` — Axios instance; JWT token auto-injected from `AuthContext`
- `api/*.js` — Per-feature API modules
- `contexts/` — `AuthContext` (global auth + token), `OutletContext` (selected outlet)
- `pages/admin/`, `pages/manager/`, `pages/store-user/` — Role-based page separation
- `components/` — Reusable UI components

Styling: Tailwind for layout/spacing, MUI for complex widgets (dialogs, tables). Don't mix styled-components.

### Mobile (`mobile/`)
- `screens/` — Full-page React Native components
- `services/` — API + auth (Axios + AsyncStorage for token)
- `App.js` — Navigation stack root

## Key Files

| File | Purpose |
|------|---------|
| `docker-compose.yml` | Local dev services |
| `backend/config/settings/base.py` | Django base config, CORS |
| `backend/config/settings/local.py` | Local dev overrides |
| `frontend/src/api/client.js` | Axios client with auth |
| `frontend/vite.config.js` | Vite + path aliases |

## Adding a Feature

**Backend**: model → `makemigrations` + `migrate` → serializer → ViewSet → register router → permission class if needed

**Frontend**: page in `src/pages/<role>/` → route in React Router layout → API module in `src/api/` → nav link in Layout

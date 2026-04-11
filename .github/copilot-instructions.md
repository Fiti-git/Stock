# Stock Management System - Copilot Instructions

## Project Overview

A full-stack stock inventory management system with Django backend, React frontend, and React Native mobile app. The system handles stock counting, item management, outlet operations, and analytics dashboards.

**Technology Stack:**
- **Backend**: Django 5.0.4 (Python 3.12) + DRF, PostgreSQL, JWT auth
- **Frontend**: React 18 + Vite, Material-UI, TailwindCSS
- **Mobile**: React Native 0.71.0, TypeScript, Barcode scanning
- **Infrastructure**: Docker Compose for local dev, Nginx reverse proxy pattern

## Architecture

### Directory Structure
```
stock/
├── backend/          # Django project
│   ├── apps/        # Django apps (accounts, outlets, items, uploads, dashboard)
│   ├── config/      # Project settings
│   ├── manage.py    # Django CLI
│   └── requirements.txt
├── frontend/        # Vite + React
│   └── src/         # React components, pages, API clients
├── mobile/          # React Native app
│   ├── screens/     # Screen components
│   └── services/    # Mobile API clients
└── docker-compose.yml
```

### App Structure (Backend)

Each Django app follows standard conventions:
- `models.py` - Database models
- `serializers.py` - DRF serializers for API
- `views.py` - ViewSets with CRUD operations
- `urls.py` - Route configuration  
- `permissions.py` - Custom permission classes
- `management/commands/` - Custom management commands

**Core Apps:**
- **accounts**: User authentication, JWT tokens, role management
- **outlets**: Branch/store locations
- **items**: Product catalog and inventory
- **uploads**: Bulk CSV/Excel import functionality
- **dashboard**: Analytics and reporting

### API Conventions

- **Base URL**: Backend routes through `/api/` prefix
- **Authentication**: JWT tokens in Authorization header
- **Response Format**: Consistent JSON with `results` field for lists
- **Pagination**: LimitOffset pagination
- **Filtering**: DjangoFilterBackend on list endpoints

## Development Setup

### Prerequisites
- Docker & Docker Compose (recommended)
- Python 3.12 + pip (for local backend dev)
- Node.js 20 (for frontend/mobile dev)
- npm/yarn package manager

### Local Development (Docker)

```bash
# Start all services (db, backend, frontend)
docker-compose up

# Access services:
# Backend API: http://localhost:8001
# Frontend: http://localhost:8002
# Database: localhost:5432
```

Services automatically run migrations and seed data on startup.

### Backend Development (Local)

```bash
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Set up database (requires running PostgreSQL)
python manage.py migrate

# Create superuser for admin panel
python manage.py createsuperuser

# Run development server
python manage.py runserver 0.0.0.0:8000
```

**Key management commands:**
- `python manage.py seed_data` - Populate test data
- `python manage.py makemigrations` - Create DB migration files
- `python manage.py migrate` - Apply migrations
- `python manage.py shell` - Django interactive shell

### Frontend Development (Local)

```bash
cd frontend

# Install dependencies
npm install

# Start Vite dev server (http://localhost:5173)
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

### Mobile Development

```bash
cd mobile

# Install dependencies
npm install

# Start Metro bundler
npm start

# Run on Android
npm run android

# Run on iOS
npm run ios
```

## Backend Development Conventions

### Creating New Endpoints

1. **Add model** in `apps/<app>/models.py`
   ```python
   class MyModel(models.Model):
       # Use UUID primary key when possible
       id = models.UUIDField(primary_key=True, default=uuid.uuid4)
       # Created/updated timestamps
       created_at = models.DateTimeField(auto_now_add=True)
       updated_at = models.DateTimeField(auto_now=True)
   ```

2. **Create serializer** in `apps/<app>/serializers.py`
   ```python
   class MyModelSerializer(serializers.ModelSerializer):
       class Meta:
           model = MyModel
           fields = '__all__'
   ```

3. **Add ViewSet** in `apps/<app>/views.py`
   ```python
   class MyModelViewSet(viewsets.ModelViewSet):
       queryset = MyModel.objects.all()
       serializer_class = MyModelSerializer
       permission_classes = [IsAuthenticated]
       filterset_fields = ['field1', 'field2']
   ```

4. **Register route** in `apps/<app>/urls.py`
   ```python
   router = DefaultRouter()
   router.register(r'mymodel', MyModelViewSet)
   urlpatterns = router.urls
   ```

### Authentication & Permissions

- JWT tokens issued during login (no session auth)
- Use `permission_classes = [IsAuthenticated]` for protected endpoints
- Create custom permission classes in `permissions.py` for role-based access
- Accounts app handles user roles and permissions

### Common Pitfalls
- Remember to run `makemigrations` then `migrate` after model changes
- Database fixtures go in `migrations/` as Python files
- Avoid circular imports between serializers and views

## Frontend Development Conventions

### Project Structure

```
src/
├── components/      # Reusable UI components
├── pages/          # Page components (organized by role)
│   ├── admin/      # Admin dashboard pages
│   ├── auth/       # Login/signup pages
│   ├── manager/    # Manager features
│   └── store-user/ # Store staff pages
├── contexts/       # React Context (AuthContext, OutletContext)
├── api/            # API client functions
│   ├── client.js   # Axios instance & base config
│   └── *.js        # API endpoints per feature
└── styles/         # Global CSS, Tailwind config
```

### Styling Approach

- **Tailwind CSS** for utility-first styling
- **Material-UI** components for complex UI (dialogs, tables, buttons)
- Avoid mixing styled-components; use Tailwind + MUI
- TailwindCSS configured in `tailwind.config.js`

### API Communication

API client is centralized in `src/api/client.js`:

```javascript
// src/api/client.js defines the Axios instance with auth headers
import client from '@/api/client'

// Usage in API modules:
export const getItems = () => client.get('/api/items/')
export const createItem = (data) => client.post('/api/items/', data)
```

JWT token stored in `AuthContext` and automatically added to requests.

### React Patterns

- Use **function components** with hooks (no class components)
- Global state via React Context (auth, outlet selection)
- Local state with `useState` for form inputs
- `useEffect` for data fetching (consider useQuery for complex cases)
- Handle loading/error states in components explicitly

### Component Template

```jsx
import { useState, useEffect } from 'react'
import { Box, Button, CircularProgress } from '@mui/material'

export function MyComponent() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    // Fetch data
  }, [])

  if (loading) return <CircularProgress />
  if (error) return <Alert severity="error">{error}</Alert>

  return <Box>{/* Component JSX */}</Box>
}
```

## Mobile Development Conventions

### React Native Structure

- **Screens** in `screens/` folder - full page components
- **Services** in `services/` - API and auth logic
- **Styles** in `styles/Style.js` - shared styling constants
- Navigation stack defined in `App.js`

### Key Packages

- `@react-navigation` - Navigation between screens
- `react-native-camera` - Barcode/QR code scanning
- `@kichiyaki/react-native-barcode-generator` - Barcode generation
- `react-native-vector-icons` - Icons
- `axios` - HTTP requests (same API as backend)

### Common Tasks

**Barcode Scanning:**
Use `react-native-camera` RNCamera component with barcode detection.

**Navigation:**
Use `@react-navigation/native-stack` for screen transitions.

**API Calls:**
Same Axios client as frontend; auth token stored in AsyncStorage.

## Testing Strategy

### Backend Testing

Not yet formalized. When adding tests:
- Use Django's `TestCase` or pytest
- Tests in `tests/` subdirectory of each app
- Mock external services (file uploads, payments)
- Run: `python manage.py test`

### Frontend Testing

Not yet formalized. Recommended setup:
- Vitest + React Testing Library
- Component tests for complex UI
- API mocking with MSW
- Test files: `*.test.jsx` colocated with components

### Mobile Testing

Basic Jest setup present. Expand with:
- Component snapshot tests
- Navigation flow tests
- API integration tests

## Deployment

### Backend Deployment

- WSGI server: Gunicorn (configured, see `config/wsgi.py`)
- Static files: Collected to `/app/media/` directory
- Database: PostgreSQL (use managed service in production)
- Environment: Use `.env` file; see `config/settings/local.py`

### Frontend Deployment

- Build artifacts: `npm run build` → `dist/` directory
- Serve via Nginx or static hosting
- Set `VITE_API_URL` environment variable to backend URL

### Production Checklist

- [ ] Set `SECRET_KEY` to random string
- [ ] Set `DEBUG=False` in settings
- [ ] Configure `ALLOWED_HOSTS`
- [ ] Use HTTPS (CORS settings updated)
- [ ] Database backups configured
- [ ] Static files CDN optional but recommended
- [ ] Error logging configured (Sentry recommended)

## Useful Commands Reference

### Backend
```bash
cd backend

# Run tests
python manage.py test

# Create migrations
python manage.py makemigrations

# Apply migrations
python manage.py migrate

# Load fixtures
python manage.py loaddata fixture_name

# Run shell
python manage.py shell

# Create superuser
python manage.py createsuperuser

# Collect static files
python manage.py collectstatic
```

### Frontend
```bash
cd frontend

# Development
npm run dev

# Build
npm run build

# Lint & format (if configured)
npm run lint

# Type checking with Vite
npm run typecheck
```

### Mobile
```bash
cd mobile

# Start Metro
npm start

# Run Android
npm run android

# Run iOS
npm run ios

# Lint
npm run lint

# Tests
npm run test
```

### Docker
```bash
# Build and start all services
docker-compose up --build

# View logs
docker-compose logs -f backend

# Stop services
docker-compose down

# Remove volumes (dangerous - loses data)
docker-compose down -v
```

## Key Files

| File | Purpose |
|------|---------|
| `docker-compose.yml` | Local dev environment definition |
| `backend/config/settings/base.py` | Django base configuration |
| `backend/config/settings/local.py` | Local dev overrides |
| `frontend/vite.config.js` | Vite build configuration |
| `frontend/tailwind.config.js` | Tailwind CSS customization |
| `frontend/src/api/client.js` | Axios client with auth |
| `mobile/App.js` | React Native app entry point |

## Common Workflows

### Adding a New Feature (Backend API)

1. Create model in Django app
2. Run `makemigrations` and `migrate`
3. Create serializer and ViewSet
4. Register routes
5. Add permission class if needed
6. Test with Postman or curl

### Adding a New Feature (Frontend Page)

1. Create page component in `src/pages/`
2. Add route in React Router (check main layout)
3. Create API client functions in `src/api/`
4. Use MUI components + Tailwind for styling
5. Add navigation link in Layout

### Running Full Stack Locally

```bash
docker-compose up

# Then:
# Frontend: http://localhost:8002
# Backend API: http://localhost:8001
# Admin panel: http://localhost:8001/admin

# Superuser credentials auto-created (check docker-compose output)
```

## Quick Reference

- **API Base**: `http://localhost:8001/api/` (production: check VITE_API_URL)
- **Frontend**: `http://localhost:8002` (Vite hot reload)
- **Database**: PostgreSQL connection string in `docker-compose.yml`
- **Admin Panel**: `http://localhost:8001/admin/` (Django admin)
- **Authentication**: JWT tokens via `/api/token/` endpoint
- **CORS**: Configured in `config/settings/base.py` for dev (localhost:5173)

## Troubleshooting

**Port already in use**: Change ports in `docker-compose.yml`

**Database connection error**: Ensure PostgreSQL is running and credentials match `.env`

**CORS errors in frontend**: Check `CORS_ALLOWED_ORIGINS` in `backend/config/settings/base.py`

**Mobile barcode scanner not working**: Ensure camera permissions granted in app settings

**Frontend API calls failing**: Verify backend is running and `VITE_API_URL` is correct

## Additional Resources

- Django REST Framework: https://www.django-rest-framework.org/
- React Hooks: https://react.dev/reference/react
- React Native: https://reactnative.dev/docs/getting-started
- Tailwind CSS: https://tailwindcss.com/docs
- Material-UI: https://mui.com/material-ui/getting-started/

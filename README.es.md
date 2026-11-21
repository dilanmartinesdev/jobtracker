# JobTracker (resumen en español)

Tablero Kanban para dar seguimiento a postulaciones de empleo. Cada movimiento queda en un historial, y el embudo muestra cuántas postulaciones llegan a entrevista y a oferta.

**Stack:** FastAPI + PostgreSQL (API), React + TypeScript (web), Docker, GitHub Actions.

## Cómo correrlo

```bash
cp .env.example .env     # define POSTGRES_PASSWORD y SECRET_KEY
docker compose up --build
```

Abre <http://localhost:8080>. Para cargar datos de ejemplo:

```bash
docker compose exec api python -m scripts.seed
# demo@jobtracker.dev / demo-password-123
```

Sin Docker, mira la sección *Local development* del [README principal](README.md).

## Qué lo hace distinto de un CRUD básico

- **Historial de estados** y un embudo calculado desde ese historial (una postulación rechazada tras una entrevista cuenta como entrevista).
- **Deshacer** un movimiento accidental en menos de 2 minutos lo borra del historial, para no distorsionar las estadísticas.
- **Seguridad:** Argon2id, tokens JWT con expiración, tiempo de respuesta constante en el login, límite de intentos, validación estricta de entradas y CSP en nginx.
- **Calidad automática:** Ruff, mypy estricto, Bandit, pip-audit, pruebas en SQLite y PostgreSQL con cobertura mínima del 95 %, migraciones verificadas contra los modelos, ESLint y Vitest. La accesibilidad (axe-core) y los flujos en navegador (Playwright) se revisaron a mano; esos scripts aún no están en el repositorio.

## Documentación

- [Guía de estudio en español](docs/es/guia-de-estudio.md): explica cada archivo, qué funciones usa y por qué, y cómo defender el proyecto en una entrevista.
- [Arquitectura](docs/architecture.md), [decisiones técnicas](docs/decisions.md) y [registro de auditoría](docs/audit.md) (en inglés).

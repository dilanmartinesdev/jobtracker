.PHONY: help install check test lint backend-test frontend-test up seed

help:  ## Show this help
	@grep -E '^[a-z-]+:.*##' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  %-16s %s\n", $$1, $$2}'

install:  ## Install backend and frontend dependencies
	cd backend && pip install -r requirements-dev.txt
	cd frontend && npm ci

lint:  ## Lint and type-check everything
	cd backend && ruff check . && ruff format --check . && mypy
	cd frontend && npm run lint && npm run typecheck

backend-test:  ## Backend tests with the coverage gate
	cd backend && pytest --cov

frontend-test:  ## Frontend tests
	cd frontend && npm test

test: backend-test frontend-test  ## Run every test suite

check: lint test  ## Everything CI runs, locally (minus Docker and dependency audits)

up:  ## Start the whole stack with Docker
	docker compose up --build

seed:  ## Load the demo account into the running stack
	docker compose exec api python -m scripts.seed

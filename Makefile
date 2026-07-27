# ============================================================
#  Enterprise POS System — Project Makefile
#  Usage: make <target>
# ============================================================

# ── Database Configuration ────────────────────────────────────
DB_CONTAINER   = pos-postgres
DB_IMAGE       = postgres:16
DB_USER        = admin
DB_PASSWORD    = admin123
DB_NAME        = POS_System
DB_PORT        = 5432
DATABASE_URL   = postgresql://$(DB_USER):$(DB_PASSWORD)@localhost:$(DB_PORT)/$(DB_NAME)

# ── Redis Configuration ───────────────────────────────────────
REDIS_CONTAINER = pos-redis
REDIS_IMAGE     = redis:7-alpine
REDIS_PORT      = 6379

# ── Paths ─────────────────────────────────────────────────────
BACKEND_DIR    = .
FRONTEND_DIR   = ../frontend

# ── Colors (ANSI) ─────────────────────────────────────────────
GREEN  = \033[0;32m
YELLOW = \033[1;33m
CYAN   = \033[0;36m
RED    = \033[0;31m
RESET  = \033[0m

.PHONY: help \
        db-up db-down db-reset db-logs db-shell \
        redis-up redis-down redis-logs \
        services-up services-down \
        migrate generate seed \
        dev-backend dev-frontend dev \
        install build clean setup

# ── Default target ────────────────────────────────────────────
help:
	@echo ""
	@echo "$(CYAN)╔══════════════════════════════════════════════════╗$(RESET)"
	@echo "$(CYAN)║      Enterprise POS System — Make Commands       ║$(RESET)"
	@echo "$(CYAN)╚══════════════════════════════════════════════════╝$(RESET)"
	@echo ""
	@echo "$(YELLOW)  Services (Docker):$(RESET)"
	@echo "    make services-up    — Start PostgreSQL + Redis containers"
	@echo "    make services-down  — Stop & remove all containers"
	@echo ""
	@echo "$(YELLOW)  PostgreSQL:$(RESET)"
	@echo "    make db-up          — Start PostgreSQL container"
	@echo "    make db-down        — Stop & remove PostgreSQL container"
	@echo "    make db-reset       — Drop & recreate the database"
	@echo "    make db-logs        — Tail PostgreSQL container logs"
	@echo "    make db-shell       — Open psql shell inside container"
	@echo ""
	@echo "$(YELLOW)  Redis:$(RESET)"
	@echo "    make redis-up       — Start Redis container"
	@echo "    make redis-down     — Stop & remove Redis container"
	@echo "    make redis-logs     — Tail Redis container logs"
	@echo ""
	@echo "$(YELLOW)  Prisma:$(RESET)"
	@echo "    make migrate        — Run prisma db push"
	@echo "    make generate       — Generate Prisma client"
	@echo "    make seed           — Seed default chart of accounts"
	@echo ""
	@echo "$(YELLOW)  Development:$(RESET)"
	@echo "    make install        — Install all dependencies"
	@echo "    make dev-backend    — Start backend dev server"
	@echo "    make dev-frontend   — Start frontend dev server"
	@echo ""
	@echo "$(YELLOW)  Setup (first run):$(RESET)"
	@echo "    make setup          — services-up + migrate + generate + seed"
	@echo ""

# ── PostgreSQL Container ──────────────────────────────────────

db-up:
	@echo "$(GREEN)▶ Starting PostgreSQL container [$(DB_CONTAINER)]...$(RESET)"
	@docker run -d \
		--name $(DB_CONTAINER) \
		-e POSTGRES_USER=$(DB_USER) \
		-e POSTGRES_PASSWORD=$(DB_PASSWORD) \
		-e POSTGRES_DB=$(DB_NAME) \
		-p $(DB_PORT):5432 \
		--restart unless-stopped \
		$(DB_IMAGE) \
	|| docker start $(DB_CONTAINER)
	@echo "$(GREEN)✔ PostgreSQL running on port $(DB_PORT)$(RESET)"
	@echo "$(CYAN)  DATABASE_URL = $(DATABASE_URL)$(RESET)"

db-down:
	@echo "$(RED)▶ Stopping PostgreSQL [$(DB_CONTAINER)]...$(RESET)"
	@docker stop $(DB_CONTAINER) && docker rm $(DB_CONTAINER)
	@echo "$(RED)✔ PostgreSQL container removed.$(RESET)"

db-reset: db-down db-up
	@echo "$(YELLOW)▶ Waiting for PostgreSQL to be ready...$(RESET)"
	@sleep 4
	$(MAKE) migrate
	$(MAKE) generate
	$(MAKE) seed
	@echo "$(GREEN)✔ Database reset complete.$(RESET)"

db-logs:
	@docker logs -f $(DB_CONTAINER)

db-shell:
	@docker exec -it $(DB_CONTAINER) psql -U $(DB_USER) -d $(DB_NAME)

# ── Redis Container ───────────────────────────────────────────

redis-up:
	@echo "$(GREEN)▶ Starting Redis container [$(REDIS_CONTAINER)]...$(RESET)"
	@docker run -d \
		--name $(REDIS_CONTAINER) \
		-p $(REDIS_PORT):6379 \
		--restart unless-stopped \
		$(REDIS_IMAGE) \
	|| docker start $(REDIS_CONTAINER)
	@echo "$(GREEN)✔ Redis running on port $(REDIS_PORT)$(RESET)"

redis-down:
	@echo "$(RED)▶ Stopping Redis [$(REDIS_CONTAINER)]...$(RESET)"
	@docker stop $(REDIS_CONTAINER) && docker rm $(REDIS_CONTAINER)
	@echo "$(RED)✔ Redis container removed.$(RESET)"

redis-logs:
	@docker logs -f $(REDIS_CONTAINER)

# ── Start / Stop ALL services ─────────────────────────────────

services-up: db-up redis-up
	@echo ""
	@echo "$(GREEN)✔ All services are up!$(RESET)"
	@echo "$(CYAN)  PostgreSQL : localhost:$(DB_PORT) — db: $(DB_NAME)$(RESET)"
	@echo "$(CYAN)  Redis      : localhost:$(REDIS_PORT)$(RESET)"

services-down: db-down redis-down
	@echo "$(RED)✔ All services stopped.$(RESET)"

# ── Prisma ────────────────────────────────────────────────────

migrate:
	@echo "$(GREEN)▶ Running prisma db push...$(RESET)"
	@cd $(BACKEND_DIR) && npx prisma db push
	@echo "$(GREEN)✔ Schema synced.$(RESET)"

generate:
	@echo "$(GREEN)▶ Generating Prisma client...$(RESET)"
	@cd $(BACKEND_DIR) && npx prisma generate
	@echo "$(GREEN)✔ Prisma client generated.$(RESET)"

seed:
	@echo "$(GREEN)▶ Seeding default chart of accounts...$(RESET)"
	@cd $(BACKEND_DIR) && npx prisma db execute --file=./seed-accounts.sql
	@echo "$(GREEN)✔ Seed complete.$(RESET)"

# ── Development ───────────────────────────────────────────────

install:
	@echo "$(GREEN)▶ Installing backend dependencies...$(RESET)"
	@cd $(BACKEND_DIR) && pnpm install
	@echo "$(GREEN)▶ Installing frontend dependencies...$(RESET)"
	@cd $(FRONTEND_DIR) && pnpm install
	@echo "$(GREEN)✔ All dependencies installed.$(RESET)"

dev-backend:
	@cd $(BACKEND_DIR) && pnpm run start:dev

dev-frontend:
	@cd $(FRONTEND_DIR) && pnpm run dev

dev:
	@echo "$(YELLOW)  Run these in separate terminals:$(RESET)"
	@echo "    make dev-backend"
	@echo "    make dev-frontend"

# ── First-time Full Setup ─────────────────────────────────────

setup: services-up
	@echo "$(YELLOW)▶ Waiting 5s for services to be ready...$(RESET)"
	@sleep 5
	$(MAKE) migrate
	$(MAKE) generate
	$(MAKE) seed
	@echo ""
	@echo "$(GREEN)╔══════════════════════════════════════════════════╗$(RESET)"
	@echo "$(GREEN)║  ✔  Setup complete! Ready to develop.            ║$(RESET)"
	@echo "$(GREEN)║  PostgreSQL : localhost:$(DB_PORT) / $(DB_NAME)        ║$(RESET)"
	@echo "$(GREEN)║  Redis      : localhost:$(REDIS_PORT)                  ║$(RESET)"
	@echo "$(GREEN)╚══════════════════════════════════════════════════╝$(RESET)"

# ── Clean ─────────────────────────────────────────────────────
clean:
	@echo "$(RED)▶ Cleaning build artifacts...$(RESET)"
	@rm -rf dist
	@rm -rf $(FRONTEND_DIR)/.next
	@echo "$(RED)✔ Clean complete.$(RESET)"


# ── Colors (ANSI) ─────────────────────────────────────────────
GREEN  = \033[0;32m
YELLOW = \033[1;33m
CYAN   = \033[0;36m
RED    = \033[0;31m
RESET  = \033[0m

.PHONY: help db-up db-down db-reset db-logs db-shell \
        migrate generate seed \
        dev-backend dev-frontend dev \
        install build clean

# ── Default target ────────────────────────────────────────────
help:
	@echo ""
	@echo "$(CYAN)╔══════════════════════════════════════════════════╗$(RESET)"
	@echo "$(CYAN)║      Enterprise POS System — Make Commands       ║$(RESET)"
	@echo "$(CYAN)╚══════════════════════════════════════════════════╝$(RESET)"
	@echo ""
	@echo "$(YELLOW)  Database:$(RESET)"
	@echo "    make db-up        — Start PostgreSQL Docker container"
	@echo "    make db-down      — Stop & remove the DB container"
	@echo "    make db-reset     — Drop & recreate the database"
	@echo "    make db-logs      — Tail container logs"
	@echo "    make db-shell     — Open psql shell inside container"
	@echo ""
	@echo "$(YELLOW)  Prisma:$(RESET)"
	@echo "    make migrate      — Run prisma db push"
	@echo "    make generate     — Generate Prisma client"
	@echo "    make seed         — Seed default chart of accounts"
	@echo ""
	@echo "$(YELLOW)  Development:$(RESET)"
	@echo "    make install      — Install all dependencies"
	@echo "    make dev          — Start backend + frontend dev servers"
	@echo "    make dev-backend  — Start backend only"
	@echo "    make dev-frontend — Start frontend only"
	@echo ""
	@echo "$(YELLOW)  Setup (first run):$(RESET)"
	@echo "    make setup        — db-up + migrate + generate + seed"
	@echo ""

# ── PostgreSQL Container ──────────────────────────────────────

## Start the PostgreSQL container (creates it if not exists)
db-up:
	@echo "$(GREEN)▶ Starting PostgreSQL container [$(DB_CONTAINER)]...$(RESET)"
	@docker run -d \
		--name $(DB_CONTAINER) \
		-e POSTGRES_USER=$(DB_USER) \
		-e POSTGRES_PASSWORD=$(DB_PASSWORD) \
		-e POSTGRES_DB=$(DB_NAME) \
		-p $(DB_PORT):5432 \
		--restart unless-stopped \
		$(DB_IMAGE) \
	|| docker start $(DB_CONTAINER)
	@echo "$(GREEN)✔ PostgreSQL is running on port $(DB_PORT)$(RESET)"
	@echo "$(CYAN)  DATABASE_URL = $(DATABASE_URL)$(RESET)"

## Stop and remove the container
db-down:
	@echo "$(RED)▶ Stopping container [$(DB_CONTAINER)]...$(RESET)"
	@docker stop $(DB_CONTAINER) && docker rm $(DB_CONTAINER)
	@echo "$(RED)✔ Container removed.$(RESET)"

## Drop DB, remove container, recreate everything fresh
db-reset: db-down db-up
	@echo "$(YELLOW)▶ Waiting for Postgres to be ready...$(RESET)"
	@sleep 3
	$(MAKE) migrate
	$(MAKE) generate
	$(MAKE) seed
	@echo "$(GREEN)✔ Database reset complete.$(RESET)"

## Tail container logs
db-logs:
	@docker logs -f $(DB_CONTAINER)

## Open psql shell inside container
db-shell:
	@docker exec -it $(DB_CONTAINER) psql -U $(DB_USER) -d $(DB_NAME)

# ── Prisma ────────────────────────────────────────────────────

## Push schema to database (no migration history)
migrate:
	@echo "$(GREEN)▶ Running prisma db push...$(RESET)"
	@cd $(BACKEND_DIR) && npx prisma db push
	@echo "$(GREEN)✔ Schema synced.$(RESET)"

## Generate Prisma client
generate:
	@echo "$(GREEN)▶ Generating Prisma client...$(RESET)"
	@cd $(BACKEND_DIR) && npx prisma generate
	@echo "$(GREEN)✔ Prisma client generated.$(RESET)"

## Seed default chart of accounts
seed:
	@echo "$(GREEN)▶ Seeding default chart of accounts...$(RESET)"
	@cd $(BACKEND_DIR) && npx prisma db execute --file=./seed-accounts.sql
	@echo "$(GREEN)✔ Seed complete.$(RESET)"

# ── Development ───────────────────────────────────────────────

## Install dependencies for backend and frontend
install:
	@echo "$(GREEN)▶ Installing backend dependencies...$(RESET)"
	@cd $(BACKEND_DIR) && pnpm install
	@echo "$(GREEN)▶ Installing frontend dependencies...$(RESET)"
	@cd $(FRONTEND_DIR) && pnpm install
	@echo "$(GREEN)✔ All dependencies installed.$(RESET)"

## Start backend dev server
dev-backend:
	@cd $(BACKEND_DIR) && pnpm run start:dev

## Start frontend dev server
dev-frontend:
	@cd $(FRONTEND_DIR) && pnpm run dev

## Start both servers (requires two terminals — use concurrently or run separately)
dev:
	@echo "$(YELLOW)  Run these in separate terminals:$(RESET)"
	@echo "    make dev-backend"
	@echo "    make dev-frontend"

# ── First-time Full Setup ─────────────────────────────────────

## Full setup: start DB → push schema → generate client → seed
setup: db-up
	@echo "$(YELLOW)▶ Waiting 4s for Postgres to be ready...$(RESET)"
	@sleep 4
	$(MAKE) migrate
	$(MAKE) generate
	$(MAKE) seed
	@echo ""
	@echo "$(GREEN)╔══════════════════════════════════════════════╗$(RESET)"
	@echo "$(GREEN)║  ✔  Setup complete! Ready to develop.        ║$(RESET)"
	@echo "$(GREEN)║     DATABASE_URL = $(DATABASE_URL)$(RESET)"
	@echo "$(GREEN)╚══════════════════════════════════════════════╝$(RESET)"

# ── Clean ─────────────────────────────────────────────────────
clean:
	@echo "$(RED)▶ Cleaning build artifacts...$(RESET)"
	@rm -rf $(BACKEND_DIR)/dist
	@rm -rf $(FRONTEND_DIR)/.next
	@echo "$(RED)✔ Clean complete.$(RESET)"

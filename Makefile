install:
	docker compose up -d
	cp apps/backend/.env.example apps/backend/.env
	cp apps/frontend-next/.env.example apps/frontend-next/.env
	cp packages/backend-base/.env.example packages/backend-base/.env
	cp packages/database/.env.example packages/database/.env
	bun install
	cd packages/database && bun migrate:deploy
	cd packages/database && bun db:seed

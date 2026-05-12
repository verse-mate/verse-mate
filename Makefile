install:
	docker compose up -d
	sleep 10s
	cp -n apps/backend/.env.example apps/backend/.env
	cp -n apps/frontend-next/.env.example apps/frontend-next/.env
	cp -n packages/backend-base/.env.example packages/backend-base/.env
	cp -n packages/database/.env.example packages/database/.env
	bun install --frozen-lockfile
	cd packages/database && bun migrate:deploy
	cd packages/database && bun db:seed

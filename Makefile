.PHONY: help deps lint typecheck format build check release
.DEFAULT_GOAL := help

help: ## — list the targets
	@awk -F':.*## ' '/^[a-z-]+:.*## /{printf "%-12s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

deps: ## — install from the lockfile
	npm ci

lint: ## — eslint
	npm run -s lint

typecheck: ## — tsc without emit
	npm run -s typecheck

format: ## — prettier check
	npm run -s format:check

build: ## — compile to dist
	npm run -s build

check: lint typecheck format build ## — everything CI runs

release: ## — tag the next semver and push it: make release TYPE=patch|minor|major
	@./scripts/release.sh "$(TYPE)"

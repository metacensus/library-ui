.PHONY: help deps browsers lint typecheck format build test test-browser check release
.DEFAULT_GOAL := help

help: ## — list the targets
	@awk -F':.*## ' '/^[a-z-]+:.*## /{printf "%-12s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

deps: ## — install from the lockfile
	npm ci

browsers: ## — install the Playwright engines and, on Linux, their system libraries
	npx playwright install --with-deps chromium firefox webkit

lint: ## — eslint
	npm run -s lint

typecheck: ## — tsc without emit
	npm run -s typecheck

format: ## — prettier check
	npm run -s format:check

build: ## — compile to dist
	npm run -s build

test: build ## — the Node tests, against the built package
	npm test

test-browser: build ## — the browser specs, in Chromium, Firefox and WebKit
	npm run -s test:browser

check: lint typecheck format test test-browser ## — everything CI runs

release: ## — tag the next semver and push it: make release TYPE=patch|minor|major
	@./scripts/release.sh "$(TYPE)"

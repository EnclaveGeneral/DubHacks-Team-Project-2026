# Shortcuts for the demo. Run from the repo root.
#   make demo   start the store, store server, service, and extension build
#   make warm   build the extraction cache (needs ANTHROPIC_API_KEY in .env)

ifeq ($(OS),Windows_NT)
PY := .venv/Scripts/python
else
PY := .venv/bin/python
endif

.PHONY: demo warm

demo:
	npm run dev

# Pass ARGS=--fresh to re-extract documents that are already cached.
warm:
	$(PY) service/warm_cache.py $(ARGS)

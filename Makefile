.PHONY: all
all: build

.PHONY: serve
serve: node_modules/
	@if [ -f node_modules/@kittycad/kcl-wasm-lib/kcl_wasm_lib_bg.wasm ]; then \
		cp node_modules/@kittycad/kcl-wasm-lib/kcl_wasm_lib_bg.wasm public/; \
	else \
		echo "[sync-wasm-assets] Skipping copy; missing node_modules/@kittycad/kcl-wasm-lib/kcl_wasm_lib_bg.wasm"; \
	fi
	npx esbuild --bundle src/example.ts --outdir=public --servedir=public --serve=localhost:3000

.PHONY: build
build: node_modules/
	-mkdir pkg/
	npx esbuild --bundle --global-name=kittycadWebWiew src/index.ts --outdir=pkg
	npx tsc --build
	cp package.json pkg/
	cp README.md pkg/

clean:
	-rm -r pkg
	
node_modules/:
	npm install

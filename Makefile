.PHONY: all
all: build

.PHONY: serve
serve: node_modules/
	npx esbuild --bundle src/example.ts --outdir=public --servedir=public --serve=localhost:3000

.PHONY: build
build: node_modules/
	npx esbuild --bundle --global-name=kittycadWebWiew src/index.ts --outdir=pkg
	npx tsc --build
	cp package.json pkg/

clean:
	-rm -r pkg
	
node_modules/:
	npm install

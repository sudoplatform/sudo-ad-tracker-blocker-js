#!/bin/sh

WASM_PACK_MODE=${WASM_PACK_MODE:-dev}

# Clean output dir
rm -rf wasm

# Build the Rust filter engine and JS glue code using wasm-pack
wasm-pack build --target web --out-dir wasm --$WASM_PACK_MODE

# Transpile the glue code using babel.
# In particular, we must use `babel-plugin-bundled-import-meta` in order to 
# compile out the reliance on `imports.meta` because this is not well supported.
# https://www.npmjs.com/package/babel-plugin-bundled-import-meta
#
# Note, the transpiled code still has a dependency on `document.baseURL`, so this
# must be patched into the global context when running in Node.
# This is done via src/runtimes/node/environment.ts
babel wasm/filter_engine.js --out-dir wasm

# Remove files that we don't need
rm wasm/.gitignore
rm wasm/package.json
rm wasm/README.md
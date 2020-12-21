import init from '../wasm/filter_engine'

const wasmFile = 'filter_engine_bg.wasm'

export type WasmInitInput =
  | string
  | RequestInfo
  | URL
  | Response
  | BufferSource
  | WebAssembly.Module
  | Promise<Response | BufferSource | WebAssembly.Module>

/**
 * TODO: Document the heck out of this
 */
export async function initWasm(
  locateWasm?: (file: string) => WasmInitInput,
): Promise<void> {
  await init(locateWasm?.(wasmFile))
}

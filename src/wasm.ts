import init from '../wasm/filter_engine'

const wasmFile = 'filter_engine_bg.wasm'

/**
 * The return value of {@link initWasm}.
 * This will indicate how to load a Web Assembly file.
 *
 * In a browser context, the easiest option is to
 * specify a string that describes the fetch location of
 * the web assembly file, relative to the website's root,
 * e.g. :`/web-assembly-files/file.wasm`.
 *
 * In NodeJS it is easiest to load the file using `fs.readFile`
 * and provide the BufferSource of the file.
 */
export type WasmInitInput =
  | string
  | RequestInfo
  | URL
  | Response
  | BufferSource
  | WebAssembly.Module
  | Promise<Response | BufferSource | WebAssembly.Module>

/**
 * This function is used to load a Web Assembly file that
 * {@link SudoAdTrackerBlockerClient} depends on, and must be called one
 * time during application startup.
 *
 * For browser, the easiest implementation is:
 * ```
 * initWasm((file) => `/fetch-path-of-wasm-file-in-website/${file}`)
 * ```
 *
 * For NodeJS, the easiest implementation is:
 * ```
 * initWasm((file) => fs.readFile(
 *   `./node_modules/@sudoplatform/ad-tracker-blocker/wasm/${file}`
 * )
 * ```
 *
 * @param locateWasm A callback that returns the location of the required web assembly file.
 */
export async function initWasm(
  locateWasm: (file: string) => WasmInitInput,
): Promise<void> {
  await init(locateWasm(wasmFile))
}

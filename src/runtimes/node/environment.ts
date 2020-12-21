/* eslint-disable @typescript-eslint/no-explicit-any */

const globalAny: any = global

globalAny.document = {
  /** Required for import.meta babel plugin compatibility. */
  baseURI: 'https://example.com',
}

import { Logger } from '@sudoplatform/sudo-common'

export const nullLogger: Logger = {
  debug: () => undefined,
  warn: () => undefined,
  info: () => undefined,
  error: () => undefined,
  fatal: () => undefined,
  trace: () => undefined,
}

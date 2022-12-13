import { Logger } from '@sudoplatform/sudo-common'

export const nullLogger: Logger = {
  debug: () => false,
  warn: () => false,
  info: () => false,
  error: () => false,
  fatal: () => false,
  trace: () => false,
}

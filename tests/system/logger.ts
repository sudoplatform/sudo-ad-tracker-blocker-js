import Bunyan from 'bunyan'

export const logger = Bunyan.createLogger({
  name: 'system-tests',
  streams: [
    {
      level: 'info',
      path: 'system-tests.log',
    },
    {
      level: 'error',
      stream: process.stderr,
    },
  ],
})

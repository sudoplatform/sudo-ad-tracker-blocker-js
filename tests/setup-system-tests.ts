import 'isomorphic-fetch'

import '../src/runtimes/node/environment'

jest.setTimeout(60000)

global.crypto = require('isomorphic-webcrypto')

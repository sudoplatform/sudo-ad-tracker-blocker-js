import fs from 'fs'
import path from 'path'

import { DefaultConfigurationManager } from '@sudoplatform/sudo-common'
import { DefaultSudoUserClient, SudoUserClient } from '@sudoplatform/sudo-user'
import { TESTAuthenticationProvider } from '@sudoplatform/sudo-user/lib/user/auth-provider'

import { requireEnv } from '../../utils/require-env'
import { logger } from './logger'

const env = requireEnv({
  REGISTER_KEY: {
    type: 'string',
    default: () =>
      fs.readFileSync(
        path.resolve(__dirname, `../../config/register_key.private`),
        'ascii',
      ),
  },
  REGISTER_KEY_ID: {
    type: 'string',
    default: () =>
      fs.readFileSync(
        path.resolve(__dirname, `../../config/register_key.id`),
        'ascii',
      ),
  },
  SDK_CONFIG: {
    type: 'string',
    default: () =>
      fs.readFileSync(
        path.resolve(__dirname, `../../config/sudoplatformconfig.json`),
        'utf8',
      ),
  },
})

export const sdkConfig = {
  ...JSON.parse(env.SDK_CONFIG),
  federatedSignIn: {
    appClientId: 'n/a',
    refreshTokenLifetime: 0,
    signInRedirectUri: 'n/a',
    signOutRedirectUri: 'n/a',
    webDomain: 'n/a',
    identityProvider: 'n/a',
  },
}

DefaultConfigurationManager.getInstance().setConfig(JSON.stringify(sdkConfig))

const testAuthProvider = new TESTAuthenticationProvider(
  'system-test',
  env.REGISTER_KEY,
  env.REGISTER_KEY_ID,
)

export async function registerUser(): Promise<SudoUserClient> {
  const logSpy = jest.spyOn(console, 'log').mockImplementation()
  const userClient = new DefaultSudoUserClient(
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    logger,
  )
  await userClient.registerWithAuthenticationProvider(testAuthProvider)
  await userClient.signInWithKey()
  logSpy.mockRestore()
  return userClient
}

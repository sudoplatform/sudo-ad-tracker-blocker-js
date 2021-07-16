import fs from 'fs'
import path from 'path'

import { DefaultConfigurationManager } from '@sudoplatform/sudo-common'
import { DefaultSudoUserClient, SudoUserClient } from '@sudoplatform/sudo-user'
import { AuthenticationStore } from '@sudoplatform/sudo-user/lib/core/auth-store'
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

export async function registerUser(): Promise<{
  userClient: SudoUserClient
  authStore: AuthenticationStore
}> {
  const authStore = new AuthenticationStore()
  const userClient = new DefaultSudoUserClient({
    authenticationStore: authStore,
    logger,
  })

  await userClient.registerWithAuthenticationProvider(testAuthProvider)
  await userClient.signInWithKey()

  return {
    authStore,
    userClient,
  }
}

export async function invalidateAuthTokens(
  authStore: AuthenticationStore,
  userClient: SudoUserClient,
): Promise<void> {
  // Get current tokens
  const idToken = authStore.getItem('idToken')!
  const refreshToken = authStore.getItem('refreshToken')!

  // Do global signout to invalidate the tokens
  await userClient.globalSignOut() // this clears auth store

  // Restore tokens to auth store so we can try and use them
  await authStore.setItem('idToken', idToken)
  await authStore.setItem('refreshToken', refreshToken)
}

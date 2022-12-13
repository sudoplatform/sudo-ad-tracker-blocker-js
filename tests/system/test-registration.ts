import fs from 'fs'
import path from 'path'

import {
  DefaultConfigurationManager,
  DefaultSudoKeyManager,
  KeyDataKeyType,
  SudoKeyManager,
} from '@sudoplatform/sudo-common'
import {
  DefaultSudoUserClient,
  SudoUserClient,
  TESTAuthenticationProvider,
} from '@sudoplatform/sudo-user'
import { WebSudoCryptoProvider } from '@sudoplatform/sudo-web-crypto-provider'

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
  keyManager: SudoKeyManager
  userClient: SudoUserClient
}> {
  const cryptoProvider = new WebSudoCryptoProvider('ns', 'atb-service')
  const keyManager = new DefaultSudoKeyManager(cryptoProvider)
  const userClient = new DefaultSudoUserClient({
    sudoKeyManager: keyManager,
    logger,
  })

  await userClient.registerWithAuthenticationProvider(testAuthProvider)
  await userClient.signInWithKey()

  return { userClient, keyManager }
}

export async function invalidateAuthTokens(
  keyManager: SudoKeyManager,
  userClient: SudoUserClient,
): Promise<void> {
  // Get current tokens
  const keyData = await keyManager.exportKeys()

  // Do global signout to invalidate the tokens
  await userClient.globalSignOut() // this clears auth store

  // Set tokens back
  keyData.map((value) => {
    switch (value.type) {
      case KeyDataKeyType.SymmetricKey:
        void keyManager.addSymmetricKey(value.data, value.name)
        break
      case KeyDataKeyType.RSAPublicKey:
        void keyManager.addPublicKey(value.data, value.name)
        break
      case KeyDataKeyType.RSAPrivateKey:
        void keyManager.addPrivateKey(value.data, value.name)
        break
      case KeyDataKeyType.Password:
        void keyManager.addPassword(value.data, value.name)
        break
      default:
        throw new Error(`Unknown KeyDataKeyType: ${value.type}`)
    }
  })
}

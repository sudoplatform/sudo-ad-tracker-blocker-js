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
    default: path.resolve(__dirname, `../../config/register_key.private`),
  },
  REGISTER_KEY_ID: {
    type: 'string',
    default: path.resolve(__dirname, `../../config/register_key.id`),
  },
  SUDO_PLATFORM_CONFIG: {
    type: 'string',
    default: path.resolve(__dirname, `../../config/sudoplatformconfig.json`),
  },
})

/**
 * Read a config value obtained from the environment.
 * If file is specified, load from the file.
 * This supports both File and Var GitLab CI Variable types.
 */
function readConfigValue(value: string) {
  if (fs.existsSync(value)) {
    return fs.readFileSync(value, 'utf8')
  } else {
    return value
  }
}

export const sdkConfig = {
  ...JSON.parse(readConfigValue(env.SUDO_PLATFORM_CONFIG)),
  federatedSignIn: {
    appClientId: 'n/a',
    refreshTokenLifetime: 0,
    signInRedirectUri: 'n/a',
    signOutRedirectUri: 'n/a',
    webDomain: 'n/a',
    identityProvider: 'n/a',
  },
}

const testAuthProvider = new TESTAuthenticationProvider(
  'system-test',
  readConfigValue(env.REGISTER_KEY),
  readConfigValue(env.REGISTER_KEY_ID),
)

DefaultConfigurationManager.getInstance().setConfig(JSON.stringify(sdkConfig))

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

import * as t from 'io-ts'

const identityService = t.type({
  region: t.string,
  poolId: t.string,
  identityPoolId: t.string,
  staticDataBucket: t.string,
})

/**
 * The portion of Identity Service config that is required by ATB client.
 */
export const IotsConfig = t.type({
  identityService,
})

export type IotsConfig = t.TypeOf<typeof IotsConfig>

/**
 * The SDK Config required for {@link SudoAdTrackerBlockerClient}.
 * @see https://docs.sudoplatform.com/guides/getting-started#step-2-download-the-sdk-configuration-file
 */
export interface Config {
  identityService: {
    region: string
    poolId: string
    identityPoolId: string
    staticDataBucket: string
  }
}

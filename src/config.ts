import * as t from 'io-ts'

const identityService = t.type({
  region: t.string,
  poolId: t.string,
  identityPoolId: t.string,
})

const adTrackerBlockerService = t.type({
  bucket: t.string,
  region: t.string,
})

/**
 * The portion of the SDK Config that is required by ATB client.
 */
export const IotsConfig = t.type({
  identityService,
  adTrackerBlockerService,
})

/**
 * The SDK Config required for {@link SudoAdTrackerBlockerClient}.
 * @see https://docs.sudoplatform.com/guides/getting-started#step-2-download-the-sdk-configuration-file
 */
export type Config = t.TypeOf<typeof IotsConfig>

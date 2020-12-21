import * as t from 'io-ts'

/**
 * The portion of Identity Service config that is required by ATB client.
 */
const identityService = t.type({
  region: t.string,
  poolId: t.string,
  identityPoolId: t.string,
  staticDataBucket: t.string,
})

export const Config = t.type({
  identityService,
})

export type Config = t.TypeOf<typeof Config>

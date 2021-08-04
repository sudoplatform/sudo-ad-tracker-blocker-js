import { NotAuthorizedError } from '@sudoplatform/sudo-common'
import { SudoUserClient } from '@sudoplatform/sudo-user'
import { AuthenticationStore } from '@sudoplatform/sudo-user/lib/core/auth-store'

import { RulesetContent } from '../../lib/ruleset-provider'
import { RulesetFormat } from '../../lib/ruleset-provider'
import {
  DefaultRulesetProvider,
  DefaultRulesetProviderProps,
} from '../../lib/ruleset-providers/default-ruleset-provider'
import {
  invalidateAuthTokens,
  registerUser,
  sdkConfig,
} from './test-registration'

let userClient: SudoUserClient
let authStore: AuthenticationStore
let testProps: DefaultRulesetProviderProps

beforeEach(async () => {
  const services = await registerUser()
  authStore = services.authStore
  userClient = services.userClient
  testProps = {
    userClient,
    poolId: sdkConfig.identityService.poolId,
    identityPoolId: sdkConfig.identityService.identityPoolId,
    bucket: sdkConfig.adTrackerBlockerService.bucket,
    bucketRegion: sdkConfig.adTrackerBlockerService.region,
  }
})

describe('DefaultRulesetProvider', () => {
  it('listRulesets should throw NotAuthorizedError', async () => {
    await invalidateAuthTokens(authStore, userClient)

    const ruleSetProvider = new DefaultRulesetProvider(testProps)

    await expect(ruleSetProvider.listRulesets()).rejects.toThrow(
      NotAuthorizedError,
    )
  })

  it('should list rule sets', async () => {
    const ruleSetProvider = new DefaultRulesetProvider(testProps)

    const result = await ruleSetProvider.listRulesets()

    const expectedPrefix = '/filter-lists/adblock-plus'
    expect(result).toEqual([
      {
        type: 'ad-blocking',
        location: `${expectedPrefix}/AD/easylist.txt`,
        updatedAt: expect.any(Date),
      },
      {
        type: 'privacy',
        location: `${expectedPrefix}/PRIVACY/easyprivacy.txt`,
        updatedAt: expect.any(Date),
      },
      {
        type: 'social',
        location: `${expectedPrefix}/SOCIAL/fanboy-social.txt`,
        updatedAt: expect.any(Date),
      },
    ])
  })

  it('downloadRuleset should throw NotAuthorizedError', async () => {
    await invalidateAuthTokens(authStore, userClient)

    const ruleSetProvider = new DefaultRulesetProvider(testProps)

    await expect(
      ruleSetProvider.downloadRuleset('not-important'),
    ).rejects.toThrow(NotAuthorizedError)
  })

  it('should download rule sets', async () => {
    const eTagRegex = /"[0-9a-f]*"$/

    const ruleSetProvider = new DefaultRulesetProvider(testProps)

    const result = await ruleSetProvider.downloadRuleset(
      '/filter-lists/adblock-plus/AD/easylist.txt',
    )

    if (result === 'not-modified') fail()
    expect(result.data.length).toBeGreaterThan(0)
    expect(result.cacheKey).toEqual(expect.stringMatching(eTagRegex))
  })

  it('should not download if etag has not changed', async () => {
    const ruleSetProvider = new DefaultRulesetProvider(testProps)

    const result1 = await ruleSetProvider.downloadRuleset(
      '/filter-lists/adblock-plus/AD/easylist.txt',
    )
    const result2 = await ruleSetProvider.downloadRuleset(
      '/filter-lists/adblock-plus/AD/easylist.txt',
      (result1 as RulesetContent).cacheKey,
    )

    expect(result2 as string).toBe('not-modified')
  })

  it('should list Apple rulesets', async () => {
    const ruleSetProvider = new DefaultRulesetProvider({
      ...testProps,
      format: RulesetFormat.Apple,
    })

    const result = await ruleSetProvider.listRulesets()

    const expectedPrefix = '/filter-lists/apple'
    expect(result).toEqual([
      {
        type: 'ad-blocking',
        location: `${expectedPrefix}/AD/easylist.json`,
        updatedAt: expect.any(Date),
      },
      {
        type: 'privacy',
        location: `${expectedPrefix}/PRIVACY/easyprivacy.json`,
        updatedAt: expect.any(Date),
      },
      {
        type: 'social',
        location: `${expectedPrefix}/SOCIAL/fanboy-social.json`,
        updatedAt: expect.any(Date),
      },
    ])
  })

  it('should download an Apple rulesets', async () => {
    const eTagRegex = /"[0-9a-f]*"$/

    const ruleSetProvider = new DefaultRulesetProvider({
      ...testProps,
      format: RulesetFormat.Apple,
    })

    const result = await ruleSetProvider.downloadRuleset(
      '/filter-lists/apple/AD/easylist.json',
    )

    if (result === 'not-modified') fail()
    const json = JSON.parse(result.data)
    expect(json.length).toBeGreaterThan(0)
    expect(result.cacheKey).toEqual(expect.stringMatching(eTagRegex))
  })
})

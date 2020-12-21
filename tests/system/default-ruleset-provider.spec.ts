import { SudoUserClient } from '@sudoplatform/sudo-user'

import { RulesetContent } from '../../lib/ruleset-provider'
import { DefaultRulesetProvider } from '../../lib/ruleset-providers/default-ruleset-provider'
import { registerUser, sdkConfig } from './test-registration'

let userClient: SudoUserClient
beforeAll(async () => {
  userClient = await registerUser()
})

describe('DefaultRulesetProvider', () => {
  it('should list rule sets', async () => {
    const ruleSetProvider = new DefaultRulesetProvider({
      userClient,
      poolId: sdkConfig.identityService.poolId,
      identityPoolId: sdkConfig.identityService.identityPoolId,
      bucket: sdkConfig.identityService.staticDataBucket,
    })

    const result = await ruleSetProvider.listRulesets()

    const expectedPrefix = '/ad-tracker-blocker/filter-lists/adblock-plus'
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

  it('should download rule sets', async () => {
    const eTagRegex = /"[0-9a-f]*"$/

    const ruleSetProvider = new DefaultRulesetProvider({
      userClient,
      poolId: sdkConfig.identityService.poolId,
      identityPoolId: sdkConfig.identityService.identityPoolId,
      bucket: sdkConfig.identityService.staticDataBucket,
    })

    const result = await ruleSetProvider.downloadRuleset(
      '/ad-tracker-blocker/filter-lists/adblock-plus/AD/easylist.txt',
    )

    if (result === 'not-modified') fail()
    expect(result.data.length).toBeGreaterThan(0)
    expect(result.cacheKey).toEqual(expect.stringMatching(eTagRegex))
  })

  it('should not download if etag has not changed', async () => {
    const ruleSetProvider = new DefaultRulesetProvider({
      userClient,
      poolId: sdkConfig.identityService.poolId,
      identityPoolId: sdkConfig.identityService.identityPoolId,
      bucket: sdkConfig.identityService.staticDataBucket,
    })

    const result1 = await ruleSetProvider.downloadRuleset(
      '/ad-tracker-blocker/filter-lists/adblock-plus/AD/easylist.txt',
    )
    const result2 = await ruleSetProvider.downloadRuleset(
      '/ad-tracker-blocker/filter-lists/adblock-plus/AD/easylist.txt',
      (result1 as RulesetContent).cacheKey,
    )

    expect(result2 as string).toBe('not-modified')
  })
})

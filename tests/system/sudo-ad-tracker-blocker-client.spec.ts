import fs from 'fs'
import path from 'path'

import { SudoUserClient } from '@sudoplatform/sudo-user'

import {
  RulesetFormat,
  RulesetType,
  SudoAdTrackerBlockerClient,
  initWasm,
} from '../../lib'
import { logger } from './logger'
import { registerUser } from './test-registration'

let userClient: SudoUserClient
beforeAll(async () => {
  userClient = await registerUser()
  await initWasm((file) =>
    fs.readFileSync(path.resolve(__dirname, '../../wasm', file)),
  )
})

describe('SudoAdTrackerBlockerClient', () => {
  it('should initialize with all lists enabled by default', async () => {
    const client = new SudoAdTrackerBlockerClient({
      sudoUserClient: userClient,
      logger,
    })

    // Assert lists:
    const lists = await client.getActiveRulesets()
    expect(lists).toEqual([
      RulesetType.AdBlocking,
      RulesetType.Privacy,
      RulesetType.Social,
    ])

    // Test ad blocking rule from easylist:
    await client.update()
    expect(client.checkUrl('https://example.com/!advert_')).toEqual('blocked')

    // Test privacy rule from easyprivacy:
    expect(client.checkUrl('https://example.com/admp-')).toEqual('blocked')

    // Test social rule from fanboysocial:
    expect(client.checkUrl('https://example.com/button-fb.')).toEqual('blocked')

    // Control:
    expect(client.checkUrl('https://example.com/anonyome-is-cool')).toEqual(
      'allowed',
    )
  })

  it('should list rulesets', async () => {
    const client = new SudoAdTrackerBlockerClient({
      sudoUserClient: userClient,
      logger,
    })

    await client.update()
    const rulesets = await client.listRulesets()
    expect(rulesets).toEqual([
      { type: 'ad-blocking', updatedAt: expect.any(Date) },
      { type: 'privacy', updatedAt: expect.any(Date) },
      { type: 'social', updatedAt: expect.any(Date) },
    ])
  })

  it('should set active rulesets', async () => {
    const client = new SudoAdTrackerBlockerClient({
      sudoUserClient: userClient,
    })

    await client.update()

    // Verify default active rulesets
    await expect(client.getActiveRulesets()).resolves.toEqual([
      RulesetType.AdBlocking,
      RulesetType.Privacy,
      RulesetType.Social,
    ])

    // This should be blocked due to AdBlocking ruleset:
    expect(
      client.checkUrl(
        'https://example.com/!advert_',
        'https://www.anonyome.com',
      ),
    ).toEqual('blocked')

    // Disable Ad blocking ruleset
    await client.setActiveRulesets([RulesetType.Privacy, RulesetType.Social])

    // Verify getActiveRulesets reports the change correctly
    await expect(client.getActiveRulesets()).resolves.toEqual([
      RulesetType.Privacy,
      RulesetType.Social,
    ])

    // This should be now be allowed:
    expect(
      client.checkUrl(
        'https://example.com/!advert_',
        'https://www.anonyome.com',
      ),
    ).toEqual('allowed')
  })

  it('should whitelist a site', async () => {
    const client = new SudoAdTrackerBlockerClient({
      sudoUserClient: userClient,
      logger,
    })

    await client.update()

    // Without whitelisting, this should be blocked:
    expect(
      client.checkUrl(
        'https://example.com/!advert_',
        'https://www.anonyome.com',
      ),
    ).toEqual('blocked')

    // Add whitelist exception
    await client.addExceptions([{ type: 'host', source: 'www.anonyome.com' }])

    // Now it should be not be blocked:
    expect(
      client.checkUrl(
        'https://example.com/!advert_',
        'https://www.anonyome.com',
      ),
    ).toEqual('allowed')
  })

  it('should list apple rulesets', async () => {
    const client = new SudoAdTrackerBlockerClient({
      sudoUserClient: userClient,
      logger,
      format: RulesetFormat.Apple,
    })

    await client.update()
    const rulesets = await client.listRulesets()
    const rulesetsWithLengths = rulesets.map((rs) => ({
      type: rs.type,
      updatedAt: rs.updatedAt,
      length: rs.content!.length,
    }))

    expect(rulesetsWithLengths).toEqual([
      {
        type: 'ad-blocking',
        updatedAt: expect.any(Date),
        length: expect.any(Number),
      },
      {
        type: 'privacy',
        updatedAt: expect.any(Date),
        length: expect.any(Number),
      },
      {
        type: 'social',
        updatedAt: expect.any(Date),
        length: expect.any(Number),
      },
    ])
  })

  it('should not allow checkUrl for Apple rulesets', async () => {
    const client = new SudoAdTrackerBlockerClient({
      sudoUserClient: userClient,
      logger,
      format: RulesetFormat.Apple,
    })

    expect(() => client.checkUrl('https://whatever.com')).toThrow(
      "The filter engine is not available. To instantiate the filter engine make sure the ruleset provider's format is AdBlockPlus and then call `client.update`.",
    )
  })
})

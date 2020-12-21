import fs from 'fs'
import path from 'path'

import { SudoUserClient } from '@sudoplatform/sudo-user'

import { AdTrackerBlockerClient, RulesetType, initWasm } from '../../lib'
import { logger } from './logger'
import { registerUser } from './test-registration'

let userClient: SudoUserClient
beforeAll(async () => {
  userClient = await registerUser()
  await initWasm((file) =>
    fs.readFileSync(path.resolve(__dirname, '../../wasm', file)),
  )
})

describe('AdTrackerBlockerClient', () => {
  it('should initialize with all lists enabled by default', async () => {
    const client = new AdTrackerBlockerClient({
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
    await expect(
      client.checkUrl('https://example.com/!advert_'),
    ).resolves.toEqual('blocked')

    // Test privacy rule from easyprivacy:
    await expect(client.checkUrl('https://example.com/admp-')).resolves.toEqual(
      'blocked',
    )

    // Test social rule from fanboysocial:
    await expect(
      client.checkUrl('https://example.com/button-fb.'),
    ).resolves.toEqual('blocked')

    // Control:
    await expect(
      client.checkUrl('https://example.com/anonyome-is-cool'),
    ).resolves.toEqual('allowed')
  })

  it('should list rulesets', async () => {
    const client = new AdTrackerBlockerClient({
      sudoUserClient: userClient,
      logger,
    })

    const rulesets = await client.listRulesets()
    expect(rulesets).toEqual([
      { type: 'ad-blocking', updatedAt: expect.any(Date) },
      { type: 'privacy', updatedAt: expect.any(Date) },
      { type: 'social', updatedAt: expect.any(Date) },
    ])
  })

  it('should set active rulesets', async () => {
    const client = new AdTrackerBlockerClient({
      sudoUserClient: userClient,
    })

    // Verify default active rulesets
    await expect(client.getActiveRulesets()).resolves.toEqual([
      RulesetType.AdBlocking,
      RulesetType.Privacy,
      RulesetType.Social,
    ])

    // This should be blocked due to AdBlocking ruleset:
    await expect(
      client.checkUrl(
        'https://example.com/!advert_',
        'https://www.anonyome.com',
      ),
    ).resolves.toEqual('blocked')

    // Disable Ad blocking ruleset
    await client.setActiveRulesets([RulesetType.Privacy, RulesetType.Social])

    // Verify getActiveRulesets reports the change correctly
    await expect(client.getActiveRulesets()).resolves.toEqual([
      RulesetType.Privacy,
      RulesetType.Social,
    ])

    // This should be now be allowed:
    await expect(
      client.checkUrl(
        'https://example.com/!advert_',
        'https://www.anonyome.com',
      ),
    ).resolves.toEqual('allowed')
  })

  it('should whitelist a site', async () => {
    const client = new AdTrackerBlockerClient({
      sudoUserClient: userClient,
      logger,
    })

    // Without whitelisting, this should be blocked:
    await expect(
      client.checkUrl(
        'https://example.com/!advert_',
        'https://www.anonyome.com',
      ),
    ).resolves.toEqual('blocked')

    // Add whitelist exception
    await client.addExceptions([{ type: 'host', source: 'www.anonyome.com' }])

    // Now it should be not be blocked:
    await expect(
      client.checkUrl(
        'https://example.com/!advert_',
        'https://www.anonyome.com',
      ),
    ).resolves.toEqual('allowed')
  })
})

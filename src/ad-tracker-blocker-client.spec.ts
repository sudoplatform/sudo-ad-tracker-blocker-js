import fs from 'fs'
import path from 'path'

import { nullLogger } from '../tests/unit/null-logger'
import {
  AdTrackerBlockerClient,
  AdTrackerBlockerClientProps,
} from './ad-tracker-blocker-client'
import { normalizeExceptionSources } from './filter-exceptions'
import { MockRuleSetProvider } from './ruleset-providers/mock-ruleset-provider'
import { RulesetType } from './ruleset-type'
import { MemoryStorageProvider } from './storage-providers/memory-storage-provider'
import { initWasm } from './wasm'

const fetchSpy = jest.fn()

fetchSpy.mockResolvedValue({
  text: () => '?nope',
  headers: {
    get: () =>
      "Cache key that should be a date string but those don't play nice in tests...and stuff",
  },
})

global.fetch = fetchSpy

const testProps: AdTrackerBlockerClientProps = {
  config: {} as any,
  sudoUserClient: {} as any,
  rulesetProvider: new MockRuleSetProvider(),
  logger: nullLogger,
}

beforeAll(async () => {
  await initWasm((file) =>
    fs.readFileSync(path.resolve(__dirname, '../wasm', file)),
  )
})

describe('AdTrackerBlockerClient', () => {
  describe('construction', () => {
    it('should start with initializing status', async () => {
      const atbClient = new AdTrackerBlockerClient(testProps)

      expect(atbClient.status).toBe('preparing')
    })

    it('should go to ready after initializing status', async () => {
      const atbClient = new AdTrackerBlockerClient(testProps)

      // This awaits this.engine
      await atbClient.checkUrl('http://something.com')

      expect(atbClient.status).toBe('ready')
    })

    it('should signal ready state via callback', async () => {
      let resolveStatus: (value?: unknown) => void
      const waitForStatus = new Promise((resolve) => {
        resolveStatus = resolve
      })
      const atbClient = new AdTrackerBlockerClient({
        ...testProps,
        onStatusChanged: () => resolveStatus(),
      })

      expect(atbClient.status).toBe('preparing')
      await waitForStatus
      expect(atbClient.status).toBe('ready')
    })
  })

  describe('checkUrl()', () => {
    it.each`
      url                                         | expectedResult
      ${'https://example.com'}                    | ${'allowed'}
      ${'https://buybuybuy.com'}                  | ${'blocked'}
      ${'https://peep-n-tom.com'}                 | ${'blocked'}
      ${'https://example.com/?listening=true'}    | ${'blocked'}
      ${'https://example.com/?listening=false'}   | ${'allowed'}
      ${'https://friendspacebook.com/hello'}      | ${'blocked'}
      ${'https://example.com/?like=yes&poke=yes'} | ${'blocked'}
    `(
      'should check urls according to mock rule set rules',
      async ({ url, expectedResult }) => {
        const atbClient = new AdTrackerBlockerClient(testProps)

        const result = await atbClient.checkUrl(url)
        expect(result).toBe(expectedResult)
      },
    )

    it('should throw if `url` arg is not a valid URL', async () => {
      const atbClient = new AdTrackerBlockerClient(testProps)

      await expect(atbClient.checkUrl('buybuybuy.com')).rejects.toThrow(
        '`url` is not a valid URL',
      )
    })

    it('should throw if `url` arg is not a valid scheme', async () => {
      const atbClient = new AdTrackerBlockerClient(testProps)

      await expect(atbClient.checkUrl('ftp://buybuybuy.com')).rejects.toThrow(
        '`url` must be of a valid scheme',
      )
    })
  })

  it('should get rulesets', async () => {
    const atbClient = new AdTrackerBlockerClient(testProps)

    const result = await atbClient.listRulesets()

    expect(result).toEqual([
      {
        type: RulesetType.AdBlocking,
        updatedAt: new Date('2020-01-01T00:00:00.000Z'),
      },
      {
        type: RulesetType.Privacy,
        updatedAt: new Date('2020-01-02T00:00:00.000Z'),
      },
      {
        type: RulesetType.Social,
        updatedAt: new Date('2020-01-03T00:00:00.000Z'),
      },
    ])
  })

  it('should update rulesets', async () => {
    fetchSpy.mockResolvedValue({
      text: () => 'Data and stuff',
      headers: {
        get: () =>
          "Cache key that should be a date string but those don't play nice in tests...and stuff",
      },
    })
    const atbClient = new AdTrackerBlockerClient(testProps)

    await atbClient.updateRulesets()

    // TODO: CHeck that storage has cached values
    // Get rid of fetch spy
  })

  describe('addExceptions', () => {
    it.each`
      type      | source            | testUrl                    | sourceUrl                      | expectedResult
      ${'host'} | ${'anonyome.com'} | ${'https://buybuybuy.com'} | ${'https://anonyome.com'}      | ${'allowed'}
      ${'host'} | ${'anonyome.com'} | ${'https://buybuybuy.com'} | ${'https://anonyome.com/page'} | ${'allowed'}
      ${'host'} | ${'10.0.1.1'}     | ${'https://buybuybuy.com'} | ${'https://10.0.1.1'}          | ${'allowed'}
      ${'host'} | ${'10.0.1.1'}     | ${'https://buybuybuy.com'} | ${'https://10.0.1.1/page'}     | ${'allowed'}
    `(
      'should add a "Host" (domain) exception',
      async ({ type, source, testUrl, sourceUrl, expectedResult }) => {
        const atbClient = new AdTrackerBlockerClient(testProps)

        await atbClient.addExceptions([{ type, source }])

        expect(await atbClient.checkUrl(testUrl, sourceUrl)).toBe(
          expectedResult,
        )
      },
    )

    it.each`
      type      | source             | testUrl                    | sourceUrl                      | expectedResult
      ${'page'} | ${'anonyome.com/'} | ${'https://buybuybuy.com'} | ${'https://anonyome.com'}      | ${'blocked'}
      ${'page'} | ${'anonyome.com/'} | ${'https://buybuybuy.com'} | ${'https://anonyome.com/'}     | ${'allowed'}
      ${'page'} | ${'anonyome.com/'} | ${'https://buybuybuy.com'} | ${'https://anonyome.com/page'} | ${'blocked'}
      ${'page'} | ${'10.0.1.1/'}     | ${'https://buybuybuy.com'} | ${'https://10.0.1.1'}          | ${'blocked'}
      ${'page'} | ${'10.0.1.1/'}     | ${'https://buybuybuy.com'} | ${'https://10.0.1.1/'}         | ${'allowed'}
      ${'page'} | ${'10.0.1.1/'}     | ${'https://buybuybuy.com'} | ${'https://10.0.1.1/page'}     | ${'blocked'}
    `(
      'should add a Page exception',
      async ({ type, source, testUrl, sourceUrl, expectedResult }) => {
        const atbClient = new AdTrackerBlockerClient(testProps)

        await atbClient.addExceptions([{ type, source }])

        expect(await atbClient.checkUrl(testUrl, sourceUrl)).toBe(
          expectedResult,
        )
      },
    )

    it('should add exceptions to stored exceptions', async () => {
      const storageProvider = new MemoryStorageProvider()
      await storageProvider.setItem(
        'exceptions',
        JSON.stringify(['federation.com']),
      )

      const atbClient = new AdTrackerBlockerClient({
        ...testProps,
        storageProvider,
      })

      await atbClient.addExceptions([
        {
          type: 'host',
          source: 'anonyome.com',
        },
      ])

      const exceptions = await atbClient.getExceptions()
      const storedExceptions = await storageProvider
        .getItem('exceptions')
        .then((ex) => JSON.parse(ex))
      expect(exceptions).toEqual(normalizeExceptionSources(storedExceptions))

      expect(
        await atbClient.checkUrl(
          'http://www.buybuybuy.com',
          'http://anonyome.com',
        ),
      ).toBe('allowed')
    })
  })

  describe('getExceptions', () => {
    it('should return an empty array when no exceptions have been set', async () => {
      const atbClient = new AdTrackerBlockerClient(testProps)
      expect(await atbClient.getExceptions()).toEqual([])
    })

    it('should return the current list of exceptions', async () => {
      const storageProvider = new MemoryStorageProvider()
      await storageProvider.setItem(
        'exceptions',
        JSON.stringify(['exception1.com', 'exception2.com']),
      )
      const atbClient = new AdTrackerBlockerClient({
        ...testProps,
        storageProvider,
      })

      expect(await atbClient.getExceptions()).toEqual([
        { type: 'host', source: 'exception1.com' },
        { type: 'host', source: 'exception2.com' },
      ])
      expect(
        await atbClient.checkUrl(
          'http://buybuybuy.com',
          'http://exception1.com',
        ),
      ).toBe('allowed')
    })
  })

  describe('removeExceptions', () => {
    it('should remove a url from the exception list', async () => {
      const storageProvider = new MemoryStorageProvider()
      await storageProvider.setItem(
        'exceptions',
        JSON.stringify(['exception1.com', 'exception2.com', 'anonyome.com']),
      )
      const atbClient = new AdTrackerBlockerClient({
        ...testProps,
        storageProvider,
      })

      await atbClient.removeExceptions([
        { type: 'host', source: 'anonyome.com' },
      ])

      expect(await atbClient.getExceptions()).toEqual([
        { type: 'host', source: 'exception1.com' },
        { type: 'host', source: 'exception2.com' },
      ])
      expect(
        await atbClient.checkUrl(
          'http://www.buybuybuy.com',
          'http://anonyome.com',
        ),
      ).toBe('blocked')
    })

    it('should do nothing if exception does not exist', async () => {
      const storageProvider = new MemoryStorageProvider()
      await storageProvider.setItem(
        'exceptions',
        JSON.stringify(['exception1.com', 'exception2.com', 'exception3.com']),
      )
      const atbClient = new AdTrackerBlockerClient({
        ...testProps,
        storageProvider,
      })

      await atbClient.removeExceptions([
        { type: 'host', source: 'romulan.scum' },
      ])

      expect(await atbClient.getExceptions()).toEqual([
        { type: 'host', source: 'exception1.com' },
        { type: 'host', source: 'exception2.com' },
        { type: 'host', source: 'exception3.com' },
      ])
    })

    it('should remove exceptions with html entities', async () => {
      const atbClient = new AdTrackerBlockerClient(testProps)

      await atbClient.addExceptions([{ source: '%', type: 'host' }])

      await expect(atbClient.getExceptions()).resolves.toEqual([
        {
          source: '%',
          type: 'host',
        },
      ])

      await atbClient.removeExceptions([
        {
          source: '%',
          type: 'host',
        },
      ])

      await expect(atbClient.getExceptions()).resolves.toEqual([])
    })
  })

  describe('removeAllExceptions()', () => {
    it('should remove all exceptions', async () => {
      const storageProvider = new MemoryStorageProvider()
      await storageProvider.setItem(
        'exceptions',
        JSON.stringify(['exception1.com', 'exception2.com', 'exception3.com']),
      )
      const atbClient = new AdTrackerBlockerClient({
        ...testProps,
        storageProvider,
      })

      await atbClient.removeAllExceptions()
      expect(await atbClient.getExceptions()).toEqual([])
    })
  })

  describe('setActiveRulesets()', () => {
    it('should set active lists in storage provider and set status to updating', async () => {
      const storageProvider = new MemoryStorageProvider()
      const atbClient = new AdTrackerBlockerClient({
        ...testProps,
        storageProvider,
      })

      // An action to get into ready state
      await atbClient.checkUrl('http://stuff')
      expect(atbClient.status).toBe('ready')

      // Action that updates filter engine
      await atbClient.setActiveRulesets([RulesetType.AdBlocking])
      expect(atbClient.status).toBe('preparing')

      const activeLists = await storageProvider.getItem('activeRulesets')

      expect(JSON.parse(activeLists)).toEqual([RulesetType.AdBlocking])
    })
  })

  describe('getActiveRulesets', () => {
    it('should get a list of active lists statuses', async () => {
      const storageProvider = new MemoryStorageProvider()
      await storageProvider.setItem(
        'activeRulesets',
        JSON.stringify(['privacy', 'social']),
      )
      const atbClient = new AdTrackerBlockerClient({
        ...testProps,
        storageProvider,
      })

      const result = await atbClient.getActiveRulesets()
      expect(result).toEqual([RulesetType.Privacy, RulesetType.Social])
    })
  })

  describe('reset()', () => {
    it('should reset exceptions to empty array and rule sets back to default', async () => {
      const atbClient = new AdTrackerBlockerClient(testProps)

      // Update user settings
      await atbClient.setActiveRulesets([RulesetType.AdBlocking])
      await atbClient.addExceptions([
        { type: 'host', source: 'www.federation.com' },
      ])

      // Verify updated user settings
      await expect(atbClient.getActiveRulesets()).resolves.toEqual([
        RulesetType.AdBlocking,
      ])
      await expect(atbClient.getExceptions()).resolves.toEqual([
        { type: 'host', source: 'www.federation.com' },
      ])

      // Act
      await atbClient.reset()

      // Verify reset user settings
      await expect(atbClient.getActiveRulesets()).resolves.toEqual([
        RulesetType.AdBlocking,
        RulesetType.Privacy,
        RulesetType.Social,
      ])
      await expect(atbClient.getExceptions()).resolves.toEqual([])
    })
  })
})

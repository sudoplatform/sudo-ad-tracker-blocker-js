import fs from 'fs'
import path from 'path'

import { nullLogger } from '../tests/unit/null-logger'
import {
  FilterEngineNotAvailableError,
  RulesetDataNotPresentError,
} from './errors'
import { RulesetFormat } from './ruleset-provider'
import { MockRuleSetProvider } from './ruleset-providers/mock-ruleset-provider'
import { RulesetType } from './ruleset-type'
import { MemoryStorageProvider } from './storage-providers/memory-storage-provider'
import {
  Status,
  SudoAdTrackerBlockerClient,
  SudoAdTrackerBlockerClientProps,
} from './sudo-ad-tracker-blocker-client'
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

const testProps: SudoAdTrackerBlockerClientProps = {
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

describe('SudoAdTrackerBlockerClient', () => {
  describe('construction', () => {
    it('should start with initializing status', async () => {
      const atbClient = new SudoAdTrackerBlockerClient(testProps)

      expect(atbClient.status).toBe(Status.NeedsUpdate)
    })

    it('should throw if client needs update', async () => {
      const atbClient = new SudoAdTrackerBlockerClient(testProps)

      expect(() => atbClient.checkUrl('http://something.com')).toThrow()
    })

    it('should go to ready after initializing status', async () => {
      const atbClient = new SudoAdTrackerBlockerClient(testProps)

      await atbClient.update()
      atbClient.checkUrl('http://something.com')

      expect(atbClient.status).toBe(Status.Ready)
    })

    it('should signal ready state via callback', async () => {
      const onStatusChangedSpy = jest.fn()
      const atbClient = new SudoAdTrackerBlockerClient({
        ...testProps,
        onStatusChanged: onStatusChangedSpy,
      })

      expect(atbClient.status).toBe(Status.NeedsUpdate)
      await atbClient.update()
      expect(onStatusChangedSpy).toBeCalled()
      expect(atbClient.status).toBe(Status.Ready)
    })

    it('should prevent construction with both format and ruleset provider props set', async () => {
      expect(() => {
        new SudoAdTrackerBlockerClient({
          ...testProps,
          format: RulesetFormat.Apple,
        })
      }).toThrow(
        'You cannot specific both `rulesetProvider` and `format` in constuctor props.',
      )
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
        const atbClient = new SudoAdTrackerBlockerClient(testProps)

        await atbClient.update()
        const result = atbClient.checkUrl(url)
        expect(result).toBe(expectedResult)
      },
    )

    it('should throw if `url` arg is not a valid URL', async () => {
      const atbClient = new SudoAdTrackerBlockerClient(testProps)

      await atbClient.update()
      expect(() => atbClient.checkUrl('buybuybuy.com')).toThrow(
        '`url` is not a valid URL',
      )
    })

    it('should throw if `url` arg is not a valid scheme', async () => {
      const atbClient = new SudoAdTrackerBlockerClient(testProps)

      await atbClient.update()
      expect(() => atbClient.checkUrl('ftp://buybuybuy.com')).toThrow(
        '`url` must be of a valid scheme',
      )
    })

    it('should disable filter engine for non adblock-plus lists', async () => {
      const atbClient = new SudoAdTrackerBlockerClient({
        ...testProps,
        rulesetProvider: new MockRuleSetProvider({
          format: RulesetFormat.Apple,
        }),
      })

      expect(() => atbClient.checkUrl('https://whatever.com')).toThrow(
        FilterEngineNotAvailableError,
      )
    })

    it('should throw if status is needs update', async () => {
      const atbClient = new SudoAdTrackerBlockerClient(testProps)

      expect(() => atbClient.checkUrl('https://whatever.com')).toThrow(
        FilterEngineNotAvailableError,
      )
    })
  })

  it('should throw if needs update for listRulesets', async () => {
    const atbClient = new SudoAdTrackerBlockerClient(testProps)

    await expect(atbClient.listRulesets()).rejects.toThrow(
      RulesetDataNotPresentError,
    )
  })

  it('should throw if no cached ruleset meta data for listRulesets', async () => {
    const atbClient = new SudoAdTrackerBlockerClient({
      ...testProps,
      storageProvider: {
        getItem: jest.fn().mockResolvedValue(undefined),
      } as any,
    })

    await atbClient.update()
    await expect(atbClient.listRulesets()).rejects.toThrow(
      RulesetDataNotPresentError,
    )
  })

  it('should throw if no cached rulesets for listRulesets', async () => {
    const atbClient = new SudoAdTrackerBlockerClient({
      ...testProps,
      rulesetProvider: new MockRuleSetProvider({
        format: RulesetFormat.Apple,
      }),
      storageProvider: {
        getItem: jest
          .fn()
          // stored ruleset meta data
          .mockResolvedValueOnce(
            JSON.stringify([
              {
                updatedAt: '2020-01-01T00:00:00.000Z',
                type: 'droid',
              },
            ]),
          )
          // stored ruleset content
          .mockResolvedValueOnce(undefined),
      } as any,
    })

    await atbClient.update()
    await expect(atbClient.listRulesets()).rejects.toThrow(
      RulesetDataNotPresentError,
    )
  })

  it('should get AdBlockPlus rulesets', async () => {
    const atbClient = new SudoAdTrackerBlockerClient(testProps)

    await atbClient.update()
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

  it('should get Apple rulesets', async () => {
    const atbClient = new SudoAdTrackerBlockerClient({
      ...testProps,
      rulesetProvider: new MockRuleSetProvider({
        format: RulesetFormat.Apple,
      }),
    })

    await atbClient.update()
    const rulesets = await atbClient.listRulesets()
    expect(rulesets).toEqual([
      {
        type: 'ad-blocking',
        updatedAt: new Date('2020-02-01T00:00:00.000Z'),
        content: 'apple1',
      },
      {
        type: 'privacy',
        updatedAt: new Date('2020-02-02T00:00:00.000Z'),
        content: 'apple2',
      },
      {
        type: 'social',
        updatedAt: new Date('2020-02-03T00:00:00.000Z'),
        content: 'apple3',
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
    const atbClient = new SudoAdTrackerBlockerClient(testProps)

    await atbClient.update()

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
        const atbClient = new SudoAdTrackerBlockerClient(testProps)

        await atbClient.addExceptions([{ type, source }])
        await atbClient.update()

        expect(atbClient.checkUrl(testUrl, sourceUrl)).toBe(expectedResult)
      },
    )

    it.each`
      type      | source             | testUrl                    | sourceUrl                      | expectedResult
      ${'page'} | ${'anonyome.com'}  | ${'https://buybuybuy.com'} | ${'https://anonyome.com/'}     | ${'allowed'}
      ${'page'} | ${'anonyome.com/'} | ${'https://buybuybuy.com'} | ${'https://anonyome.com/'}     | ${'allowed'}
      ${'page'} | ${'anonyome.com/'} | ${'https://buybuybuy.com'} | ${'https://anonyome.com/page'} | ${'blocked'}
      ${'page'} | ${'10.0.1.1'}      | ${'https://buybuybuy.com'} | ${'https://10.0.1.1/'}         | ${'allowed'}
      ${'page'} | ${'10.0.1.1/'}     | ${'https://buybuybuy.com'} | ${'https://10.0.1.1/'}         | ${'allowed'}
      ${'page'} | ${'10.0.1.1/'}     | ${'https://buybuybuy.com'} | ${'https://10.0.1.1/page'}     | ${'blocked'}
    `(
      'should add a Page exception',
      async ({ type, source, testUrl, sourceUrl, expectedResult }) => {
        const atbClient = new SudoAdTrackerBlockerClient(testProps)

        await atbClient.addExceptions([{ type, source }])
        await atbClient.update()

        expect(atbClient.checkUrl(testUrl, sourceUrl)).toBe(expectedResult)
      },
    )

    it('should add exceptions to stored exceptions', async () => {
      const storageProvider = new MemoryStorageProvider()
      await storageProvider.setItem(
        'exceptions',
        JSON.stringify([{ type: 'host', source: 'federation.com' }]),
      )

      const atbClient = new SudoAdTrackerBlockerClient({
        ...testProps,
        storageProvider,
      })

      await atbClient.addExceptions([
        {
          type: 'host',
          source: 'anonyome.com',
        },
        {
          type: 'page',
          source: 'anonyome.com',
        },
      ])

      const exceptions = await atbClient.getExceptions()
      const storedExceptions = await storageProvider
        .getItem('exceptions')
        .then((ex) => JSON.parse(ex))
      expect(exceptions).toEqual(storedExceptions)

      await atbClient.update()
      expect(
        atbClient.checkUrl('http://www.buybuybuy.com', 'http://anonyome.com'),
      ).toBe('allowed')
    })

    it.each`
      type      | source                         | expectedType | expectedSource
      ${'page'} | ${'example.com'}               | ${'page'}    | ${'example.com/'}
      ${'page'} | ${'example.com/'}              | ${'page'}    | ${'example.com/'}
      ${'page'} | ${'example.com/page'}          | ${'page'}    | ${'example.com/page'}
      ${'page'} | ${'example.com/page/'}         | ${'page'}    | ${'example.com/page/'}
      ${'page'} | ${'https://example.com/page'}  | ${'page'}    | ${'example.com/page'}
      ${'page'} | ${'https://example.com/page/'} | ${'page'}    | ${'example.com/page/'}
    `(
      'should noramlize urls when storing exceptions',
      async ({ type, source, expectedType, expectedSource }) => {
        const storageProvider = new MemoryStorageProvider()
        const atbClient = new SudoAdTrackerBlockerClient({
          ...testProps,
          storageProvider,
        })

        await atbClient.addExceptions([{ type, source }])

        const storedExceptions = await storageProvider
          .getItem('exceptions')
          .then(JSON.parse)
        expect(await storedExceptions).toEqual([
          { type: expectedType, source: expectedSource },
        ])
      },
    )

    it.each`
      source
      ${'https://www.@#$%^#$.com'}
      ${'https://@#$%^#$.com'}
      ${'@#$%^#$.com'}
    `('should throw when bogus domain', async ({ source }) => {
      const atbClient = new SudoAdTrackerBlockerClient(testProps)

      const promise = atbClient.addExceptions([{ type: 'host', source }])

      await expect(promise).rejects.toThrow(
        `Could not determine host for exception: ${source}`,
      )
    })
  })

  describe('getExceptions', () => {
    it('should return an empty array when no exceptions have been set', async () => {
      const atbClient = new SudoAdTrackerBlockerClient(testProps)
      expect(await atbClient.getExceptions()).toEqual([])
    })

    it('should return the current list of exceptions', async () => {
      const storageProvider = new MemoryStorageProvider()
      const storedExceptions = [
        { type: 'host', source: 'exception1.com' },
        { type: 'host', source: 'exception2.com' },
      ]
      await storageProvider.setItem(
        'exceptions',
        JSON.stringify(storedExceptions),
      )
      const atbClient = new SudoAdTrackerBlockerClient({
        ...testProps,
        storageProvider,
      })
      await atbClient.update()

      expect(await atbClient.getExceptions()).toEqual(storedExceptions)
      expect(
        atbClient.checkUrl('http://buybuybuy.com', 'http://exception1.com'),
      ).toBe('allowed')
    })
  })

  describe('removeExceptions', () => {
    it('should remove a url from the exception list', async () => {
      const storageProvider = new MemoryStorageProvider()
      const storedExceptions = [
        { type: 'host', source: 'exception1.com' },
        { type: 'host', source: 'exception2.com' },
        { type: 'host', source: 'anonyome.com' },
      ]
      await storageProvider.setItem(
        'exceptions',
        JSON.stringify(storedExceptions),
      )
      const atbClient = new SudoAdTrackerBlockerClient({
        ...testProps,
        storageProvider,
      })

      await atbClient.removeExceptions([
        { type: 'host', source: 'anonyome.com' },
      ])
      await atbClient.update()

      expect(await atbClient.getExceptions()).toEqual([
        { type: 'host', source: 'exception1.com' },
        { type: 'host', source: 'exception2.com' },
      ])
      expect(
        atbClient.checkUrl('http://www.buybuybuy.com', 'http://anonyome.com'),
      ).toBe('blocked')
    })

    it('should do nothing if exception does not exist', async () => {
      const storageProvider = new MemoryStorageProvider()
      const storedExceptions = [
        { type: 'host', source: 'exception1.com' },
        { type: 'host', source: 'exception2.com' },
        { type: 'host', source: 'exception3.com' },
      ]
      await storageProvider.setItem(
        'exceptions',
        JSON.stringify(storedExceptions),
      )
      const atbClient = new SudoAdTrackerBlockerClient({
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
      const atbClient = new SudoAdTrackerBlockerClient(testProps)

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
      const atbClient = new SudoAdTrackerBlockerClient({
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
      const atbClient = new SudoAdTrackerBlockerClient({
        ...testProps,
        storageProvider,
      })

      await atbClient.update()
      expect(atbClient.status).toBe(Status.Ready)

      // Action that updates filter engine
      await atbClient.setActiveRulesets([RulesetType.AdBlocking])

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
      const atbClient = new SudoAdTrackerBlockerClient({
        ...testProps,
        storageProvider,
      })

      const result = await atbClient.getActiveRulesets()
      expect(result).toEqual([RulesetType.Privacy, RulesetType.Social])
    })
  })

  describe('reset()', () => {
    it('should reset exceptions to empty array and rule sets back to default', async () => {
      const atbClient = new SudoAdTrackerBlockerClient(testProps)

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

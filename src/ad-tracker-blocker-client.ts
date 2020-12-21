import {
  DefaultConfigurationManager,
  DefaultLogger,
  Logger,
} from '@sudoplatform/sudo-common'
import { SudoUserClient } from '@sudoplatform/sudo-user'
import { isEqual, pullAllWith, uniqWith } from 'lodash'

import { FilterEngine } from '../wasm/filter_engine'
import { Config } from './config'
import { FilterException } from './filter-exceptions'
import {
  findExceptionMatch,
  normalizeExceptionSources,
  normalizeExceptions,
} from './filter-exceptions'
import { RulesetProvider } from './ruleset-provider'
import { DefaultRulesetProvider } from './ruleset-providers/default-ruleset-provider'
import { RulesetType } from './ruleset-type'
import { StorageProvider } from './storage-provider'
import { MemoryStorageProvider } from './storage-providers/memory-storage-provider'

const defaultActiveRulesets: RulesetType[] = [
  RulesetType.AdBlocking,
  RulesetType.Privacy,
  RulesetType.Social,
]

const exceptionsStorageKey = 'exceptions'
const activeRulesetsKey = 'activeRulesets'
const validCheckUrlSchemes = ['https:', 'http:', 'ws:']

/**
 * A Ruleset that can be activated for ad/tracker
 * blocking in the filter engine.
 */
export type Ruleset = { type: RulesetType; updatedAt: Date }

/**
 * Filter Engine Status.
 */
export enum Status {
  /** Filter engine is (re)initializing and is not ready to process calls to `checkUrl()` */
  Preparing = 'preparing',

  /** Client is initialized and ready to process calls to `checkUrl()` */
  Ready = 'ready',

  /**  There was an error initializing the Client and cannot process calls to `checkUrl()` */
  Error = 'error',
}

/**
 * The result given when calling checkUrl
 */
export enum CheckUrlResult {
  /** The `url` is allowed to be fetched based on active rulesets & exceptions */
  Allowed = 'allowed',

  /** The `url` is not allowed to be fetched based on active rulesets & exceptions */
  Blocked = 'blocked',
}

/**
 * An item that is cached in a StorageProvider.
 */
interface CacheItem {
  cacheKey: string
  data: string
}

/**
 * AdTrackerBlockerClient constructor props
 */
export interface AdTrackerBlockerClientProps {
  /**
   * Sudo User Client instance, required for authenticated access to SudoPlatform.
   */
  sudoUserClient: SudoUserClient

  /**
   * SDK Config. If not provided, then DefaultConfigurationManager will be used.
   */
  config?: Config

  /**
   * Custom logging implementation. If not provided then default loging will be used.
   */
  logger?: Logger

  /**
   * A StorageProvider implementation. MemoryStorageProvider
   * will be used by default.
   */
  storageProvider?: StorageProvider

  /**
   * Overrides the default RulesetProvider
   */
  rulesetProvider?: RulesetProvider

  /**
   * A call back which provides the new status of the filter engine.
   * @param newStatus New Status of the filter engine
   */
  onStatusChanged?: () => void
}

/**
 * TODO: Class comments
 */
export class AdTrackerBlockerClient {
  private _status: Status = Status.Preparing
  private config: Config
  private storageProvider: StorageProvider
  private rulesetProvider: RulesetProvider
  private engine!: Promise<FilterEngine>
  private exceptions: FilterException[] = []
  private logger: Logger

  constructor(private props: AdTrackerBlockerClientProps) {
    this.logger = props.logger ?? new DefaultLogger()

    this.config =
      props?.config ??
      DefaultConfigurationManager.getInstance().bindConfigSet<Config>(Config)

    this.storageProvider = props?.storageProvider ?? new MemoryStorageProvider()

    this.rulesetProvider =
      props?.rulesetProvider ??
      new DefaultRulesetProvider({
        userClient: props.sudoUserClient,
        poolId: this.config.identityService.poolId,
        identityPoolId: this.config.identityService.identityPoolId,
        bucket: this.config.identityService.staticDataBucket,
      })

    this.prepareFilterEngine()
  }

  /**
   * Filter engine status
   */
  public get status(): Status {
    return this._status
  }

  /**
   * Gets all available rulesets and their active status
   */
  public async listRulesets(): Promise<Ruleset[]> {
    const rulesets = await this.rulesetProvider.listRulesets()

    return rulesets.map((ruleset) => ({
      type: ruleset.type,
      updatedAt: ruleset.updatedAt,
    }))
  }

  /**
   * Gets all currently active rulesets
   */
  public async getActiveRulesets(): Promise<RulesetType[]> {
    const activeRulesetsJson = await this.storageProvider.getItem(
      activeRulesetsKey,
    )

    return activeRulesetsJson
      ? JSON.parse(activeRulesetsJson)
      : defaultActiveRulesets
  }

  /**
   * Sets which ruleset types are active
   */
  public async setActiveRulesets(rulesetTypes: RulesetType[]): Promise<void> {
    await this.storageProvider.setItem(
      activeRulesetsKey,
      JSON.stringify(rulesetTypes),
    )

    this.prepareFilterEngine()
  }

  /**
   * Resets the client back to default exceptions and rulesets
   */
  public async reset(): Promise<void> {
    await Promise.all([
      this.storageProvider.clearItem(exceptionsStorageKey),
      this.storageProvider.clearItem(activeRulesetsKey),
    ])

    this.prepareFilterEngine()
  }

  /**
   * Returns true if url and currentUrl match; false if not.
   * @param url URL to test against current URL
   * @param currentUrl Current URL
   * @param resourceType
   */
  public async checkUrl(
    url: string,
    sourceUrl = '',
    resourceType = '',
  ): Promise<CheckUrlResult> {
    const engine = await this.engine

    let parsedUrl
    try {
      parsedUrl = new URL(url)
    } catch {
      throw new Error('`url` is not a valid URL')
    }

    if (!validCheckUrlSchemes.includes(parsedUrl.protocol)) {
      throw new Error(
        `\`url\` must be of a valid scheme type: ${validCheckUrlSchemes.join(
          ',',
        )}`,
      )
    }

    if (sourceUrl) {
      const matchResult = findExceptionMatch(this.exceptions, sourceUrl)
      if (matchResult === 'match') {
        return CheckUrlResult.Allowed
      }
    }

    const isBlocked = engine.checkNetworkUrlsMatched(
      url,
      sourceUrl,
      resourceType,
    )

    return isBlocked ? CheckUrlResult.Blocked : CheckUrlResult.Allowed
  }

  /**
   * Re-fetches all rulesets to ensure they are up-to-date.
   */
  public async updateRulesets(): Promise<void> {
    const rulesets = await this.rulesetProvider.listRulesets()

    await Promise.all(
      rulesets.map(async (rs) =>
        this.rulesetProvider.downloadRuleset(rs.location),
      ),
    )
  }

  /**
   * Retrieves current exceptions
   */
  public async getExceptions(): Promise<FilterException[]> {
    const sourcesJson = await this.storageProvider.getItem(exceptionsStorageKey)
    const sources = sourcesJson ? JSON.parse(sourcesJson) : []

    this.exceptions = normalizeExceptionSources(sources)

    return this.exceptions
  }

  /**
   * Adds items from the exception list
   * @param urls An array of URLs or domains
   */
  public async addExceptions(exceptions: FilterException[]): Promise<void> {
    const currentExceptions = await this.getExceptions()
    const newExceptions = normalizeExceptions(exceptions)

    // Combine the new exceptions with current exceptions, discard any duplicates
    const combinedException = uniqWith(
      [...currentExceptions, ...newExceptions],
      isEqual,
    )

    // Store just the exception sources
    await this.storageProvider.setItem(
      exceptionsStorageKey,
      JSON.stringify(combinedException.map(({ source }) => source)),
    )

    this.exceptions = combinedException
  }

  /**
   * Removes items from the exception list
   */
  public async removeExceptions(exceptions: FilterException[]): Promise<void> {
    const currentExceptions = await this.getExceptions()
    const exceptionsToRemove = normalizeExceptions(exceptions)

    // Remove any matches from current exception list
    const updatedExceptions = pullAllWith(
      currentExceptions,
      exceptionsToRemove,
      isEqual,
    )

    // Store just the exception sources
    await this.storageProvider.setItem(
      exceptionsStorageKey,
      JSON.stringify(updatedExceptions.map(({ source }) => source)),
    )

    this.exceptions = updatedExceptions
  }

  /**
   * Removes all filter exceptions from the exception list
   */
  public async removeAllExceptions(): Promise<void> {
    await this.storageProvider.clearItem(exceptionsStorageKey)
    this.exceptions = []
  }

  private updateStatus(status: Status): void {
    if (this._status !== status) {
      this._status = status
      this.props.onStatusChanged?.()
    }
  }

  private prepareFilterEngine(): void {
    this.logger.info('Preparing filter engine.')
    this.updateStatus(Status.Preparing)

    const newEngine = new Promise<FilterEngine>(async (resolve, reject) => {
      try {
        await this.getExceptions()

        const rulesetsMeta = await this.rulesetProvider.listRulesets()
        const activeRulesets = await this.getActiveRulesets()
        const activeRulesetsData = await Promise.all(
          rulesetsMeta
            .filter((ruleset) => activeRulesets.includes(ruleset.type))
            .map((rulesetMeta) =>
              this.downloadRulesetData(rulesetMeta.location),
            ),
        )
        const filterEngine = new FilterEngine(activeRulesetsData.join('\n'))

        if (this.engine === newEngine) {
          this.logger.info('Filter engine is ready.')
          this.updateStatus(Status.Ready)
        }

        resolve(filterEngine)
      } catch (error) {
        if (this.engine === newEngine) {
          this.logger.error('Error initializing filter engine.', error)
          this.updateStatus(Status.Error)
        }
        reject(error)
      }
    })

    this.engine = newEngine
  }

  private async downloadRulesetData(id: string): Promise<string> {
    this.logger.info(`Syncing ruleset: ${id}`)
    const cacheItem = await this.getCacheItem(id)
    const ruleSet = await this.rulesetProvider.downloadRuleset(
      id,
      cacheItem?.cacheKey,
    )

    if (ruleSet === 'not-modified') {
      this.logger.info(`Ruleset ${id} is available in cache.`)
      if (!cacheItem) {
        throw new Error('Unexpected: no cache item')
      }

      return cacheItem.data
    } else {
      this.logger.info(`Ruleset ${id} was downloaded.`)
    }

    const cacheKey = ruleSet.cacheKey
    if (cacheKey) {
      this.setCacheItem(id, cacheKey, ruleSet.data)
    }

    return ruleSet.data
  }

  private async setCacheItem(
    id: string,
    cacheKey: string,
    data: string,
  ): Promise<void> {
    await this.storageProvider.setItem(
      id,
      JSON.stringify({
        data,
        cacheKey,
      }),
    )
  }

  private async getCacheItem(id: string): Promise<CacheItem | undefined> {
    const item = await this.storageProvider.getItem(id)

    return item && JSON.parse(item)
  }
}

import {
  DefaultConfigurationManager,
  DefaultLogger,
  Logger,
} from '@sudoplatform/sudo-common'
import { SudoUserClient } from '@sudoplatform/sudo-user'
import { isEqual, pullAllWith, uniqWith } from 'lodash'

import { FilterEngine } from '../wasm/filter_engine'
import { Config, IotsConfig } from './config'
import {
  FilterEngineNotAvailableError,
  RulesetDataNotPresentError,
} from './errors'
import { FilterException } from './filter-exceptions'
import { findExceptionMatch, normalizeExceptions } from './filter-exceptions'
import {
  RulesetFormat,
  RulesetMetaData,
  RulesetProvider,
} from './ruleset-provider'
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
const rulesetsMetaDataKey = 'rulesets'

/**
 * Resource URL schemes that can be blocked
 */
export const validCheckUrlSchemes = ['https:', 'http:', 'ws:', 'wss:']

/**
 * A ruleset that can be activated for ad/tracker
 * blocking in the filter engine.
 */
export interface Ruleset {
  type: RulesetType
  updatedAt: Date
  /** Not available for ABP lists. */
  content?: string
}

/**
 * Status of filtering engine {@link SudoAdTrackerBlockerClient}.
 * @see {@link SudoAdTrackerBlockerClient.status}.
 */
export enum Status {
  /** Client is (re)initializing and is not ready to process calls to `checkUrl()`. */
  NeedsUpdate = 'needs-update',

  /** Client is initialized and ready to process calls to `checkUrl()`. */
  Ready = 'ready',

  /**  There was an error initializing the Client and cannot process calls to `checkUrl()`. */
  Error = 'error',
}

/**
 * The result given when calling {@link SudoAdTrackerBlockerClient.checkUrl}.
 */
export enum CheckUrlResult {
  /** The `url` is allowed to be fetched based on active rulesets & exceptions. */
  Allowed = 'allowed',

  /** The `url` is not allowed to be fetched based on active rulesets & exceptions. */
  Blocked = 'blocked',
}

/**
 * An item that is cached in a StorageProvider.
 */
interface CachedRuleset {
  cacheKey: string
  data: string
}

/**
 * {@link SudoAdTrackerBlockerClient} constructor props.
 */
export interface SudoAdTrackerBlockerClientProps {
  /**
   * `SudoUserClient` instance.
   * This is required for authenticated access to the Sudo Platform.
   * @see https://docs.sudoplatform.com/guides/users/integrate-the-user-sdk#integrate-the-js-sdk
   */
  sudoUserClient: SudoUserClient

  /**
   * Sudo Platform SDK Config.
   * If not provided, then DefaultConfigurationManager will be used.
   * @see https://docs.sudoplatform.com/guides/getting-started#step-2-download-the-sdk-configuration-file
   * @see https://docs.sudoplatform.com/guides/users/integrate-the-user-sdk#sdk-configuration
   */
  config?: Config

  /**
   * Custom logging implementation.
   * If not provided then default logging will be used.
   */
  logger?: Logger

  /**
   * A {@link StorageProvider} implementation.
   * An in-memory implementation is used by default.
   */
  storageProvider?: StorageProvider

  /**
   * @internal
   * Overrides the default ruleset provider.
   * This is used for testing purposes.
   */
  rulesetProvider?: RulesetProvider

  /**
   * Type of lists to use
   */
  format?: RulesetFormat

  /**
   * Callback invoked whenever the filtering
   * status ({@link SudoAdTrackerBlockerClient.status}) changes.
   */
  onStatusChanged?: () => void
}

/**
 * This is the main class used for Ad/Tracker blocking.
 * Each instance of `SudoAdTrackerBlockerClient` will contain a filtering engine
 * that can be configured to use a set of blocking rulesets.
 * To query the filtering engine, you can call (@link SudoAdTrackerBlockerClient.checkUrl}.
 */
export class SudoAdTrackerBlockerClient {
  private _status: Status = Status.NeedsUpdate
  private config: Config
  private storageProvider: StorageProvider
  private rulesetProvider: RulesetProvider
  private engine: FilterEngine | undefined
  private exceptions: FilterException[] = []
  private logger: Logger

  constructor(private props: SudoAdTrackerBlockerClientProps) {
    this.logger = props.logger ?? new DefaultLogger()

    this.config =
      props?.config ??
      DefaultConfigurationManager.getInstance().bindConfigSet<IotsConfig>(
        IotsConfig,
      )

    if (props.rulesetProvider && props.format) {
      throw new Error(
        'You cannot specific both `rulesetProvider` and `format` in constuctor props.',
      )
    }

    this.storageProvider = props?.storageProvider ?? new MemoryStorageProvider()

    this.rulesetProvider =
      props?.rulesetProvider ??
      new DefaultRulesetProvider({
        userClient: props.sudoUserClient,
        poolId: this.config.identityService.poolId,
        identityPoolId: this.config.identityService.identityPoolId,
        bucket: this.config.identityService.staticDataBucket,
        format: props.format ?? RulesetFormat.AdBlockPlus,
      })
  }

  /**
   * Update rulesets based on any server-side changes.
   */
  public async update(): Promise<void> {
    try {
      // Update cached rulesets metadata.
      //  -- this is always going to do a network request
      const rulesetsMetaData = await this.rulesetProvider.listRulesets()
      await this.setCachedRulesetsMetaData(rulesetsMetaData)

      // Get rulesets data
      //  -- this.downloadRulesData handles caching of data
      const rulesetsData = await Promise.all(
        rulesetsMetaData.map(async (rulesetMetaData) => ({
          ...rulesetMetaData,
          data: await this.downloadRulesetData(rulesetMetaData.location),
        })),
      )

      // Only update filter engine when using AdBlockPlus rules
      if (this.rulesetProvider.format === RulesetFormat.AdBlockPlus) {
        await this.getExceptions() // Ensures exceptions are updated on class state
        const activeRulesets = await this.getActiveRulesets()
        const activeRulesetsData = rulesetsData
          .filter((rulesetData) => activeRulesets.includes(rulesetData.type))
          .map((rulesetData) => rulesetData.data)
        this.engine = new FilterEngine(activeRulesetsData.join('\n'))
      }

      this.logger.info('Filter engine is ready.')
      this.updateStatus(Status.Ready)
    } catch (error) {
      this.logger.error('Error updating rulesets', error)
      this.updateStatus(Status.Error)
    }
  }

  /**
   * Resets the client by clearing cached data and user preferences.
   */
  public async reset(): Promise<void> {
    await Promise.all([
      this.storageProvider.clearItem(exceptionsStorageKey),
      this.storageProvider.clearItem(activeRulesetsKey),
    ])

    this.updateStatus(Status.NeedsUpdate)
  }

  /**
   * Filter engine status.
   */
  public get status(): Status {
    return this._status
  }

  /**
   * Gets all available rulesets with associated metadata.
   */
  public async listRulesets(): Promise<Ruleset[]> {
    if (this.status === Status.NeedsUpdate) {
      throw new RulesetDataNotPresentError()
    }

    // Gets the rulesets meta data from cache
    const rulesetsMetaData = await this.getCachedRulesetsMetaData()
    if (!rulesetsMetaData) {
      this.updateStatus(Status.NeedsUpdate)
      throw new RulesetDataNotPresentError()
    }

    // Determine if we need to return ruleset data in the resonse
    const includeContent =
      this.rulesetProvider.format !== RulesetFormat.AdBlockPlus

    // Map rulesets metadata to rulesets
    return Promise.all(
      rulesetsMetaData.map(async (rulesetMetaData) => {
        // Get base ruleset info
        const ruleset: Ruleset = {
          type: rulesetMetaData.type,
          updatedAt: rulesetMetaData.updatedAt,
        }

        // Include ruleset content, if needed
        if (includeContent) {
          const cachedRuleset = await this.getCachedRuleset(
            rulesetMetaData.location,
          )
          if (!cachedRuleset) {
            this.updateStatus(Status.NeedsUpdate)
            throw new RulesetDataNotPresentError()
          }
          ruleset.content = cachedRuleset.data
        }

        return ruleset
      }),
    )
  }

  /**
   * Gets all rulesets that are currently influencing the results
   * of {@link SudoAdTrackerBlockerClient.checkUrl}.
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
   * Sets which ruleset types are active in the filtering engine and
   * then performs the update operation.
   */
  public async setActiveRulesets(rulesetTypes: RulesetType[]): Promise<void> {
    await this.storageProvider.setItem(
      activeRulesetsKey,
      JSON.stringify(rulesetTypes),
    )

    await this.update()
  }

  /**
   * Returns true if `url` and `currentUrl` match; false if not.
   * @param url URL to test against current URL.
   * @param currentUrl Current URL.
   * @param resourceType
   */
  public checkUrl(
    url: string,
    sourceUrl = '',
    resourceType = '',
  ): CheckUrlResult {
    if (
      this.rulesetProvider.format !== RulesetFormat.AdBlockPlus ||
      !this.engine
    ) {
      throw new FilterEngineNotAvailableError()
    }

    if (this.status === Status.NeedsUpdate) {
      throw new RulesetDataNotPresentError()
    }

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

    const isBlocked = this.engine.checkNetworkUrlsMatched(
      url,
      sourceUrl,
      resourceType,
    )

    return isBlocked ? CheckUrlResult.Blocked : CheckUrlResult.Allowed
  }

  /**
   * Retrieves current filtering exceptions that are influencing
   * the behavior of {@link SudoAdTrackerBlockerClient.checkUrl}.
   */
  public async getExceptions(): Promise<FilterException[]> {
    const filterExceptionsJson = await this.storageProvider.getItem(
      exceptionsStorageKey,
    )
    const filterExceptions = filterExceptionsJson
      ? JSON.parse(filterExceptionsJson)
      : []

    this.exceptions = filterExceptions

    return this.exceptions
  }

  /**
   * Adds items to the exceptions list.
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
      JSON.stringify(combinedException),
    )

    this.exceptions = combinedException
  }

  /**
   * Removes specific exceptions from the exceptions list.
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
      JSON.stringify(updatedExceptions),
    )

    this.exceptions = updatedExceptions
  }

  /**
   * Removes all exceptions from the exceptions list.
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

  private async downloadRulesetData(id: string): Promise<string> {
    this.logger.info(`Syncing ruleset: ${id}`)
    const cachedRuleset = await this.getCachedRuleset(id)
    const ruleSet = await this.rulesetProvider.downloadRuleset(
      id,
      cachedRuleset?.cacheKey,
    )

    if (ruleSet === 'not-modified') {
      this.logger.info(`Ruleset ${id} is available in cache.`)
      if (!cachedRuleset) {
        throw new Error('Unexpected: no cache item')
      }

      return cachedRuleset.data
    } else {
      this.logger.info(`Ruleset ${id} was downloaded.`)
    }

    const cacheKey = ruleSet.cacheKey
    if (cacheKey) {
      this.setCachedRuleset(id, cacheKey, ruleSet.data)
    }

    return ruleSet.data
  }

  private async setCachedRulesetsMetaData(
    rulesetsMetaData: RulesetMetaData[],
  ): Promise<void> {
    this.storageProvider.setItem(
      rulesetsMetaDataKey,
      JSON.stringify(rulesetsMetaData),
    )
  }

  private async getCachedRulesetsMetaData(): Promise<
    RulesetMetaData[] | undefined
  > {
    const rulesetsJson = await this.storageProvider.getItem(rulesetsMetaDataKey)
    if (!rulesetsJson) {
      return undefined
    }

    return JSON.parse(rulesetsJson, (key, value) => {
      switch (key) {
        case 'updatedAt':
          return new Date(value)
        default:
          return value
      }
    })
  }

  private async setCachedRuleset(
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

  private async getCachedRuleset(
    id: string,
  ): Promise<CachedRuleset | undefined> {
    const item = await this.storageProvider.getItem(id)

    return item && JSON.parse(item)
  }
}

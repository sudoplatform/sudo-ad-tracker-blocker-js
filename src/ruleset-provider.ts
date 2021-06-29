import { RulesetType } from './ruleset-type'

/**
 * Ruleset meta data.
 */
export interface RulesetMetaData {
  type: RulesetType
  location: string
  updatedAt: Date
}

/**
 * The data result of downloading a rule set.
 */
export interface RulesetContent {
  data: string
  cacheKey?: string
}

/**
 * Ruleset format
 */
export enum RulesetFormat {
  AdBlockPlus = 'adblock-plus',
  Apple = 'apple',
}

export interface RulesetProvider {
  /**
   * Ruleset data format
   */
  format: RulesetFormat

  /**
   * Lists all available Rulesets
   */
  listRulesets(): Promise<RulesetMetaData[]>

  /**
   * Downloads rule set if cacheKey is valid.
   * @param id The id of the Ruleset to download.
   * @param cacheKey A key that determines whether or not to download Ruleset.
   */
  downloadRuleset(
    id: string,
    cacheKey?: string,
  ): Promise<RulesetContent | 'not-modified'>
}

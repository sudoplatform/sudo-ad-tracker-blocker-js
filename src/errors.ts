/**
 * Thrown when ruleset data is not present.  A call to `client.update`
 * will update the ruleset data.
 */
export class RulesetDataNotPresentError extends Error {
  constructor() {
    super(
      'Ruleset data is not present. Call `update` to obtain the latest rulesets.',
    )
    this.name = 'RulesetDataNotPresentError'
  }
}

/**
 * Thrown whenever the ruleset provider format is not AdBlockPlus
 */
export class FilterEngineNotAvailableError extends Error {
  constructor() {
    super(
      "The filter engine is not available. To instantiate the filter engine make sure the ruleset provider's format is AdBlockPlus and then call `client.update`.",
    )
    this.name = 'FilterEngineNotAvailableError '
  }
}

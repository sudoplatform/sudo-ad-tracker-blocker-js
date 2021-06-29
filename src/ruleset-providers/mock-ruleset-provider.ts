import { omit } from 'lodash'

import {
  RulesetContent,
  RulesetFormat,
  RulesetMetaData,
  RulesetProvider,
} from '../ruleset-provider'
import { RulesetType } from '../ruleset-type'

const mockRuleSets = [
  {
    type: RulesetType.AdBlocking,
    location: 'adblock-plus/list1',
    updatedAt: new Date('2020-01-01T00:00:00Z'),
    _rules: ['buybuybuy.com', 'federation.com', 'romulan.com'],
  },
  {
    type: RulesetType.Privacy,
    location: 'adblock-plus/list2',
    updatedAt: new Date('2020-01-02T00:00:00Z'),
    _rules: ['peep-n-tom.com', '?listening=true'],
  },
  {
    type: RulesetType.Social,
    location: 'adblock-plus/list3',
    name: 'Social Rule Set',
    updatedAt: new Date('2020-01-03T00:00:00Z'),
    _rules: ['friendspacebook.com', 'like='],
  },
  {
    type: RulesetType.AdBlocking,
    location: 'apple/list1',
    updatedAt: new Date('2020-02-01T00:00:00Z'),
    _rules: ['apple1'],
  },
  {
    type: RulesetType.Privacy,
    location: 'apple/list2',
    updatedAt: new Date('2020-02-02T00:00:00Z'),
    _rules: ['apple2'],
  },
  {
    type: RulesetType.Social,
    location: 'apple/list3',
    name: 'Social Rule Set',
    updatedAt: new Date('2020-02-03T00:00:00Z'),
    _rules: ['apple3'],
  },
]

export class MockRuleSetProvider implements RulesetProvider {
  public readonly format: RulesetFormat

  constructor(props?: { format?: RulesetFormat }) {
    this.format = props?.format ?? RulesetFormat.AdBlockPlus
  }

  async listRulesets(): Promise<RulesetMetaData[]> {
    return mockRuleSets
      .filter((ruleset) => ruleset.location.includes(this.format))
      .map((ruleSet) => omit(ruleSet, 'rules'))
  }

  async downloadRuleset(
    location: string,
  ): Promise<RulesetContent | 'not-modified'> {
    const ruleSet = mockRuleSets.find((rs) => rs.location === location)
    if (!ruleSet) {
      throw new Error('Not found')
    }

    return {
      data: ruleSet._rules.join('\n'),
      cacheKey: location,
    }
  }
}

import { omit } from 'lodash'

import {
  RulesetContent,
  RulesetMetaData,
  RulesetProvider,
} from '../ruleset-provider'
import { RulesetType } from '../ruleset-type'

const mockRuleSets = [
  {
    type: RulesetType.AdBlocking,
    location: 'list1',
    updatedAt: new Date('2020-01-01T00:00:00Z'),
    _rules: ['buybuybuy.com', 'federation.com', 'romulan.com'],
  },
  {
    type: RulesetType.Privacy,
    location: 'list2',
    updatedAt: new Date('2020-01-02T00:00:00Z'),
    _rules: ['peep-n-tom.com', '?listening=true'],
  },
  {
    type: RulesetType.Social,
    location: 'list3',
    name: 'Social Rule Set',
    updatedAt: new Date('2020-01-03T00:00:00Z'),
    _rules: ['friendspacebook.com', 'like='],
  },
]

export class MockRuleSetProvider implements RulesetProvider {
  async listRulesets(): Promise<RulesetMetaData[]> {
    return mockRuleSets.map((ruleSet) => omit(ruleSet, 'rules'))
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

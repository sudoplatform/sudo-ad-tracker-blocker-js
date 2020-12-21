import {
  RulesetContent,
  RulesetMetaData,
  RulesetProvider,
} from '../ruleset-provider'
import { RulesetType } from '../ruleset-type'

const easylistRulesets: RulesetMetaData[] = [
  {
    type: RulesetType.AdBlocking,
    location: 'easylist.txt',
    updatedAt: new Date('2020-01-01T00:00:00Z'),
  },
  {
    type: RulesetType.Privacy,
    location: 'easyprivacy.txt',
    updatedAt: new Date('2020-01-02T00:00:00Z'),
  },
  {
    type: RulesetType.Social,
    location: 'fanboy-social.txt',
    updatedAt: new Date('2020-01-03T00:00:00Z'),
  },
]

export class EasyListRuleSetProvider implements RulesetProvider {
  private easyListBaseURL = 'https://easylist.to/easylist/'

  public async listRulesets(): Promise<RulesetMetaData[]> {
    return easylistRulesets
  }

  public async downloadRuleset(
    location: string,
    cacheKey?: string,
  ): Promise<RulesetContent | 'not-modified'> {
    const cachedItemExpiry = !!cacheKey && new Date(cacheKey)

    if (cachedItemExpiry && cachedItemExpiry.getTime() >= Date.now()) {
      return 'not-modified' // cache ok
    }

    const response = await fetch(`${this.easyListBaseURL}${location}`)
    return {
      data: await response.text(),
      cacheKey: response.headers.get('Expires') ?? undefined,
    }
  }
}

import {
  EasyListRuleSetProvider,
  easylistRulesets,
} from './easylist-ruleset-provider'

describe('EasyListRuleSetProvider', () => {
  it('should return easy list rulesets', async () => {
    const provider = new EasyListRuleSetProvider()

    const results = await provider.listRulesets()

    expect(results).toEqual(easylistRulesets)
  })

  it('should download rulesets', async () => {
    const fetchSpy = jest.fn().mockResolvedValue({
      text: jest.fn().mockResolvedValue('data'),
      headers: {
        get: jest.fn().mockReturnValue('cacheKey'),
      },
    })
    global.fetch = fetchSpy
    const provider = new EasyListRuleSetProvider()

    const results = await provider.downloadRuleset('test-ruleset.txt')

    expect(fetchSpy).toBeCalledWith(
      'https://easylist.to/easylist/test-ruleset.txt',
    )
    expect(results).toEqual({
      data: 'data',
      cacheKey: 'cacheKey',
    })
  })

  it('should return `not-modified` if cached', async () => {
    Date.now = jest.fn().mockReturnValue(0)
    const provider = new EasyListRuleSetProvider()

    const result = await provider.downloadRuleset(
      'test-ruleset.txt',
      '2020-01-01T00:00:00.000Z',
    )

    expect(result).toBe('not-modified')
  })
})

import { NotAuthorizedError } from '@sudoplatform/sudo-common'
import { CognitoIdentityCredentials } from 'aws-sdk/lib/core'

import { RulesetFormat } from '../ruleset-provider'
import { DefaultRulesetProvider } from './default-ruleset-provider'

jest.mock('aws-sdk/clients/s3', () => {
  const buckets = {
    BUCKET: [
      {
        Key: '/filter-lists/adblock-plus/AD/list1.txt',
        Body: Buffer.from('LIST1', 'utf8'),
        ETag: 'etag1',
        LastModified: new Date('2020-01-01T00:00:00Z'),
      },
      {
        Key: '/filter-lists/adblock-plus/PRIVACY/list2.txt',
        Body: Buffer.from('LIST2', 'utf8'),
        ETag: 'etag2',
        LastModified: new Date('2020-01-02T00:00:00Z'),
      },
      {
        Key: '/filter-lists/adblock-plus/SOCIAL/list3.txt',
        Body: Buffer.from('LIST3', 'utf8'),
        ETag: 'etag3',
        LastModified: new Date('2020-01-03T00:00:00Z'),
      },
      {
        Key: '/filter-lists/apple/AD/list1.json',
        Body: Buffer.from('LIST1-APPLE', 'utf8'),
        ETag: 'etag1',
        LastModified: new Date('2020-02-01T00:00:00Z'),
      },
      {
        Key: '/filter-lists/apple/PRIVACY/list2.json',
        Body: Buffer.from('LIST2-APPLE', 'utf8'),
        ETag: 'etag2',
        LastModified: new Date('2020-02-02T00:00:00Z'),
      },
      {
        Key: '/filter-lists/apple/SOCIAL/list3.json',
        Body: Buffer.from('LIST3-APPLE', 'utf8'),
        ETag: 'etag3',
        LastModified: new Date('2020-02-03T00:00:00Z'),
      },
    ],
  }

  return jest.fn().mockImplementation(() => {
    return {
      listObjects: (props: any) => ({
        promise: async () => {
          const bucket = buckets[props.Bucket as keyof typeof buckets]
          const objects = bucket.filter((object) =>
            object.Key.startsWith(props.Prefix),
          )

          return {
            Contents: objects,
          }
        },
      }),
      getObject: (props: any) => ({
        promise: async () => {
          const bucket = buckets[props.Bucket as keyof typeof buckets]
          const object = bucket.find((o) => o.Key === props.Key)
          if (!object) {
            throw { code: 'NotFound' }
          } else if (props.IfNoneMatch && props.IfNoneMatch === object.ETag) {
            throw { code: 'NotModified' }
          } else {
            return object
          }
        },
      }),
    }
  })
})

jest.mock('aws-sdk/lib/core', () => {
  const CognitoIdentityCredentials = Object.assign(
    jest.fn((props) => ({
      props,
      getPromise: jest.fn().mockImplementation(async () => {
        if (CognitoIdentityCredentials.alwaysThrowAuthError) {
          throw CognitoIdentityCredentials.alwaysThrowAuthError
        }
      }),
      clearCachedId: jest.fn(),
    })),
    {
      alwaysThrowAuthError: undefined,
    },
  )

  return {
    CognitoIdentityCredentials,
  }
})

const mockUserClient = {
  getLatestAuthToken: jest.fn(),
}

beforeEach(() => {
  ;(CognitoIdentityCredentials as any).alwaysThrowAuthError = undefined
})

const testProps = {
  userClient: mockUserClient as any,
  bucket: 'BUCKET',
  bucketRegion: 'REGION',
  poolId: 'POOL',
  identityPoolId: 'ID_POOL',
}

describe('DefaultRuleSetProvider', () => {
  describe('listRuleSets()', () => {
    it('should throw NotAuthorizedError', async () => {
      ;(CognitoIdentityCredentials as any).alwaysThrowAuthError = {
        code: 'NotAuthorizedException',
      }

      const provider = new DefaultRulesetProvider(testProps)

      await expect(provider.listRulesets()).rejects.toThrow(NotAuthorizedError)
    })

    it('should return metadata for all rulesets - AdblockPlus', async () => {
      const provider = new DefaultRulesetProvider(testProps)

      const result = await provider.listRulesets()
      const expectedPrefix = '/filter-lists/adblock-plus'
      expect(result).toEqual([
        {
          location: `${expectedPrefix}/AD/list1.txt`,
          type: 'ad-blocking',
          updatedAt: new Date('2020-01-01T00:00:00Z'),
        },
        {
          type: 'privacy',
          location: `${expectedPrefix}/PRIVACY/list2.txt`,
          updatedAt: new Date('2020-01-02T00:00:00Z'),
        },
        {
          type: 'social',
          location: `${expectedPrefix}/SOCIAL/list3.txt`,
          updatedAt: new Date('2020-01-03T00:00:00Z'),
        },
      ])
    })

    it('should return metadata for all rulesets - Apple', async () => {
      const provider = new DefaultRulesetProvider({
        ...testProps,
        format: RulesetFormat.Apple,
      })

      const result = await provider.listRulesets()
      const expectedPrefix = '/filter-lists/apple'
      expect(result).toEqual([
        {
          location: `${expectedPrefix}/AD/list1.json`,
          type: 'ad-blocking',
          updatedAt: new Date('2020-02-01T00:00:00Z'),
        },
        {
          type: 'privacy',
          location: `${expectedPrefix}/PRIVACY/list2.json`,
          updatedAt: new Date('2020-02-02T00:00:00Z'),
        },
        {
          type: 'social',
          location: `${expectedPrefix}/SOCIAL/list3.json`,
          updatedAt: new Date('2020-02-03T00:00:00Z'),
        },
      ])
    })
  })

  describe('downloadRuleset', () => {
    it('should throw NotAuthorizedError', async () => {
      ;(CognitoIdentityCredentials as any).alwaysThrowAuthError = {
        code: 'NotAuthorizedException',
      }

      const provider = new DefaultRulesetProvider(testProps)

      await expect(provider.downloadRuleset('meh')).rejects.toThrow(
        NotAuthorizedError,
      )
    })

    it('should download ruleset data with no cache', async () => {
      const provider = new DefaultRulesetProvider(testProps)

      const result = await provider.downloadRuleset(
        '/filter-lists/adblock-plus/AD/list1.txt',
      )

      expect(result).toEqual({ cacheKey: 'etag1', data: 'LIST1' })
    })

    it('should download ruleset data with cache key miss', async () => {
      const provider = new DefaultRulesetProvider(testProps)

      const result = await provider.downloadRuleset(
        '/filter-lists/adblock-plus/AD/list1.txt',
        'OLD_ETAG',
      )

      expect(result).toEqual({ cacheKey: 'etag1', data: 'LIST1' })
    })

    it('should not download rules with cache key hit', async () => {
      const provider = new DefaultRulesetProvider(testProps)

      const result = await provider.downloadRuleset(
        '/filter-lists/adblock-plus/AD/list1.txt',
        'etag1',
      )
      expect(result).toEqual('not-modified')
    })
  })
})

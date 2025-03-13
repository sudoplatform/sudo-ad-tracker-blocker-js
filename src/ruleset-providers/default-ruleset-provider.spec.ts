import {
  GetObjectCommand,
  ListObjectsCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { RulesetFormat } from '../ruleset-provider'
import { s3Prefix, DefaultRulesetProvider } from './default-ruleset-provider'
import { mockClient } from 'aws-sdk-client-mock'
import * as matchers from 'aws-sdk-client-mock-jest'
import { NotAuthorizedError } from '@sudoplatform/sudo-common'
import { sdkStreamMixin } from '@aws-sdk/util-stream-node'
import { Readable } from 'stream'

const s3Mock = mockClient(S3Client)

beforeEach(() => {
  expect.extend(matchers)
})

afterEach(() => {
  s3Mock.reset()
})

const mockUserClient = {
  getLatestAuthToken: jest.fn(),
}

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
      s3Mock.on(ListObjectsCommand).rejectsOnce({
        name: 'NotAuthorizedException',
      })
      const provider = new DefaultRulesetProvider(testProps)

      await expect(provider.listRulesets()).rejects.toThrow(NotAuthorizedError)
      expect(s3Mock).toHaveReceivedCommandWith(ListObjectsCommand, {
        Bucket: testProps.bucket,
      })
    })

    it('should return metadata for all rulesets - AdblockPlus', async () => {
      s3Mock.on(ListObjectsCommand).resolvesOnce({
        Contents: [
          {
            Key: '/filter-lists/adblock-plus/AD/list1.txt',
            ETag: 'etag1',
            LastModified: new Date('2020-01-01T00:00:00Z'),
          },
          {
            Key: '/filter-lists/adblock-plus/PRIVACY/list2.txt',
            ETag: 'etag2',
            LastModified: new Date('2020-01-02T00:00:00Z'),
          },
          {
            Key: '/filter-lists/adblock-plus/SOCIAL/list3.txt',
            ETag: 'etag3',
            LastModified: new Date('2020-01-03T00:00:00Z'),
          },
        ],
      })
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

      expect(s3Mock).toHaveReceivedCommandWith(ListObjectsCommand, {
        Bucket: testProps.bucket,
        Prefix: s3Prefix + RulesetFormat.AdBlockPlus + '/',
      })
    })

    it('should return metadata for all rulesets - Apple', async () => {
      s3Mock.on(ListObjectsCommand).resolvesOnce({
        Contents: [
          {
            Key: '/filter-lists/apple/AD/list1.json',
            ETag: 'etag1',
            LastModified: new Date('2020-02-01T00:00:00Z'),
          },
          {
            Key: '/filter-lists/apple/PRIVACY/list2.json',
            ETag: 'etag2',
            LastModified: new Date('2020-02-02T00:00:00Z'),
          },
          {
            Key: '/filter-lists/apple/SOCIAL/list3.json',
            ETag: 'etag3',
            LastModified: new Date('2020-02-03T00:00:00Z'),
          },
        ],
      })
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
      expect(s3Mock).toHaveReceivedCommandWith(ListObjectsCommand, {
        Bucket: testProps.bucket,
        Prefix: s3Prefix + RulesetFormat.Apple + '/',
      })
    })
  })

  describe('downloadRuleset', () => {
    it('should throw NotAuthorizedError', async () => {
      s3Mock.on(GetObjectCommand).rejectsOnce({
        name: 'NotAuthorizedException',
      })
      const provider = new DefaultRulesetProvider(testProps)

      await expect(provider.downloadRuleset('meh')).rejects.toThrow(
        NotAuthorizedError,
      )
      expect(s3Mock).toHaveReceivedCommandWith(GetObjectCommand, {
        Bucket: testProps.bucket,
        Key: 'meh',
      })
    })

    it('should download ruleset data with no cache', async () => {
      s3Mock.on(GetObjectCommand).resolvesOnce({
        Body: sdkStreamMixin(
          new Readable({
            read() {
              this.push('LIST1')
              this.push(null)
            },
          }),
        ),
        ETag: 'etag1',
        LastModified: new Date('2020-01-01T00:00:00Z'),
      })
      const provider = new DefaultRulesetProvider(testProps)

      const result = await provider.downloadRuleset(
        '/filter-lists/adblock-plus/AD/list1.txt',
      )

      expect(result).toEqual({ cacheKey: 'etag1', data: 'LIST1' })
      expect(s3Mock).toHaveReceivedCommandWith(GetObjectCommand, {
        Bucket: testProps.bucket,
        Key: '/filter-lists/adblock-plus/AD/list1.txt',
      })
    })

    it('should download ruleset data with cache key miss', async () => {
      s3Mock.on(GetObjectCommand).resolvesOnce({
        Body: sdkStreamMixin(
          new Readable({
            read() {
              this.push('LIST1')
              this.push(null)
            },
          }),
        ),
        ETag: 'etag1',
        LastModified: new Date('2020-01-01T00:00:00Z'),
      })
      const provider = new DefaultRulesetProvider(testProps)

      const result = await provider.downloadRuleset(
        '/filter-lists/adblock-plus/AD/list1.txt',
        'OLD_ETAG',
      )

      expect(result).toEqual({ cacheKey: 'etag1', data: 'LIST1' })
      expect(s3Mock).toHaveReceivedCommandWith(GetObjectCommand, {
        Bucket: testProps.bucket,
        Key: '/filter-lists/adblock-plus/AD/list1.txt',
        IfNoneMatch: 'OLD_ETAG',
      })
    })

    it('should not download rules with cache key hit', async () => {
      s3Mock.on(GetObjectCommand).rejectsOnce({
        name: 'NotModified',
      })
      const provider = new DefaultRulesetProvider(testProps)

      const result = await provider.downloadRuleset(
        '/filter-lists/adblock-plus/AD/list1.txt',
        'etag1',
      )

      expect(result).toEqual('not-modified')
      expect(s3Mock).toHaveReceivedCommandWith(GetObjectCommand, {
        Bucket: testProps.bucket,
        Key: '/filter-lists/adblock-plus/AD/list1.txt',
        IfNoneMatch: 'etag1',
      })
    })
  })
})

import { NotAuthorizedError } from '@sudoplatform/sudo-common'
import { SudoUserClient } from '@sudoplatform/sudo-user'
import { AWSError } from 'aws-sdk'
import S3 from 'aws-sdk/clients/s3'
import { CognitoIdentityCredentials } from 'aws-sdk/lib/core'

import {
  RulesetContent,
  RulesetFormat,
  RulesetMetaData,
  RulesetProvider,
} from '../ruleset-provider'
import { RulesetType } from '../ruleset-type'

const s3Prefix = '/filter-lists/'

const serviceTypeToRuleSetTypeLookup: Record<string, RulesetType> = {
  AD: RulesetType.AdBlocking,
  PRIVACY: RulesetType.Privacy,
  SOCIAL: RulesetType.Social,
}

export interface DefaultRulesetProviderProps {
  userClient: SudoUserClient
  poolId: string
  identityPoolId: string
  bucket: string
  bucketRegion: string
  format?: RulesetFormat
}

export class DefaultRulesetProvider implements RulesetProvider {
  public readonly format: RulesetFormat

  constructor(private props: DefaultRulesetProviderProps) {
    this.format = props.format ?? RulesetFormat.AdBlockPlus
  }

  public async listRulesets(): Promise<RulesetMetaData[]> {
    const s3 = await this.getS3Client()

    const result = await s3
      .listObjects({
        Bucket: this.props.bucket,
        Prefix: s3Prefix + this.format + '/',
      })
      .promise()

    if (!result.Contents) {
      throw new Error('Unexpected. Cannot get Contents from S3 result.')
    }

    return result.Contents.map(({ Key, LastModified }) => {
      if (!Key) {
        throw new Error('Cannot interpret S3 Object result.')
      }

      const [, tail] = Key.split(s3Prefix + this.format + '/')
      const [serviceType] = tail.split('/')
      const ruleType = serviceTypeToRuleSetTypeLookup[serviceType]
      if (!ruleType) {
        throw new Error('Could not determine list type.')
      }

      return {
        location: Key,
        type: ruleType,
        updatedAt: LastModified ?? new Date(0),
      }
    })
  }

  public async downloadRuleset(
    key: string,
    cacheKey?: string,
  ): Promise<RulesetContent | 'not-modified'> {
    const s3 = await this.getS3Client()

    let response
    try {
      response = await s3
        .getObject({
          Bucket: this.props.bucket,
          Key: key,
          IfNoneMatch: cacheKey,
        })
        .promise()
    } catch (error) {
      if (isAWSError(error) && error.code === 'NotModified') {
        return 'not-modified'
      } else {
        throw error
      }
    }

    if (!response.Body) {
      throw new Error('Unexpected. Could not get body from S3 response.')
    }

    return {
      data: response.Body.toString('utf-8'),
      cacheKey: response.ETag,
    }
  }

  private async getS3Client(): Promise<S3> {
    const authToken = await this.props.userClient.getLatestAuthToken()
    const providerName = `cognito-idp.us-east-1.amazonaws.com/${this.props.poolId}`
    const credentials = new CognitoIdentityCredentials(
      {
        IdentityPoolId: this.props.identityPoolId,
        Logins: {
          [providerName]: authToken,
        },
      },
      {
        region: 'us-east-1',
      },
    )

    credentials.clearCachedId()

    try {
      await credentials.getPromise()
    } catch (error) {
      if (isAWSError(error) && error.code === 'NotAuthorizedException') {
        throw new NotAuthorizedError()
      }

      throw error
    }

    return new S3({
      region: this.props.bucketRegion,
      credentials: credentials,
    })
  }
}

function isAWSError(error: unknown): error is AWSError {
  return typeof error === 'object' && error !== null && 'code' in error
}

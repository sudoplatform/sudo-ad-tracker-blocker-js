import { SudoUserClient } from '@sudoplatform/sudo-user'
import S3 from 'aws-sdk/clients/s3'
import { CognitoIdentityCredentials } from 'aws-sdk/lib/core'

import {
  RulesetContent,
  RulesetMetaData,
  RulesetProvider,
} from '../ruleset-provider'
import { RulesetType } from '../ruleset-type'

const s3Region = 'us-east-1'
const s3Prefix = '/ad-tracker-blocker/filter-lists/adblock-plus/'

const serviceTypeToRuleSetTypeLookup: Record<string, RulesetType> = {
  AD: RulesetType.AdBlocking,
  PRIVACY: RulesetType.Privacy,
  SOCIAL: RulesetType.Social,
}

interface Props {
  userClient: SudoUserClient
  poolId: string
  identityPoolId: string
  bucket: string
}

export class DefaultRulesetProvider implements RulesetProvider {
  constructor(private props: Props) {}

  public async listRulesets(): Promise<RulesetMetaData[]> {
    const s3 = await this.getS3Client()

    const result = await s3
      .listObjects({
        Bucket: this.props.bucket,
        Prefix: s3Prefix,
      })
      .promise()

    if (!result.Contents) {
      throw new Error('Unexpected. Cannot get Contents from S3 result.')
    }

    return result.Contents.map(({ Key, LastModified }) => {
      if (!Key) {
        throw new Error('Cannot interpret S3 Object result.')
      }

      const [, tail] = Key.split(s3Prefix)
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
      if (error?.code === 'NotModified') {
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

    await credentials.getPromise()

    return new S3({
      region: s3Region,
      credentials: credentials,
    })
  }
}

import { NotAuthorizedError } from '@sudoplatform/sudo-common'
import { SudoUserClient } from '@sudoplatform/sudo-user'
import {
  GetObjectCommand,
  ListObjectsCommand,
  S3Client,
  S3ServiceException,
} from '@aws-sdk/client-s3'
import { fromCognitoIdentityPool } from '@aws-sdk/credential-providers'

import {
  RulesetContent,
  RulesetFormat,
  RulesetMetaData,
  RulesetProvider,
} from '../ruleset-provider'
import { RulesetType } from '../ruleset-type'

export const s3Prefix = '/filter-lists/'

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
    try {
      const result = await s3.send(
        new ListObjectsCommand({
          Bucket: this.props.bucket,
          Prefix: s3Prefix + this.format + '/',
        }),
      )

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
    } catch (error) {
      if (isAWSError(error) && error.name === 'NotAuthorizedException') {
        throw new NotAuthorizedError()
      }
      throw error
    }
  }

  public async downloadRuleset(
    key: string,
    cacheKey?: string,
  ): Promise<RulesetContent | 'not-modified'> {
    const s3 = await this.getS3Client()

    let response
    try {
      response = await s3.send(
        new GetObjectCommand({
          Bucket: this.props.bucket,
          Key: key,
          IfNoneMatch: cacheKey,
        }),
      )
    } catch (error) {
      if (isAWSError(error)) {
        switch (error.name) {
          case 'NotAuthorizedException':
            throw new NotAuthorizedError()
          case 'NotModified':
          case '304':
            return 'not-modified'
        }
      }
      throw error
    }

    if (!response.Body) {
      throw new Error('Unexpected. Could not get body from S3 response.')
    }

    return {
      data: await response.Body.transformToString('utf-8'),
      cacheKey: response.ETag,
    }
  }

  private async getS3Client(): Promise<S3Client> {
    const authToken = await this.props.userClient.getLatestAuthToken()
    const providerName = `cognito-idp.us-east-1.amazonaws.com/${this.props.poolId}`

    const credentials = fromCognitoIdentityPool({
      clientConfig: {
        region: 'us-east-1',
      },
      identityPoolId: this.props.identityPoolId,
      logins: {
        [providerName]: authToken,
      },
    })

    return new S3Client({
      region: this.props.bucketRegion,
      credentials: credentials,
    })
  }
}

function isAWSError(error: unknown): error is S3ServiceException {
  return typeof error === 'object' && error !== null && 'name' in error
}

import { reduce } from 'lodash'

type EnvProps =
  | {
      type: 'string'
      default?: string | (() => string)
    }
  | {
      type: 'boolean'
      default?: boolean | (() => boolean)
    }
  | {
      type: 'number'
      default?: number | (() => number)
    }

type EnvSchema = Record<string, EnvProps>

// prettier-ignore
type Env<T extends EnvSchema> = {
  [P in keyof T]: 
    T[P]["type"] extends "string" ? string :
    T[P]["type"] extends "boolean" ? boolean :
    T[P]["type"] extends "number" ? number :
    never
}

export function requireEnv<T extends EnvSchema>(schema: T): Env<T> {
  return reduce(
    schema,
    (result, envProps, key) => {
      const rawValue = process.env[key]?.trim()

      let typedValue
      if (rawValue) {
        switch (envProps.type) {
          case 'string':
            typedValue = rawValue
            break
          case 'boolean':
            typedValue = rawValue.toLowerCase() !== 'false' && rawValue !== '0'
            break
          case 'number': {
            typedValue = Number(rawValue)
            if (Number.isNaN(typedValue)) {
              throw new Error(`Invalid number: ${key}=${rawValue}`)
            }
            break
          }
          default:
            throw new Error('Invalid prop type')
        }
      } else {
        typedValue =
          typeof envProps.default === 'function'
            ? envProps.default()
            : envProps.default
      }

      if (typedValue === undefined) {
        throw new Error(`Missing env: ${key}. Set var or define default.`)
      }

      result[key] = typedValue
      return result
    },
    {} as Record<string, unknown>,
  ) as Env<T>
}

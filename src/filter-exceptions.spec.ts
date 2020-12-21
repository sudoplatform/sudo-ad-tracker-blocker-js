import {
  FilterException,
  findExceptionMatch,
  normalizeExceptionSources,
  normalizeExceptions,
} from './filter-exceptions'

describe('filter-exceptions', () => {
  describe('normalizeExceptions', () => {
    it.each`
      type      | source                   | expectedSource
      ${'host'} | ${'example.com'}         | ${'example.com'}
      ${'host'} | ${'www.example.com'}     | ${'www.example.com'}
      ${'host'} | ${'https://example.com'} | ${'example.com'}
      ${'host'} | ${'example.com/'}        | ${'example.com'}
      ${'host'} | ${'example.com/page'}    | ${'example.com'}
      ${'host'} | ${'10.0.1.1'}            | ${'10.0.1.1'}
      ${'page'} | ${'example.com'}         | ${'example.com/'}
      ${'page'} | ${'www.example.com'}     | ${'www.example.com/'}
      ${'page'} | ${'https://example.com'} | ${'example.com/'}
      ${'page'} | ${'example.com/'}        | ${'example.com/'}
      ${'page'} | ${'example.com/page'}    | ${'example.com/page'}
      ${'page'} | ${'10.0.1.1'}            | ${'10.0.1.1/'}
    `('should normalize', ({ type, source, expectedSource }) => {
      const [result] = normalizeExceptions([{ type, source }])
      expect(result).toEqual({
        type,
        source: expectedSource,
      })
    })
  })

  describe('normalizeExceptionSources()', () => {
    it.each`
      source                               | expectedType | expectedSource
      ${'https://www.federation.com'}      | ${'host'}    | ${'www.federation.com'}
      ${'http://www.federation.com'}       | ${'host'}    | ${'www.federation.com'}
      ${'www.federation.com'}              | ${'host'}    | ${'www.federation.com'}
      ${'https://federation.com'}          | ${'host'}    | ${'federation.com'}
      ${'federation.com'}                  | ${'host'}    | ${'federation.com'}
      ${'federation.com'}                  | ${'host'}    | ${'federation.com'}
      ${'https://www.federation.com/solo'} | ${'page'}    | ${'www.federation.com/solo'}
      ${'http://www.federation.com/solo'}  | ${'page'}    | ${'www.federation.com/solo'}
      ${'www.federation.com/solo'}         | ${'page'}    | ${'www.federation.com/solo'}
      ${'https://federation.com/solo'}     | ${'page'}    | ${'federation.com/solo'}
      ${'federation.com/solo'}             | ${'page'}    | ${'federation.com/solo'}
      ${'federation.com/solo'}             | ${'page'}    | ${'federation.com/solo'}
      ${'federation.com/'}                 | ${'page'}    | ${'federation.com/'}
      ${'%.com'}                           | ${'host'}    | ${'%.com'}
    `(
      'should return an encoded URL',
      ({ source, expectedType, expectedSource }) => {
        const [result] = normalizeExceptionSources([source])

        expect(result).toEqual({
          type: expectedType,
          source: expectedSource,
        })
      },
    )

    it.each`
      source
      ${'https://www.@#$%^#$.com'}
      ${'https://@#$%^#$.com'}
      ${'@#$%^#$.com'}
    `('should throw when bogus domain', ({ source }) => {
      expect(() => normalizeExceptionSources([source])).toThrowError(
        'Could not determine host for exception',
      )
    })
  })

  describe('findExceptionMatch()', () => {
    it.each`
      source                               | expected
      ${'https://federation.com'}          | ${'match'}
      ${'https://www.federation.com'}      | ${'no-match'}
      ${'https://www.federation.com/solo'} | ${'match'}
      ${'https://romulan.scum/jerks'}      | ${'match'}
      ${'https://romulan.scum'}            | ${'match'}
      ${'https://www.romulan.scum'}        | ${'no-match'}
    `(
      'should return true if a url matches an exception',
      ({ source, expected }) => {
        const exceptions: FilterException[] = [
          { type: 'host', source: 'federation.com' },
          { type: 'page', source: 'www.federation.com/solo' },
          { type: 'host', source: 'romulan.scum' },
        ]

        const result = findExceptionMatch(exceptions, source)

        expect(result).toBe(expected)
      },
    )
  })
})

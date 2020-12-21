import urlparse from 'url-parse'

const scheme = /^\w+:\/\//

export interface FilterException {
  type: 'host' | 'page'
  source: string
}

export function normalizeExceptions(
  exceptions: FilterException[],
): FilterException[] {
  return exceptions.map((exception) => {
    switch (exception.type) {
      case 'host':
        return normalizeDomainException(exception.source)
      case 'page':
        return normalizePageException(exception.source)
    }
  })
}

export function normalizeExceptionSources(
  exceptionSources: string[],
): FilterException[] {
  return exceptionSources.map(normalizeException)
}

export function findExceptionMatch(
  exceptions: FilterException[],
  url: string,
): 'match' | 'no-match' {
  const parsedCurrentUrl = getUrlParts(url)

  const matchedException = exceptions.find((exception) => {
    switch (exception.type) {
      case 'host':
        return parsedCurrentUrl.hostname === exception.source
      case 'page':
        const urlSource = `${parsedCurrentUrl.hostname}${parsedCurrentUrl.pathname}`
        return urlSource === exception.source
    }
  })

  return matchedException ? 'match' : 'no-match'
}

function normalizeException(source: string): FilterException {
  const urlParts = getUrlParts(source)
  const normalizedSource = `${urlParts.host}${urlParts.pathname}`
  const isPageException = normalizedSource.includes('/')

  return {
    type: isPageException ? 'page' : 'host',
    source: normalizedSource,
  }
}

function normalizeDomainException(source: string): FilterException {
  const urlParts = getUrlParts(source)

  return {
    type: 'host',
    source: urlParts.hostname,
  }
}

function normalizePageException(source: string): FilterException {
  const urlParts = getUrlParts(source)

  return {
    type: 'page',
    source: `${urlParts.host}${urlParts.pathname || '/'}`,
  }
}

function getUrlParts(input: string): urlparse {
  input = input.trim().toLowerCase()
  const hasScheme = scheme.test(input)
  const urlParts = urlparse(hasScheme ? input : `scheme://${input}`)

  if (!urlParts.host) {
    throw new Error(`Could not determine host for exception: ${input}`)
  }

  return urlParts
}
